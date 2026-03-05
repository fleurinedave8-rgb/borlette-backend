const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function parseDate(str) {
  if (!str) return null;
  if (str.includes('/')) return new Date(str.split('/').reverse().join('-'));
  return new Date(str);
}

async function getFiches(agentId, debut, fin) {
  const fiches = await db.fiches.find({ agentId, statut: { $ne: 'elimine' } });
  return fiches.filter(f => {
    const d = new Date(f.dateVente);
    if (debut && d < debut) return false;
    if (fin   && d > fin)   return false;
    return true;
  });
}

router.get('/partiel', auth, async (req, res) => {
  try {
    const date  = req.query.date || new Date().toISOString().split('T')[0];
    const debut = parseDate(req.query.date);
    const fin   = debut ? new Date(debut.getTime() + 86399999) : null;
    const fiches = await getFiches(req.user.id, debut, fin);
    const vente  = fiches.reduce((s, f) => s + f.total, 0);
    res.json({ tirage: 'tout', date, fichesVendu: fiches.length, vente: vente.toFixed(2), commision: (vente * 0.10).toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/tirage', auth, async (req, res) => {
  try {
    const debut  = parseDate(req.query.debut);
    const fin    = req.query.fin ? new Date(parseDate(req.query.fin).getTime() + 86399999) : null;
    const fiches = await getFiches(req.user.id, debut, fin);
    const vente  = fiches.reduce((s, f) => s + f.total, 0);
    res.json({ tirage: 'tout', date: req.query.debut, fichesVendu: fiches.length, vente: vente.toFixed(2), commision: (vente * 0.10).toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/gagnant',      auth, (req, res) => res.json({ fiches: [], count: 0, total: 0 }));
router.get('/transactions', auth, async (req, res) => {
  try {
    const debut  = parseDate(req.query.debut);
    const fin    = req.query.fin ? new Date(parseDate(req.query.fin).getTime() + 86399999) : null;
    const fiches = await db.fiches.find({ agentId: req.user.id });
    const filtered = fiches.filter(f => {
      const d = new Date(f.dateVente);
      if (debut && d < debut) return false;
      if (fin   && d > fin)   return false;
      return true;
    });
    res.json({ transactions: filtered.map(f => ({ ticket: f.ticket, total: f.total, date: f.dateVente, statut: f.statut })), count: filtered.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.get('/eliminer', auth, async (req, res) => {
  try {
    const fiches = await db.fiches.find({ agentId: req.user.id, statut: 'elimine' });
    res.json({ fiches, count: fiches.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
