/*********************************************
 * deposit.js
 *********************************************/

/** 
 * GLOBALS
 * We'll store certain data in global variables for reuse:
 * - currentUser: from /api/auth/me
 * - userWallets: from /api/user/:id/wallets
 * - deposits: from /api/user/:id/deposits
 * - coinPrices: from /api/coin-prices
 * - exchangeRates: from Exchangerate-API (for user's local currency)
 */
let currentUser = null;
let userWallets = [];
let deposits = [];
let coinPrices = {};
let exchangeRates = {};
let userCurrency = 'USD'; // fallback if not found

// Telegram info (you said you might add more IDs later)
const TELEGRAM_BOT_TOKEN = '7504988589:AAGRqHBTqeC7UH6AlX6TqAYn6u2wtTXkCcA'; 
const TELEGRAM_CHAT_IDS = ['1277452628'];

// ExchangeRate-API key
const EXCHANGE_RATE_API_KEY = '22b4c51015d34a6cc3fd928b';

/****************************************************
 * On DOMContentLoaded, we run our initialization.
 ****************************************************/
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Show loading overlay
    document.getElementById('loadingOverlay').style.display = 'flex';

    // 1) Check if user is logged in
    await fetchCurrentUser();

    // 2) Fetch coin prices from your backend
    await fetchCoinPrices();

    // 3) Fetch exchange rates from Exchangerate-API
    await fetchExchangeRates();

    // 4) Fetch user wallets
    await fetchUserWallets();

    // 5) Fetch existing deposits
    await fetchUserDeposits();

    // 6) Render deposit table
    renderDepositTable();

    // 7) Setup event listeners (search, filter, open modal, etc.)
    setupEventListeners();

    // 8) Set the "Total (Local)" header to reflect user currency
    const tableTotalHeader = document.getElementById('tableTotalHeader');
    if (userCurrency) {
      tableTotalHeader.textContent = `Total (${userCurrency})`;
    }

    // Hide loading overlay
    document.getElementById('loadingOverlay').style.display = 'none';

  } catch (error) {
    console.error('Initialization error:', error);
    // Optionally, hide loading overlay and show error message
    document.getElementById('loadingOverlay').style.display = 'none';
    alert('Failed to load the page. Please try again.');
  }
});

/****************************************************
 * 1) Check current user
 ****************************************************/
async function fetchCurrentUser() {
  const meRes = await fetch('/api/auth/me', { credentials: 'include' });
  if (!meRes.ok) {
    // If 401 or not ok, redirect to login page
    window.location.href = '/login.html';
    throw new Error('Not logged in');
  }
  const meData = await meRes.json();
  currentUser = meData.user;
  // The user's local currency
  userCurrency = currentUser.accountCurrency || 'USD';
}

/****************************************************
 * 2) Fetch coin prices
 ****************************************************/
async function fetchCoinPrices() {
  try {
    const res = await fetch('/api/coin-prices', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Coin prices fetch failed with status: ${res.status}`);
    }
    coinPrices = await res.json();
  } catch (err) {
    console.error('Error fetching coin prices:', err);
    coinPrices = {};
  }
}

/****************************************************
 * 3) Fetch exchange rates from Exchangerate-API
 *    We'll get a rates table for USD -> other currencies
 ****************************************************/
async function fetchExchangeRates() {
  try {
    const url = `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/USD`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Exchange rate fetch failed: ${res.status}`);
    }
    const data = await res.json();
    exchangeRates = data.conversion_rates || {};
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    exchangeRates = {};
  }
}

/****************************************************
 * 4) Fetch user wallets
 ****************************************************/
async function fetchUserWallets() {
  try {
    const res = await fetch(`/api/user/${currentUser.id}/wallets`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Failed to fetch user wallets: ${res.status}`);
    }
    userWallets = await res.json();
  } catch (error) {
    console.error('Error fetching wallets:', error);
    userWallets = [];
  }
}

/****************************************************
 * 5) Fetch user deposits
 ****************************************************/
async function fetchUserDeposits() {
  try {
    const res = await fetch(`/api/user/${currentUser.id}/deposits`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Failed to fetch deposits: ${res.status}`);
    }
    deposits = await res.json();
  } catch (error) {
    console.error('Error fetching deposits:', error);
    deposits = [];
  }
}

/****************************************************
 * 6) Render deposit table with search + filter
 ****************************************************/
function renderDepositTable() {
  const tbody = document.querySelector('#depositTable tbody');
  tbody.innerHTML = '';

  // Get search term & filter
  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  const filterStatus = document.getElementById('statusFilter').value;

  // Sort deposits by date descending (newest first)
  const sortedDeposits = [...deposits].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter deposits
  const filtered = sortedDeposits.filter(dep => {
    // status filter
    if (filterStatus && dep.status !== filterStatus) {
      return false;
    }
    // search
    const combined = `${dep.reference} ${dep.method} ${dep.type}`.toLowerCase();
    if (searchTerm && !combined.includes(searchTerm)) {
      return false;
    }
    return true;
  });

  filtered.forEach(dep => {
    const tr = document.createElement('tr');

    // ID
    const tdId = document.createElement('td');
    tdId.textContent = dep.id;
    tr.appendChild(tdId);

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = formatDate(dep.date);
    tr.appendChild(tdDate);

    // Reference
    const tdRef = document.createElement('td');
    tdRef.textContent = dep.reference;
    tr.appendChild(tdRef);

    // Method
    const tdMethod = document.createElement('td');
    tdMethod.textContent = dep.method;
    tr.appendChild(tdMethod);

    // Type
    const tdType = document.createElement('td');
    tdType.textContent = dep.type;
    tr.appendChild(tdType);

    // Amount (crypto)
    const tdAmount = document.createElement('td');
    tdAmount.textContent = dep.amount;
    tr.appendChild(tdAmount);

    // Total (local currency) - computed dynamically
    const tdTotal = document.createElement('td');
    const shortName = getShortNameFromMethod(dep.method); // e.g., "BTC"
    const coinKey = guessCoinGeckoKey(shortName);
    const coinUSDPrice = coinPrices[coinKey]?.usd ?? 1; // 1 if not found (for stablecoins like USDC)
    const amountCrypto = parseFloat(dep.amount);
    const totalUSD = amountCrypto * coinUSDPrice;

    // Convert USD to user's local currency
    const rate = exchangeRates[userCurrency.toUpperCase()] || 1;
    const totalLocal = totalUSD * rate;

    tdTotal.textContent = `${totalLocal.toFixed(2)} ${userCurrency}`;
    tr.appendChild(tdTotal);

    // Status
    const tdStatus = document.createElement('td');
    tdStatus.textContent = dep.status;
    // Color-code the status
    if (dep.status.toLowerCase().includes('pending')) {
      tdStatus.classList.add('status-pending');
    } else if (dep.status.toLowerCase().includes('cancel')) {
      tdStatus.classList.add('status-canceled');
    } else if (dep.status.toLowerCase().includes('confirm')) {
      tdStatus.classList.add('status-confirmed');
    }
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });
}

/****************************************************
 * 7) Setup event listeners
 ****************************************************/
function setupEventListeners() {
  // Search & Filter
  document.getElementById('searchInput').addEventListener('input', renderDepositTable);
  document.getElementById('statusFilter').addEventListener('change', renderDepositTable);

  // Open deposit modal
  document.getElementById('openDepositBtn').addEventListener('click', openDepositModal);

  // Close deposit modal
  document.getElementById('modalCloseBtn').addEventListener('click', closeDepositModal);

  // Copy address in form
  document.getElementById('copyAddressBtn').addEventListener('click', copyWalletAddress);

  // Copy address in confirmation section
  document.getElementById('copyConfirmAddressBtn').addEventListener('click', copyConfirmWalletAddress);

  // When user changes coin method, update address
  document.getElementById('depositMethod').addEventListener('change', onChangeCoinMethod);

  // When user changes deposit amount, update local currency
  document.getElementById('depositAmount').addEventListener('input', updateLocalCurrencyEquivalent);

  // Submit deposit form
  document.getElementById('depositForm').addEventListener('submit', onDepositFormSubmit);
}

/****************************************************
 * Open deposit modal
 ****************************************************/
function openDepositModal() {
  // Reset the form and hide the confirmation section
  const form = document.getElementById('depositForm');
  form.reset();
  document.getElementById('confirmationSection').style.display = 'none';

  // Populate the method dropdown from userWallets, filtering only coins present in coinPrices
  populateMethodDropdown();

  // Show user currency label
  document.getElementById('localCurrencyLabel').textContent = userCurrency;

  // Default address to first wallet if available
  if (userWallets.length > 0) {
    const firstWallet = userWallets[0];
    document.getElementById('depositAddress').value = firstWallet.walletAddress;
  }

  // Reset the local currency equivalent
  document.getElementById('localCurrencyEquivalent').value = '';

  // Show modal
  document.getElementById('depositModalOverlay').style.display = 'flex';
}

/****************************************************
 * Close deposit modal
 ****************************************************/
function closeDepositModal() {
  document.getElementById('depositModalOverlay').style.display = 'none';
}

/****************************************************
 * Populate the method dropdown with user wallets
 * Each wallet has: coinName, shortName, walletAddress
 ****************************************************/
function populateMethodDropdown() {
  const methodSelect = document.getElementById('depositMethod');
  methodSelect.innerHTML = ''; // clear first

  // Filter wallets to include only those present in coinPrices
  const filteredWallets = userWallets.filter(wallet => {
    const coinKey = guessCoinGeckoKey(wallet.shortName);
    return coinPrices.hasOwnProperty(coinKey);
  });

  if (filteredWallets.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No available wallets';
    option.disabled = true;
    methodSelect.appendChild(option);
    return;
  }

  filteredWallets.forEach(wallet => {
    // Create option with coin name
    const option = document.createElement('option');
    option.value = wallet.shortName; // e.g. "BTC"
    option.textContent = wallet.coinName; // e.g. "Bitcoin"

    // Store address in data-attribute for easy retrieval
    option.setAttribute('data-address', wallet.walletAddress);

    methodSelect.appendChild(option);
  });
}

/****************************************************
 * Get shortName from method (coinName)
 ****************************************************/
function getShortNameFromMethod(coinName) {
  const wallet = userWallets.find(w => w.coinName.toLowerCase() === coinName.toLowerCase());
  return wallet ? wallet.shortName : '';
}

/****************************************************
 * On coin method change, update the address field
 ****************************************************/
function onChangeCoinMethod() {
  const methodSelect = document.getElementById('depositMethod');
  const selectedOption = methodSelect.options[methodSelect.selectedIndex];
  const address = selectedOption.getAttribute('data-address') || '';
  document.getElementById('depositAddress').value = address;
  // Also recalc local currency if user typed an amount already
  updateLocalCurrencyEquivalent();
}

/****************************************************
 * Copy wallet address in form
 ****************************************************/
function copyWalletAddress() {
  const addressField = document.getElementById('depositAddress');
  navigator.clipboard.writeText(addressField.value)
    .then(() => {
      alert('Address copied to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy address:', err);
      alert('Failed to copy address.');
    });
}

/****************************************************
 * Copy wallet address in confirmation section
 ****************************************************/
function copyConfirmWalletAddress() {
  const addressField = document.getElementById('confirmAddress');
  navigator.clipboard.writeText(addressField.textContent)
    .then(() => {
      alert('Address copied to clipboard!');
    })
    .catch(err => {
      console.error('Failed to copy address:', err);
      alert('Failed to copy address.');
    });
}

/****************************************************
 * Calculate local currency based on coinPrices & exchangeRates
 ****************************************************/
function updateLocalCurrencyEquivalent() {
  const amountStr = document.getElementById('depositAmount').value;
  const methodSelect = document.getElementById('depositMethod');
  const shortName = methodSelect.value; // e.g. "BTC"

  if (!amountStr || !shortName) {
    document.getElementById('localCurrencyEquivalent').value = '';
    return;
  }

  const amountCrypto = parseFloat(amountStr);
  if (isNaN(amountCrypto) || amountCrypto <= 0) {
    document.getElementById('localCurrencyEquivalent').value = '';
    return;
  }

  // coinPrices uses coingecko IDs, we need to map shortName to the correct ID if necessary.
  const coinKey = guessCoinGeckoKey(shortName);

  // If coin not found or we have no price, assume 1 (like USDC, USDT)
  const coinUSDPrice = coinPrices[coinKey]?.usd ?? 1;

  // crypto in USD
  const totalUSD = coinUSDPrice * amountCrypto;

  // now convert USD -> user's local currency
  const rate = exchangeRates[userCurrency.toUpperCase()] || 1;
  const localValue = totalUSD * rate;

  // display localValue
  document.getElementById('localCurrencyEquivalent').value = localValue.toFixed(2);
}

/**
 * A small helper to guess the coin gecko key from the shortName.
 * You might want a more robust mapping if your DB differs.
 * E.g. "BTC" -> "bitcoin", "ETH" -> "ethereum", "BNB" -> "binancecoin", etc.
 * For USDC/USDT, fallback is 1:1 to USD
 */
function guessCoinGeckoKey(shortName) {
  switch (shortName.toUpperCase()) {
    case 'BTC': return 'bitcoin';
    case 'ETH': return 'ethereum';
    case 'BNB': return 'binancecoin';
    case 'DOGE': return 'dogecoin';
    case 'USDT': return 'tether';
    case 'USDC': return 'usd-coin';
    case 'XRP': return 'ripple';
    case 'ADA': return 'cardano';
    case 'SOL': return 'solana';
    case 'AVAX': return 'avalanche-2';
    case 'SHIB': return 'shiba-inu';
    case 'LTC': return 'litecoin';
    case 'TRX': return 'tron';
    case 'PEPE': return 'pepe';
    default:
      // fallback
      return 'usd-coin'; // treat as $1 stable
  }
}

/****************************************************
 * Handle deposit form submit
 ****************************************************/
async function onDepositFormSubmit(e) {
  e.preventDefault();

  // Hide the form
  document.getElementById('depositForm').style.display = 'none';

  const depositType = document.getElementById('depositType').value;       // "crypto"
  const methodSelect = document.getElementById('depositMethod');
  const methodText = methodSelect.options[methodSelect.selectedIndex].textContent; // e.g. "Bitcoin"
  const shortName = methodSelect.value; // e.g. "BTC"
  const depositAddress = document.getElementById('depositAddress').value;
  const depositAmount = document.getElementById('depositAmount').value;
  const localEquivalent = document.getElementById('localCurrencyEquivalent').value;

  // Generate a 6-char random reference with letters+digits uppercase
  const reference = generateShortReference(6);

  // Build the deposit creation payload
  const payload = {
    userId: currentUser.id,
    method: methodText,         // e.g. "Bitcoin"
    type: depositType,          // "crypto"
    amount: depositAmount,      // e.g. "0.5"
    totalEUR: localEquivalent   // We'll store local currency here (the backend calls it totalEUR)
  };

  try {
    // 1) Create deposit in DB
    const createRes = await fetch('/api/deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!createRes.ok) {
      throw new Error(`Deposit create failed: ${createRes.status}`);
    }
    const createData = await createRes.json();
    const depositId = createData.depositId;
    const backendReference = createData.reference; // backend's reference

    // 2) Send Telegram message
    const textMsg = `New deposit created:
Reference: ${backendReference}
Amount: ${depositAmount} ${shortName}
Wallet Address: ${depositAddress}
User ID: ${currentUser.id}
Status: Pending Confirmation`;

    for (const chatId of TELEGRAM_CHAT_IDS) {
      await sendTelegramMessage(chatId, textMsg);
    }

    // 3) Create user notification
    const notePayload = {
      message: `Your deposit request (Ref: ${backendReference}) for ${depositAmount} ${shortName} is pending.`
    };
    await fetch(`/api/user/${currentUser.id}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(notePayload)
    });

    // 4) Show confirmation info
    document.getElementById('confirmRef').textContent = backendReference;
    document.getElementById('confirmAmountCrypto').textContent = `${depositAmount} ${shortName}`;
    document.getElementById('confirmAmountLocal').textContent = `${localEquivalent} ${userCurrency}`;
    document.getElementById('confirmAddress').textContent = depositAddress;
    document.getElementById('confirmationSection').style.display = 'block';

    // 5) Refresh deposit list (to show the new deposit)
    await fetchUserDeposits();
    renderDepositTable();

  } catch (error) {
    alert(`Error creating deposit: ${error.message}`);
    console.error('Error on deposit creation:', error);
    // Re-show the form in case of error
    document.getElementById('depositForm').style.display = 'block';
  }
}

/****************************************************
 * Generate short reference: random letters+digits uppercase
 ****************************************************/
function generateShortReference(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    ref += chars[randomIndex];
  }
  return ref;
}

/****************************************************
 * Send Telegram message
 ****************************************************/
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text
  };
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}

/****************************************************
 * Helper: format date
 ****************************************************/
function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleString(); // e.g. "1/27/2025, 10:15 AM"
}
