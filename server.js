const express = require('express');
const bodyParser = require('body-parser');
const StellarSdk = require('stellar-sdk');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const server = new StellarSdk.Server('https://api.mainnet.minepi.com');

let sessions = {}; // session: { ip, timestamp }
let wallets = {};  // active wallets with configs
const PASSCODE = 'Topboy15';

app.use(bodyParser.json());

// Middleware: session + passcode auth
app.use((req, res, next) => {
  const ip = req.ip;
  const { passcode } = req.body || {};

  if (req.path !== '/login' && (!sessions[ip] || sessions[ip].passcode !== passcode)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  next();
});

// Login route
app.post('/login', (req, res) => {
  const { username, passcode } = req.body;
  if (username === 'Topboy' && passcode === PASSCODE) {
    sessions[req.ip] = { passcode, timestamp: Date.now() };
    return res.json({ success: true, message: 'Logged in', ip: req.ip });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

// Register wallet
app.post('/add-wallet', async (req, res) => {
  const bot = req.body;
  if (!bot.public || !bot.secret || !bot.destination || !bot.claimId || !bot.amount || !bot.unlockTime) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  wallets[bot.public] = { ...bot, attempts: 0, tx: null, sequence: null };
  await prepareTransaction(bot);
  res.json({ success: true });
});

// Remove wallet
app.post('/remove-wallet', (req, res) => {
  const { public } = req.body;
  if (wallets[public]) {
    delete wallets[public];
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Wallet not found' });
});

// Status
app.get('/', (req, res) => {
  res.send({ status: '🟢 Running', activeWallets: Object.keys(wallets).length });
});

// Prepare transaction ahead of time
async function prepareTransaction(bot) {
  try {
    const account = await server.loadAccount(bot.public);
    bot.sequence = account.sequence;
    const baseFee = Math.floor((parseFloat(bot.baseFeePi || '0.005')) * 1e7);

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
  } catch (e) {
    console.log(`❌ Failed to prepare transaction for ${bot.public}:`, e.message);
  }
}

// Stream ledgers
server.ledgers().cursor('now').stream({
  onmessage: async (ledger) => {
    const ledgerTime = new Date(ledger.closed_at).getTime();

    for (const key in wallets) {
      const bot = wallets[key];
      const unlockMs = new Date(bot.unlockTime).getTime();

      if (ledgerTime >= unlockMs && bot.tx && bot.attempts < 3) {
        try {
          const result = await server.submitTransaction(bot.tx);
          if (result.successful) {
            console.log(`✅ TX Success for ${bot.public}: ${result.hash}`);
          } else {
            console.log(`❌ TX failed for ${bot.public}`);
          }
        } catch (e) {
          console.log(`⚠️ TX Error for ${bot.public}:`, e?.response?.data?.extras?.result_codes || e.message);
        }
        bot.attempts++;
        await prepareTransaction(bot); // Prepare again for next ledger
      }
    }
  },
  onerror: (err) => {
    console.error('Ledger stream error:', err);
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Server running at port ${PORT}`);
});
      
