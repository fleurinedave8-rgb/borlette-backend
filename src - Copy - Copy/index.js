require('dotenv').config();
const express = require('express');
const cors    = require('cors');

require('./database');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/agent',   require('./routes/agent'));
app.use('/api/tirages', require('./routes/tirages'));
app.use('/api/fiches',  require('./routes/fiches'));
app.use('/api/rapport', require('./routes/rapport'));
app.use('/api/admin',   require('./routes/admin'));

app.get('/', (req, res) => res.json({ service: 'LA-PROBITE-BORLETTE API', version: '2.0.0', status: 'running' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).json({ message: 'Route pa trouve' }));
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ message: 'Erè sèvè entèn' }); });

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 ================================');
  console.log(`   LA-PROBITE-BORLETTE API v2.0`);
  console.log(`   http://localhost:${PORT}`);
  console.log('================================\n');
  console.log('  POST /api/auth/login');
  console.log('  GET  /api/agent/info');
  console.log('  GET  /api/tirages/disponibles');
  console.log('  POST /api/fiches');
  console.log('  GET  /api/admin/stats');
  console.log('  GET  /api/admin/agents\n');
});
