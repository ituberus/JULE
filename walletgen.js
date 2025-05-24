/************************************************
 * COMBINED WALLET GENERATOR (MODIFIED VERSION)
 ************************************************/

// ========== 1) IMPORT REQUIRED LIBRARIES ==========
import { Blockfrost, Lucid } from 'lucid-cardano';
import StellarSdk from '@stellar/stellar-sdk';
import { Keypair as SolanaKeypair } from '@solana/web3.js';
import keypairs from 'ripple-keypairs';
import cw from 'crypto-wallets';  // "crypto-wallets" library

// ========== 2) BLOCKFROST CONFIG FOR CARDANO ==========
const BLOCKFROST_API_KEY = 'mainnet1F2blnF42iyh9SsfQObx4L2b9RG7WQZX';
const BLOCKFROST_NETWORK = 'https://cardano-mainnet.blockfrost.io/api/v0';
const CARDANO_NETWORK = 'Mainnet';

// ========== 3) HELPER FUNCTIONS FOR EACH BLOCKCHAIN ==========

// 3a) Generate Cardano Wallet
async function generateCardanoWallet() {
  const lucid = await Lucid.new(
    new Blockfrost(BLOCKFROST_NETWORK, BLOCKFROST_API_KEY),
    CARDANO_NETWORK
  );

  // Generate mnemonic
  const mnemonic = lucid.utils.generateSeedPhrase();

  // Select wallet from that mnemonic
  await lucid.selectWalletFromSeed(mnemonic);

  // Get a Cardano address
  const address = await lucid.wallet.address();

  return {
    coinName: 'Cardano',
    shortName: 'ada',
    walletAddress: address,
    // Save the mnemonic in the privateKey field (per your requirements)
    privateKey: mnemonic
  };
}

// 3b) Generate Stellar Wallet
function generateStellarWallet() {
  const pair = StellarSdk.Keypair.random();
  // Combine secretKey & publicKey in the privateKey field
  const privateKeyField = `privateKey:${pair.secret()}|publicKey:${pair.publicKey()}`;
  return {
    coinName: 'Stellar',
    shortName: 'xlm',
    walletAddress: pair.publicKey(),
    privateKey: privateKeyField
  };
}

// 3c) Generate Solana Wallet
function generateSolanaWallet(coinName, shortName) {
  const keypair = SolanaKeypair.generate();
  // Convert secretKey (Uint8Array) to hex string
  const privateKeyHex = Buffer.from(keypair.secretKey).toString('hex');
  return {
    coinName,
    shortName,
    walletAddress: keypair.publicKey.toString(),
    privateKey: privateKeyHex
  };
}

// 3d) Generate Ripple (XRP) Wallet
function generateRippleWallet() {
  // Generate a random seed
  const seed = keypairs.generateSeed();
  // Derive keypair from the seed
  const keypair = keypairs.deriveKeypair(seed);
  // Derive classic address
  const address = keypairs.deriveAddress(keypair.publicKey);

  // Combine multiple keys in the privateKey field
  const privateKeyField = `privateKey:${keypair.privateKey}|publicKey:${keypair.publicKey}|secret:${seed}`;

  return {
    coinName: 'Ripple',
    shortName: 'xrp',
    walletAddress: address,
    privateKey: privateKeyField
  };
}

// 3e) Generate a wallet using crypto-wallets for a given currency symbol
async function generateCryptoWallet(coinName, shortName, currencySymbol) {
  const wallet = await cw.generateWallet(currencySymbol);
  return {
    coinName,
    shortName,
    walletAddress: wallet.address,
    privateKey: wallet.privateKey
  };
}

// ========== 4) MAIN EXPORT: GENERATE ALL WALLETS AT ONCE ==========
export async function generateAllWallets() {
  // We'll do a single attempt; if any fails, an exception is thrown
  const tasks = [
    // 1) USD Coin (ERC-20 style - use Ethereum method)
    generateCryptoWallet('USD Coin', 'usdc', 'ETH'),
    // 2) Tether (ERC-20 style)
    generateCryptoWallet('Tether', 'usdt', 'ETH'),
    // 3) Solana
    (async () => generateSolanaWallet('Solana', 'sol'))(),
    // 4) Shiba Inu (ERC-20 style)
    generateCryptoWallet('Shiba Inu', 'shib', 'ETH'),
    // 5) Ethereum
    generateCryptoWallet('Ethereum', 'eth', 'ETH'),
    // 6) Pepe (ERC-20 style)
    generateCryptoWallet('Pepe', 'pepe', 'ETH'),
    // 7) Cardano
    (async () => generateCardanoWallet())(),
    // 8) Vechain (treat as ETH-based for simplicity)
    generateCryptoWallet('Vechain', 'vet', 'ETH'),
    // 9) Cronos (also EVM-based)
    generateCryptoWallet('Cronos', 'cro', 'ETH'),
    // 10) Dogecoin
    generateCryptoWallet('Dogecoin', 'doge', 'DOGE'),
    // 11) Bitcoin
    generateCryptoWallet('Bitcoin', 'btc', 'BTC'),
    // 12) Stellar
    (async () => generateStellarWallet())(),
    // 13) Ripple
    (async () => generateRippleWallet())(),
    // 14) Litecoin
    generateCryptoWallet('Litecoin', 'ltc', 'LTC'),
    // 15) Binance Coin BNB (using Ethereum method for address generation)
    generateCryptoWallet('Binance Coin BNB', 'bnb', 'ETH'),
    // 16) USDC (Solana version) - separate from the first USD Coin
    (async () => generateSolanaWallet('USDC', 'usdc_spl'))()
  ];

  return Promise.all(tasks);
}
