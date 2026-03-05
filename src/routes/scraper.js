// scraper.js — Récupération automatique des résultats de tirage
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const https   = require('https');
const http    = require('http');

// ── MAPPING TIRAGES ───────────────────────────────────────────
// Les noms exacts utilisés dans notre système
const TIRAGE_MAP = {
  'georgia_day':    'Georgia-Matin',
  'georgia_eve':    'Georgia-Soir',
  'florida_day':    'Florida matin',
  'florida_eve':    'Florida soir',
  'newyork_day':    'New-york matin',
  'newyork_eve':    'New-york soir',
};

// ── FETCH HELPER ──────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// ── PARSER RÉSULTATS DEPUIS VARIOUS SOURCES ───────────────────
// Source 1: tlotobòlèt.com ou bouleloto.com style API
async function fetchFromBouleLoto() {
  try {
    const html = await fetchUrl('https://www.bouleloto.com/');
    const results = {};

    // Parser les boules depuis le HTML
    const tirageRegex = /Georgia.*?Matin[\s\S]*?(\d{1,2})[\s\S]*?(\d{1,2})[\s\S]*?(\d{1,2})/gi;
    let match;
    while ((match = tirageRegex.exec(html)) !== null) {
      results['Georgia-Matin'] = { lot1: match[1], lot2: match[2], lot3: match[3] };
    }
    return results;
  } catch { return {}; }
}

// Source 2: API Haiti Loto (format JSON)
async function fetchFromHaitiLoto() {
  try {
    const data = await fetchUrl('https://www.haitiloto.com/api/results/latest');
    const json = JSON.parse(data);
    const results = {};

    if (Array.isArray(json)) {
      json.forEach(r => {
        const nom = TIRAGE_MAP[r.game?.toLowerCase().replace(' ','_')] || r.game;
        if (nom) results[nom] = { lot1: r.first, lot2: r.second, lot3: r.third, date: r.date };
      });
    }
    return results;
  } catch { return {}; }
}

// Source 3: Résultats manuels simulés (fallback pour demo)
function getDemoResults() {
  const today = new Date().toISOString().split('T')[0];
  // Boules fixes pour demo — seront remplacées par vrais résultats
  return {
    'Georgia-Matin':  { lot1:'45', lot2:'12', lot3:'78', date: today, source:'demo' },
    'Georgia-Soir':   { lot1:'23', lot2:'56', lot3:'89', date: today, source:'demo' },
    'Florida matin':  { lot1:'67', lot2:'34', lot3:'01', date: today, source:'demo' },
    'Florida soir':   { lot1:'89', lot2:'45', lot3:'23', date: today, source:'demo' },
    'New-york matin': { lot1:'12', lot2:'67', lot3:'45', date: today, source:'demo' },
    'New-york soir':  { lot1:'34', lot2:'89', lot3:'56', date: today, source:'demo' },
  };
}

// ── SAUVEGARDER RÉSULTATS EN DB ───────────────────────────────
async function saveResults(results) {
  const today = new Date().toISOString().split('T')[0];
  const saved = [];

  for (const [tirage, data] of Object.entries(results)) {
    if (!data.lot1) continue;
    try {
      // Vérifier si déjà enregistré aujourd'hui
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
      } else {
        // Mettre à jour si source auto
        await db.resultats.update(
          { _id: exists._id },
          { $set: { lot1: data.lot1, lot2: data.lot2||'', lot3: data.lot3||'', updatedAt: new Date() } }
        );
        saved.push({ ...exists, updated: true });
      }
    } catch {}
  }
  return saved;
}

// ── ROUTE: RÉCUPÉRER RÉSULTATS AUTOMATIQUEMENT ────────────────
router.get('/fetch', async (req, res) => {
  try {
    let results = {};

    // Essayer les sources internet dans l'ordre
    results = await fetchFromHaitiLoto();

    if (Object.keys(results).length === 0) {
      results = await fetchFromBouleLoto();
    }

    // Si aucune source ne marche → utiliser les résultats déjà en DB
    // (ne pas écraser avec demo si on a déjà des vrais résultats)
    const existingCount = await db.resultats.count({});
    if (Object.keys(results).length === 0 && existingCount === 0) {
      results = getDemoResults();
    }

    let saved = [];
    if (Object.keys(results).length > 0) {
      saved = await saveResults(results);
    }

    // Retourner tous les derniers résultats depuis la DB
    const allResults = await getLatestResults();
    res.json({ success: true, fetched: Object.keys(results).length, saved: saved.length, results: allResults });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── HELPER: DERNIERS RÉSULTATS PAR TIRAGE ────────────────────
async function getLatestResults() {
  const tirages = ['Georgia-Matin','Georgia-Soir','Florida matin','Florida soir','New-york matin','New-york soir'];
  const latest = {};

  for (const tirage of tirages) {
    const results = await db.resultats.find({ tirage }).sort({ date: -1 });
    if (results.length > 0) latest[tirage] = results[0];
  }
  return latest;
}

// ── ROUTE: DERNIERS RÉSULTATS ─────────────────────────────────
router.get('/latest', async (req, res) => {
  try {
    const latest = await getLatestResults();
    res.json(latest);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ROUTE: TOUS LES RÉSULTATS DU JOUR ────────────────────────
router.get('/today', async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const results = await db.resultats.find({
      date: { $gte: today }
    }).sort({ date: -1 });
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
module.exports.getLatestResults = getLatestResults;
module.exports.saveResults = saveResults;
