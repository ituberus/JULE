/*************************************************************
 *  app.js — Node/Express/SQLite backend with HTTP-only cookie auth
 *************************************************************/

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { randomBytes } from 'crypto';
import { CronJob } from 'cron';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

// 1) IMPORTANT: import the wallet generator
import { generateAllWallets } from './walletgen.js';

import path from 'path';
import { fileURLToPath } from 'url';

// **** Added for price fetching ****
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================
// ENV / CONFIG
// ============================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_TO_SOMETHING_SECURE';

const app = express();

// CORS setup
app.use(
  cors({
    origin: 'http://localhost:3001', // Adjust to your frontend domain if needed
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'projectinsight')));

// -----------------------------------------------------
// 0) Initialize / Open Database
// -----------------------------------------------------
let db;
(async () => {
  db = await open({
    filename: './myCryptoDemo.sqlite',
    driver: sqlite3.Database
  });

  // Create tables if they do not exist.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT,
      lastName TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      country TEXT,
      password TEXT,
      accountCurrency TEXT,
      verificationStatus TEXT DEFAULT 'not_verified',
      planName TEXT,
      planAmount TEXT,
      referrerUsed TEXT,
      myReferrerCode TEXT,
      referrerCount INTEGER DEFAULT 0,
      referrerEarnings TEXT DEFAULT '0',
      createdAt TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS user_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      coinName TEXT,
      shortName TEXT,
      walletAddress TEXT,
      privateKey TEXT,
      balance TEXT DEFAULT '0'
    );

    CREATE TABLE IF NOT EXISTS user_external_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      walletName TEXT,
      walletText TEXT
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      date TEXT,
      reference TEXT,
      method TEXT,
      type TEXT,
      amount TEXT,
      totalEUR TEXT,
      status TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      date TEXT,
      reference TEXT,
      method TEXT,
      amount TEXT,
      total TEXT,
      status TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS user_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      signalName TEXT,
      balance TEXT DEFAULT '0'
    );

    CREATE TABLE IF NOT EXISTS user_stakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      stakeName TEXT,
      balance TEXT DEFAULT '0'
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      message TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt TEXT
    );
  `);

  console.log('Database connected and tables ensured.');
})();

// -----------------------------------------------------
// Helper Functions
// -----------------------------------------------------
function generateRefCode() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return code;
}

function generateReference() {
  return randomBytes(8).toString('hex');
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1d' });
}

// Optional auth middleware (used on certain routes)
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.authToken;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized. No token provided.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// -----------------------------------------------------
// 2) Auth Routes (Sign Up, Sign In, Logout, Me)
// -----------------------------------------------------

/**
 * 2.1) SIGNUP
 */
app.post('/api/auth/signup', async (req, res) => {
  const now = new Date().toISOString();

  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      country,
      password,
      accountCurrency,
      referrerCode
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and Password are required' });
    }

    // Generate new user ref code
    const myRefCode = generateRefCode();

    // Insert user in DB
    const insertUser = await db.run(`
      INSERT INTO users (
        firstName, lastName, email, phone, country, password, accountCurrency,
        referrerUsed, myReferrerCode, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      firstName || '',
      lastName || '',
      email.trim(),
      phone || '',
      country || '',
      password, // Plaintext password (as requested)
      accountCurrency || 'USD',
      referrerCode || '',
      myRefCode,
      now,
      now
    ]);

    const newUserId = insertUser.lastID;

    // If user used a valid referrer code, increment that referrer's count
    if (referrerCode && referrerCode.trim() !== '') {
      const refUser = await db.get('SELECT * FROM users WHERE myReferrerCode = ?', [referrerCode.trim()]);
      if (refUser) {
        await db.run(`
          UPDATE users
          SET referrerCount = referrerCount + 1
          WHERE id = ?
        `, [refUser.id]);
      }
    }

    // ========== Generate new user wallets from walletgen.js ==========
    try {
      const generatedWallets = await generateAllWallets();
      for (let w of generatedWallets) {
        await db.run(`
          INSERT INTO user_wallets (
            userId, coinName, shortName, walletAddress, privateKey
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          newUserId,
          w.coinName,
          w.shortName,
          w.walletAddress,
          w.privateKey
        ]);
      }
    } catch (errWallet) {
      // If something fails, delete user to avoid leftover user record
      await db.run('DELETE FROM users WHERE id = ?', [newUserId]);
      return res.status(500).json({
        error: 'Failed to generate or insert wallets.',
        details: errWallet.message
      });
    }

    // Initialize external wallets
    const externalWalletNames = [
      "Aktionariat Wallet", "Binance", "Bitcoin Wallet", "Bitkeep Wallet",
      "Bitpay", "Blockchain", "Coinbase", "Coinbase One", "Crypto Wallet",
      "Exodus Wallet", "Gemini", "Imtoken", "Infinito Wallet", "Infinity Wallet",
      "Keyringpro Wallet", "Metamask", "Ownbit Wallet", "Phantom Wallet",
      "Pulse Wallet", "Rainbow", "Robinhood Wallet", "Safepal Wallet",
      "Sparkpoint Wallet", "Trust Wallet", "Uniswap", "Wallet io"
    ];
    for (let walletName of externalWalletNames) {
      await db.run(`
        INSERT INTO user_external_wallets (userId, walletName, walletText)
        VALUES (?, ?, '')
      `, [newUserId, walletName]);
    }

    // Initialize signals
    const signalsList = [
      "ACD-Pro", "CD V5 Pro", "XPN-4N", "BC-IRS", "BC-IRS LEVEL2 Pro",
      "TASANA Pro", "RBF V6 25000", "SILVER Pro WAYXE Pro"
    ];
    for (let signalName of signalsList) {
      await db.run(`
        INSERT INTO user_signals (userId, signalName, balance)
        VALUES (?, ?, '0')
      `, [newUserId, signalName]);
    }

    // Initialize stakes
    const stakeList = ["Avalanche", "Ethereum", "Polygon", "Solana", "Tether"];
    for (let stakeName of stakeList) {
      await db.run(`
        INSERT INTO user_stakes (userId, stakeName, balance)
        VALUES (?, ?, '0')
      `, [newUserId, stakeName]);
    }

    // Finally, return newly created user (minus password)
    const user = await db.get('SELECT * FROM users WHERE id = ?', [newUserId]);
    const { password: pw, ...userSafe } = user;
    res.json({ message: 'Signup successful', user: userSafe });
  } catch (err) {
    console.error('Sign up error:', err);
    res.status(500).json({ error: 'Could not sign up user', details: err.message });
  }
});

/**
 * 2.2) SIGNIN (using HTTP-only cookie for JWT)
 */
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email & Password required' });
    }

    const user = await db.get(`
      SELECT * FROM users
      WHERE email = ?
    `, [email.trim()]);

    // Simple password check
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = generateToken(user.id);

    // Set token in an HTTP-only cookie
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
    });

    const { password: _, ...userSafe } = user;
    res.json({
      message: 'Sign in successful',
      user: userSafe
    });
  } catch (err) {
    console.error('Sign in error:', err);
    res.status(500).json({ error: 'Could not sign in', details: err.message });
  }
});

/**
 * 2.3) LOGOUT
 */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out' });
});

/**
 * 2.4) ME — Return the currently logged-in user's data
 */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { password, ...userSafe } = user;
    res.json({ user: userSafe });
  } catch (err) {
    console.error('ME route error:', err);
    res.status(500).json({ error: 'Could not fetch user' });
  }
});

// -----------------------------------------------------
// 3) Wallet Management (User-facing CRUD)
// -----------------------------------------------------
app.post('/api/user/:userId/wallets', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { coinName, shortName, walletAddress, privateKey, balance } = req.body;

    if (!coinName || !shortName) {
      return res.status(400).json({ error: 'coinName and shortName are required' });
    }

    await db.run(`
      INSERT INTO user_wallets
        (userId, coinName, shortName, walletAddress, privateKey, balance)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      userId,
      coinName,
      shortName,
      walletAddress || '',
      privateKey || '',
      balance || '0'
    ]);

    res.json({ message: 'Wallet added successfully' });
  } catch (err) {
    console.error('Add wallet error:', err);
    res.status(500).json({ error: 'Could not add wallet', details: err.message });
  }
});

app.get('/api/user/:userId/wallets', async (req, res) => {
  try {
    const userId = req.params.userId;
    const wallets = await db.all(`
      SELECT * FROM user_wallets WHERE userId = ?
    `, [userId]);
    res.json(wallets);
  } catch (err) {
    console.error('Get wallets error:', err);
    res.status(500).json({ error: 'Could not fetch user wallets' });
  }
});

app.put('/api/user/:userId/wallets/:walletId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const walletId = req.params.walletId;
    const { coinName, shortName, walletAddress, privateKey, balance } = req.body;

    await db.run(`
      UPDATE user_wallets
      SET
        coinName = ?,
        shortName = ?,
        walletAddress = ?,
        privateKey = ?,
        balance = ?
      WHERE id = ? AND userId = ?
    `, [
      coinName,
      shortName,
      walletAddress,
      privateKey,
      balance,
      walletId,
      userId
    ]);

    res.json({ message: 'Wallet updated successfully' });
  } catch (err) {
    console.error('Update wallet error:', err);
    res.status(500).json({ error: 'Could not update wallet', details: err.message });
  }
});

app.delete('/api/user/:userId/wallets/:walletId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const walletId = req.params.walletId;

    await db.run(`
      DELETE FROM user_wallets
      WHERE id = ? AND userId = ?
    `, [walletId, userId]);

    res.json({ message: 'Wallet deleted successfully' });
  } catch (err) {
    console.error('Delete wallet error:', err);
    res.status(500).json({ error: 'Could not delete wallet', details: err.message });
  }
});

// -----------------------------------------------------
// 3b) External Wallets CRUD (User-facing)
// -----------------------------------------------------
app.post('/api/user/:userId/external-wallets', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { walletName, walletText } = req.body;

    if (!walletName) {
      return res.status(400).json({ error: 'walletName is required' });
    }

    await db.run(`
      INSERT INTO user_external_wallets (userId, walletName, walletText)
      VALUES (?, ?, ?)
    `, [userId, walletName, walletText || '']);

    res.json({ message: 'External wallet added successfully' });
  } catch (err) {
    console.error('Add external wallet error:', err);
    res.status(500).json({ error: 'Could not add external wallet', details: err.message });
  }
});

app.get('/api/user/:userId/external-wallets', async (req, res) => {
  try {
    const userId = req.params.userId;
    const data = await db.all(`
      SELECT * FROM user_external_wallets WHERE userId = ?
    `, [userId]);
    res.json(data);
  } catch (err) {
    console.error('Get external wallets error:', err);
    res.status(500).json({ error: 'Could not fetch external wallets' });
  }
});

app.put('/api/user/:userId/external-wallets/:extWalletId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const extWalletId = req.params.extWalletId;
    const { walletName, walletText } = req.body;

    await db.run(`
      UPDATE user_external_wallets
      SET walletName = ?,
          walletText = ?
      WHERE id = ? AND userId = ?
    `, [walletName, walletText, extWalletId, userId]);

    res.json({ message: 'External wallet updated successfully' });
  } catch (err) {
    console.error('Update external wallet error:', err);
    res.status(500).json({ error: 'Could not update external wallet', details: err.message });
  }
});

app.delete('/api/user/:userId/external-wallets/:extWalletId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const extWalletId = req.params.extWalletId;

    await db.run(`
      DELETE FROM user_external_wallets
      WHERE id = ? AND userId = ?
    `, [extWalletId, userId]);

    res.json({ message: 'External wallet deleted successfully' });
  } catch (err) {
    console.error('Delete external wallet error:', err);
    res.status(500).json({ error: 'Could not delete external wallet', details: err.message });
  }
});

// -----------------------------------------------------
// 4) User & Admin Endpoints
// -----------------------------------------------------
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.all('SELECT * FROM users');
    res.json(users);
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ error: 'Could not fetch all users' });
  }
});

// Get single user + all sub-resources
app.get('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const wallets = await db.all('SELECT * FROM user_wallets WHERE userId = ?', [userId]);
    const externalWallets = await db.all('SELECT * FROM user_external_wallets WHERE userId = ?', [userId]);
    const signals = await db.all('SELECT * FROM user_signals WHERE userId = ?', [userId]);
    const stakes = await db.all('SELECT * FROM user_stakes WHERE userId = ?', [userId]);
    const deposits = await db.all('SELECT * FROM deposits WHERE userId = ?', [userId]);
    const withdrawals = await db.all('SELECT * FROM withdrawals WHERE userId = ?', [userId]);
    const notifications = await db.all('SELECT * FROM notifications WHERE userId = ?', [userId]);

    res.json({
      user,
      wallets,
      externalWallets,
      signals,
      stakes,
      deposits,
      withdrawals,
      notifications
    });
  } catch (err) {
    console.error('Get user data error:', err);
    res.status(500).json({ error: 'Could not fetch user data' });
  }
});

/**
 * Update a user's fields (User-facing or Admin)
 */
app.put('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    // We'll accept arbitrary fields from the body to update the user
    // (e.g. firstName, lastName, email, phone, password, etc.)
    const updateFields = req.body;
    if (!updateFields || Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' });
    }

    // Build dynamic SET clause
    const columns = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);

    const sql = `UPDATE users SET ${columns}, updatedAt = ? WHERE id = ?`;
    await db.run(sql, [...values, new Date().toISOString(), userId]);

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Could not update user', details: err.message });
  }
});

/**
 * Delete a user entirely (User or Admin). 
 * - This also optionally could delete all user sub-resources if you want.
 *   For now, let's just delete the user row itself. 
 */
app.delete('/api/user/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    // If you want to remove sub-resources, you can also do:
    // await db.run(`DELETE FROM user_wallets WHERE userId = ?`, [userId]);
    // ... etc.

    await db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Could not delete user', details: err.message });
  }
});

// Admin update user verification
app.put('/api/admin/verify-user/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { verificationStatus } = req.body;
    await db.run(`
      UPDATE users
      SET verificationStatus = ?,
          updatedAt = ?
      WHERE id = ?
    `, [
      verificationStatus || 'not_verified',
      new Date().toISOString(),
      userId
    ]);
    res.json({ message: 'User verification status updated' });
  } catch (err) {
    console.error('Verify user error:', err);
    res.status(500).json({ error: 'Could not update user verification' });
  }
});

// Admin/User update plan subscription
app.put('/api/user/:id/plan', async (req, res) => {
  try {
    const userId = req.params.id;
    const { planName, planAmount } = req.body;
    await db.run(`
      UPDATE users
      SET planName = ?,
          planAmount = ?,
          updatedAt = ?
      WHERE id = ?
    `, [
      planName || '',
      planAmount || '0',
      new Date().toISOString(),
      userId
    ]);
    res.json({ message: 'Plan updated successfully' });
  } catch (err) {
    console.error('Update plan error:', err);
    res.status(500).json({ error: 'Could not update plan', details: err.message });
  }
});

// -----------------------------------------------------
// 5) Deposits / Withdrawals
// -----------------------------------------------------
app.post('/api/deposits', async (req, res) => {
  try {
    const { userId, method, type, amount, totalEUR } = req.body;
    const reference = generateReference();
    const now = new Date().toISOString();

    const result = await db.run(`
      INSERT INTO deposits (
        userId, date, reference, method, type, amount, totalEUR, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending confirmation', ?)
    `, [
      userId,
      now,
      reference,
      method || '',
      type || '',
      amount || '0',
      totalEUR || '0',
      now
    ]);

    res.json({
      message: 'Deposit created',
      depositId: result.lastID,
      reference
    });
  } catch (err) {
    console.error('Create deposit error:', err);
    res.status(500).json({ error: 'Could not create deposit', details: err.message });
  }
});

app.get('/api/user/:id/deposits', async (req, res) => {
  try {
    const userId = req.params.id;
    const list = await db.all('SELECT * FROM deposits WHERE userId = ?', [userId]);
    res.json(list);
  } catch (err) {
    console.error('List deposits error:', err);
    res.status(500).json({ error: 'Could not fetch deposits' });
  }
});

/** Update deposit (Admin or user) */
app.put('/api/user/:id/deposits/:depositId', async (req, res) => {
  try {
    const userId = req.params.id;
    const depositId = req.params.depositId;
    const updateFields = req.body; // e.g. { method: '...', status: '...' }

    if (!updateFields || Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' });
    }

    const columns = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);

    const sql = `UPDATE deposits SET ${columns} WHERE id = ? AND userId = ?`;
    await db.run(sql, [...values, depositId, userId]);

    res.json({ message: 'Deposit updated successfully' });
  } catch (err) {
    console.error('Update deposit error:', err);
    res.status(500).json({ error: 'Could not update deposit', details: err.message });
  }
});

/** Delete deposit (Admin or user) */
app.delete('/api/user/:id/deposits/:depositId', async (req, res) => {
  try {
    const userId = req.params.id;
    const depositId = req.params.depositId;

    await db.run(`
      DELETE FROM deposits
      WHERE id = ? AND userId = ?
    `, [depositId, userId]);

    res.json({ message: 'Deposit deleted successfully' });
  } catch (err) {
    console.error('Delete deposit error:', err);
    res.status(500).json({ error: 'Could not delete deposit', details: err.message });
  }
});

app.post('/api/withdrawals', async (req, res) => {
  try {
    const { userId, method, amount, total } = req.body;
    const reference = generateReference();
    const now = new Date().toISOString();

    const result = await db.run(`
      INSERT INTO withdrawals (
        userId, date, reference, method, amount, total, status, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [
      userId,
      now,
      reference,
      method || '',
      amount || '0',
      total || '0',
      now
    ]);

    res.json({
      message: 'Withdrawal created',
      withdrawalId: result.lastID,
      reference
    });
  } catch (err) {
    console.error('Create withdrawal error:', err);
    res.status(500).json({ error: 'Could not create withdrawal', details: err.message });
  }
});

app.get('/api/user/:id/withdrawals', async (req, res) => {
  try {
    const userId = req.params.id;
    const list = await db.all('SELECT * FROM withdrawals WHERE userId = ?', [userId]);
    res.json(list);
  } catch (err) {
    console.error('List withdrawals error:', err);
    res.status(500).json({ error: 'Could not fetch withdrawals' });
  }
});

/** Update withdrawal */
app.put('/api/user/:id/withdrawals/:withdrawalId', async (req, res) => {
  try {
    const userId = req.params.id;
    const withdrawalId = req.params.withdrawalId;
    const updateFields = req.body;

    if (!updateFields || Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' });
    }

    const columns = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
    const values = Object.values(updateFields);

    const sql = `UPDATE withdrawals SET ${columns} WHERE id = ? AND userId = ?`;
    await db.run(sql, [...values, withdrawalId, userId]);

    res.json({ message: 'Withdrawal updated successfully' });
  } catch (err) {
    console.error('Update withdrawal error:', err);
    res.status(500).json({ error: 'Could not update withdrawal', details: err.message });
  }
});

/** Delete withdrawal */
app.delete('/api/user/:id/withdrawals/:withdrawalId', async (req, res) => {
  try {
    const userId = req.params.id;
    const withdrawalId = req.params.withdrawalId;

    await db.run(`
      DELETE FROM withdrawals
      WHERE id = ? AND userId = ?
    `, [withdrawalId, userId]);

    res.json({ message: 'Withdrawal deleted successfully' });
  } catch (err) {
    console.error('Delete withdrawal error:', err);
    res.status(500).json({ error: 'Could not delete withdrawal', details: err.message });
  }
});

// -----------------------------------------------------
// 6) Signal & Stake Management
// -----------------------------------------------------
/**
 * Bulk update signals
 */
app.put('/api/user/:userId/signals', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { signals } = req.body;

    if (!Array.isArray(signals)) {
      return res.status(400).json({ error: 'signals must be an array' });
    }

    for (let s of signals) {
      await db.run(`
        UPDATE user_signals
        SET balance = ?
        WHERE userId = ? AND signalName = ?
      `, [
        s.balance || '0',
        userId,
        s.signalName
      ]);
    }

    res.json({ message: 'Signals updated successfully' });
  } catch (err) {
    console.error('Update signals error:', err);
    res.status(500).json({ error: 'Could not update signals', details: err.message });
  }
});

/** 
 * Create a new signal entry (if you want dynamic signals)
 */
app.post('/api/user/:userId/signals', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { signalName, balance } = req.body;

    if (!signalName) {
      return res.status(400).json({ error: 'signalName is required' });
    }

    const result = await db.run(`
      INSERT INTO user_signals (userId, signalName, balance)
      VALUES (?, ?, ?)
    `, [userId, signalName, balance || '0']);

    res.json({ message: 'Signal created', id: result.lastID });
  } catch (err) {
    console.error('Create signal error:', err);
    res.status(500).json({ error: 'Could not create signal', details: err.message });
  }
});

/** Read all signals for user */
app.get('/api/user/:userId/signals', async (req, res) => {
  try {
    const userId = req.params.userId;
    const rows = await db.all(`
      SELECT * FROM user_signals WHERE userId = ?
    `, [userId]);
    res.json(rows);
  } catch (err) {
    console.error('Get signals error:', err);
    res.status(500).json({ error: 'Could not fetch signals', details: err.message });
  }
});

/** Delete a signal */
app.delete('/api/user/:userId/signals/:signalId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const signalId = req.params.signalId;

    await db.run(`
      DELETE FROM user_signals
      WHERE id = ? AND userId = ?
    `, [signalId, userId]);

    res.json({ message: 'Signal deleted successfully' });
  } catch (err) {
    console.error('Delete signal error:', err);
    res.status(500).json({ error: 'Could not delete signal', details: err.message });
  }
});

/**
 * Bulk update stakes
 */
app.put('/api/user/:userId/stakes', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { stakes } = req.body;

    if (!Array.isArray(stakes)) {
      return res.status(400).json({ error: 'stakes must be an array' });
    }

    for (let st of stakes) {
      await db.run(`
        UPDATE user_stakes
        SET balance = ?
        WHERE userId = ? AND stakeName = ?
      `, [
        st.balance || '0',
        userId,
        st.stakeName
      ]);
    }

    res.json({ message: 'Stakes updated successfully' });
  } catch (err) {
    console.error('Update stakes error:', err);
    res.status(500).json({ error: 'Could not update stakes', details: err.message });
  }
});

/** Create a new stake if needed */
app.post('/api/user/:userId/stakes', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { stakeName, balance } = req.body;

    if (!stakeName) {
      return res.status(400).json({ error: 'stakeName is required' });
    }

    const result = await db.run(`
      INSERT INTO user_stakes (userId, stakeName, balance)
      VALUES (?, ?, ?)
    `, [userId, stakeName, balance || '0']);

    res.json({ message: 'Stake created', id: result.lastID });
  } catch (err) {
    console.error('Create stake error:', err);
    res.status(500).json({ error: 'Could not create stake', details: err.message });
  }
});

/** Read all stakes for user */
app.get('/api/user/:userId/stakes', async (req, res) => {
  try {
    const userId = req.params.userId;
    const rows = await db.all(`
      SELECT * FROM user_stakes WHERE userId = ?
    `, [userId]);
    res.json(rows);
  } catch (err) {
    console.error('Get stakes error:', err);
    res.status(500).json({ error: 'Could not fetch stakes', details: err.message });
  }
});

/** Delete a stake */
app.delete('/api/user/:userId/stakes/:stakeId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const stakeId = req.params.stakeId;

    await db.run(`
      DELETE FROM user_stakes
      WHERE id = ? AND userId = ?
    `, [stakeId, userId]);

    res.json({ message: 'Stake deleted successfully' });
  } catch (err) {
    console.error('Delete stake error:', err);
    res.status(500).json({ error: 'Could not delete stake', details: err.message });
  }
});

// -----------------------------------------------------
// 7) Notifications
// -----------------------------------------------------
app.post('/api/user/:userId/notifications', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { message } = req.body;
    const now = new Date().toISOString();

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await db.run(`
      INSERT INTO notifications (userId, message, isRead, createdAt)
      VALUES (?, ?, 0, ?)
    `, [userId, message, now]);

    res.json({ message: 'Notification created', notificationId: result.lastID });
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(500).json({ error: 'Could not create notification', details: err.message });
  }
});

app.get('/api/user/:userId/notifications', async (req, res) => {
  try {
    const userId = req.params.userId;
    const notifications = await db.all(`
      SELECT * FROM notifications WHERE userId = ?
      ORDER BY id DESC
    `, [userId]);
    res.json(notifications);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Could not get notifications', details: err.message });
  }
});

app.put('/api/user/:userId/notifications/:notificationId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const notificationId = req.params.notificationId;
    const { message, isRead } = req.body;

    const existing = await db.get(`
      SELECT * FROM notifications
      WHERE id = ? AND userId = ?
    `, [notificationId, userId]);
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const newMessage = (message === undefined) ? existing.message : message;
    const newIsRead = (isRead === undefined) ? existing.isRead : isRead;

    await db.run(`
      UPDATE notifications
      SET message = ?,
          isRead = ?
      WHERE id = ? AND userId = ?
    `, [newMessage, newIsRead, notificationId, userId]);

    res.json({ message: 'Notification updated' });
  } catch (err) {
    console.error('Update notification error:', err);
    res.status(500).json({ error: 'Could not update notification', details: err.message });
  }
});

app.delete('/api/user/:userId/notifications/:notificationId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const notificationId = req.params.notificationId;

    await db.run(`
      DELETE FROM notifications
      WHERE id = ? AND userId = ?
    `, [notificationId, userId]);

    res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Could not delete notification', details: err.message });
  }
});

app.put('/api/user/:userId/notifications-mark-all', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { isRead } = req.body;

    if (isRead === undefined) {
      return res.status(400).json({ error: 'isRead is required and should be 0 or 1' });
    }

    await db.run(`
      UPDATE notifications
      SET isRead = ?
      WHERE userId = ?
    `, [isRead, userId]);

    res.json({ message: 'All notifications updated' });
  } catch (err) {
    console.error('Mark all notifications error:', err);
    res.status(500).json({ error: 'Could not mark all notifications', details: err.message });
  }
});

// -----------------------------------------------------
// 8) Automatic Deposit Cancellation (Cron Job)
// -----------------------------------------------------
const depositCheckJob = new CronJob('0 * * * *', async () => {
  // Runs every hour at minute 0
  try {
    const now = new Date().getTime();
    const pendingDeposits = await db.all(`
      SELECT * FROM deposits WHERE status = 'pending confirmation'
    `);

    for (let deposit of pendingDeposits) {
      const createdTime = new Date(deposit.createdAt).getTime();
      if ((now - createdTime) > 2 * 60 * 60 * 1000) { // older than 2 hours
        await db.run(`
          UPDATE deposits
          SET status = 'canceled'
          WHERE id = ?
        `, [deposit.id]);
        console.log(`Deposit ${deposit.id} auto-canceled (pending > 2 hours).`);
      }
    }
  } catch (err) {
    console.error('Error in depositCheckJob:', err);
  }
});

depositCheckJob.start();

// -----------------------------------------------------
// 9) SUPER-ADMIN: ALLOW EVERYTHING TO BE EDITED/DELETED
// -----------------------------------------------------

/** 
 * GET all records from a specific table 
 * e.g. GET /api/admin/get/users -> returns all user rows
 */
app.get('/api/admin/get/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const rows = await db.all(`SELECT * FROM ${table}`);
    res.json(rows);
  } catch (err) {
    console.error('Generic Get-All Error:', err);
    res.status(500).json({ error: 'Could not get records', details: err.message });
  }
});

/** 
 * GET one record by ID from any table 
 * e.g. GET /api/admin/get/users/1 -> returns user with id=1
 */
app.get('/api/admin/get/:table/:id', async (req, res) => {
  try {
    const table = req.params.table;
    const rowId = req.params.id;
    const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [rowId]);

    if (!row) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(row);
  } catch (err) {
    console.error('Generic Get-One Error:', err);
    res.status(500).json({ error: 'Could not get record', details: err.message });
  }
});

/** 
 * Admin Update: Updates by `id` column in any table with key/value pairs provided.
 * e.g. PUT /api/admin/update/users/1  with body { email: "new@email.com", password: "plaintext" }
 */
app.put('/api/admin/update/:table/:id', async (req, res) => {
  try {
    const table = req.params.table;       // e.g. 'users'
    const rowId = req.params.id;          // e.g. 1
    const updateFields = req.body;        // e.g. { firstName: 'NewName', lastName: 'NewLast' }

    if (!updateFields || Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields provided for update.' });
    }

    // Build the SET clause
    const columns = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updateFields);

    // Construct dynamic SQL
    const sql = `UPDATE ${table} SET ${columns} WHERE id = ?`;
    await db.run(sql, [...values, rowId]);

    res.json({ message: 'Record updated successfully' });
  } catch (err) {
    console.error('Generic Update Error:', err);
    res.status(500).json({ error: 'Could not update record', details: err.message });
  }
});

/**
 * Admin Insert: Insert into any table with provided key/value pairs
 * e.g. POST /api/admin/insert/users  with body { firstName: 'Test', lastName: 'User', email: 'test@test.com' }
 */
app.post('/api/admin/insert/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const insertFields = req.body; 

    if (!insertFields || Object.keys(insertFields).length === 0) {
      return res.status(400).json({ error: 'No fields provided for insert.' });
    }

    const columns = Object.keys(insertFields).join(', ');
    const placeholders = Object.keys(insertFields).map(() => '?').join(', ');
    const values = Object.values(insertFields);

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    const result = await db.run(sql, values);

    res.json({ message: 'Record inserted successfully', lastID: result.lastID });
  } catch (err) {
    console.error('Generic Insert Error:', err);
    res.status(500).json({ error: 'Could not insert record', details: err.message });
  }
});

/**
 * Admin Delete: Delete a record from any table by `id` column
 * e.g. DELETE /api/admin/delete/users/1
 */
app.delete('/api/admin/delete/:table/:id', async (req, res) => {
  try {
    const table = req.params.table;
    const rowId = req.params.id;

    const sql = `DELETE FROM ${table} WHERE id = ?`;
    await db.run(sql, rowId);

    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Generic Delete Error:', err);
    res.status(500).json({ error: 'Could not delete record', details: err.message });
  }
});

// -----------------------------------------------------
// 10) [NEW] Price Fetching Feature
// -----------------------------------------------------

// Removed in-memory caching and periodic fetching

// Provide an API endpoint to retrieve these prices on-demand
app.get('/api/coin-prices', async (req, res) => {
  try {
    const coinIds = [
      'bitcoin',
      'ethereum',
      'binancecoin',
      'usd-coin',
      'tether',
      'ripple',
      'cardano',
      'dogecoin',
      'solana',
      'avalanche-2',
      'shiba-inu',
      'litecoin',
      'tron',
      'polygon',
      'pepe'
    ].join(',');

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CoinGecko fetch failed with status: ${response.status}`);
    }
    const data = await response.json();
    // Log the fetched prices to the terminal console
    console.log('Fetched Coin Prices:', JSON.stringify(data, null, 2));
    // Send the fetched data to the frontend
    res.json(data);
  } catch (err) {
    console.error('Error fetching coin prices:', err.message);
    res.status(500).json({ error: 'Could not fetch coin prices', details: err.message });
  }
});

// -----------------------------------------------------
// 11) Start the Server
// -----------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
