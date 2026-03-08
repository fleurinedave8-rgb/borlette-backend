const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function parseDate(str) {
  if (!str) return null;
  return new Date(str);
}

// GET /api/rapport/partiel
router.get('/partiel', auth, async (req, res) => {
  try {
    const date  = req.query.date || new Date().toISOString().split('T')[0];
    const debut = new Date(date);
    const fin   = new Date(date + 'T23:59:59');
    const agentId = req.query.agentId || req.user.id;

    const query = agentId === 'tout' ? {} : { agentId };
    let fiches = await db.fiches.find({ ...query, statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => {
      const d = new Date(f.dateVente);
      return d >= debut && d <= fin;
    });

    const vente = fiches.reduce((s, f) => s + (f.total||0), 0);
    res.json({ date, fichesVendu: fiches.length, vente: vente.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/tirage
router.get('/tirage', auth, async (req, res) => {
  try {
    const { debut, fin, tirage } = req.query;
    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });

    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin+'T23:59:59'));
    if (tirage && tirage !== 'tout') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }

    const vente = fiches.reduce((s, f) => s + (f.total||0), 0);
    res.json({ debut, fin, tirage: tirage||'tout', fichesVendu: fiches.length, vente: vente.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/gagnant
router.get('/gagnant', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let fiches = await db.fiches.find({ statut: 'gagnant' });
    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin+'T23:59:59'));

    const result = await Promise.all(fiches.map(async f => {
      const tirage = await db.tirages.findOne({ _id: f.tirageId });
      const agent  = await db.agents.findOne({ _id: f.agentId });
      const rows   = await db.rows.find({ ficheId: f._id });
      return { ...f, tirage: tirage?.nom, agent: `${agent?.prenom||''} ${agent?.nom||''}`.trim(), rows };
    }));

    res.json({ fiches: result, count: result.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/eliminer
router.get('/eliminer', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let fiches = await db.fiches.find({ statut: 'elimine' }).sort({ dateElimine: -1 });
    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin+'T23:59:59'));

    const result = await Promise.all(fiches.slice(0,100).map(async f => {
      const tirage = await db.tirages.findOne({ _id: f.tirageId });
      const agent  = await db.agents.findOne({ _id: f.agentId });
      return { ...f, tirage: tirage?.nom, agent: `${agent?.prenom||''} ${agent?.nom||''}`.trim() };
    }));

    res.json({ fiches: result, count: result.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/transactions
router.get('/transactions', auth, async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    const query = agentId ? { agentId } : {};
    let paiements = await db.paiements.find(query).sort({ date: -1 });
    if (debut) paiements = paiements.filter(p => new Date(p.date) >= new Date(debut));
    if (fin)   paiements = paiements.filter(p => new Date(p.date) <= new Date(fin+'T23:59:59'));

    const result = await Promise.all(paiements.map(async p => {
      const agent = await db.agents.findOne({ _id: p.agentId });
      return { ...p, agent: `${agent?.prenom||''} ${agent?.nom||''}`.trim() };
    }));

    res.json(Array.isArray(result) ? result : []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/statistiques
router.get('/statistiques', auth, async (req, res) => {
  try {
    const { tirage, date, tab } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    const debut = new Date(today);
    const fin   = new Date(today + 'T23:59:59');

    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => new Date(f.dateVente) >= debut && new Date(f.dateVente) <= fin);

    if (tirage && tirage !== 'TOUT') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }

    // Agréger par boule
    const stats = {};
    for (const f of fiches) {
      const rows = await db.rows.find({ ficheId: f._id });
      for (const r of rows) {
        const key = `${r.type}-${r.boule}`;
        if (!stats[key]) stats[key] = { type: r.type, boule: r.boule, quantite: 0, montant: 0 };
        stats[key].quantite++;
        stats[key].montant += r.mise || 0;
      }
    }

    res.json(Object.values(stats).sort((a,b) => b.montant - a.montant));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/journalier
router.get('/journalier', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    const debut = new Date(today);
    const fin   = new Date(today + 'T23:59:59');

    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => new Date(f.dateVente) >= debut && new Date(f.dateVente) <= fin);
    const vente = fiches.reduce((s,f) => s+(f.total||0), 0);

    // Par agent
    const agentMap = {};
    for (const f of fiches) {
      if (!agentMap[f.agentId]) agentMap[f.agentId] = { fiches:0, vente:0 };
      agentMap[f.agentId].fiches++;
      agentMap[f.agentId].vente += f.total||0;
    }

    const agents = await Promise.all(Object.entries(agentMap).map(async ([id, data]) => {
      const a = await db.agents.findOne({ _id: id });
      const pct = (a?.agentPct || 10) / 100;
      return { agent: `${a?.prenom||''} ${a?.nom||''}`.trim(), ...data, commission: (data.vente*pct).toFixed(2), pct: a?.agentPct||10 };
    }));

    const commTotal = agents.reduce((s,a) => s + parseFloat(a.commission||0), 0);
    res.json({ date: today, fichesVendu: fiches.length, vente: vente.toFixed(2), commission: commTotal.toFixed(2), agents });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
