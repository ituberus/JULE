import fetch from 'node-fetch';

let exchangeRatesCache = {};
let exchangeRatesLastFetchTime = 0;
const EXCHANGE_RATE_API_KEY = '22b4c51015d34a6cc3fd928b'; // From projectinsight/trade.html
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

async function fetchAndUpdateExchangeRates() {
  console.log('Attempting to fetch exchange rates...');
  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/USD`);
    if (!response.ok) {
      throw new Error(`ExchangeRate-API request failed with status: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (data.result === 'success' && data.conversion_rates) {
      exchangeRatesCache = data.conversion_rates;
      exchangeRatesLastFetchTime = Date.now();
      console.log('Successfully fetched and cached exchange rates.');
    } else {
      console.error('Invalid data format from ExchangeRate-API:', data);
      throw new Error('Invalid data format from ExchangeRate-API.');
    }
  } catch (error) {
    console.error('Error fetching or processing exchange rates:', error.message);
    // Keep stale cache in case of error, or clear it:
    // exchangeRatesCache = {}; 
    // exchangeRatesLastFetchTime = 0;
  }
}

export async function getExchangeRate(targetCurrency) {
  if (targetCurrency === 'USD' || !targetCurrency) {
    return 1.0;
  }
  const now = Date.now();
  // Fetch if cache is empty, stale, or target currency is missing
  if (Object.keys(exchangeRatesCache).length === 0 || 
      (now - exchangeRatesLastFetchTime > CACHE_DURATION_MS) || 
      !exchangeRatesCache[targetCurrency]) {
    console.log(`Cache stale or target currency "${targetCurrency}" not found or cache empty, fetching new rates...`);
    await fetchAndUpdateExchangeRates();
  }

  if (!exchangeRatesCache[targetCurrency]) {
    console.error(`Exchange rate for ${targetCurrency} not found after fetch. Defaulting to USD rate (1.0).`);
    return 1.0; // Fallback to USD rate
  }
  return exchangeRatesCache[targetCurrency];
}

// Initial fetch on startup.
// Run it without awaiting to prevent blocking server start,
// but handle potential initial errors if needed elsewhere.
fetchAndUpdateExchangeRates().catch(error => {
  console.error("Initial exchange rate fetch failed on startup:", error);
});
