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
    const bodyElement = document.querySelector('body');
    if (bodyElement) {
        bodyElement.innerHTML = `<p style="color: red; padding: 20px;">Failed to load page critical data: ${error.message}. Please try refreshing or <a href="/login.html">login again</a>.</p>`;
    } else {
        alert('Failed to load the page. Please try again.');
    }
  }
});

/****************************************************
 * 1) Check current user
 ****************************************************/
async function fetchCurrentUser() {
  try {
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
  } catch (error) {
     console.error("fetchCurrentUser error:", error.message);
     currentUser = null; // Ensure currentUser is null if auth fails
     userCurrency = 'USD'; // Default currency
     throw error; // Re-throw to be caught by DOMContentLoaded
  }
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
    if (data.result === 'success') {
        exchangeRates = data.conversion_rates || {};
    } else {
        console.error("ExchangeRate-API success false:", data['error-type']);
        exchangeRates = {}; // Fallback
    }
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    exchangeRates = {};
  }
}

/****************************************************
 * 4) Fetch user wallets
 ****************************************************/
async function fetchUserWallets() {
  if (!currentUser || !currentUser.id) {
    console.error("Cannot fetch user wallets, user not authenticated.");
    userWallets = [];
    return;
  }
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
  if (!currentUser || !currentUser.id) {
    console.error("Cannot fetch user deposits, user not authenticated.");
    deposits = [];
    return;
  }
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

  const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  const filterStatus = document.getElementById('statusFilter').value;

  const sortedDeposits = [...deposits].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

  const filtered = sortedDeposits.filter(dep => {
    // User Status filter (now includes admin statuses for user view)
    let matchesStatus = true;
    if (filterStatus) {
        // Map combined statuses if necessary or ensure filter values match DB values
        if (filterStatus === 'pending_user_confirmation' && dep.status !== 'pending_user_confirmation') matchesStatus = false;
        else if (filterStatus === 'pending_approval' && dep.admin_status !== 'pending_approval' && dep.status === 'pending_user_confirmation') matchesStatus = false; // More specific
        else if (filterStatus === 'confirmed' && dep.status !== 'confirmed') matchesStatus = false;
        else if (filterStatus === 'rejected_by_admin' && dep.status !== 'rejected_by_admin') matchesStatus = false;
        else if (filterStatus === 'canceled' && dep.status !== 'canceled') matchesStatus = false;
        else if (filterStatus === 'pending_approval' && !(dep.status === 'pending_user_confirmation' && dep.admin_status === 'pending_approval')) matchesStatus = false;


    }


    const combinedSearchable = `${dep.reference} ${dep.method} ${dep.type} ${dep.admin_status} ${dep.admin_remarks || ''}`.toLowerCase();
    const matchesSearch = !searchTerm || combinedSearchable.includes(searchTerm);

    return matchesStatus && matchesSearch;
  });

  filtered.forEach(dep => {
    const tr = document.createElement('tr');

    ['id', 'date', 'reference', 'method', 'type', 'amount'].forEach(key => {
        const td = document.createElement('td');
        td.textContent = key === 'date' ? formatDate(dep[key]) : dep[key] || 'N/A';
        tr.appendChild(td);
    });
    
    // Total (local currency)
    const tdTotal = document.createElement('td');
    const shortName = dep.method; // Assuming method now stores shortName directly
    const coinKey = guessCoinGeckoKey(shortName);
    const coinUSDPrice = coinPrices[coinKey]?.usd ?? ( (shortName ==='USDT' || shortName === 'USDC') ? 1 : 0);
    const amountCrypto = parseFloat(dep.amount);
    const totalUSD = amountCrypto * coinUSDPrice;
    const rate = exchangeRates[userCurrency.toUpperCase()] || 1;
    const totalLocal = totalUSD * rate;
    tdTotal.textContent = `${totalLocal.toFixed(2)} ${userCurrency}`;
    tr.appendChild(tdTotal);

    // User Status
    const tdUserStatus = document.createElement('td');
    tdUserStatus.textContent = dep.status; // e.g. 'pending_user_confirmation', 'confirmed', 'rejected_by_admin'
    tdUserStatus.className = `status-${dep.status.toLowerCase().replace(/\s+/g, '_')}`;
    tr.appendChild(tdUserStatus);

    // Admin Status
    const tdAdminStatus = document.createElement('td');
    tdAdminStatus.textContent = dep.admin_status || 'N/A';
    tdAdminStatus.className = `status-${(dep.admin_status || '').toLowerCase().replace(/\s+/g, '_')}`;
    tr.appendChild(tdAdminStatus);

    // Approved Amount
    const tdApprovedAmount = document.createElement('td');
    // Show approved amount if it's different from original or if status is approved/rejected
    if (dep.admin_status === 'approved' || dep.admin_status === 'rejected') {
        tdApprovedAmount.textContent = dep.admin_approved_amount !== null ? dep.admin_approved_amount : 'N/A';
    } else {
        tdApprovedAmount.textContent = 'N/A'; // Or original amount if preferred before review
    }
    tr.appendChild(tdApprovedAmount);
    
    // Admin Remarks
    const tdAdminRemarks = document.createElement('td');
    tdAdminRemarks.textContent = dep.admin_remarks || 'N/A';
    if (dep.admin_remarks && dep.admin_remarks.length > 30) { // Basic tooltip for long remarks
        tdAdminRemarks.title = dep.admin_remarks;
        tdAdminRemarks.textContent = dep.admin_remarks.substring(0, 27) + '...';
    }
    tr.appendChild(tdAdminRemarks);

    tbody.appendChild(tr);
  });
}

/****************************************************
 * 7) Setup event listeners
 ****************************************************/
function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', renderDepositTable);
  document.getElementById('statusFilter').addEventListener('change', renderDepositTable);
  document.getElementById('openDepositBtn').addEventListener('click', openDepositModal);
  document.getElementById('modalCloseBtn').addEventListener('click', closeDepositModal);
  document.getElementById('copyAddressBtn').addEventListener('click', copyWalletAddress);
  document.getElementById('copyConfirmAddressBtn').addEventListener('click', copyConfirmWalletAddress);
  document.getElementById('depositMethod').addEventListener('change', onChangeCoinMethod);
  document.getElementById('depositAmount').addEventListener('input', updateLocalCurrencyEquivalent);
  document.getElementById('depositForm').addEventListener('submit', onDepositFormSubmit);
}

/****************************************************
 * Open deposit modal
 ****************************************************/
function openDepositModal() {
  const form = document.getElementById('depositForm');
  form.style.display = 'flex'; // Ensure form is visible
  form.reset();
  document.getElementById('confirmationSection').style.display = 'none';
  populateMethodDropdown();
  document.getElementById('localCurrencyLabel').textContent = userCurrency;
  onChangeCoinMethod(); // Set initial address and update currency equivalent
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
 ****************************************************/
function populateMethodDropdown() {
  const methodSelect = document.getElementById('depositMethod');
  methodSelect.innerHTML = ''; 

  const depositableWallets = userWallets.filter(wallet => {
    const coinKey = guessCoinGeckoKey(wallet.shortName);
    // Only allow deposits for coins we have price info for, or are known stables (USDT, USDC)
    return coinPrices.hasOwnProperty(coinKey) || wallet.shortName === 'USDT' || wallet.shortName === 'USDC';
  });

  if (depositableWallets.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No depositable wallets';
    option.disabled = true;
    methodSelect.appendChild(option);
    document.getElementById('depositAddress').value = ''; // Clear address field
    return;
  }

  depositableWallets.forEach(wallet => {
    const option = document.createElement('option');
    option.value = wallet.shortName; 
    option.textContent = `${wallet.coinName} (${wallet.shortName})`;
    option.setAttribute('data-address', wallet.walletAddress);
    methodSelect.appendChild(option);
  });
  // Trigger change to update address field for the first selected item
  onChangeCoinMethod(); 
}

/****************************************************
 * On coin method change, update the address field
 ****************************************************/
function onChangeCoinMethod() {
  const methodSelect = document.getElementById('depositMethod');
  if (methodSelect.options.length > 0 && methodSelect.selectedIndex !== -1) {
    const selectedOption = methodSelect.options[methodSelect.selectedIndex];
    const address = selectedOption.getAttribute('data-address') || '';
    document.getElementById('depositAddress').value = address;
  } else {
     document.getElementById('depositAddress').value = 'No wallet selected or available';
  }
  updateLocalCurrencyEquivalent();
}

/****************************************************
 * Copy wallet address
 ****************************************************/
function copyWalletAddress() {
  const addressField = document.getElementById('depositAddress');
  navigator.clipboard.writeText(addressField.value)
    .then(() => alert('Address copied!'))
    .catch(err => {
      console.error('Failed to copy address:', err);
      alert('Failed to copy.');
    });
}
function copyConfirmWalletAddress() {
  const addressText = document.getElementById('confirmAddress').textContent;
  navigator.clipboard.writeText(addressText)
    .then(() => alert('Address copied!'))
    .catch(err => {
      console.error('Failed to copy address:', err);
      alert('Failed to copy.');
    });
}


/****************************************************
 * Calculate local currency based on coinPrices & exchangeRates
 ****************************************************/
function updateLocalCurrencyEquivalent() {
  const amountStr = document.getElementById('depositAmount').value;
  const methodSelect = document.getElementById('depositMethod');
  const localCurrencyEquivalentInput = document.getElementById('localCurrencyEquivalent');
  
  if (!methodSelect.value) { // No coin selected
      localCurrencyEquivalentInput.value = '';
      return;
  }
  const shortName = methodSelect.value; 

  if (!amountStr) {
    localCurrencyEquivalentInput.value = '';
    return;
  }

  const amountCrypto = parseFloat(amountStr);
  if (isNaN(amountCrypto) || amountCrypto <= 0) {
    localCurrencyEquivalentInput.value = '';
    return;
  }

  const coinKey = guessCoinGeckoKey(shortName);
  const coinUSDPrice = coinPrices[coinKey]?.usd ?? ( (shortName ==='USDT' || shortName === 'USDC') ? 1 : 0);

  if(coinUSDPrice === 0 && shortName !== 'USDT' && shortName !== 'USDC'){
      console.warn(`Price for ${shortName} (key: ${coinKey}) not found. Cannot calculate local equivalent.`);
      localCurrencyEquivalentInput.value = 'Price N/A';
      return;
  }
  
  const totalUSD = coinUSDPrice * amountCrypto;
  const rate = exchangeRates[userCurrency.toUpperCase()] || 1; // Default to 1 if userCurrency rate not found (USD to USD)
  const localValue = totalUSD * rate;

  localCurrencyEquivalentInput.value = localValue.toFixed(2);
}

/**
 * A small helper to guess the coin gecko key from the shortName.
 */
function guessCoinGeckoKey(shortName) {
  if (!shortName) return 'usd-coin'; // Default if shortName is undefined or empty
  const upperShortName = shortName.toUpperCase();
  const mapping = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin', 
    'DOGE': 'dogecoin', 'USDT': 'tether', 'USDC': 'usd-coin',
    'XRP': 'ripple', 'ADA': 'cardano', 'SOL': 'solana', 
    'AVAX': 'avalanche-2', 'SHIB': 'shiba-inu', 'LTC': 'litecoin',
    'TRX': 'tron', 'MATIC': 'polygon', 'PEPE': 'pepe'
    // Add more mappings as needed
  };
  return mapping[upperShortName] || shortName.toLowerCase(); // Fallback to lowercase shortName
}

/****************************************************
 * Handle deposit form submit
 ****************************************************/
async function onDepositFormSubmit(e) {
  e.preventDefault();
  document.getElementById('confirmDepositBtn').disabled = true; // Prevent double submission

  const depositForm = document.getElementById('depositForm');
  const confirmationSection = document.getElementById('confirmationSection');
  
  const depositType = document.getElementById('depositType').value;      
  const methodSelect = document.getElementById('depositMethod');
  const coinShortName = methodSelect.value; // e.g. "BTC"
  const coinFullName = methodSelect.options[methodSelect.selectedIndex]?.textContent.split(' (')[0] || coinShortName; // "Bitcoin"
  const depositAddress = document.getElementById('depositAddress').value;
  const depositAmount = document.getElementById('depositAmount').value;
  const localEquivalent = document.getElementById('localCurrencyEquivalent').value;

  if (!coinShortName || !depositAmount || parseFloat(depositAmount) <= 0 || !depositAddress || depositAddress === 'No wallet selected or available') {
    alert('Please select a coin, enter a valid amount, and ensure a wallet address is available.');
    document.getElementById('confirmDepositBtn').disabled = false;
    return;
  }

  const payload = {
    userId: currentUser.id,
    method: coinShortName, // STORE SHORTNAME (e.g. BTC) as method
    type: depositType,        
    amount: depositAmount,    
    totalEUR: localEquivalent, // This stores the calculated local currency equivalent
    // status, admin_status, admin_approved_amount, admin_remarks will be set by backend defaults
  };

  try {
    document.getElementById('loadingOverlay').style.display = 'flex';
    const createRes = await fetch('/api/deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    if (!createRes.ok) {
      const errData = await createRes.json();
      throw new Error(errData.error || `Deposit create failed: ${createRes.status}`);
    }
    const createData = await createRes.json();
    const backendReference = createData.reference;

    const textMsg = `New deposit initiated by User ${currentUser.id} (${currentUser.email}):
Reference: ${backendReference}
Amount: ${depositAmount} ${coinShortName} (${coinFullName})
User's Wallet Address for Deposit: ${depositAddress} 
Status: pending_user_confirmation / admin_status: pending_approval`;

    for (const chatId of TELEGRAM_CHAT_IDS) {
      await sendTelegramMessage(chatId, textMsg);
    }

    const notePayload = {
      message: `Your deposit request (Ref: ${backendReference}) for ${depositAmount} ${coinShortName} is pending user confirmation and admin approval.`
    };
    await fetch(`/api/user/${currentUser.id}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(notePayload)
    });

    depositForm.style.display = 'none';
    document.getElementById('confirmRef').textContent = backendReference;
    document.getElementById('confirmAmountCrypto').textContent = `${depositAmount} ${coinShortName}`;
    document.getElementById('confirmAmountLocal').textContent = `${localEquivalent} ${userCurrency}`;
    document.getElementById('confirmAddress').textContent = depositAddress;
    confirmationSection.style.display = 'block';

    // Add to local list to reflect immediately
    const newDepositEntry = {
        id: createData.depositId, // Use ID from response
        date: new Date().toISOString(), // Use current date for immediate display
        reference: backendReference,
        method: coinShortName, // Store shortName
        type: depositType,
        amount: depositAmount,
        totalEUR: localEquivalent, // This represents the local currency equivalent
        status: 'pending_user_confirmation', // Initial user status
        admin_status: 'pending_approval',   // Initial admin status
        admin_approved_amount: depositAmount, // Default approved to actual amount
        admin_remarks: null,
        createdAt: new Date().toISOString()
    };
    deposits.push(newDepositEntry);
    renderDepositTable(); // Re-render to show the new deposit at the top

  } catch (error) {
    alert(`Error creating deposit: ${error.message}`);
    console.error('Error on deposit creation:', error);
    // depositForm.style.display = 'flex'; // Re-show form if error
  } finally {
    document.getElementById('loadingOverlay').style.display = 'none';
    document.getElementById('confirmDepositBtn').disabled = false;
    // Don't close modal automatically, user should see confirmation.
  }
}

/****************************************************
 * Generate short reference (not used, backend generates)
 ****************************************************/
// function generateShortReference(length) { ... } // Can be removed

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
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
        console.error("Telegram API error:", await response.json());
    }
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}

/****************************************************
 * Helper: format date
 ****************************************************/
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    // Check if date is valid
    if (isNaN(d.getTime())) {
        return 'Invalid Date';
    }
    return d.toLocaleString(); 
  } catch (e) {
    return dateString; // Fallback to original string if parsing fails
  }
}
