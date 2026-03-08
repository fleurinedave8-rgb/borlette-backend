// ════════════════════════════════════════════════════════════════
//  scraper.js — Résultats tiraj AUTOMATIK
//  SOURCE 1 (PRENSIPAL) : RapidAPI NosyAPI — update 10min apre tiraj
//  SOURCE 2 (BACKUP)    : lottery.net HTML scraping — gratis
//  Si RapidAPI tonbe oswa pa gen kle → backup otomatik
// ════════════════════════════════════════════════════════════════
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const https   = require('https');
const http    = require('http');

// ── CONFIGURATION ─────────────────────────────────────────────
// Mete RAPIDAPI_KEY nan fichye .env sou Railway
// Si pa gen kle → backup HTML otomatikman
const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'usa-lottery-result-all-state-api.p.rapidapi.com';

// ── MAPPING COMPLET — NosyAPI gameId ──────────────────────────
// gameId pou chak tiraj nan NosyAPI
// Jwenn yo nan: GET /states → GET /games?stateCode=GA
const RAPIDAPI_GAMES = [
  // Georgia Cash 3
  { tirage: 'Georgia-Matin',   stateCode:'GA', gameName:'Cash 3',   drawName:'Midday'  },
  { tirage: 'Georgia-Soir',    stateCode:'GA', gameName:'Cash 3',   drawName:'Evening' },
  // Florida Cash 3
  { tirage: 'Florida matin',   stateCode:'FL', gameName:'Cash 3',   drawName:'Midday'  },
  { tirage: 'Florida soir',    stateCode:'FL', gameName:'Cash 3',   drawName:'Evening' },
  // New York Numbers
  { tirage: 'New-york matin',  stateCode:'NY', gameName:'Numbers',  drawName:'Midday'  },
  { tirage: 'New-york soir',   stateCode:'NY', gameName:'Numbers',  drawName:'Evening' },
  // Ohio Pick 3
  { tirage: 'Ohio matin',      stateCode:'OH', gameName:'Pick 3',   drawName:'Midday'  },
  { tirage: 'Ohio soir',       stateCode:'OH', gameName:'Pick 3',   drawName:'Evening' },
  // Illinois (Chicago) Pick 3
  { tirage: 'Chicago matin',   stateCode:'IL', gameName:'Pick 3',   drawName:'Midday'  },
  { tirage: 'Chicago soir',    stateCode:'IL', gameName:'Pick 3',   drawName:'Evening' },
  // Maryland Pick 3
  { tirage: 'Maryland midi',   stateCode:'MD', gameName:'Pick 3',   drawName:'Midday'  },
  { tirage: 'Maryland soir',   stateCode:'MD', gameName:'Pick 3',   drawName:'Evening' },
  // Tennessee Cash 3
  { tirage: 'Tennessee matin', stateCode:'TN', gameName:'Cash 3',   drawName:'Midday'  },
  { tirage: 'Tennessee soir',  stateCode:'TN', gameName:'Cash 3',   drawName:'Evening' },
];

// ── BACKUP — lottery.net URLs ──────────────────────────────────
const BACKUP_SOURCES = {
  'Georgia-Matin':   'https://www.lottery.net/georgia/cash-3-midday/numbers',
  'Georgia-Soir':    'https://www.lottery.net/georgia/cash-3-evening/numbers',
  'Florida matin':   'https://www.lottery.net/florida/cash-3-midday/numbers',
  'Florida soir':    'https://www.lottery.net/florida/cash-3-evening/numbers',
  'New-york matin':  'https://www.lottery.net/new-york/numbers-midday/numbers',
  'New-york soir':   'https://www.lottery.net/new-york/numbers-evening/numbers',
  'Ohio matin':      'https://www.lottery.net/ohio/pick-3-midday/numbers',
  'Ohio soir':       'https://www.lottery.net/ohio/pick-3-evening/numbers',
  'Chicago matin':   'https://www.lottery.net/illinois/pick-3-midday/numbers',
  'Chicago soir':    'https://www.lottery.net/illinois/pick-3-evening/numbers',
  'Maryland midi':   'https://www.lottery.net/maryland/pick-3-midday/numbers',
  'Maryland soir':   'https://www.lottery.net/maryland/pick-3-evening/numbers',
  'Tennessee matin': 'https://www.lottery.net/tennessee/cash-3-midday/numbers',
  'Tennessee soir':  'https://www.lottery.net/tennessee/cash-3-evening/numbers',
};

// ══════════════════════════════════════════════════════════════
//  FETCH HELPERS
// ══════════════════════════════════════════════════════════════
function fetchJson(url, headers = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      timeout,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        ...headers,
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location, headers, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchHtml(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,*/*',
        'Accept-Encoding': 'identity',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : 'https://www.lottery.net' + res.headers.location;
        return fetchHtml(next, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 1 — RapidAPI NosyAPI
// ══════════════════════════════════════════════════════════════
let _rapidApiGameMap = null; // cache

async function buildRapidApiMap() {
  if (_rapidApiGameMap) return _rapidApiGameMap;
  if (!RAPIDAPI_KEY) return null;
  try {
    // Récupère tous les jeux par état en une seule requête
    const data = await fetchJson(
      'https://usa-lottery-result-all-state-api.p.rapidapi.com/getAllGames',
      { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': RAPIDAPI_HOST }
    );
    // Construit un map: "GA|Cash 3|Midday" → gameId
    _rapidApiGameMap = {};
    for (const [stateCode, games] of Object.entries(data || {})) {
      for (const game of (games || [])) {
        for (const play of (game.plays || [])) {
          const key = `${stateCode}|${game.name}|${play.name}`;
          const draws = play.draws || [];
          if (draws.length > 0) {
            _rapidApiGameMap[key] = { draws, game: game.name, play: play.name };
          }
        }
      }
    }
    console.log('[RAPIDAPI] Map construit:', Object.keys(_rapidApiGameMap).length, 'jeux');
    return _rapidApiGameMap;
  } catch (e) {
    console.log('[RAPIDAPI] buildMap error:', e.message);
    return null;
  }
}

async function fetchFromRapidApi() {
  if (!RAPIDAPI_KEY) {
    console.log('[RAPIDAPI] Pas de clé API — utilisation backup HTML');
    return {};
  }
  try {
    const map = await buildRapidApiMap();
    if (!map) return {};

    const today = new Date().toISOString().split('T')[0];
    const results = {};

    for (const game of RAPIDAPI_GAMES) {
      // Essaie plusieurs variantes de nom
      const variants = [
        `${game.stateCode}|${game.gameName}|${game.drawName}`,
        `${game.stateCode}|${game.gameName}|${game.drawName.toLowerCase()}`,
        `${game.stateCode}|${game.gameName}|Midday` ,
        `${game.stateCode}|${game.gameName}|Evening`,
        `${game.stateCode}|${game.gameName}|Morning`,
      ];

      let found = null;
      for (const v of variants) {
        if (map[v]) { found = map[v]; break; }
      }
      if (!found) {
        // Cherche n'importe quelle clé qui commence par stateCode|gameName
        const prefix = `${game.stateCode}|${game.gameName}|`;
        const matchKey = Object.keys(map).find(k => k.startsWith(prefix) &&
          (game.drawName === 'Midday'  ? k.toLowerCase().includes('mid') || k.toLowerCase().includes('morn') :
           game.drawName === 'Evening' ? k.toLowerCase().includes('eve') || k.toLowerCase().includes('night') : true));
        if (matchKey) found = map[matchKey];
      }
      if (!found) continue;

      const draws = found.draws;
      if (!draws || draws.length === 0) continue;

      // Prend le draw du jour
      const draw = draws.find(d => {
        const dDate = parseRapidDate(d.date);
        return dDate === today;
      }) || draws[0]; // fallback: dernier draw

      if (!draw || !draw.numbers) continue;
      const nums = draw.numbers.sort((a,b) => a.order - b.order);
      if (nums.length < 3) continue;

      results[game.tirage] = {
        lot1: String(nums[0].value).padStart(2,'0'),
        lot2: String(nums[1].value).padStart(2,'0'),
        lot3: String(nums[2].value).padStart(2,'0'),
        date: parseRapidDate(draw.date) || today,
        source: 'rapidapi-nosyapi',
      };
    }

    const found = Object.keys(results).length;
    console.log(`[RAPIDAPI] ${found} résultats obtenus`);
    return results;
  } catch (e) {
    console.log('[RAPIDAPI] Erreur globale:', e.message);
    _rapidApiGameMap = null; // reset cache
    return {};
  }
}

function parseRapidDate(dateStr) {
  if (!dateStr) return null;
  // Format "MM/DD/YYYY"
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  // Format ISO
  if (dateStr.includes('-')) return dateStr.split('T')[0];
  return null;
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 2 — lottery.net HTML (BACKUP)
// ══════════════════════════════════════════════════════════════
function stripHtml(s) {
  return (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
}

function parseHtmlResult(html) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
    const yStr = yesterday.toISOString().split('T')[0];
    const found = [];

    // METÒD 1: rows <tr>
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRegex.exec(html)) !== null) {
      const text = stripHtml(m[1]);
      const dateM = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})/i)
                 || text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const numsM = text.match(/\b(\d)\b[^\d]*\b(\d)\b[^\d]*\b(\d)\b/);
      if (!dateM || !numsM) continue;
      let dateStr;
      if (dateM[0].includes('/')) {
        dateStr = dateM[3]+'-'+String(dateM[1]).padStart(2,'0')+'-'+String(dateM[2]).padStart(2,'0');
      } else {
        dateStr = new Date(dateM[1]+' '+dateM[2]+', '+dateM[3]).toISOString().split('T')[0];
      }
      found.push({ date:dateStr, lot1:numsM[1].padStart(2,'0'), lot2:numsM[2].padStart(2,'0'), lot3:numsM[3].padStart(2,'0'), source:'lottery.net-tr' });
    }

    // METÒD 2: class ball/number/digit
    if (found.length === 0) {
      const balls = [];
      const ballRx = /class="[^"]*(?:ball|number|digit|winning)[^"]*"[^>]*>(\d)</gi;
      let bm;
      while ((bm = ballRx.exec(html)) !== null) balls.push(bm[1]);
      const dateP = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(202\d)/i);
      if (dateP && balls.length >= 3) {
        found.push({
          date: new Date(dateP[1]+' '+dateP[2]+', '+dateP[3]).toISOString().split('T')[0],
          lot1:balls[0].padStart(2,'0'), lot2:balls[1].padStart(2,'0'), lot3:balls[2].padStart(2,'0'),
          source:'lottery.net-ball'
        });
      }
    }

    // METÒD 3: JSON nan paj la
    if (found.length === 0) {
      const jn = html.match(/"numbers"\s*:\s*\[(\d),(\d),(\d)\]/);
      const jd = html.match(/"drawDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
      if (jn && jd) found.push({ date:jd[1], lot1:jn[1].padStart(2,'0'), lot2:jn[2].padStart(2,'0'), lot3:jn[3].padStart(2,'0'), source:'lottery.net-json' });
    }

    if (found.length === 0) return null;
    found.sort((a,b) => new Date(b.date) - new Date(a.date));
    const latest = found[0];

    // Jodi ou yè → retounen
    if (latest.date === today || latest.date === yStr) return latest;
    // < 3 jou pase → aksepte tou (tiraj pa chak jou)
    const diff = (new Date(today) - new Date(latest.date)) / 86400000;
    if (diff <= 3) return latest;
    return null;
  } catch(e) { console.log('[BACKUP] parse error:', e.message); return null; }
}

async function fetchFromBackup(tiragesToFetch) {
  const results = {};
  // Chunks de 3 pour pas surcharger
  for (let i = 0; i < tiragesToFetch.length; i += 3) {
    const chunk = tiragesToFetch.slice(i, i+3);
    await Promise.allSettled(chunk.map(async tirage => {
      const url = BACKUP_SOURCES[tirage];
      if (!url) return;
      try {
        const html = await fetchHtml(url);
        const r = parseHtmlResult(html);
        if (r) {
          results[tirage] = r;
          console.log(`[BACKUP] ✅ ${tirage}: ${r.lot1}-${r.lot2}-${r.lot3}`);
        } else {
          console.log(`[BACKUP] ⚠️  ${tirage}: pas de résultat aujourd'hui`);
        }
      } catch (e) {
        console.log(`[BACKUP] ❌ ${tirage}: ${e.message}`);
      }
    }));
    if (i + 3 < tiragesToFetch.length) await new Promise(r => setTimeout(r, 800));
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
//  FETCH PRINCIPAL — RapidAPI + Backup automatik
// ══════════════════════════════════════════════════════════════
async function fetchAllResults() {
  const allTirages = RAPIDAPI_GAMES.map(g => g.tirage);
  console.log(`\n[SCRAPER] ${new Date().toISOString()}`);
  console.log(`[SCRAPER] Source 1: RapidAPI (key: ${RAPIDAPI_KEY ? '✅ configuré' : '❌ manquant'})`);

  // Étape 1: RapidAPI
  const rapidResults = await fetchFromRapidApi();
  const rapidFound   = Object.keys(rapidResults);

  // Étape 2: Backup pour ceux non trouvés
  const missing = allTirages.filter(t => !rapidFound.includes(t));
  let backupResults = {};
  if (missing.length > 0) {
    console.log(`[SCRAPER] Source 2: Backup HTML pour ${missing.length} tiraj mankan: ${missing.join(', ')}`);
    backupResults = await fetchFromBackup(missing);
  }

  const final = { ...rapidResults, ...backupResults };
  console.log(`[SCRAPER] Total final: ${Object.keys(final).length}/${allTirages.length} résultats`);
  return final;
}

// ── SAUVEGARDER EN DB + BROADCAST ─────────────────────────────
async function saveResults(results, broadcast) {
  const today  = new Date().toISOString().split('T')[0];
  const saved  = [];
  for (const [tirage, data] of Object.entries(results)) {
    if (!data.lot1) continue;
    try {
      const dayStart = new Date(today + 'T00:00:00');
      const dayEnd   = new Date(today + 'T23:59:59');
      const exists   = await db.resultats.findOne({ tirage, date: { $gte: dayStart, $lte: dayEnd }});
      if (!exists) {
        const r = await db.resultats.insert({
          tirage, lot1: data.lot1, lot2: data.lot2||'', lot3: data.lot3||'',
          date: new Date(), source: data.source||'auto', createdAt: new Date()
        });
        saved.push(r);
        if (broadcast) broadcast({ type:'nouveau_resultat', tirage,
          lot1:data.lot1, lot2:data.lot2||'', lot3:data.lot3||'',
          date: new Date().toISOString(), source: data.source, ts: Date.now() });
        console.log(`[DB] ✅ Sauvé: ${tirage} ${data.lot1}-${data.lot2}-${data.lot3} (${data.source})`);
      } else if (exists.lot1 !== data.lot1) {
        await db.resultats.update({ _id: exists._id },
          { $set: { lot1:data.lot1, lot2:data.lot2||'', lot3:data.lot3||'', updatedAt: new Date() }});
        saved.push({ ...exists, updated:true });
        if (broadcast) broadcast({ type:'nouveau_resultat', tirage,
          lot1:data.lot1, lot2:data.lot2||'', lot3:data.lot3||'', ts: Date.now() });
      }
    } catch (e) { console.log('[DB] Save error:', e.message); }
  }
  return saved;
}

// ── DERNIERS RÉSULTATS ─────────────────────────────────────────
async function getLatestResults() {
  const latest = {};
  for (const g of RAPIDAPI_GAMES) {
    const rows = await db.resultats.find({ tirage: g.tirage }).sort({ date:-1 });
    if (rows.length > 0) latest[g.tirage] = rows[0];
  }
  return latest;
}

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════
router.get('/fetch', async (req, res) => {
  try {
    const broadcast = req.app?.locals?.broadcast;
    const results   = await fetchAllResults();
    const saved     = await saveResults(results, broadcast);
    const all       = await getLatestResults();
    res.json({ success:true, fetched: Object.keys(results).length, saved: saved.length,
      sources: { rapidapi: RAPIDAPI_KEY ? 'configured' : 'missing', backup: 'lottery.net' },
      results: all });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/latest', async (req, res) => {
  try { res.json(await getLatestResults()); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/today', async (req, res) => {
  try {
    const { date } = req.query;
    const d = date ? new Date(date) : new Date();
    d.setHours(0,0,0,0);
    const end = new Date(d); end.setHours(23,59,59,999);
    res.json(await db.resultats.find({ date:{ $gte:d, $lte:end }}).sort({ date:-1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/status', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayResults = await db.resultats.find({ date:{ $gte:today }});
    res.json({
      lastRun: global._lastScraperRun || null,
      rapidApiKey: RAPIDAPI_KEY ? '✅ configuré' : '❌ manquant — backup sèlman',
      sources: { primary:'RapidAPI NosyAPI', backup:'lottery.net HTML' },
      todayCount: todayResults.length,
      totalTirages: RAPIDAPI_GAMES.length,
      coverage: `${todayResults.length}/${RAPIDAPI_GAMES.length}`,
      results: todayResults.map(r => ({ tirage:r.tirage, lot1:r.lot1, source:r.source, date:r.date }))
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});


// ═══════════════════════════════════════════════════════════
//  CALCUL GAGNANT OTOMATIK
// ═══════════════════════════════════════════════════════════
async function calculerGagnants(tirageNom, lot1, lot2, lot3, date) {
  try {
    const tirage = await db.tirages.findOne({ nom: tirageNom });
    if (!tirage) { console.log(`[GAGNANT] Tiraj "${tirageNom}" pa jwenn`); return 0; }

    const today = date || new Date().toISOString().split('T')[0];
    const debut = new Date(today);
    const fin   = new Date(today + 'T23:59:59');

    // Chèche tout fiches aktif pou tiraj sa a
    let fiches = await db.fiches.find({ tirageId: tirage._id, statut: 'actif' });
    fiches = fiches.filter(f => {
      const d = new Date(f.dateVente);
      return d >= debut && d <= fin;
    });

    const primesAll = await db.primes.find({});
    const primeMap = {};
    for (const p of primesAll) primeMap[p.type] = p;

    const lots = [lot1, lot2, lot3].filter(Boolean).map(l => String(l).padStart(2,'0'));
    let totalGagnants = 0;

    for (const fiche of fiches) {
      const rows = await db.rows.find({ ficheId: fiche._id });
      let montantGagne = 0;
      const rowsGagnant = [];

      for (const row of rows) {
        const boule = String(row.boule).padStart(2,'0');
        const type  = row.type || 'P0';
        const mise  = Number(row.mise) || 0;
        const pos   = lots.indexOf(boule);
        if (pos === -1) continue;

        const prime = primeMap[type];
        if (!prime) continue;

        let mult = 0;
        if (type === 'P0') {
          mult = pos===0 ? (prime.prime1||0) : pos===1 ? (prime.prime2||0) : (prime.prime3||0);
        } else if (type === 'P1' && pos === 0) { mult = prime.prime1||0; }
        else if (type === 'P2' && pos === 1)   { mult = prime.prime1||0; }
        else if (type === 'P3' && pos === 2)   { mult = prime.prime1||0; }
        else if (type === 'MAR' && lots.length >= 2 && pos <= 1) { mult = prime.prime1||0; }
        else if (type.startsWith('L4') && pos === 0) { mult = prime.prime1||0; }

        if (mult > 0) {
          const gain = mise * mult;
          montantGagne += gain;
          rowsGagnant.push({ boule, type, mise, gain, mult });
        }
      }

      if (montantGagne > 0) {
        await db.fiches.update({ _id: fiche._id }, {
          $set: { statut:'gagnant', montantGagne, lotsGagnants:lots, dateCalcul:new Date(), rowsGagnant }
        });
        const agent = await db.agents.findOne({ _id: fiche.agentId });
        if (agent) {
          await db.agents.update({ _id: fiche.agentId }, { $set: { balance: (agent.balance||0) + montantGagne } });
        }
        totalGagnants++;
        console.log(`[GAGNANT] ✅ Ticket ${fiche.ticket} — ${montantGagne} HTG`);
      }
    }

    // Fèmen tiraj la
    await db.tirages.update({ _id: tirage._id }, { $set: { actif: false, dateFermeture: new Date() } });
    console.log(`[GAGNANT] ${tirageNom}: ${totalGagnants} gagnant(s) — Tiraj fèmen`);
    return totalGagnants;
  } catch (err) {
    console.error('[GAGNANT] Erè:', err.message);
    return 0;
  }
}

module.exports = router;
module.exports.calculerGagnants = calculerGagnants;
module.exports.fetchAllResults  = fetchAllResults;
module.exports.saveResults      = saveResults;
module.exports.getLatestResults = getLatestResults;
