// warp.mjs
import { ethers } from 'ethers';
import 'dotenv/config';
import tokensConfig from './contracts/tokens.json' assert { type: 'json' };
import wrappersConfig from './contracts/wrappers.json' assert { type: 'json' };

const rawPrivateKey = process.env.PRIVATE_KEY?.trim();
if (!rawPrivateKey) throw new Error('❌ PRIVATE_KEY not found in .env');

const PRIVATE_KEY = rawPrivateKey.startsWith('0x') ? rawPrivateKey : `0x${rawPrivateKey}`;
if (!/^[a-fA-F0-9]{64}$/.test(PRIVATE_KEY.slice(2))) {
  throw new Error('❌ PRIVATE_KEY is invalid');
}

const RPC_URL = (process.env.RPC_URL || 'https://sepolia.drpc.org').trim();
const network = 'sepolia';

const tokens = tokensConfig[network];
const wrappers = wrappersConfig[network];

if (!tokens || !wrappers) {
  throw new Error(`❌ Configuration for network "${network}" is incomplete`);
}

// Get WRAP_PERCENT from .env (default: 50%)
const WRAP_PERCENT = parseFloat(process.env.WRAP_PERCENT || '50');
if (WRAP_PERCENT <= 0 || WRAP_PERCENT > 100) {
  throw new Error('❌ WRAP_PERCENT must be between 0–100');
}
console.log(`🎯 Wrapping ${WRAP_PERCENT}% of each token`);

const TOKEN_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) external returns (bool)'
];

const WRAP_ABI = ['function wrap(address to, uint256 amount) external'];

async function wrapToken(wallet, provider, tokenSymbol, tokenAddress, wrapperAddress) {
  console.log(`\n--- 🔄 Processing ${tokenSymbol} → c${tokenSymbol} ---`);

  const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, wallet);
  const wrapContract = new ethers.Contract(wrapperAddress, WRAP_ABI, wallet);

  // Get decimals & balance
  const decimals = Number(await tokenContract.decimals());
  const balance = await tokenContract.balanceOf(wallet.address);

  if (balance === 0n) {
    console.log(`⏭️  Skipping ${tokenSymbol}: balance = 0`);
    return;
  }

  // Calculate wrap amount (percentage)
  const fraction = BigInt(Math.floor((WRAP_PERCENT / 100) * 1e18));
  const amountInWei = (balance * fraction) / 1000000000000000000n;

  if (amountInWei === 0n) {
    console.log(`⏭️  Skipping ${tokenSymbol}: wrap amount too small`);
    return;
  }

  const humanAmount = ethers.formatUnits(amountInWei, decimals);
  console.log(`📊 ${tokenSymbol} balance: ${ethers.formatUnits(balance, decimals)}`);
  console.log(`📤 Wrapping ${humanAmount} ${tokenSymbol}`);

  // Approve if needed
  const currentAllowance = await tokenContract.allowance(wallet.address, wrapperAddress);
  if (currentAllowance < amountInWei) {
    console.log(`🔄 Approving ${tokenSymbol}...`);
    const approveTx = await tokenContract.approve(wrapperAddress, amountInWei);
    await approveTx.wait();
    console.log(`✅ Approved`);
  }

  // Wrap!
  console.log(`⏳ Wrapping...`);
  const wrapTx = await wrapContract.wrap(wallet.address, amountInWei, { gasLimit: 600000 });
  await wrapTx.wait();
  console.log(`✅ Wrap ${tokenSymbol} → c${tokenSymbol} successful!`);

  // Revoke approval
  await tokenContract.approve(wrapperAddress, 0n);
  console.log(`🔒 Approval revoked`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`📍 Wallet: ${wallet.address}`);
  console.log(`📡 RPC: ${RPC_URL}`);

  // Match pairs: USDC → cUSDC, USDT → cUSDT, etc.
  for (const [symbol, tokenAddr] of Object.entries(tokens)) {
    const wrapperSymbol = `c${symbol}`;
    const wrapperAddr = wrappers[wrapperSymbol];

    if (!wrapperAddr) {
      console.warn(`⚠️  No wrapper found for ${symbol} (${wrapperSymbol})`);
      continue;
    }

    try {
      await wrapToken(wallet, provider, symbol, tokenAddr, wrapperAddr);
    } catch (err) {
      console.error(`💥 Failed to wrap ${symbol}:`, err.message || err);
    }
  }

  console.log(`\n🎉 All processes completed!`);
}

console.log("🔧 Running wrap script (all tokens)...");
main().catch(err => {
  console.error("💥 GLOBAL ERROR:", err.message || err);
  process.exit(1);
});