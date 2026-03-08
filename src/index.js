require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const cron     = require('node-cron');
const http     = require('http');
const { WebSocketServer, WebSocket } = require('ws');

require('./database');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'https://borlette-web.vercel.app',
    'http://localhost:3000',
    process.env.FRONTEND_URL || '*',
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json());

// ── WEBSOCKET SERVER ──────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', message: 'LA-PROBITE-BORLETTE WS OK' }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

app.locals.broadcast = broadcast;
app.locals.wsClients = clients;

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api/auth',      rateLimit(20, 60000), require('./routes/auth')); // 20 koneksyon/minit
app.use('/api/agent',     require('./routes/agent'));
app.use('/api/tirages',   require('./routes/tirages'));
app.use('/api/fiches',    require('./routes/fiches'));
app.use('/api/rapport',   require('./routes/rapport'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/resultats', require('./routes/scraper'));

app.get('/api/ws/clients', (req, res) => res.json({ clients: clients.size }));
app.get('/', (req, res) => res.json({
  service: 'LA-PROBITE-BORLETTE API', version: '3.0.0',
  status: 'running', ws_clients: clients.size,
  scraper: global._lastScraperRun || 'never'
}));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).json({ message: 'Route pa trouve' }));
app.use((err, req, res, next) => { res.status(500).json({ message: 'Erè sèvè entèn' }); });

// ── SCRAPER AUTOMATIQUE ───────────────────────────────────────
const { fetchAllResults, saveResults } = require('./routes/scraper');

async function autoScrape() {
  try {
    global._lastScraperRun = new Date().toISOString();
    console.log(`\n[CRON] ${global._lastScraperRun} — Scraping résultats...`);
    const results = await fetchAllResults();
    const saved   = await saveResults(results, broadcast);
    if (saved.length > 0) {
      console.log(`[CRON] ✅ ${saved.length} nouveaux résultats sauvés et broadcastés`);
      // Broadcast résumé
      broadcast({ type: 'scraper_done', count: saved.length, ts: Date.now() });
    } else {
      console.log(`[CRON] Pas de nouveaux résultats (${Object.keys(results).length} trouvés déjà en DB)`);
    }
  } catch (err) {
    console.error('[CRON] Erreur scraper:', err.message);
  }
}

// Toutes les 15 minutes entre 10h et 23h (heure serveur)
// Adjust timezone: Haiti = UTC-5, donc 10h Haiti = 15h UTC
cron.schedule('*/15 10-23 * * *', autoScrape, { timezone: 'America/Port-au-Prince' });

// Aussi à exactement l'heure de chaque tirage connu
// Georgia: 12:29 / 18:29 | Florida: 13:30 / 18:00 | NY: 14:30 / 22:30
// Ohio: 12:29 / 19:29 | Chicago: 12:40 / 21:00 | Maryland: 13:00 / 20:00 | TN: 11:00 / 18:00
const DRAW_TIMES = ['11:01','11:05','12:31','12:35','13:01','13:05','13:32','14:32',
                    '18:01','18:05','18:31','19:01','20:01','21:01','22:31'];
for (const time of DRAW_TIMES) {
  const [h, m] = time.split(':');
  cron.schedule(`${m} ${h} * * *`, autoScrape, { timezone: 'America/Port-au-Prince' });
}

server.listen(PORT, () => {
  console.log(`🚀 LA-PROBITE-BORLETTE API v3 — Port ${PORT}`);
  console.log(`🔌 WebSocket actif: ws://0.0.0.0:${PORT}/ws`);
  console.log(`⏰ Scraper: toutes les 15min (10h-23h) + aux heures de tirage`);
  // Premier scrape au démarrage après 30s
  setTimeout(autoScrape, 30000);
});
