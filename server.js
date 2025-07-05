const fs = require('fs'); const express = require('express'); const bodyParser = require('body-parser'); const StellarSdk = require('stellar-sdk');

const app = express(); const PORT = process.env.PORT || 10000; const server = new StellarSdk.Server('https://api.mainnet.minepi.com');

const DB_PATH = './db.json'; let bots = {}; // in-memory bot storage let sessions = {}; // login sessions const PASSCODE = 'Topboy15'; let executed = false;

// Load bots from db.json function loadBotsFromFile() { if (fs.existsSync(DB_PATH)) { const raw = fs.readFileSync(DB_PATH, 'utf8'); try { bots = JSON.parse(raw || '{}'); } catch (e) { bots = {}; } } }

// Save bots to db.json function saveBotsToFile() { fs.writeFileSync(DB_PATH, JSON.stringify(bots, null, 2)); }

// Convert time to UTC ms function getBotTimestamp(bot) { return ( parseInt(bot.hour) * 3600000 + parseInt(bot.minute) * 60000 + parseInt(bot.second) * 1000 + parseInt(bot.millisecond || 0) ); }

// Main bot logic async function send(bot) { const botKey = StellarSdk.Keypair.fromSecret(bot.secret);

for (let attempt = 1; attempt <= 10; attempt++) { try { if (attempt > 1) await new Promise(res => setTimeout(res, 400));

const accountData = await server.loadAccount(bot.public);
  const account = new StellarSdk.Account(bot.public, accountData.sequence);

  const baseFeePi = parseFloat(bot.baseFeePi || "0.005");
  const baseFeeStroops = Math.floor(baseFeePi * 1e7);

  const txBuilder = new StellarSdk.TransactionBuilder(account, {
    fee: (baseFeeStroops * 2).toString(),
    networkPassphrase: 'Pi Network',
  });

  if (attempt === 1) {
    txBuilder.addOperation(StellarSdk.Operation.claimClaimableBalance({
      balanceId: bot.claimId
    }));
  }

  txBuilder.addOperation(StellarSdk.Operation.payment({
    destination: bot.destination,
    asset: StellarSdk.Asset.native(),
    amount: bot.amount,
  }));

  const tx = txBuilder.setTimeout(60).build();
  tx.sign(botKey);

  const result = await server.submitTransaction(tx);

  if (result?.successful && result?.hash) {
    console.log(`✅ [${bot.name}] TX Success! Hash: ${result.hash}`);
  } else {
    console.log(`❌ [${bot.name}] TX not successful`);
  }

} catch (e) {
  console.log(`❌ [${bot.name}] Attempt ${attempt} failed.`);
  if (e?.response?.data?.extras?.result_codes) {
    console.log('🔍 result_codes:', e.response.data.extras.result_codes);
  } else if (e?.response?.data) {
    console.log('🔍 Horizon error:', e.response.data);
  } else if (e?.response) {
    console.log('🔍 Response error:', e.response);
  } else {
    console.log('🔍 Raw error:', e.message || e.toString());
  }
}

}

console.log(⛔ [${bot.name}] All 10 attempts failed.); }

// Run bots async function runBotsSequentially() { for (const key in bots) { const bot = bots[key]; console.log(🚀 Running ${bot.name}...); await send(bot); } }

// Time-based trigger setInterval(() => { const now = new Date(); const nowMs = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000 + now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();

const firstKey = Object.keys(bots)[0]; if (!firstKey) return;

const botTimeMs = getBotTimestamp(bots[firstKey]); const diff = Math.abs(nowMs - botTimeMs);

if (!executed && diff <= 200) { console.log(⏰ Time matched for ${bots[firstKey].name}. Starting...); executed = true; runBotsSequentially(); }

if (nowMs < 1000) { executed = false; console.log("🔁 New UTC day — reset."); } }, 100);

// Express routes app.use(bodyParser.json());

app.post('/login', (req, res) => { const { username, passcode } = req.body; if (username === 'Topboy' && passcode === PASSCODE) { sessions[req.ip] = { passcode, timestamp: Date.now() }; return res.json({ success: true, message: 'Logged in', ip: req.ip }); } res.status(401).json({ error: 'Invalid credentials' }); });

app.use((req, res, next) => { const ip = req.ip; const { passcode } = req.body || {};

if (req.path !== '/login' && (!sessions[ip] || sessions[ip].passcode !== passcode)) { return res.status(403).json({ error: 'Unauthorized' }); } next(); });

app.get('/', (req, res) => { res.send(🟢 Bot status: Triggered = ${executed}); });

app.get('/db', (req, res) => { const raw = fs.readFileSync(DB_PATH, 'utf8'); res.type('json').send(raw); });

app.post('/add-wallet', (req, res) => { const bot = req.body; if (!bot.name || !bot.secret || !bot.public || !bot.destination || !bot.claimId || !bot.amount || !bot.hour || !bot.minute || !bot.second) { return res.status(400).json({ error: 'Missing required fields' }); } bots[bot.public] = bot; saveBotsToFile(); res.json({ success: true }); });

app.post('/remove-wallet', (req, res) => { const { public } = req.body; if (bots[public]) { delete bots[public]; saveBotsToFile(); return res.json({ success: true }); } res.status(404).json({ error: 'Wallet not found' }); });

// Start server app.listen(PORT, () => { loadBotsFromFile(); console.log(🌍 Server running on port ${PORT}); });

    
