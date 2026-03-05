require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');

require('./database');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/agent',    require('./routes/agent'));
app.use('/api/tirages',  require('./routes/tirages'));
app.use('/api/fiches',   require('./routes/fiches'));
app.use('/api/rapport',  require('./routes/rapport'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/resultats', require('./routes/scraper'));

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  service: 'LA-PROBITE-BORLETTE API',
  version: '2.0.0',
  status: 'running'
}));
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ── 404 & ERROR HANDLERS ──────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Route pa trouve' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Erè sèvè entèn' });
});

// ── AUTO-FETCH RÉSULTATS (CRON) ───────────────────────────────
// Fetch toutes les heures de 10h à 22h
const scraper = require('./routes/scraper');

async function autoFetch() {
  try {
    console.log('🔄 Auto-fetch résultats tirage...');
    const db = require('./database');
    const tirages = ['Georgia-Matin','Georgia-Soir','Florida matin','Florida soir','New-york matin','New-york soir'];
    const latest = {};
    for (const tirage of tirages) {
      const results = await db.resultats.find({ tirage }).sort({ date: -1 });
      if (results.length > 0) latest[tirage] = results[0];
    }
    console.log(`✅ ${Object.keys(latest).length} résultats en cache`);
  } catch (err) {
    console.error('Auto-fetch error:', err.message);
  }
}

// Cron: toutes les 30 minutes
cron.schedule('*/30 * * * *', autoFetch);

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 ================================');
  console.log(`   LA-PROBITE-BORLETTE API v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log('================================\n');
  // Fetch immédiatement au démarrage
  setTimeout(autoFetch, 3000);
});
