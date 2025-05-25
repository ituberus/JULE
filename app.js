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
import { getExchangeRate } from './exchange_rate_helper.js';

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
      pin TEXT,
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
      admin_status TEXT DEFAULT 'pending_approval',
      admin_approved_amount TEXT,
      admin_remarks TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      date TEXT,
      reference TEXT,
      method TEXT,
      amount TEXT,
      total TEXT, // This might store the equivalent value in user's accountCurrency at time of request
      status TEXT, // User-facing status: 'pending', 'processing', 'completed', 'rejected', 'canceled'
      admin_status TEXT DEFAULT 'pending_approval', // Admin's internal status: 'pending_approval', 'approved', 'rejected'
      admin_processed_amount TEXT, // Actual amount processed by admin (after fees, if any)
      admin_remarks TEXT,
      withdrawal_fee TEXT DEFAULT '0',
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

    CREATE TABLE IF NOT EXISTS global_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT
    );

    CREATE TABLE IF NOT EXISTS open_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      symbol TEXT,
      direction TEXT,
      amount REAL,
      entry_price REAL,
      leverage INTEGER DEFAULT 1,
      status TEXT DEFAULT 'open',
      stop_loss_price REAL,
      take_profit_price REAL,
      margin REAL,
      open_timestamp TEXT
    );

    CREATE TABLE IF NOT EXISTS closed_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      open_trade_id INTEGER,
      userId INTEGER,
      symbol TEXT,
      direction TEXT,
      amount REAL,
      entry_price REAL,
      exit_price REAL,
      leverage INTEGER DEFAULT 1,
      profit_loss REAL,
      stop_loss_price REAL,
      take_profit_price REAL,
      margin REAL,
      open_timestamp TEXT,
      close_timestamp TEXT,
      closing_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      icon_url TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1 
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,  
      status TEXT NOT NULL, 
      purchase_price REAL,
      purchase_currency TEXT,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
    );

    CREATE TABLE IF NOT EXISTS signal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      min_deposit REAL DEFAULT 0,
      max_deposit REAL DEFAULT 0, 
      currency TEXT NOT NULL, 
      performance_metric TEXT, 
      is_active INTEGER DEFAULT 1 
    );

    DROP TABLE IF EXISTS user_signals; 
    CREATE TABLE IF NOT EXISTS user_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      balance REAL DEFAULT 0, 
      subscribed_at TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (plan_id) REFERENCES signal_plans(id)
    );

    CREATE TABLE IF NOT EXISTS stakeable_coins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, 
      short_name TEXT NOT NULL UNIQUE, 
      icon_url TEXT, 
      roi_percentage REAL NOT NULL, 
      roi_period TEXT DEFAULT 'yearly', 
      min_stake REAL DEFAULT 0,
      lockup_days INTEGER DEFAULT 0, 
      is_active INTEGER DEFAULT 1 
    );

    DROP TABLE IF EXISTS user_stakes; 
    CREATE TABLE IF NOT EXISTS user_stakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      stakeable_coin_id INTEGER NOT NULL,
      amount_staked REAL NOT NULL,
      start_date TEXT NOT NULL, 
      end_date TEXT,            
      expected_roi_value REAL,  
      status TEXT NOT NULL,     
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (stakeable_coin_id) REFERENCES stakeable_coins(id)
    );

    CREATE TABLE IF NOT EXISTS copy_traders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT, 
      performance_metric_demo TEXT, 
      strategy_summary TEXT,
      is_active INTEGER DEFAULT 1 
    );
  `);

  // Seed initial stakeable coins (run once after table creation)
  (async () => {
    const initialCoins = [
      { name: 'Avalanche', short_name: 'AVAX', icon_url: 'https://assets.coingecko.com/coins/images/12559/large/avalanche.png', roi_percentage: 7.2, roi_period: 'yearly', min_stake: 25, lockup_days: 14 },
      { name: 'Ethereum', short_name: 'ETH', icon_url: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png', roi_percentage: 4.5, roi_period: 'yearly', min_stake: 0.1, lockup_days: 0 },
      { name: 'Polygon', short_name: 'MATIC', icon_url: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png', roi_percentage: 5.0, roi_period: 'yearly', min_stake: 100, lockup_days: 0 },
      { name: 'Solana', short_name: 'SOL', icon_url: 'https://assets.coingecko.com/coins/images/4128/large/solana.png', roi_percentage: 6.0, roi_period: 'yearly', min_stake: 10, lockup_days: 7 },
      { name: 'Tether', short_name: 'USDT', icon_url: 'https://assets.coingecko.com/coins/images/325/large/Tether.png', roi_percentage: 2.5, roi_period: 'yearly', min_stake: 1000, lockup_days: 0 }
    ];
    for (const coin of initialCoins) {
      try {
        await db.run(
          'INSERT OR IGNORE INTO stakeable_coins (name, short_name, icon_url, roi_percentage, roi_period, min_stake, lockup_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
          [coin.name, coin.short_name, coin.icon_url, coin.roi_percentage, coin.roi_period, coin.min_stake, coin.lockup_days]
        );
      } catch (seedErr) {
        console.error('Error seeding stakeable coin ' + coin.short_name + ':', seedErr);
      }
    }
  })();

  // Insert default global settings if not present
  try {
    await db.run("INSERT OR IGNORE INTO global_settings (setting_key, setting_value) VALUES (?, ?)", 'pin_requirement_enabled', 'true');
  } catch (err) {
    console.error("Error inserting default global settings:", err);
  }

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
      referrerCode,
      pin
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
        referrerUsed, myReferrerCode, pin, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      pin || null, // Store PIN or null if not provided
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
        userId, date, reference, method, type, amount, totalEUR, status, 
        admin_status, admin_approved_amount, admin_remarks, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      now,
      reference,
      method || '', // Assuming this will store coin shortName like 'BTC', 'ETH'
      type || '',   // e.g., 'crypto'
      amount || '0',
      totalEUR || '0', // This field might be less relevant if 'amount' is in crypto and 'method' is coin symbol
      'pending_user_confirmation', // Initial status before admin review
      'pending_approval',          // admin_status
      amount || '0',               // admin_approved_amount (default to original amount)
      null,                        // admin_remarks
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
// 9b) [NEW] Admin Global PIN Settings
// -----------------------------------------------------

// TODO: Add admin authentication middleware if not already covered by a blanket admin auth for /api/admin/*

app.get('/api/admin/settings/pin', async (req, res) => {
  try {
    const setting = await db.get("SELECT setting_value FROM global_settings WHERE setting_key = 'pin_requirement_enabled'");
    if (setting) {
      res.json({ pin_requirement_enabled: setting.setting_value === 'true' });
    } else {
      // Default to true if not set, though it should be set by default on startup
      res.json({ pin_requirement_enabled: true });
    }
  } catch (err) {
    console.error('Error fetching PIN requirement setting:', err);
    res.status(500).json({ error: 'Could not fetch PIN setting', details: err.message });
  }
});

// ============================
// User Settings Endpoints
// ============================

// POST to change PIN
app.post('/api/settings/change-pin', requireAuth, async (req, res) => {
  const { current_pin, new_pin, confirm_new_pin } = req.body;
  const userId = req.userId;

  if (!current_pin || !new_pin || !confirm_new_pin) {
    return res.status(400).json({ error: 'All PIN fields are required.' });
  }
  if (new_pin !== confirm_new_pin) {
    return res.status(400).json({ error: 'New PIN and confirmation PIN do not match.' });
  }
  if (!/^\d{4}$/.test(new_pin)) {
    return res.status(400).json({ error: 'New PIN must be 4 digits.' });
  }

  try {
    const user = await db.get('SELECT pin FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Assuming PINs are stored in plaintext for now, as per existing password handling
    if (user.pin !== current_pin) {
      return res.status(401).json({ error: 'Incorrect current PIN.' });
    }

    await db.run('UPDATE users SET pin = ?, updatedAt = ? WHERE id = ?', [new_pin, new Date().toISOString(), userId]);
    res.json({ message: 'PIN changed successfully.' });

  } catch (err) {
    console.error(`Error changing PIN for user ${userId}:`, err);
    res.status(500).json({ error: 'Could not change PIN.', details: err.message });
  }
});

// POST to change password
app.post('/api/settings/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_new_password } = req.body;
  const userId = req.userId;

  if (!current_password || !new_password || !confirm_new_password) {
    return res.status(400).json({ error: 'All password fields are required.' });
  }
  if (new_password !== confirm_new_password) {
    return res.status(400).json({ error: 'New password and confirmation password do not match.' });
  }
  if (new_password.length < 6) { // Example validation: min length
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  try {
    const user = await db.get('SELECT password FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Assuming passwords are stored in plaintext for now
    if (user.password !== current_password) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    await db.run('UPDATE users SET password = ?, updatedAt = ? WHERE id = ?', [new_password, new Date().toISOString(), userId]);
    res.json({ message: 'Password changed successfully.' });

  } catch (err) {
    console.error(`Error changing password for user ${userId}:`, err);
    res.status(500).json({ error: 'Could not change password.', details: err.message });
  }
});

// ============================
// User Copy Trading Endpoints
// ============================

// GET all active copy traders (for users to view)
app.get('/api/copy-traders', async (req, res) => {
  try {
    const traders = await db.all('SELECT id, name, description, image_url, performance_metric_demo, strategy_summary FROM copy_traders WHERE is_active = 1 ORDER BY name');
    res.json(traders);
  } catch (err) {
    console.error('Error fetching active copy traders:', err);
    res.status(500).json({ error: 'Could not fetch copy traders', details: err.message });
  }
});

// POST to select or deselect a copy trader
app.post('/api/copy-trader/:traderId', requireAuth, async (req, res) => {
  const { traderId } = req.params;
  const userId = req.userId;

  let newCopiedTraderId = parseInt(traderId);

  if (isNaN(newCopiedTraderId)) {
    return res.status(400).json({ error: 'Invalid trader ID format.' });
  }

  try {
    if (newCopiedTraderId === 0) { // Special value to stop copying
      await db.run('UPDATE users SET copied_trader_id = NULL, updatedAt = ? WHERE id = ?', [new Date().toISOString(), userId]);
      return res.json({ message: 'Successfully stopped copying trader.' });
    }

    // Check if the traderId is valid and active
    const traderToCopy = await db.get('SELECT * FROM copy_traders WHERE id = ? AND is_active = 1', [newCopiedTraderId]);
    if (!traderToCopy) {
      return res.status(404).json({ error: 'Active copy trader not found or ID is invalid.' });
    }

    // Update user's copied_trader_id
    await db.run('UPDATE users SET copied_trader_id = ?, updatedAt = ? WHERE id = ?', [newCopiedTraderId, new Date().toISOString(), userId]);
    
    // Create notification
    const notificationMessage = `You are now copying ${traderToCopy.name}.`;
    await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [userId, notificationMessage, new Date().toISOString()]);

    res.json({ message: `Successfully started copying ${traderToCopy.name}.`, copied_trader_id: newCopiedTraderId });

  } catch (err) {
    console.error(`Error updating copied trader for user ${userId}:`, err);
    res.status(500).json({ error: 'Could not update copy trader selection', details: err.message });
  }
});

// ============================
// Admin Copy Trader Management Endpoints
// ============================

// GET all copy traders
app.get('/api/admin/copy_traders', requireAdminAuth, async (req, res) => {
  try {
    const traders = await db.all('SELECT * FROM copy_traders ORDER BY id DESC');
    res.json(traders);
  } catch (err) {
    console.error('Error fetching copy traders:', err);
    res.status(500).json({ error: 'Could not fetch copy traders', details: err.message });
  }
});

// POST create a new copy trader profile
app.post('/api/admin/copy_traders', requireAdminAuth, async (req, res) => {
  try {
    const { name, description, image_url, performance_metric_demo, strategy_summary, is_active = 1 } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name.' });
    }

    const result = await db.run(
      'INSERT INTO copy_traders (name, description, image_url, performance_metric_demo, strategy_summary, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || null, image_url || null, performance_metric_demo || null, strategy_summary || null, is_active ? 1 : 0]
    );
    res.status(201).json({ message: 'Copy trader profile created successfully.', traderId: result.lastID });
  } catch (err) {
    console.error('Error creating copy trader profile:', err);
    if (err.message.includes("UNIQUE constraint failed: copy_traders.name")) {
        return res.status(409).json({ error: 'A copy trader with this name already exists.' });
    }
    res.status(500).json({ error: 'Could not create copy trader profile', details: err.message });
  }
});

// PUT update an existing copy trader profile (including toggling is_active)
app.put('/api/admin/copy_traders/:traderId', requireAdminAuth, async (req, res) => {
  const { traderId } = req.params;
  const { name, description, image_url, performance_metric_demo, strategy_summary, is_active } = req.body;

  const existingTrader = await db.get('SELECT * FROM copy_traders WHERE id = ?', [traderId]);
  if (!existingTrader) {
    return res.status(404).json({ error: 'Copy trader profile not found.' });
  }

  const payload = {
    name: name !== undefined ? name : existingTrader.name,
    description: description !== undefined ? description : existingTrader.description,
    image_url: image_url !== undefined ? image_url : existingTrader.image_url,
    performance_metric_demo: performance_metric_demo !== undefined ? performance_metric_demo : existingTrader.performance_metric_demo,
    strategy_summary: strategy_summary !== undefined ? strategy_summary : existingTrader.strategy_summary,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : existingTrader.is_active,
  };

  if (!payload.name) { // Name is mandatory
    return res.status(400).json({ error: 'Name field is required for update.' });
  }
  
  try {
    await db.run(
      'UPDATE copy_traders SET name = ?, description = ?, image_url = ?, performance_metric_demo = ?, strategy_summary = ?, is_active = ? WHERE id = ?',
      [payload.name, payload.description, payload.image_url, payload.performance_metric_demo, payload.strategy_summary, payload.is_active, traderId]
    );
    res.json({ message: `Copy trader profile ${traderId} updated successfully.` });
  } catch (err) {
    console.error(`Error updating copy trader profile ${traderId}:`, err);
     if (err.message.includes("UNIQUE constraint failed: copy_traders.name")) {
        return res.status(409).json({ error: 'A copy trader with this name already exists.' });
    }
    res.status(500).json({ error: `Could not update copy trader profile ${traderId}`, details: err.message });
  }
});

// ============================
// User Staking Endpoints
// ============================

// GET all active stakeable coins (for users to view)
app.get('/api/stakeable-coins', async (req, res) => {
  try {
    const coins = await db.all('SELECT * FROM stakeable_coins WHERE is_active = 1 ORDER BY name');
    res.json(coins);
  } catch (err) {
    console.error('Error fetching stakeable coins:', err);
    res.status(500).json({ error: 'Could not fetch stakeable coins', details: err.message });
  }
});

// POST to stake a coin
app.post('/api/stake', requireAuth, async (req, res) => {
  const { stakeable_coin_id, amount_to_stake } = req.body;
  const userId = req.userId;
  const now = new Date();
  const startDateISO = now.toISOString();

  if (!stakeable_coin_id || !amount_to_stake || isNaN(parseFloat(amount_to_stake)) || parseFloat(amount_to_stake) <= 0) {
    return res.status(400).json({ error: 'Valid stakeable_coin_id and positive amount_to_stake are required.' });
  }
  const numericAmountToStake = parseFloat(amount_to_stake);

  try {
    // 1. Fetch stakeable coin details
    const coinToStake = await db.get('SELECT * FROM stakeable_coins WHERE id = ? AND is_active = 1', [stakeable_coin_id]);
    if (!coinToStake) {
      return res.status(404).json({ error: 'Active stakeable coin not found.' });
    }

    // 2. Validate amount_to_stake against plan's min_stake
    if (coinToStake.min_stake > 0 && numericAmountToStake < coinToStake.min_stake) {
      return res.status(400).json({ error: `Amount to stake (${numericAmountToStake}) is less than minimum stake (${coinToStake.min_stake} ${coinToStake.short_name}).` });
    }
    
    const coinShortName = coinToStake.short_name.toUpperCase();

    // 3. Balance Check: User must have a wallet for the coin with sufficient balance
    const paymentWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [userId, coinShortName]);
    if (!paymentWallet) {
      return res.status(400).json({ error: `No ${coinShortName} wallet found. Please ensure you have a ${coinShortName} balance.` });
    }
    const currentBalance = parseFloat(paymentWallet.balance);
    if (currentBalance < numericAmountToStake) {
      return res.status(400).json({ error: `Insufficient ${coinShortName} balance. Required: ${numericAmountToStake}, Available: ${currentBalance}.` });
    }

    // 4. Process Staking
    // Deduct amount_to_stake from the payment wallet
    const newPaymentWalletBalance = currentBalance - numericAmountToStake;
    await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newPaymentWalletBalance.toString(), paymentWallet.id]);

    // Calculate end_date and expected_roi_value
    let endDateISO = null;
    if (coinToStake.lockup_days > 0) {
      const endDate = new Date(now);
      endDate.setDate(now.getDate() + coinToStake.lockup_days);
      endDateISO = endDate.toISOString();
    }
    
    // Simplified ROI calculation: amount_staked * (roi_percentage / 100)
    // This assumes roi_percentage is for the lockup_period if one exists, or a general APY otherwise.
    // For more precise APY calculation over lockup_days: amount_staked * ( (roi_percentage / 100) / 365 ) * lockup_days
    // Using the simpler version as per subtask note.
    const expectedRoiValue = numericAmountToStake * (parseFloat(coinToStake.roi_percentage) / 100);

    // Create entry in user_stakes
    await db.run(
      'INSERT INTO user_stakes (userId, stakeable_coin_id, amount_staked, start_date, end_date, expected_roi_value, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, coinToStake.id, numericAmountToStake.toString(), startDateISO, endDateISO, expectedRoiValue.toFixed(8).toString(), 'active']
    );
    
    // Create notification
    const notificationMessage = `Successfully staked ${numericAmountToStake.toFixed(8)} ${coinShortName}.`;
    await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [userId, notificationMessage, startDateISO]);

    res.status(201).json({ 
        message: 'Successfully staked asset!', 
        coinName: coinToStake.name,
        amountStaked: numericAmountToStake,
        endDate: endDateISO,
        expectedRoi: expectedRoiValue.toFixed(8)
    });

  } catch (err) {
    console.error(`Error staking coin for user ${userId}, plan ${stakeable_coin_id}:`, err);
    res.status(500).json({ error: 'Could not process staking request', details: err.message });
  }
});

// GET user's stakes (active and past)
app.get('/api/my-stakes', requireAuth, async (req, res) => {
  try {
    const stakes = await db.all(`
      SELECT 
        us.id as user_stake_id, us.stakeable_coin_id, us.amount_staked, 
        us.start_date, us.end_date, us.expected_roi_value, us.status,
        sc.name as coin_name, sc.short_name as coin_short_name, sc.icon_url as coin_icon_url,
        sc.roi_percentage, sc.roi_period, sc.lockup_days
      FROM user_stakes us
      JOIN stakeable_coins sc ON us.stakeable_coin_id = sc.id
      WHERE us.userId = ?
      ORDER BY us.start_date DESC
    `, [req.userId]);
    res.json(stakes);
  } catch (err) {
    console.error('Error fetching user stakes:', err);
    res.status(500).json({ error: 'Could not fetch user stakes', details: err.message });
  }
});

// ============================
// Admin Stakeable Coin Management Endpoints
// ============================

// GET all stakeable coins
app.get('/api/admin/stakeable_coins', requireAdminAuth, async (req, res) => {
  try {
    const coins = await db.all('SELECT * FROM stakeable_coins ORDER BY id DESC');
    res.json(coins);
  } catch (err) {
    console.error('Error fetching stakeable coins:', err);
    res.status(500).json({ error: 'Could not fetch stakeable coins', details: err.message });
  }
});

// POST create a new stakeable coin
app.post('/api/admin/stakeable_coins', requireAdminAuth, async (req, res) => {
  try {
    const { name, short_name, icon_url, roi_percentage, roi_period = 'yearly', min_stake = 0, lockup_days = 0, is_active = 1 } = req.body;
    if (!name || !short_name || roi_percentage === undefined) {
      return res.status(400).json({ error: 'Missing required fields: name, short_name, roi_percentage.' });
    }
    if (isNaN(parseFloat(roi_percentage)) || parseFloat(roi_percentage) <= 0) {
      return res.status(400).json({ error: 'ROI percentage must be a positive number.' });
    }
    if (isNaN(parseFloat(min_stake)) || parseFloat(min_stake) < 0) {
      return res.status(400).json({ error: 'Min stake must be a non-negative number.' });
    }
     if (isNaN(parseInt(lockup_days)) || parseInt(lockup_days) < 0) {
      return res.status(400).json({ error: 'Lockup days must be a non-negative integer.' });
    }

    const result = await db.run(
      'INSERT INTO stakeable_coins (name, short_name, icon_url, roi_percentage, roi_period, min_stake, lockup_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, short_name, icon_url || null, parseFloat(roi_percentage), roi_period, parseFloat(min_stake), parseInt(lockup_days), is_active ? 1 : 0]
    );
    res.status(201).json({ message: 'Stakeable coin created successfully.', coinId: result.lastID });
  } catch (err) {
    console.error('Error creating stakeable coin:', err);
    if (err.message.includes("UNIQUE constraint failed: stakeable_coins.short_name")) {
        return res.status(409).json({ error: 'A stakeable coin with this short name already exists.' });
    }
    res.status(500).json({ error: 'Could not create stakeable coin', details: err.message });
  }
});

// PUT update an existing stakeable coin (including toggling is_active)
app.put('/api/admin/stakeable_coins/:coinId', requireAdminAuth, async (req, res) => {
  const { coinId } = req.params;
  const { name, short_name, icon_url, roi_percentage, roi_period, min_stake, lockup_days, is_active } = req.body;

  const existingCoin = await db.get('SELECT * FROM stakeable_coins WHERE id = ?', [coinId]);
  if (!existingCoin) {
    return res.status(404).json({ error: 'Stakeable coin not found.' });
  }

  const payload = {
    name: name !== undefined ? name : existingCoin.name,
    short_name: short_name !== undefined ? short_name : existingCoin.short_name,
    icon_url: icon_url !== undefined ? icon_url : existingCoin.icon_url,
    roi_percentage: roi_percentage !== undefined ? parseFloat(roi_percentage) : existingCoin.roi_percentage,
    roi_period: roi_period !== undefined ? roi_period : existingCoin.roi_period,
    min_stake: min_stake !== undefined ? parseFloat(min_stake) : existingCoin.min_stake,
    lockup_days: lockup_days !== undefined ? parseInt(lockup_days) : existingCoin.lockup_days,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : existingCoin.is_active,
  };

  if (!payload.name || !payload.short_name || payload.roi_percentage === undefined || isNaN(payload.roi_percentage) || payload.roi_percentage <= 0 ||
      isNaN(payload.min_stake) || payload.min_stake < 0 || isNaN(payload.lockup_days) || payload.lockup_days < 0) {
    return res.status(400).json({ error: 'Invalid or missing required fields for update.' });
  }
  
  try {
    await db.run(
      'UPDATE stakeable_coins SET name = ?, short_name = ?, icon_url = ?, roi_percentage = ?, roi_period = ?, min_stake = ?, lockup_days = ?, is_active = ? WHERE id = ?',
      [payload.name, payload.short_name, payload.icon_url, payload.roi_percentage, payload.roi_period, payload.min_stake, payload.lockup_days, payload.is_active, coinId]
    );
    res.json({ message: `Stakeable coin ${coinId} updated successfully.` });
  } catch (err) {
    console.error(`Error updating stakeable coin ${coinId}:`, err);
     if (err.message.includes("UNIQUE constraint failed: stakeable_coins.short_name")) {
        return res.status(409).json({ error: 'A stakeable coin with this short name already exists.' });
    }
    res.status(500).json({ error: `Could not update stakeable coin ${coinId}`, details: err.message });
  }
});

// ============================
// User Signal Plan Endpoints
// ============================

// GET all active signal plans (for users to view)
app.get('/api/signal-plans', async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM signal_plans WHERE is_active = 1 ORDER BY name');
    res.json(plans);
  } catch (err) {
    console.error('Error fetching active signal plans:', err);
    res.status(500).json({ error: 'Could not fetch signal plans', details: err.message });
  }
});

// POST subscribe to/deposit into a signal plan
app.post('/api/subscribe-signal/:planId', requireAuth, async (req, res) => {
  const { planId } = req.params;
  const { deposit_amount } = req.body;
  const userId = req.userId;
  const now = new Date().toISOString();

  if (!deposit_amount || isNaN(parseFloat(deposit_amount)) || parseFloat(deposit_amount) <= 0) {
    return res.status(400).json({ error: 'Valid positive deposit_amount is required.' });
  }
  const numericDepositAmount = parseFloat(deposit_amount);

  try {
    // 1. Fetch plan details
    const plan = await db.get('SELECT * FROM signal_plans WHERE id = ? AND is_active = 1', [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Active signal plan not found.' });
    }

    // 2. Validate deposit_amount against plan's min/max
    if (plan.min_deposit > 0 && numericDepositAmount < plan.min_deposit) {
      return res.status(400).json({ error: `Deposit amount ${numericDepositAmount} is less than minimum deposit ${plan.min_deposit} ${plan.currency}.` });
    }
    if (plan.max_deposit > 0 && numericDepositAmount > plan.max_deposit) {
      return res.status(400).json({ error: `Deposit amount ${numericDepositAmount} exceeds maximum deposit ${plan.max_deposit} ${plan.currency}.` });
    }
    
    const planCurrency = plan.currency.toUpperCase();

    // 3. Balance Check: User must have a wallet in plan.currency with sufficient balance
    const paymentWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [userId, planCurrency]);
    if (!paymentWallet) {
      return res.status(400).json({ error: `No ${planCurrency} wallet found. Please ensure you have a ${planCurrency} balance or convert funds.` });
    }
    const currentBalance = parseFloat(paymentWallet.balance);
    if (currentBalance < numericDepositAmount) {
      return res.status(400).json({ error: `Insufficient ${planCurrency} balance. Required: ${numericDepositAmount}, Available: ${currentBalance}. Please deposit or convert funds.` });
    }

    // 4. Process Subscription/Deposit
    // Deduct deposit_amount from the payment wallet
    const newPaymentWalletBalance = currentBalance - numericDepositAmount;
    await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newPaymentWalletBalance.toString(), paymentWallet.id]);

    // Check if user is already subscribed to this signal plan
    let userSignal = await db.get('SELECT * FROM user_signals WHERE userId = ? AND plan_id = ?', [userId, plan.id]);

    if (userSignal) {
      // If yes, add deposit_amount to the existing balance
      const currentSignalBalance = parseFloat(userSignal.balance);
      const newSignalBalance = currentSignalBalance + numericDepositAmount;
      await db.run('UPDATE user_signals SET balance = ? WHERE id = ?', [newSignalBalance.toString(), userSignal.id]);
    } else {
      // If no, create a new entry in user_signals
      await db.run(
        'INSERT INTO user_signals (userId, plan_id, balance, subscribed_at) VALUES (?, ?, ?, ?)',
        [userId, plan.id, numericDepositAmount.toString(), now]
      );
    }
    
    // Create notification
    const notificationMessage = `Successfully deposited ${numericDepositAmount.toFixed(2)} ${planCurrency} into ${plan.name} signal.`;
    await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [userId, notificationMessage, now]);

    res.status(200).json({ 
        message: 'Successfully deposited to signal plan!', 
        planName: plan.name,
        depositedAmount: numericDepositAmount,
        currency: planCurrency
    });

  } catch (err) {
    console.error(`Error subscribing user ${userId} to signal plan ${planId}:`, err);
    res.status(500).json({ error: 'Could not process signal plan subscription/deposit', details: err.message });
  }
});

// GET user's active signals
app.get('/api/my-signals', requireAuth, async (req, res) => {
  try {
    const signals = await db.all(`
      SELECT 
        us.id as user_signal_id, us.plan_id, us.balance as user_balance, us.subscribed_at,
        p.name as plan_name, p.description as plan_description, p.currency as plan_currency, 
        p.min_deposit, p.max_deposit, p.performance_metric
      FROM user_signals us
      JOIN signal_plans p ON us.plan_id = p.id
      WHERE us.userId = ? AND p.is_active = 1 
      ORDER BY us.subscribed_at DESC
    `, [req.userId]);
    res.json(signals);
  } catch (err) {
    console.error('Error fetching user signals:', err);
    res.status(500).json({ error: 'Could not fetch user signals', details: err.message });
  }
});

// ============================
// Admin Signal Plan Management Endpoints
// ============================

// GET all signal plans
app.get('/api/admin/signal_plans', requireAdminAuth, async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM signal_plans ORDER BY id DESC');
    res.json(plans);
  } catch (err) {
    console.error('Error fetching signal plans:', err);
    res.status(500).json({ error: 'Could not fetch signal plans', details: err.message });
  }
});

// POST create a new signal plan
app.post('/api/admin/signal_plans', requireAdminAuth, async (req, res) => {
  try {
    const { name, description, min_deposit = 0, max_deposit = 0, currency, performance_metric, is_active = 1 } = req.body;
    if (!name || currency === undefined || performance_metric === undefined) {
      return res.status(400).json({ error: 'Missing required fields: name, currency, performance_metric.' });
    }
    if (min_deposit !== undefined && (isNaN(parseFloat(min_deposit)) || parseFloat(min_deposit) < 0)) {
      return res.status(400).json({ error: 'Min deposit must be a non-negative number.' });
    }
    if (max_deposit !== undefined && (isNaN(parseFloat(max_deposit)) || parseFloat(max_deposit) < 0)) {
      return res.status(400).json({ error: 'Max deposit must be a non-negative number (or 0 for no limit).' });
    }
    if (parseFloat(max_deposit) !== 0 && parseFloat(min_deposit) > parseFloat(max_deposit)) {
        return res.status(400).json({ error: 'Min deposit cannot be greater than max deposit (unless max_deposit is 0 for no limit).' });
    }


    const result = await db.run(
      'INSERT INTO signal_plans (name, description, min_deposit, max_deposit, currency, performance_metric, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, parseFloat(min_deposit), parseFloat(max_deposit), currency, performance_metric, is_active ? 1 : 0]
    );
    res.status(201).json({ message: 'Signal plan created successfully.', planId: result.lastID });
  } catch (err) {
    console.error('Error creating signal plan:', err);
    if (err.message.includes("UNIQUE constraint failed: signal_plans.name")) {
        return res.status(409).json({ error: 'A signal plan with this name already exists.' });
    }
    res.status(500).json({ error: 'Could not create signal plan', details: err.message });
  }
});

// PUT update an existing signal plan (including toggling is_active)
app.put('/api/admin/signal_plans/:planId', requireAdminAuth, async (req, res) => {
  const { planId } = req.params;
  const { name, description, min_deposit, max_deposit, currency, performance_metric, is_active } = req.body;

  const existingPlan = await db.get('SELECT * FROM signal_plans WHERE id = ?', [planId]);
  if (!existingPlan) {
    return res.status(404).json({ error: 'Signal plan not found.' });
  }

  const payload = {
    name: name !== undefined ? name : existingPlan.name,
    description: description !== undefined ? description : existingPlan.description,
    min_deposit: min_deposit !== undefined ? parseFloat(min_deposit) : existingPlan.min_deposit,
    max_deposit: max_deposit !== undefined ? parseFloat(max_deposit) : existingPlan.max_deposit,
    currency: currency !== undefined ? currency : existingPlan.currency,
    performance_metric: performance_metric !== undefined ? performance_metric : existingPlan.performance_metric,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : existingPlan.is_active,
  };

  if (payload.name === undefined || payload.currency === undefined || payload.performance_metric === undefined ||
      payload.min_deposit === undefined || isNaN(payload.min_deposit) || payload.min_deposit < 0 ||
      payload.max_deposit === undefined || isNaN(payload.max_deposit) || payload.max_deposit < 0) {
    return res.status(400).json({ error: 'Invalid or missing required fields for update (name, currency, performance_metric, min_deposit, max_deposit).' });
  }
   if (parseFloat(payload.max_deposit) !== 0 && parseFloat(payload.min_deposit) > parseFloat(payload.max_deposit)) {
        return res.status(400).json({ error: 'Min deposit cannot be greater than max deposit (unless max_deposit is 0 for no limit).' });
    }
  
  try {
    await db.run(
      'UPDATE signal_plans SET name = ?, description = ?, min_deposit = ?, max_deposit = ?, currency = ?, performance_metric = ?, is_active = ? WHERE id = ?',
      [payload.name, payload.description, payload.min_deposit, payload.max_deposit, payload.currency, payload.performance_metric, payload.is_active, planId]
    );
    res.json({ message: `Signal plan ${planId} updated successfully.` });
  } catch (err) {
    console.error(`Error updating signal plan ${planId}:`, err);
     if (err.message.includes("UNIQUE constraint failed: signal_plans.name")) {
        return res.status(409).json({ error: 'A signal plan with this name already exists.' });
    }
    res.status(500).json({ error: `Could not update signal plan ${planId}`, details: err.message });
  }
});


// ============================
// User Subscription Management Endpoints
// ============================

// GET all active subscription plans (for users to view)
app.get('/api/subscription-plans', async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price');
    res.json(plans);
  } catch (err) {
    console.error('Error fetching active subscription plans:', err);
    res.status(500).json({ error: 'Could not fetch subscription plans', details: err.message });
  }
});

// POST subscribe to a plan
app.post('/api/subscribe/:planId', requireAuth, async (req, res) => {
  const { planId } = req.params;
  const userId = req.userId;
  const now = new Date();
  const startDateISO = now.toISOString();

  try {
    // 1. Fetch plan details
    const plan = await db.get('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1', [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Active subscription plan not found.' });
    }

    const planPrice = parseFloat(plan.price);
    const planCurrency = plan.currency.toUpperCase(); // e.g., USD, EUR, or even BTC

    // 2. Balance Check: User must have a wallet for plan.currency with sufficient balance
    const paymentWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [userId, planCurrency]);
    if (!paymentWallet) {
      return res.status(400).json({ error: `No ${planCurrency} wallet found. Please ensure you have a ${planCurrency} balance or convert funds.` });
    }
    const currentBalance = parseFloat(paymentWallet.balance);
    if (currentBalance < planPrice) {
      return res.status(400).json({ error: `Insufficient ${planCurrency} balance. Required: ${planPrice}, Available: ${currentBalance}. Please deposit or convert funds.` });
    }

    // 3. Process Subscription
    // Deduct price from wallet
    const newBalance = currentBalance - planPrice;
    await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newBalance.toString(), paymentWallet.id]);

    // Create entry in user_subscriptions
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + plan.duration_days);
    const endDateISO = endDate.toISOString();

    await db.run(
      'INSERT INTO user_subscriptions (userId, plan_id, start_date, end_date, status, purchase_price, purchase_currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, plan.id, startDateISO, endDateISO, 'active', plan.price, plan.currency]
    );
    
    // Update user's current plan info in users table (optional, but often useful)
    // This overwrites any existing planName/planAmount. A more complex system might handle multiple active subscriptions.
    await db.run('UPDATE users SET planName = ?, planAmount = ? WHERE id = ?', [plan.name, plan.price.toString(), userId]);


    // Create notification
    const notificationMessage = `Successfully subscribed to ${plan.name}. Your plan is active until ${new Date(endDateISO).toLocaleDateString()}.`;
    await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [userId, notificationMessage, startDateISO]);

    res.status(201).json({ 
        message: 'Subscription successful!', 
        planName: plan.name,
        endDate: endDateISO 
    });

  } catch (err) {
    console.error(`Error subscribing user ${userId} to plan ${planId}:`, err);
    res.status(500).json({ error: 'Could not process subscription', details: err.message });
  }
});

// GET user's subscriptions
app.get('/api/my-subscriptions', requireAuth, async (req, res) => {
  try {
    const subscriptions = await db.all(`
      SELECT 
        us.id, us.plan_id, us.start_date, us.end_date, us.status, 
        us.purchase_price, us.purchase_currency,
        p.name as plan_name, p.description as plan_description, p.duration_days as plan_duration_days
      FROM user_subscriptions us
      JOIN subscription_plans p ON us.plan_id = p.id
      WHERE us.userId = ?
      ORDER BY us.start_date DESC
    `, [req.userId]);
    res.json(subscriptions);
  } catch (err) {
    console.error('Error fetching user subscriptions:', err);
    res.status(500).json({ error: 'Could not fetch user subscriptions', details: err.message });
  }
});

// ============================
// Trade History API Endpoints
// ============================

app.get('/api/trades/open', requireAuth, async (req, res) => {
  try {
    const openTrades = await db.all(
      "SELECT * FROM open_trades WHERE userId = ? ORDER BY open_timestamp DESC",
      [req.userId]
    );
    res.json(openTrades);
  } catch (err) {
    console.error('Error fetching open trades:', err);
    res.status(500).json({ error: 'Could not fetch open trades', details: err.message });
  }
});

app.get('/api/trades/closed', requireAuth, async (req, res) => {
  try {
    const closedTrades = await db.all(
      "SELECT * FROM closed_trades WHERE userId = ? ORDER BY close_timestamp DESC",
      [req.userId]
    );
    res.json(closedTrades);
  } catch (err) {
    console.error('Error fetching closed trades:', err);
    res.status(500).json({ error: 'Could not fetch closed trades', details: err.message });
  }
});

// ============================
// Asset Conversion API Endpoint
// ============================

// Helper function to get USD value of a given amount of an asset
// This needs access to getAllCoinPricesUSD and getExchangeRate
async function getAssetUSDValue(assetShortName, amount, allCoinPrices, exchangeRateGetter) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount)) {
    throw new Error(`Invalid amount provided for ${assetShortName}`);
  }

  // Check if it's a known crypto coin (from CoinGecko IDs used in getAllCoinPricesUSD)
  // This assumes coinShortName can be mapped to a CoinGecko ID (e.g., btc -> bitcoin)
  // A more robust mapping might be needed (e.g. using the coinGeckoMap from trade_widget.html)
  const coinGeckoId = assetShortName.toLowerCase(); // Simplified mapping
  const cryptoPriceData = allCoinPrices[coinGeckoId];

  if (cryptoPriceData && cryptoPriceData.usd) {
    return numericAmount * cryptoPriceData.usd;
  } else if (assetShortName.toUpperCase() === 'USD') {
    return numericAmount;
  } else {
    // Assume it's another fiat currency that needs conversion to USD
    // getExchangeRate(TARGET) returns how many TARGET units are in 1 USD.
    // So, to get USD value of TARGET, amount_TARGET / (TARGET_per_USD)
    const rate = await exchangeRateGetter(assetShortName.toUpperCase()); // e.g. getExchangeRate('EUR') -> 0.93 (0.93 EUR for 1 USD)
    if (rate !== null && rate !== 0) {
      return numericAmount / rate; // e.g. 100 EUR / (0.93 EUR/USD) = USD value
    } else {
      throw new Error(`Could not determine USD value for asset ${assetShortName}: No price or exchange rate found.`);
    }
  }
}


app.post('/api/convert', requireAuth, async (req, res) => {
  const { from_asset_short_name, to_asset_short_name, amount_from } = req.body;
  const userId = req.userId;
  const now = new Date().toISOString();

  // 1. Validation
  if (!from_asset_short_name || !to_asset_short_name || !amount_from) {
    return res.status(400).json({ error: 'Missing required fields: from_asset_short_name, to_asset_short_name, amount_from.' });
  }
  if (from_asset_short_name === to_asset_short_name) {
    return res.status(400).json({ error: 'Cannot convert an asset to itself.' });
  }
  const numericAmountFrom = parseFloat(amount_from);
  if (isNaN(numericAmountFrom) || numericAmountFrom <= 0) {
    return res.status(400).json({ error: 'Amount to convert must be a positive number.' });
  }

  try {
    // 2. Fetch 'from' wallet and check balance
    const fromWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [userId, from_asset_short_name]);
    if (!fromWallet) {
      return res.status(404).json({ error: `Wallet for ${from_asset_short_name} not found.` });
    }
    const fromWalletBalance = parseFloat(fromWallet.balance);
    if (fromWalletBalance < numericAmountFrom) {
      return res.status(400).json({ error: `Insufficient balance in ${from_asset_short_name} wallet. Available: ${fromWalletBalance}, Requested: ${numericAmountFrom}` });
    }

    // 3. Calculate conversion
    const allCoinPrices = await getAllCoinPricesUSD(); // This helper should be available

    const usdValueOfAmountFrom = await getAssetUSDValue(from_asset_short_name, numericAmountFrom, allCoinPrices, getExchangeRate);
    const usdValueOfOneUnitToAsset = await getAssetUSDValue(to_asset_short_name, 1, allCoinPrices, getExchangeRate);

    if (usdValueOfOneUnitToAsset === 0) {
      return res.status(500).json({ error: `Cannot determine value for ${to_asset_short_name}. Conversion failed.` });
    }
    const amountToReceive = usdValueOfAmountFrom / usdValueOfOneUnitToAsset;

    // 4. Update balances (sequentially, ideally in a transaction)
    // Deduct from 'from' wallet
    const newFromBalance = fromWalletBalance - numericAmountFrom;
    await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newFromBalance.toString(), fromWallet.id]);

    // Add to 'to' wallet (create if not exists)
    let toWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [userId, to_asset_short_name]);
    if (!toWallet) {
      // For fiat, coinName can be same as shortName, address/key can be placeholders
      const isFiat = !allCoinPrices[to_asset_short_name.toLowerCase()]; // Simple check if not in crypto price list
      const toCoinName = isFiat ? to_asset_short_name.toUpperCase() : (allCoinPrices[to_asset_short_name.toLowerCase()]?.name || to_asset_short_name); // Fallback for crypto name
      
      const insertResult = await db.run(
        'INSERT INTO user_wallets (userId, coinName, shortName, walletAddress, privateKey, balance) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, toCoinName, to_asset_short_name.toUpperCase(), (isFiat ? 'N/A-FIAT' : 'GENERATED-ADDRESS'), (isFiat ? 'N/A-FIAT' : 'GENERATED-KEY'), '0']
      );
      toWallet = { id: insertResult.lastID, userId, shortName: to_asset_short_name.toUpperCase(), balance: '0' }; // Get the newly created wallet
    }
    
    const currentToBalance = parseFloat(toWallet.balance);
    const newToBalance = currentToBalance + amountToReceive;
    await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newToBalance.toFixed(8).toString(), toWallet.id]); // Using toFixed(8) for precision

    // 5. Notification
    const notificationMessage = `Successfully converted ${numericAmountFrom.toFixed(8)} ${from_asset_short_name} to ${amountToReceive.toFixed(8)} ${to_asset_short_name}.`;
    await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [userId, notificationMessage, now]);

    res.json({
      message: 'Conversion successful!',
      fromAsset: from_asset_short_name,
      amountConverted: numericAmountFrom,
      toAsset: to_asset_short_name,
      amountReceived: parseFloat(amountToReceive.toFixed(8)) // Send as number
    });

  } catch (error) {
    console.error('Asset conversion error:', error);
    res.status(500).json({ error: 'Could not process asset conversion.', details: error.message });
  }
});

// ============================
// Admin Withdrawal Review Endpoints
// ============================

app.get('/api/admin/withdrawals_for_review', requireAdminAuth, async (req, res) => {
  try {
    const withdrawalsToReview = await db.all(
      "SELECT * FROM withdrawals WHERE admin_status = 'pending_approval' ORDER BY createdAt DESC"
    );
    res.json(withdrawalsToReview);
  } catch (err) {
    console.error('Error fetching withdrawals for review:', err);
    res.status(500).json({ error: 'Could not fetch withdrawals for review', details: err.message });
  }
});

app.put('/api/admin/withdrawals/:withdrawalId/review', requireAdminAuth, async (req, res) => {
  const { withdrawalId } = req.params;
  const { admin_status, admin_processed_amount, admin_remarks, withdrawal_fee } = req.body;
  const now = new Date().toISOString();

  if (!['approved', 'rejected'].includes(admin_status)) {
    return res.status(400).json({ error: "Invalid admin_status. Must be 'approved' or 'rejected'." });
  }

  const withdrawal = await db.get('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId]);
  if (!withdrawal) {
    return res.status(404).json({ error: 'Withdrawal not found.' });
  }

  if (withdrawal.admin_status !== 'pending_approval') {
    return res.status(400).json({ error: 'This withdrawal has already been reviewed.' });
  }

  let finalProcessedAmount = withdrawal.amount; // Default to user's requested amount
  let finalFee = withdrawal_fee || '0';

  if (admin_status === 'approved') {
    if (admin_processed_amount === undefined || admin_processed_amount === null || isNaN(parseFloat(admin_processed_amount)) || parseFloat(admin_processed_amount) < 0) {
      return res.status(400).json({ error: 'Valid admin_processed_amount is required for approval.' });
    }
    finalProcessedAmount = parseFloat(admin_processed_amount).toString();
    // Ensure fee is a string and valid number
    if (isNaN(parseFloat(finalFee)) || parseFloat(finalFee) < 0) {
        finalFee = '0';
    } else {
        finalFee = parseFloat(finalFee).toString();
    }
  }

  try {
    await db.run(
      'UPDATE withdrawals SET admin_status = ?, admin_processed_amount = ?, admin_remarks = ?, withdrawal_fee = ?, status = ?, updatedAt = ? WHERE id = ?',
      [
        admin_status,
        admin_status === 'approved' ? finalProcessedAmount : null, // Only store processed amount if approved
        admin_remarks || null,
        admin_status === 'approved' ? finalFee : '0', // Only store fee if approved
        admin_status === 'approved' ? 'completed' : 'rejected', // User-facing status
        now,
        withdrawalId
      ]
    );

    const coinShortName = withdrawal.method; // Assumed to be coin shortName like 'BTC'
    const userRequestedAmount = parseFloat(withdrawal.amount);

    if (admin_status === 'approved') {
      const userWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [withdrawal.userId, coinShortName]);
      if (userWallet) {
        const currentBalance = parseFloat(userWallet.balance);
        // Deduct the original requested amount from user's balance
        // The admin_processed_amount is what the user receives, fee is the difference or explicit.
        const newBalance = currentBalance - userRequestedAmount; 
        
        if (newBalance < 0) {
            // This should ideally not happen if balance was checked at request time and funds were "held",
            // but as a safeguard if funds were not held:
            console.error(`Critical Error: User ${withdrawal.userId} wallet for ${coinShortName} has insufficient funds (${currentBalance}) for approved withdrawal of ${userRequestedAmount}.`);
            await db.run('UPDATE withdrawals SET admin_remarks = ?, status = ? WHERE id = ?', 
                [`Critical Error: Insufficient funds at time of processing. ${admin_remarks || ''}`, 'failed_processing', withdrawalId]);
            return res.status(500).json({ message: 'Withdrawal approved but failed to process due to insufficient funds at final processing.' });
        }

        await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newBalance.toString(), userWallet.id]);
        
        const message = `Your withdrawal request for ${userRequestedAmount} ${coinShortName} has been approved. Amount processed: ${finalProcessedAmount} ${coinShortName}. Fee: ${finalFee} ${coinShortName}.`;
        await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [withdrawal.userId, message, now]);
      } else {
        console.error(`Wallet not found for user ${withdrawal.userId} and coin ${coinShortName} during withdrawal approval.`);
        await db.run('UPDATE withdrawals SET admin_remarks = ? WHERE id = ?', 
            [`User wallet for ${coinShortName} not found. Processing failed. ${admin_remarks || ''}`, withdrawalId]);
        return res.status(500).json({ message: 'Withdrawal status updated, but failed to debit user wallet (wallet not found).' });
      }
    } else { // 'rejected'
      const message = `Your withdrawal request for ${userRequestedAmount} ${coinShortName} was rejected. Reason: ${admin_remarks || 'No specific reason provided.'}`;
      await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [withdrawal.userId, message, now]);
    }

    res.json({ message: `Withdrawal ${withdrawalId} has been ${admin_status}.` });
  } catch (err) {
    console.error(`Error processing withdrawal review for ${withdrawalId}:`, err);
    res.status(500).json({ error: 'Could not process withdrawal review', details: err.message });
  }
});

// ============================
// Admin Subscription Plan Management Endpoints
// ============================

// GET all subscription plans
app.get('/api/admin/subscription_plans', requireAdminAuth, async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM subscription_plans ORDER BY id DESC');
    res.json(plans);
  } catch (err) {
    console.error('Error fetching subscription plans:', err);
    res.status(500).json({ error: 'Could not fetch subscription plans', details: err.message });
  }
});

// POST create a new subscription plan
app.post('/api/admin/subscription_plans', requireAdminAuth, async (req, res) => {
  try {
    const { name, description, icon_url, price, currency, duration_days, is_active = 1 } = req.body;
    if (!name || price === undefined || !currency || duration_days === undefined) {
      return res.status(400).json({ error: 'Missing required fields: name, price, currency, duration_days.' });
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) < 0) {
      return res.status(400).json({ error: 'Price must be a non-negative number.' });
    }
    if (isNaN(parseInt(duration_days)) || parseInt(duration_days) <= 0) {
      return res.status(400).json({ error: 'Duration must be a positive integer.' });
    }

    const result = await db.run(
      'INSERT INTO subscription_plans (name, description, icon_url, price, currency, duration_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description || null, icon_url || null, parseFloat(price), currency, parseInt(duration_days), is_active ? 1 : 0]
    );
    res.status(201).json({ message: 'Subscription plan created successfully.', planId: result.lastID });
  } catch (err) {
    console.error('Error creating subscription plan:', err);
    res.status(500).json({ error: 'Could not create subscription plan', details: err.message });
  }
});

// PUT update an existing subscription plan (including toggling is_active)
app.put('/api/admin/subscription_plans/:planId', requireAdminAuth, async (req, res) => {
  const { planId } = req.params;
  const { name, description, icon_url, price, currency, duration_days, is_active } = req.body;

  // Fetch existing plan to ensure it exists and for selective updates
  const existingPlan = await db.get('SELECT * FROM subscription_plans WHERE id = ?', [planId]);
  if (!existingPlan) {
    return res.status(404).json({ error: 'Subscription plan not found.' });
  }

  // Construct payload with only provided fields, or keep existing if not provided
  const payload = {
    name: name !== undefined ? name : existingPlan.name,
    description: description !== undefined ? description : existingPlan.description,
    icon_url: icon_url !== undefined ? icon_url : existingPlan.icon_url,
    price: price !== undefined ? parseFloat(price) : existingPlan.price,
    currency: currency !== undefined ? currency : existingPlan.currency,
    duration_days: duration_days !== undefined ? parseInt(duration_days) : existingPlan.duration_days,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : existingPlan.is_active,
  };

  if (payload.name === undefined || payload.price === undefined || isNaN(payload.price) || payload.price < 0 ||
      payload.currency === undefined || payload.duration_days === undefined || isNaN(payload.duration_days) || payload.duration_days <= 0) {
    return res.status(400).json({ error: 'Invalid or missing required fields for update.' });
  }
  
  try {
    await db.run(
      'UPDATE subscription_plans SET name = ?, description = ?, icon_url = ?, price = ?, currency = ?, duration_days = ?, is_active = ? WHERE id = ?',
      [payload.name, payload.description, payload.icon_url, payload.price, payload.currency, payload.duration_days, payload.is_active, planId]
    );
    res.json({ message: `Subscription plan ${planId} updated successfully.` });
  } catch (err) {
    console.error(`Error updating subscription plan ${planId}:`, err);
    res.status(500).json({ error: `Could not update subscription plan ${planId}`, details: err.message });
  }
});

// ============================
// User Subscription Management Endpoints
// ============================

// GET all active subscription plans (for users to view)
app.get('/api/subscription-plans', async (req, res) => {
  try {
    const plans = await db.all('SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price');
    res.json(plans);
  } catch (err) {
    console.error('Error fetching active subscription plans:', err);
    res.status(500).json({ error: 'Could not fetch subscription plans', details: err.message });
  }
});

// POST subscribe to a plan
app.post('/api/subscribe/:planId', requireAuth, async (req, res) => {
  const { planId } = req.params;
  const userId = req.userId;
  const now = new Date();
  const startDateISO = now.toISOString();

  try {
    // 1. Fetch plan details
    const plan = await db.get('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1', [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Active subscription plan not found.' });
    }

    const planPrice = parseFloat(plan.price);
    const planCurrency = plan.currency.toUpperCase(); // e.g., USD, EUR, or even BTC

    // 2. Balance Check: User must have a wallet for plan.currency with sufficient balance
    const paymentWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [userId, planCurrency]);
    if (!paymentWallet) {
      return res.status(400).json({ error: `No ${planCurrency} wallet found. Please ensure you have a ${planCurrency} balance or convert funds.` });
    }
    const currentBalance = parseFloat(paymentWallet.balance);
    if (currentBalance < planPrice) {
      return res.status(400).json({ error: `Insufficient ${planCurrency} balance. Required: ${planPrice}, Available: ${currentBalance}. Please deposit or convert funds.` });
    }

    // 3. Process Subscription
    // Deduct price from wallet
    const newBalance = currentBalance - planPrice;
    await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newBalance.toString(), paymentWallet.id]);

    // Create entry in user_subscriptions
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + plan.duration_days);
    const endDateISO = endDate.toISOString();

    await db.run(
      'INSERT INTO user_subscriptions (userId, plan_id, start_date, end_date, status, purchase_price, purchase_currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, plan.id, startDateISO, endDateISO, 'active', plan.price, plan.currency]
    );
    
    // Update user's current plan info in users table (optional, but often useful)
    // This overwrites any existing planName/planAmount. A more complex system might handle multiple active subscriptions.
    await db.run('UPDATE users SET planName = ?, planAmount = ? WHERE id = ?', [plan.name, plan.price.toString(), userId]);


    // Create notification
    const notificationMessage = `Successfully subscribed to ${plan.name}. Your plan is active until ${new Date(endDateISO).toLocaleDateString()}.`;
    await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [userId, notificationMessage, startDateISO]);

    res.status(201).json({ 
        message: 'Subscription successful!', 
        planName: plan.name,
        endDate: endDateISO 
    });

  } catch (err) {
    console.error(`Error subscribing user ${userId} to plan ${planId}:`, err);
    res.status(500).json({ error: 'Could not process subscription', details: err.message });
  }
});

// GET user's subscriptions
app.get('/api/my-subscriptions', requireAuth, async (req, res) => {
  try {
    const subscriptions = await db.all(`
      SELECT 
        us.id, us.plan_id, us.start_date, us.end_date, us.status, 
        us.purchase_price, us.purchase_currency,
        p.name as plan_name, p.description as plan_description, p.duration_days as plan_duration_days
      FROM user_subscriptions us
      JOIN subscription_plans p ON us.plan_id = p.id
      WHERE us.userId = ?
      ORDER BY us.start_date DESC
    `, [req.userId]);
    res.json(subscriptions);
  } catch (err) {
    console.error('Error fetching user subscriptions:', err);
    res.status(500).json({ error: 'Could not fetch user subscriptions', details: err.message });
  }
});


// ============================
// Exchange Rate API Endpoint
// ============================
app.get('/api/exchange-rate/:targetCurrency', async (req, res) => {
  try {
    const { targetCurrency } = req.params;
    if (!targetCurrency) {
      return res.status(400).json({ error: 'Target currency is required.' });
    }
    const rate = await getExchangeRate(targetCurrency.toUpperCase()); // Ensure consistent casing
    if (rate !== null) {
      res.json({ baseCurrency: 'USD', targetCurrency: targetCurrency.toUpperCase(), rate: rate });
    } else {
      res.status(404).json({ error: `Exchange rate for ${targetCurrency.toUpperCase()} not found or failed to fetch.` });
    }
  } catch (err) {
    console.error('Error fetching single exchange rate:', err);
    res.status(500).json({ error: 'Could not fetch exchange rate', details: err.message });
  }
});

app.put('/api/admin/settings/pin', async (req, res) => {
  try {
    const { pin_requirement_enabled } = req.body;
    if (typeof pin_requirement_enabled !== 'boolean') {
      return res.status(400).json({ error: 'pin_requirement_enabled must be a boolean (true or false).' });
    }

    await db.run("UPDATE global_settings SET setting_value = ? WHERE setting_key = 'pin_requirement_enabled'", pin_requirement_enabled.toString());
    res.json({ message: 'PIN requirement setting updated successfully.' });
  } catch (err) {
    console.error('Error updating PIN requirement setting:', err);
    res.status(500).json({ error: 'Could not update PIN setting', details: err.message });
  }
});

// ============================
// Admin Deposit Review Endpoints
// ============================

// Placeholder for admin authentication - replace with actual admin check
const requireAdminAuth = (req, res, next) => {
  // For now, let's assume an admin user might have a specific ID or role
  // This is NOT secure for production.
  // const isAdmin = req.userId === ADMIN_USER_ID; // Example
  // if (!isAdmin) return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  console.log('Bypassing admin auth for /api/admin/deposits... routes for now.');
  next();
};

app.get('/api/admin/deposits_for_review', requireAdminAuth, async (req, res) => {
  try {
    const depositsToReview = await db.all(
      "SELECT * FROM deposits WHERE admin_status = 'pending_approval' ORDER BY createdAt DESC"
    );
    res.json(depositsToReview);
  } catch (err) {
    console.error('Error fetching deposits for review:', err);
    res.status(500).json({ error: 'Could not fetch deposits for review', details: err.message });
  }
});

app.put('/api/admin/deposits/:depositId/review', requireAdminAuth, async (req, res) => {
  const { depositId } = req.params;
  const { admin_status, admin_approved_amount, admin_remarks } = req.body;
  const now = new Date().toISOString();

  if (!['approved', 'rejected'].includes(admin_status)) {
    return res.status(400).json({ error: "Invalid admin_status. Must be 'approved' or 'rejected'." });
  }

  const deposit = await db.get('SELECT * FROM deposits WHERE id = ?', [depositId]);
  if (!deposit) {
    return res.status(404).json({ error: 'Deposit not found.' });
  }

  if (deposit.admin_status !== 'pending_approval') {
    return res.status(400).json({ error: 'This deposit has already been reviewed.' });
  }

  let finalApprovedAmount = deposit.amount; // Default to original amount

  if (admin_status === 'approved') {
    if (admin_approved_amount === undefined || admin_approved_amount === null || isNaN(parseFloat(admin_approved_amount)) || parseFloat(admin_approved_amount) < 0) {
      return res.status(400).json({ error: 'Valid admin_approved_amount is required for approval.' });
    }
    finalApprovedAmount = parseFloat(admin_approved_amount).toString();
  }

  try {
    await db.run(
      'UPDATE deposits SET admin_status = ?, admin_approved_amount = ?, admin_remarks = ?, status = ?, updatedAt = ? WHERE id = ?',
      [admin_status, finalApprovedAmount, admin_remarks || null, admin_status === 'approved' ? 'confirmed' : 'rejected_by_admin', now, depositId]
    );

    const coinShortName = deposit.method; // Assuming 'method' stores the coin shortName (e.g., 'BTC')

    if (admin_status === 'approved') {
      const userWallet = await db.get('SELECT * FROM user_wallets WHERE userId = ? AND shortName = ?', [deposit.userId, coinShortName]);
      if (userWallet) {
        const currentBalance = parseFloat(userWallet.balance);
        const approvedAmountNum = parseFloat(finalApprovedAmount);
        const newBalance = currentBalance + approvedAmountNum;
        await db.run('UPDATE user_wallets SET balance = ? WHERE id = ?', [newBalance.toString(), userWallet.id]);
        
        const depositorNotificationMessage = `Your deposit of ${finalApprovedAmount} ${coinShortName} has been approved and credited to your wallet.`;
        await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [deposit.userId, depositorNotificationMessage, now]);

        // --- BEGIN REFERRAL REWARD LOGIC ---
        const depositorUser = await db.get('SELECT referrerUsed FROM users WHERE id = ?', [deposit.userId]);
        if (depositorUser && depositorUser.referrerUsed) {
          const referrer = await db.get('SELECT id, accountCurrency, referrerEarnings FROM users WHERE myReferrerCode = ?', [depositorUser.referrerUsed]);
          if (referrer) {
            const depositAmountNum = parseFloat(finalApprovedAmount);
            // Use getAllCoinPricesUSD which should be defined globally or passed/imported
            const allPrices = await getAllCoinPricesUSD(); 
            const coinPriceData = allPrices[coinShortName.toLowerCase()] || allPrices[deposit.method.toLowerCase()];
            
            if (coinPriceData && coinPriceData.usd) {
              const depositValueUSD = depositAmountNum * coinPriceData.usd;
              const rewardValueUSD = depositValueUSD * 0.10; // 10% reward

              const referrerCurrency = referrer.accountCurrency || 'USD';
              let rewardAmountInReferrerCurrency = rewardValueUSD;

              if (referrerCurrency.toUpperCase() !== 'USD') {
                const conversionRate = await getExchangeRate(referrerCurrency); // Fetches Target per USD
                if (conversionRate && conversionRate !== 1.0) { // Ensure conversion rate is valid and not just USD fallback
                  rewardAmountInReferrerCurrency = rewardValueUSD * conversionRate;
                } else if (!conversionRate) { // Rate fetch failed or returned null
                  console.warn(`Could not get exchange rate for ${referrerCurrency}. Reward for referrer ${referrer.id} will be calculated based on USD value.`);
                  // Fallback: store USD value or skip if conversion is critical
                }
              }
              
              const currentReferrerEarnings = parseFloat(referrer.referrerEarnings || '0');
              const newReferrerEarnings = currentReferrerEarnings + rewardAmountInReferrerCurrency;
              
              await db.run('UPDATE users SET referrerEarnings = ? WHERE id = ?', [newReferrerEarnings.toFixed(2).toString(), referrer.id]);
              
              const referrerNotificationMessage = `You earned a referral bonus of ${rewardAmountInReferrerCurrency.toFixed(2)} ${referrerCurrency}!`;
              await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [referrer.id, referrerNotificationMessage, now]);
              console.log(`Referral reward of ${rewardAmountInReferrerCurrency.toFixed(2)} ${referrerCurrency} processed for user ${referrer.id}`);
            } else {
              console.warn(`Could not determine USD price for ${coinShortName} (Deposit ID: ${deposit.id}) to calculate referral reward. Original method: ${deposit.method}`);
            }
          } else {
            console.log(`Referrer with code ${depositorUser.referrerUsed} not found for deposit ID ${deposit.id}.`);
          }
        }
        // --- END REFERRAL REWARD LOGIC ---

      } else { // User wallet not found for deposit credit
        console.error(`Wallet not found for user ${deposit.userId} and coin ${coinShortName} during deposit approval.`);
        await db.run('UPDATE deposits SET admin_remarks = ? WHERE id = ?', [`User wallet for ${coinShortName} not found. Credit failed. ${admin_remarks || ''}`, depositId]);
         return res.status(500).json({ message: 'Deposit status updated, but failed to credit user wallet (wallet not found).' });
      }
    } else { // 'rejected' by admin
      const userRejectedMessage = `Your deposit of ${deposit.amount} ${coinShortName} was rejected. Reason: ${admin_remarks || 'No specific reason provided.'}`;
      await db.run('INSERT INTO notifications (userId, message, createdAt) VALUES (?, ?, ?)', [deposit.userId, userRejectedMessage, now]);
    }

    res.json({ message: `Deposit ${depositId} has been ${admin_status}.` });
  } catch (err) {
    console.error(`Error processing deposit review for ${depositId}:`, err);
    res.status(500).json({ error: 'Could not process deposit review', details: err.message });
  }
});

// ============================
// Dashboard API Endpoints
// ============================

// Helper function to get USD prices (simulates fetching from /api/coin-prices logic)
// In a real scenario, you might refactor /api/coin-prices to be a callable function
// or have a shared service that both use.
async function getAllCoinPricesUSD() {
  // This is a simplified version of the /api/coin-prices logic
  // For brevity, directly using the known list of coin IDs.
  const coinIds = [
    'bitcoin', 'ethereum', 'binancecoin', 'usd-coin', 'tether', 'ripple',
    'cardano', 'dogecoin', 'solana', 'avalanche-2', 'shiba-inu', 'litecoin',
    'tron', 'polygon', 'pepe'
  ].join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`CoinGecko fetch failed for prices: ${response.status}`);
      return {}; // Return empty if fetch fails
    }
    return await response.json();
  } catch (err) {
    console.error('Error in getAllCoinPricesUSD:', err.message);
    return {}; // Return empty on error
  }
}

app.get('/api/dashboard/total-balance', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await db.get('SELECT accountCurrency FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const accountCurrency = user.accountCurrency || 'USD';

    const wallets = await db.all('SELECT coinName, shortName, balance FROM user_wallets WHERE userId = ?', [userId]);
    const coinPricesUSD = await getAllCoinPricesUSD(); 
    
    let totalBalanceInUserCurrency = 0;

    for (const wallet of wallets) {
      const coinGeckoId = wallet.shortName.toLowerCase(); // Assuming shortName maps to CoinGecko IDs like 'btc' -> 'bitcoin'
                                                       // This might need a mapping object if shortNames are different
                                                       // e.g. const map = { BTC: 'bitcoin', ETH: 'ethereum', ...}; coinGeckoId = map[wallet.shortName];
      
      // A more robust mapping might be needed if shortName doesn't directly map to coingecko IDs
      // For now, let's assume a simple lowercase conversion, or use coinName if it's more accurate
      // For example, if wallet.coinName is 'Bitcoin', wallet.shortName is 'BTC'.
      // The /api/coin-prices uses full names like 'bitcoin'.
      // We need a consistent key. Let's assume coinPricesUSD keys are like 'bitcoin', 'ethereum'.
      // A mapping from user_wallets.shortName or coinName to these keys is essential.
      // For now, using a simple lowercase of shortName as a placeholder for this mapping.
      const priceData = coinPricesUSD[coinGeckoId] || coinPricesUSD[wallet.coinName.toLowerCase()];


      if (priceData && priceData.usd) {
        const balance = parseFloat(wallet.balance);
        if (isNaN(balance)) continue;

        const valueInUSD = balance * priceData.usd;
        
        if (accountCurrency === 'USD') {
          totalBalanceInUserCurrency += valueInUSD;
        } else {
          const rate = await getExchangeRate(accountCurrency);
          if (rate !== null) {
            totalBalanceInUserCurrency += valueInUSD * rate;
          } else {
            // If exchange rate is not available, we might skip this wallet or count its USD value
            // For now, let's log and skip conversion, effectively not adding it if rate fails.
            console.warn(`Exchange rate for ${accountCurrency} not found. Wallet ${wallet.shortName} not converted.`);
          }
        }
      }
    }
    res.json({ totalBalance: parseFloat(totalBalanceInUserCurrency.toFixed(2)) });
  } catch (err) {
    console.error('Error fetching total balance:', err);
    res.status(500).json({ error: 'Could not fetch total balance', details: err.message });
  }
});

app.get('/api/dashboard/top-coins', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await db.get('SELECT accountCurrency FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    const accountCurrency = user.accountCurrency || 'USD';

    const wallets = await db.all('SELECT coinName, shortName, balance FROM user_wallets WHERE userId = ?', [userId]);
    const coinPricesUSD = await getAllCoinPricesUSD(); // Helper function created for total-balance

    let coinsWithValue = [];

    for (const wallet of wallets) {
      const balance = parseFloat(wallet.balance);
      if (isNaN(balance) || balance === 0) continue;

      // Simplified CoinGecko ID mapping (similar to total-balance)
      const coinGeckoId = wallet.shortName.toLowerCase(); 
      const priceData = coinPricesUSD[coinGeckoId] || coinPricesUSD[wallet.coinName.toLowerCase()];

      if (priceData && priceData.usd) {
        const valueInUSD = balance * priceData.usd;
        let valueInUserCurrency = valueInUSD;

        if (accountCurrency !== 'USD') {
          const rate = await getExchangeRate(accountCurrency);
          if (rate !== null) {
            valueInUserCurrency = valueInUSD * rate;
          } else {
            // If rate is null, it means it defaulted to 1.0 (USD) inside getExchangeRate or failed.
            // Depending on desired behavior, we might log or handle this.
            // For now, valueInUserCurrency remains valueInUSD if rate is problematic.
             console.warn(`Exchange rate for ${accountCurrency} not found for ${wallet.shortName}, using USD value.`);
          }
        }
        
        // Placeholder for icon URL - this would ideally come from a config or another service
        const iconUrl = `path/to/icons/${wallet.shortName.toLowerCase()}.png`; 

        coinsWithValue.push({
          coinName: wallet.coinName,
          shortName: wallet.shortName,
          balance: wallet.balance, // Keep original string balance for display
          valueInUserCurrency: parseFloat(valueInUserCurrency.toFixed(2)), // Store as number for sorting
          iconUrl: iconUrl 
        });
      }
    }

    // Sort by value in descending order
    coinsWithValue.sort((a, b) => b.valueInUserCurrency - a.valueInUserCurrency);

    const topN = 5; // Return top 5 coins
    res.json(coinsWithValue.slice(0, topN));

  } catch (err) {
    console.error('Error fetching top coins:', err);
    res.status(500).json({ error: 'Could not fetch top coins', details: err.message });
  }
});


// TODO: Add admin authentication middleware if not already covered by a blanket admin auth for /api/admin/*

app.get('/api/admin/settings/pin', async (req, res) => {
  try {
    const setting = await db.get("SELECT setting_value FROM global_settings WHERE setting_key = 'pin_requirement_enabled'");
    if (setting) {
      res.json({ pin_requirement_enabled: setting.setting_value === 'true' });
    } else {
      // Default to true if not set, though it should be set by default on startup
      res.json({ pin_requirement_enabled: true });
    }
  } catch (err) {
    console.error('Error fetching PIN requirement setting:', err);
    res.status(500).json({ error: 'Could not fetch PIN setting', details: err.message });
  }
});

app.put('/api/admin/settings/pin', async (req, res) => {
  try {
    const { pin_requirement_enabled } = req.body;
    if (typeof pin_requirement_enabled !== 'boolean') {
      return res.status(400).json({ error: 'pin_requirement_enabled must be a boolean (true or false).' });
    }

    await db.run("UPDATE global_settings SET setting_value = ? WHERE setting_key = 'pin_requirement_enabled'", pin_requirement_enabled.toString());
    res.json({ message: 'PIN requirement setting updated successfully.' });
  } catch (err) {
    console.error('Error updating PIN requirement setting:', err);
    res.status(500).json({ error: 'Could not update PIN setting', details: err.message });
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
