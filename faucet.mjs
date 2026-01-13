// claim-faucet.mjs
import fetch from 'node-fetch';

const ADDRESS = '<YOUR_ADDRESS>'; 
const FAUCET_BASE_URL = 'https://faucet.fluton.io';

const HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Content-Type': 'application/json',
  'Origin': 'https://testnet.fluton.io',
  'Referer': 'https://testnet.fluton.io/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
  'Sec-Ch-Ua': '"Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
};

async function canRequestFunds(address) {
  const url = `${FAUCET_BASE_URL}/can-request-funds?address=${encodeURIComponent(address)}`;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    if (!data.canRequest) {
      const nextClaimMs = data.nextClaim;
      const nowMs = Date.now();
      const waitMs = nextClaimMs - nowMs;
      
      if (waitMs > 0) {
        const waitSec = Math.ceil(waitMs / 1000);
        const nextTime = new Date(nextClaimMs).toISOString();
        console.log(`⏳ Harus tunggu ${waitSec} detik lagi (sampai ${nextTime})`);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('❌ Gagal cek cooldown:', err.message);
    return false;
  }
}

async function claimFaucet(address) {
  const url = `${FAUCET_BASE_URL}/request-funds`;
  const body = JSON.stringify({ address });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.success) {
      console.log('✅ Claim faucet berhasil!');
      for (const hash of data.hashes || []) {
        console.log(`   📡 Tx: https://sepolia.etherscan.io/tx/${hash}`);
      }
    } else {
      console.error('❌ Claim gagal:', data);
    }
  } catch (err) {
    console.error('⚠️ Error saat claim faucet:', err.message);
  }
}

// Eksekusi utama
async function main() {
  console.log(`🔍 Memeriksa status faucet untuk: ${ADDRESS}`);
  const allowed = await canRequestFunds(ADDRESS);
  if (allowed) {
    await claimFaucet(ADDRESS);
  } else {
    console.log('❌ Belum bisa claim sekarang.');
  }
}

console.log("🔧 Menjalankan faucet...");
main().catch((err) => {
  console.error("💥 ERROR:", err.message || err);
  process.exit(1);
});