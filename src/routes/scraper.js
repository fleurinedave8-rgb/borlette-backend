// scraper.js — Récupération AUTOMATIQUE résultats tirage
// Sources: Georgia, Florida, New-York, Ohio, Chicago, Maryland, Tennessee
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const https   = require('https');
const http    = require('http');

// ── MAPPING COMPLET ────────────────────────────────────────────
const ALL_TIRAGES = [
  'Georgia-Matin', 'Georgia-Soir',
  'Florida matin', 'Florida soir',
  'New-york matin', 'New-york soir',
  'Ohio matin', 'Ohio soir',
  'Chicago matin', 'Chicago soir',
  'Maryland midi', 'Maryland soir',
  'Tennessee matin', 'Tennessee soir',
];

// ── FETCH HELPER ──────────────────────────────────────────────
function fetchUrl(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      }
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 1 — Georgia Lottery (ga.gov officiel)
// ══════════════════════════════════════════════════════════════
async function fetchGeorgia() {
  try {
    // API JSON officielle Georgia
    const url = 'https://www.galottery.com/content/dam/portal-web/game-data/draw-results/cash3.json';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};

    if (json && json.draws) {
      // Trier par date décroissante
      const draws = json.draws.sort((a, b) => new Date(b.drawDate) - new Date(a.drawDate));
      const today = new Date().toISOString().split('T')[0];

      for (const draw of draws.slice(0, 4)) {
        const drawDate = draw.drawDate?.split('T')[0] || today;
        if (drawDate !== today) continue;

        const nums = draw.winningNumbers?.split('-') || draw.winningNumbers?.split(' ') || [];
        if (nums.length < 1) continue;

        const isEvening = draw.drawTime?.toLowerCase().includes('eve') ||
                          draw.drawName?.toLowerCase().includes('eve') ||
                          draw.drawTime === 'Evening';
        const key = isEvening ? 'Georgia-Soir' : 'Georgia-Matin';

        if (!results[key]) {
          results[key] = {
            lot1: String(nums[0]||'').padStart(2,'0'),
            lot2: String(nums[1]||'').padStart(2,'0'),
            lot3: String(nums[2]||'').padStart(2,'0'),
            date: drawDate, source: 'galottery.com'
          };
        }
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] Georgia error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 2 — Florida Lottery
// ══════════════════════════════════════════════════════════════
async function fetchFlorida() {
  try {
    const url = 'https://www.flalottery.com/site/winningNumberSearch?searchTypeIn=0&gameNameIn=CASH3&singleDateIn=&startDateIn=&endDateIn=&n=1&format=json';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};
    const today   = new Date().toISOString().split('T')[0];

    const draws = json.draws || json.drawingResults || [];
    for (const draw of draws) {
      const drawDate = (draw.date || draw.drawDate || '').split('T')[0];
      if (drawDate !== today) continue;

      const nums = (draw.winningNumbers || draw.numbers || '').split('-');
      const isEve = (draw.drawTime||draw.timeOfDay||'').toLowerCase().includes('eve') ||
                    (draw.drawName||'').toLowerCase().includes('eve');
      const key = isEve ? 'Florida soir' : 'Florida matin';

      if (!results[key] && nums[0]) {
        results[key] = {
          lot1: String(nums[0]).padStart(2,'0'),
          lot2: String(nums[1]||'').padStart(2,'0'),
          lot3: String(nums[2]||'').padStart(2,'0'),
          date: drawDate, source: 'flalottery.com'
        };
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] Florida error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 3 — New York Lottery (Win 4 / Numbers)
// ══════════════════════════════════════════════════════════════
async function fetchNewYork() {
  try {
    const url = 'https://nylottery.ny.gov/api/public/getDrawResults?gameSlug=numbers&num=2';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};
    const today   = new Date().toISOString().split('T')[0];

    const draws = json?.data?.draws || json?.draws || [];
    for (const draw of draws) {
      const drawDate = (draw.date || draw.drawDate || '').split('T')[0];
      if (drawDate !== today) continue;

      const nums = draw.results?.[0]?.winningNumbers || draw.winningNumbers || '';
      const numsArr = typeof nums === 'string' ? nums.split(/[\s-]+/) : nums;
      const isEve = (draw.drawName||draw.drawTime||'').toLowerCase().includes('eve');
      const key = isEve ? 'New-york soir' : 'New-york matin';

      if (!results[key] && numsArr[0]) {
        results[key] = {
          lot1: String(numsArr[0]).padStart(2,'0'),
          lot2: String(numsArr[1]||'').padStart(2,'0'),
          lot3: String(numsArr[2]||'').padStart(2,'0'),
          date: drawDate, source: 'nylottery.gov'
        };
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] NewYork error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 4 — Ohio Lottery (Pick 3)
// ══════════════════════════════════════════════════════════════
async function fetchOhio() {
  try {
    const url = 'https://www.ohiolottery.com/api/DrawResults/Pick3?count=2';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};
    const today   = new Date().toISOString().split('T')[0];

    const draws = json?.draws || json || [];
    for (const draw of (Array.isArray(draws) ? draws : [])) {
      const drawDate = (draw.DrawDate || draw.date || '').split('T')[0];
      if (drawDate !== today) continue;

      const nums = (draw.WinningNumbers || draw.numbers || '').split(/[\s-]+/);
      const isEve = (draw.DrawTime||draw.drawName||'').toLowerCase().includes('eve');
      const key = isEve ? 'Ohio soir' : 'Ohio matin';

      if (!results[key] && nums[0]) {
        results[key] = {
          lot1: String(nums[0]).padStart(2,'0'),
          lot2: String(nums[1]||'').padStart(2,'0'),
          lot3: String(nums[2]||'').padStart(2,'0'),
          date: drawDate, source: 'ohiolottery.com'
        };
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] Ohio error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 5 — Illinois (Chicago) Pick 3
// ══════════════════════════════════════════════════════════════
async function fetchChicago() {
  try {
    const url = 'https://www.illinoislottery.com/content/dam/il/lottery/ilpick3.json';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};
    const today   = new Date().toISOString().split('T')[0];

    const draws = json?.draws || json?.drawResults || [];
    for (const draw of draws.slice(0, 4)) {
      const drawDate = (draw.drawDate || draw.date || '').split('T')[0];
      if (drawDate !== today) continue;

      const nums = (draw.winningNumbers || '').split(/[\s-]+/);
      const isEve = (draw.drawName||draw.drawTime||'').toLowerCase().includes('eve');
      const key = isEve ? 'Chicago soir' : 'Chicago matin';

      if (!results[key] && nums[0]) {
        results[key] = {
          lot1: String(nums[0]).padStart(2,'0'),
          lot2: String(nums[1]||'').padStart(2,'0'),
          lot3: String(nums[2]||'').padStart(2,'0'),
          date: drawDate, source: 'illinoislottery.com'
        };
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] Chicago error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 6 — Maryland Pick 3
// ══════════════════════════════════════════════════════════════
async function fetchMaryland() {
  try {
    const url = 'https://www.mdlottery.com/api/draw-results?game=pick3&count=2';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};
    const today   = new Date().toISOString().split('T')[0];

    const draws = json?.data || json?.draws || json || [];
    for (const draw of (Array.isArray(draws) ? draws : [])) {
      const drawDate = (draw.drawDate || draw.date || '').split('T')[0];
      if (drawDate !== today) continue;

      const nums = (draw.winningNumbers || draw.numbers || '').split(/[\s-]+/);
      const drawName = (draw.drawName || draw.drawTime || '').toLowerCase();
      const isMidi = drawName.includes('mid') || drawName.includes('noon');
      const isEve  = drawName.includes('eve');
      const key    = isMidi ? 'Maryland midi' : 'Maryland soir';

      if (!results[key] && nums[0]) {
        results[key] = {
          lot1: String(nums[0]).padStart(2,'0'),
          lot2: String(nums[1]||'').padStart(2,'0'),
          lot3: String(nums[2]||'').padStart(2,'0'),
          date: drawDate, source: 'mdlottery.com'
        };
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] Maryland error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  SOURCE 7 — Tennessee Cash 3
// ══════════════════════════════════════════════════════════════
async function fetchTennessee() {
  try {
    const url = 'https://www.tnlottery.com/api/draw-results/cash3/latest';
    const data = await fetchUrl(url, 8000);
    const json = JSON.parse(data);
    const results = {};
    const today   = new Date().toISOString().split('T')[0];

    const draws = json?.draws || (Array.isArray(json) ? json : [json]);
    for (const draw of draws.slice(0, 2)) {
      const drawDate = (draw.drawDate || draw.date || '').split('T')[0];
      if (drawDate !== today) continue;

      const nums = (draw.winningNumbers || '').split(/[\s-]+/);
      const isEve = (draw.drawName||draw.drawTime||'').toLowerCase().includes('eve');
      const key = isEve ? 'Tennessee soir' : 'Tennessee matin';

      if (!results[key] && nums[0]) {
        results[key] = {
          lot1: String(nums[0]).padStart(2,'0'),
          lot2: String(nums[1]||'').padStart(2,'0'),
          lot3: String(nums[2]||'').padStart(2,'0'),
          date: drawDate, source: 'tnlottery.com'
        };
      }
    }
    return results;
  } catch (e) {
    console.log('[SCRAPER] Tennessee error:', e.message);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════
//  FETCH PRINCIPAL — essaie toutes les sources en parallèle
// ══════════════════════════════════════════════════════════════
async function fetchAllResults() {
  console.log('[SCRAPER] Fetching all results...');

  const [ga, fl, ny, oh, ch, md, tn] = await Promise.allSettled([
    fetchGeorgia(), fetchFlorida(), fetchNewYork(),
    fetchOhio(), fetchChicago(), fetchMaryland(), fetchTennessee()
  ]);

  const results = {
    ...(ga.value || {}), ...(fl.value || {}), ...(ny.value || {}),
    ...(oh.value || {}), ...(ch.value || {}), ...(md.value || {}),
    ...(tn.value || {}),
  };

  const found = Object.keys(results).length;
  console.log(`[SCRAPER] Fetched ${found} results:`, Object.keys(results).join(', ') || 'none');
  return results;
}

// ── SAUVEGARDER RÉSULTATS EN DB + BROADCAST ─────────────────
async function saveResults(results, broadcast) {
  const today = new Date().toISOString().split('T')[0];
  const saved = [];

  for (const [tirage, data] of Object.entries(results)) {
    if (!data.lot1) continue;
    try {
      const exists = await db.resultats.findOne({
        tirage,
        date: { $gte: new Date(today), $lt: new Date(today + 'T23:59:59') }
      });

      if (!exists) {
        const r = await db.resultats.insert({
          tirage, lot1: data.lot1, lot2: data.lot2 || '',
          lot3: data.lot3 || '', date: new Date(),
          source: data.source || 'auto', createdAt: new Date()
        });
        saved.push(r);
        // Broadcast immédiat à tous les POS
        if (broadcast) {
          broadcast({
            type: 'nouveau_resultat',
            tirage, lot1: data.lot1, lot2: data.lot2||'', lot3: data.lot3||'',
            date: new Date(), source: data.source || 'auto',
            ts: Date.now()
          });
        }
        console.log(`[SCRAPER] ✅ Sauvé: ${tirage} → ${data.lot1}-${data.lot2}-${data.lot3} (${data.source})`);
      } else {
        // Mettre à jour seulement si les boules ont changé
        if (exists.lot1 !== data.lot1) {
          await db.resultats.update(
            { _id: exists._id },
            { $set: { lot1: data.lot1, lot2: data.lot2||'', lot3: data.lot3||'', updatedAt: new Date() } }
          );
          saved.push({ ...exists, updated: true });
          if (broadcast) {
            broadcast({ type: 'nouveau_resultat', tirage, lot1: data.lot1, lot2: data.lot2||'', lot3: data.lot3||'', ts: Date.now() });
          }
        }
      }
    } catch (e) {
      console.log('[SCRAPER] Save error:', e.message);
    }
  }
  return saved;
}

// ── HELPER: DERNIERS RÉSULTATS PAR TIRAGE ─────────────────────
async function getLatestResults() {
  const latest = {};
  for (const tirage of ALL_TIRAGES) {
    const results = await db.resultats.find({ tirage }).sort({ date: -1 });
    if (results.length > 0) latest[tirage] = results[0];
  }
  return latest;
}

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/resultats/fetch — déclencher manuellement
router.get('/fetch', async (req, res) => {
  try {
    const broadcast = req.app?.locals?.broadcast;
    const results = await fetchAllResults();
    const saved   = await saveResults(results, broadcast);
    const all     = await getLatestResults();
    res.json({ success: true, fetched: Object.keys(results).length, saved: saved.length, results: all });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resultats/latest — derniers résultats par tirage
router.get('/latest', async (req, res) => {
  try {
    const latest = await getLatestResults();
    res.json(latest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resultats/today — tous les résultats du jour
router.get('/today', async (req, res) => {
  try {
    const { date } = req.query;
    const d = date ? new Date(date) : new Date();
    d.setHours(0,0,0,0);
    const end = new Date(d); end.setHours(23,59,59,999);
    const results = await db.resultats.find({ date: { $gte: d, $lte: end } }).sort({ date: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/resultats/status — statut du scraper
router.get('/status', async (req, res) => {
  try {
    const today   = new Date(); today.setHours(0,0,0,0);
    const todayResults = await db.resultats.find({ date: { $gte: today } });
    const lastFetch = global._lastScraperRun || null;
    res.json({
      lastRun: lastFetch,
      todayCount: todayResults.length,
      totalTirages: ALL_TIRAGES.length,
      coverage: `${todayResults.length}/${ALL_TIRAGES.length}`,
      results: todayResults.map(r => ({ tirage: r.tirage, lot1: r.lot1, source: r.source }))
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.fetchAllResults   = fetchAllResults;
module.exports.saveResults       = saveResults;
module.exports.getLatestResults  = getLatestResults;
