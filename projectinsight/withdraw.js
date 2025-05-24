/*********************************************
 * withdraw.js
 *********************************************/

/** 
 * GLOBALS
 * We'll store certain data in global variables for reuse:
 * - currentUser: from /api/auth/me
 * - userWallets: from /api/user/:id/wallets
 * - withdrawals: from /api/user/:id/withdrawals
 * - coinPrices: from /api/coin-prices
 * - exchangeRates: from Exchangerate-API (for user's local currency)
 */
let currentUser = null;
let userWallets = [];
let withdrawals = [];
let coinPrices = {};
let exchangeRates = {};
let userCurrency = 'USD'; // fallback if not found

// Telegram info
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

    // 5) Fetch existing withdrawals
    await fetchUserWithdrawals();

    // 6) Render the withdrawal table
    renderWithdrawalTable();

    // 7) Setup event listeners
    setupEventListeners();

    // 8) Set "Total (Local)" header to reflect user currency
    const tableTotalHeader = document.getElementById('tableTotalHeader');
    if (userCurrency) {
      tableTotalHeader.textContent = `Total (${userCurrency})`;
    }

    // Hide loading overlay
    document.getElementById('loadingOverlay').style.display = 'none';

  } catch (error) {
    console.error('Initialization error:', error);
    // Hide loading overlay and show error
    document.getElementById('loadingOverlay').style.display = 'none';
    alert('Failed to load the withdraw page. Please try again.');
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
 * 5) Fetch user withdrawals
 ****************************************************/
async function fetchUserWithdrawals() {
  try {
    const res = await fetch(`/api/user/${currentUser.id}/withdrawals`, { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Failed to fetch withdrawals: ${res.status}`);
    }
    withdrawals = await res.json();
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    withdrawals = [];
  }
}

/****************************************************
 * 6) Render withdrawal table (descending order)
 ****************************************************/
function renderWithdrawalTable() {
  const tbody = document.querySelector('#withdrawTable tbody');
  tbody.innerHTML = '';

  // If no withdrawals at all, show "noWithdrawalsMsg" and return
  const noMsgEl = document.getElementById('noWithdrawalsMsg');
  if (withdrawals.length === 0) {
    noMsgEl.style.display = 'block';
    return;
  } else {
    noMsgEl.style.display = 'none';
  }

  // Get search term & filter
  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  const filterStatus = document.getElementById('statusFilter').value;

  // Sort by date descending (newest first)
  const sorted = [...withdrawals].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filter
  const filtered = sorted.filter(wd => {
    // status
    if (filterStatus && wd.status.toLowerCase() !== filterStatus.toLowerCase()) {
      return false;
    }
    // search
    const combined = `${wd.reference} ${wd.method} ${wd.type}`.toLowerCase();
    if (searchTerm && !combined.includes(searchTerm)) {
      return false;
    }
    return true;
  });

  // Render each
  filtered.forEach(wd => {
    const tr = document.createElement('tr');

    // ID
    const tdId = document.createElement('td');
    tdId.textContent = wd.id;
    tr.appendChild(tdId);

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = formatDate(wd.date);
    tr.appendChild(tdDate);

    // Reference
    const tdRef = document.createElement('td');
    tdRef.textContent = wd.reference;
    tr.appendChild(tdRef);

    // Parse "method" into [rawMethod, rawDetails]
    const { parsedMethod, parsedDetails } = parseMethodString(wd.method);

    // Method
    const tdMethod = document.createElement('td');
    tdMethod.textContent = parsedMethod;
    tr.appendChild(tdMethod);

    // Type
    const tdType = document.createElement('td');
    tdType.textContent = wd.type;
    tr.appendChild(tdType);

    // Amount
    const tdAmount = document.createElement('td');
    tdAmount.textContent = wd.amount;
    tr.appendChild(tdAmount);

    // Total (Local)
    const tdTotal = document.createElement('td');
    tdTotal.textContent = calculateLocalTotal(wd.type, wd.amount, parsedMethod);
    tr.appendChild(tdTotal);

    // Status
    const tdStatus = document.createElement('td');
    tdStatus.textContent = wd.status;
    if (wd.status.toLowerCase().includes('pending')) {
      tdStatus.classList.add('status-pending');
    } else if (wd.status.toLowerCase().includes('cancel')) {
      tdStatus.classList.add('status-canceled');
    } else if (wd.status.toLowerCase().includes('confirm')) {
      tdStatus.classList.add('status-confirmed');
    }
    tr.appendChild(tdStatus);

    // Details (separate column)
    const tdDetails = document.createElement('td');
    tdDetails.textContent = parsedDetails;
    tr.appendChild(tdDetails);

    tbody.appendChild(tr);
  });
}

/**
 * parseMethodString - splits "method:details" into two separate strings
 * If no colon, returns the original string as method, and empty details
 */
function parseMethodString(methodStr) {
  if (!methodStr) {
    return { parsedMethod: '', parsedDetails: '' };
  }
  // Example: "DOGE:abc123"
  const parts = methodStr.split(':');
  const parsedMethod = parts[0] || methodStr;
  const parsedDetails = parts[1] ? parts.slice(1).join(':') : ''; 
  return { parsedMethod, parsedDetails };
}

/**
 * calculateLocalTotal - returns the string "xx.xx USD" (or userCurrency) 
 * for the given type, amount, and coinName
 */
function calculateLocalTotal(type, amountStr, coinName) {
  let totalLocal = 0;
  const amount = parseFloat(amountStr) || 0;

  if (type === 'crypto') {
    // coinName is e.g. "Bitcoin", "Doge", "ETH", etc. We need shortName (BTC, DOGE, etc.)
    const shortName = getShortNameFromCoinName(coinName);
    const coinKey = guessCoinGeckoKey(shortName);
    const coinUSDPrice = coinPrices[coinKey]?.usd ?? 1;
    const totalUSD = amount * coinUSDPrice;
    const rate = exchangeRates[userCurrency.toUpperCase()] || 1;
    totalLocal = totalUSD * rate;
  } else {
    // type = 'bank' -> amount is already in user's local currency
    totalLocal = amount; 
    // If you wanted to do conversion if userCurrency != "USD", you could do so here:
    // But typically, "bank" means it's in local currency. 
  }

  return `${totalLocal.toFixed(2)} ${userCurrency}`;
}

/**
 * getShortNameFromCoinName
 * We look up userWallets to find the shortName from the coinName, ignoring case
 */
function getShortNameFromCoinName(coinName) {
  if (!coinName) return '';
  const found = userWallets.find(
    w => w.coinName.toLowerCase() === coinName.toLowerCase() 
         || w.shortName.toLowerCase() === coinName.toLowerCase()
  );
  return found ? found.shortName.toUpperCase() : coinName.toUpperCase();
}

/****************************************************
 * 7) Setup event listeners
 ****************************************************/
function setupEventListeners() {
  // Search & filter
  document.getElementById('searchInput').addEventListener('input', renderWithdrawalTable);
  document.getElementById('statusFilter').addEventListener('change', renderWithdrawalTable);

  // Open withdraw modal
  document.getElementById('openWithdrawBtn').addEventListener('click', openWithdrawModal);

  // Close modal
  document.getElementById('modalCloseBtn').addEventListener('click', closeWithdrawModal);

  // Withdraw type changes
  document.getElementById('withdrawType').addEventListener('change', onWithdrawTypeChange);

  // Crypto amount changes
  document.getElementById('cryptoAmount').addEventListener('input', updateCryptoLocalEquivalent);

  // Submit form
  document.getElementById('withdrawForm').addEventListener('submit', onWithdrawFormSubmit);
}

/****************************************************
 * Open withdraw modal
 ****************************************************/
function openWithdrawModal() {
  // Reset form
  const form = document.getElementById('withdrawForm');
  form.reset();
  document.getElementById('confirmationSection').style.display = 'none';
  document.getElementById('withdrawForm').style.display = 'block';

  // Show or hide relevant fields based on default type (crypto)
  onWithdrawTypeChange();

  // Populate crypto coins
  populateCryptoCoinSelect();

  // Local currency labels
  document.getElementById('localCurrencyLabelCrypto').textContent = userCurrency;
  document.getElementById('localCurrencyLabelBank').textContent = userCurrency;

  // Show modal
  document.getElementById('withdrawModalOverlay').style.display = 'flex';
}

/****************************************************
 * Close withdraw modal
 ****************************************************/
function closeWithdrawModal() {
  document.getElementById('withdrawModalOverlay').style.display = 'none';
}

/****************************************************
 * Handle type switch (crypto or bank)
 ****************************************************/
function onWithdrawTypeChange() {
  const type = document.getElementById('withdrawType').value;
  const cryptoFields = document.getElementById('cryptoFields');
  const bankFields = document.getElementById('bankFields');

  if (type === 'crypto') {
    cryptoFields.style.display = 'block';
    bankFields.style.display = 'none';
  } else {
    cryptoFields.style.display = 'none';
    bankFields.style.display = 'block';
  }
}

/****************************************************
 * Populate crypto coin select
 * Filter by coinPrices presence
 ****************************************************/
function populateCryptoCoinSelect() {
  const select = document.getElementById('cryptoCoinSelect');
  select.innerHTML = '';

  // Filter userWallets to only those that exist in coinPrices
  const filtered = userWallets.filter(w => {
    const coinKey = guessCoinGeckoKey(w.shortName);
    return coinPrices.hasOwnProperty(coinKey);
  });

  if (filtered.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No crypto wallets available';
    opt.disabled = true;
    select.appendChild(opt);
    return;
  }

  filtered.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.shortName.toUpperCase(); // e.g., "BTC"
    opt.textContent = w.coinName;          // e.g., "Bitcoin"
    select.appendChild(opt);
  });
}

/****************************************************
 * Update local currency equivalent for crypto
 ****************************************************/
function updateCryptoLocalEquivalent() {
  const amountStr = document.getElementById('cryptoAmount').value;
  const shortName = document.getElementById('cryptoCoinSelect').value;

  if (!amountStr || !shortName) {
    document.getElementById('cryptoLocalEquivalent').value = '';
    return;
  }

  const amountCrypto = parseFloat(amountStr);
  if (isNaN(amountCrypto) || amountCrypto <= 0) {
    document.getElementById('cryptoLocalEquivalent').value = '';
    return;
  }

  const coinKey = guessCoinGeckoKey(shortName);
  const coinUSDPrice = coinPrices[coinKey]?.usd ?? 1;
  const totalUSD = amountCrypto * coinUSDPrice;
  const rate = exchangeRates[userCurrency.toUpperCase()] || 1;
  const localValue = totalUSD * rate;

  document.getElementById('cryptoLocalEquivalent').value = localValue.toFixed(2);
}

/****************************************************
 * Handle withdraw form submit
 ****************************************************/
async function onWithdrawFormSubmit(e) {
  e.preventDefault();

  // Hide the form while processing
  document.getElementById('withdrawForm').style.display = 'none';

  const type = document.getElementById('withdrawType').value;

  let amount = '0';
  let localEquivalent = '0';
  let coinOrBankName = ''; // e.g. "Bitcoin" or "Bank Transfer"
  let detailsField = '';   // e.g. wallet address or bank details
  let shortName = '';

  if (type === 'crypto') {
    shortName = document.getElementById('cryptoCoinSelect').value; // e.g. "BTC"
    const walletAddress = document.getElementById('cryptoDestinationAddress').value.trim();
    amount = document.getElementById('cryptoAmount').value.trim();
    localEquivalent = document.getElementById('cryptoLocalEquivalent').value.trim() || '0';

    // Validate wallet address
    if (walletAddress === '') {
      alert('Please enter a destination wallet address.');
      restoreForm();
      return;
    }

    // coinOrBankName is the full coin name
    coinOrBankName = getCoinNameFromShortName(shortName);
    detailsField = walletAddress.replace(/\r?\n/g, ' '); // remove newlines

    // Check if user has enough balance in that crypto wallet
    const userWallet = userWallets.find(w => w.shortName.toUpperCase() === shortName.toUpperCase());
    if (!userWallet) {
      alert('No corresponding crypto wallet found. Cannot proceed.');
      restoreForm();
      return;
    }
    const userBalance = parseFloat(userWallet.balance) || 0;
    const requested = parseFloat(amount) || 0;
    if (requested > userBalance) {
      alert('Insufficient balance in your crypto wallet.');
      restoreForm();
      return;
    }

  } else {
    // Bank transfer
    shortName = userCurrency.toUpperCase(); // local currency's shortName
    amount = document.getElementById('bankAmount').value.trim();
    detailsField = document.getElementById('bankDetails').value.trim();
    detailsField = detailsField.replace(/\r?\n/g, ' '); // remove newlines
    if (!detailsField) {
      alert('Please enter your bank details.');
      restoreForm();
      return;
    }

    // bank method
    coinOrBankName = 'Bank Transfer';
    // localEquivalent is the same as amount
    localEquivalent = amount;

    // Check if user has a local currency wallet
    const userLocalWallet = userWallets.find(w => w.shortName.toUpperCase() === shortName.toUpperCase());
    if (!userLocalWallet) {
      alert(`You do not have a local currency wallet for ${userCurrency}. Cannot proceed.`);
      restoreForm();
      return;
    }
    const userBalance = parseFloat(userLocalWallet.balance) || 0;
    const requested = parseFloat(amount) || 0;
    if (requested > userBalance) {
      alert('Insufficient balance in your local currency wallet.');
      restoreForm();
      return;
    }
  }

  // Generate a random 6-char reference
  const reference = generateShortReference(6);

  // Combine method + details in one field (storing them in "method" on DB)
  // e.g. "Doge:abc123"
  const combinedMethodField = `${coinOrBankName}:${detailsField}`;

  // Build the payload for the backend
  const payload = {
    userId: currentUser.id,
    method: combinedMethodField, // "Dogecoin:0xabc" or "Bank Transfer:some detail"
    amount,                      // string
    total: localEquivalent,      // same as amount for bank, or conversion for crypto
    status: 'pending',           // default
    type                         // "crypto" or "bank"
  };

  try {
    // 1) Create withdrawal in DB
    const createRes = await fetch('/api/withdrawals', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!createRes.ok) {
      throw new Error(`Withdrawal create failed: ${createRes.status}`);
    }
    const createData = await createRes.json();
    const backendRef = createData.reference; // backend's reference (if returned)

    // 2) Send Telegram message
    const textMsg = `New withdrawal created:
Reference: ${backendRef}
Amount: ${amount} ${shortName}
Method: ${coinOrBankName}
Details: ${detailsField}
User ID: ${currentUser.id}
Status: Pending`;

    for (const chatId of TELEGRAM_CHAT_IDS) {
      await sendTelegramMessage(chatId, textMsg);
    }

    // 3) Create user notification
    const notePayload = {
      message: `Your withdrawal request (Ref: ${backendRef}) for ${amount} ${shortName} is pending.`
    };
    await fetch(`/api/user/${currentUser.id}/notifications`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notePayload)
    });

    // 4) Show confirmation
    document.getElementById('confirmRef').textContent = backendRef;
    document.getElementById('confirmAmount').textContent = `${amount} ${shortName}`;
    document.getElementById('confirmAmountLocal').textContent = `${localEquivalent} ${userCurrency}`;
    document.getElementById('confirmMethod').textContent = coinOrBankName;
    document.getElementById('confirmationSection').style.display = 'block';

    // 5) Refresh list
    await fetchUserWithdrawals();
    renderWithdrawalTable();

  } catch (error) {
    alert(`Error creating withdrawal: ${error.message}`);
    console.error('Withdrawal creation error:', error);
    restoreForm();
  }
}

/****************************************************
 * Helper to restore form if error
 ****************************************************/
function restoreForm() {
  document.getElementById('confirmationSection').style.display = 'none';
  document.getElementById('withdrawForm').style.display = 'block';
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
 * getCoinNameFromShortName
 ****************************************************/
function getCoinNameFromShortName(shortName) {
  const wallet = userWallets.find(w => w.shortName.toUpperCase() === shortName.toUpperCase());
  return wallet ? wallet.coinName : shortName;
}

/****************************************************
 * guessCoinGeckoKey - maps shortName to CoinGecko key
 ****************************************************/
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
      return 'usd-coin'; // fallback stable or treat as 1:1
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
