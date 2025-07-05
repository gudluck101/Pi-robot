const fs = require('fs'); const express = require('express'); const bodyParser = require('body-parser'); const StellarSdk = require('stellar-sdk');

const app = express(); const PORT = process.env.PORT || 10000; const server = new StellarSdk.Server('https://api.mainnet.minepi.com');

const dbFile = './db.json'; if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '{}');

let sessions = {}; // Stores login sessions const PASSCODE = 'Topboy15';

app.use(bodyParser.json());

// Authentication middleware app.use((req, res, next) => { const ip = req.ip; const { passcode } = req.body || {};

if (req.path !== '/login' && (!sessions[ip] || sessions[ip].passcode !== passcode)) { return res.status(403).json({ error: 'Unauthorized' }); } next(); });

// Login endpoint app.post('/login', (req, res) => { const { username, passcode } = req.body; if (username === 'Topboy' && passcode === PASSCODE) { sessions[req.ip] = { passcode, timestamp: Date.now() }; return res.json({ success: true, message: 'Logged in', ip: req.ip }); } res.status(401).json({ error: 'Invalid credentials' }); });

function readBots() { return JSON.parse(fs.readFileSync(dbFile, 'utf-8')); }

function writeBots(data) { fs.writeFileSync(dbFile, JSON.stringify(data, null, 2)); }

app.get('/', (req, res) => { res.send({ status: '🟢 Bot is live', activeWallets: Object.keys(readBots()).length }); });

app.get('/db', (req, res) => { res.json(readBots()); });

app.post('/add-wallet', async (req, res) => { const bot = req.body; if (!bot.public || !bot.secret || !bot.destination || !bot.claimId || !bot.amount || !bot.hour || !bot.minute || !bot.second) { return res.status(400).json({ error: 'Missing fields' }); } const bots = readBots(); bots[bot.public] = { ...bot, attempts: 0, tx: null, sequence: null }; writeBots(bots); await prepareTransaction(bot); res.json({ success: true }); });

app.post('/remove-wallet', (req, res) => { const { public } = req.body; const bots = readBots(); if (bots[public]) { delete bots[public]; writeBots(bots); return res.json({ success: true }); } res.status(404).json({ error: 'Wallet not found' }); });

async function prepareTransaction(bot) { try { const account = await server.loadAccount(bot.public); bot.sequence = account.sequence; const baseFee = Math.floor((parseFloat(bot.baseFeePi || '0.005')) * 1e7);

const txBuilder = new StellarSdk.TransactionBuilder(account, {
  fee: (baseFee * 2).toString(),
  networkPassphrase: 'Pi Network',
});

txBuilder.addOperation(StellarSdk.Operation.claimClaimableBalance({ balanceId: bot.claimId }));
txBuilder.addOperation(StellarSdk.Operation.payment({
  destination: bot.destination,
  asset: StellarSdk.Asset.native(),
  amount: bot.amount,
}));

bot.tx = txBuilder.setTimeout(60).build();
const botKey = StellarSdk.Keypair.fromSecret(bot.secret);
bot.tx.sign(botKey);

const bots = readBots();
bots[bot.public] = bot;
writeBots(bots);

} catch (e) { console.log(❌ Failed to prepare TX for ${bot.public}:, e.message); } }

async function trySubmit(bot) { for (let attempt = 1; attempt <= 10; attempt++) { try { if (attempt > 1) await new Promise(res => setTimeout(res, 400));

const result = await server.submitTransaction(bot.tx);
  if (result.successful) {
    console.log(`✅ TX Success for ${bot.public}: ${result.hash}`);
    return;
  } else {
    console.log(`❌ TX failed for ${bot.public}`);
  }
} catch (e) {
  console.log(`⚠️ TX Error for ${bot.public}:`, e?.response?.data?.extras?.result_codes || e.message);
}

} }

server.ledgers().cursor('now').stream({ onmessage: async (ledger) => { const ledgerTime = new Date(ledger.closed_at).getTime(); const bots = readBots();

for (const key in bots) {
  const bot = bots[key];
  const unlockMs =
    parseInt(bot.hour) * 3600000 +
    parseInt(bot.minute) * 60000 +
    parseInt(bot.second) * 1000;
  const now = new Date();
  const nowMs =
    now.getUTCHours() * 3600000 +
    now.getUTCMinutes() * 60000 +
    now.getUTCSeconds() * 1000;

  if (nowMs >= unlockMs && bot.tx && bot.attempts < 3) {
    await trySubmit(bot);
    bot.attempts++;
    await prepareTransaction(bot);
  }
}

}, onerror: (err) => { console.error('Ledger stream error:', err); } });

app.listen(PORT, () => { console.log(🌍 Server running at port ${PORT}); });

                                        
