const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

// Middleware admin only
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Accès admin requis' });
  next();
}

// ── STATS ─────────────────────────────────────────────────────
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const agents     = await db.agents.count({ role: 'agent', actif: true });
    const allFiches  = await db.fiches.find({ statut: { $ne: 'elimine' } });
    const todayFiches= allFiches.filter(f => new Date(f.dateVente) >= today);
    const totalVente = allFiches.reduce((s, f) => s + (f.total||0), 0);
    const todayVente = todayFiches.reduce((s, f) => s + (f.total||0), 0);
    res.json({
      totalAgents: agents,
      totalFiches: allFiches.length,
      fichesAujourdhui: todayFiches.length,
      venteTotal: totalVente.toFixed(2),
      venteAujourdhui: todayVente.toFixed(2),
      commission: (totalVente * 0.10).toFixed(2),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── AGENTS ────────────────────────────────────────────────────
router.get('/agents', auth, adminOnly, async (req, res) => {
  try {
    const agents = await db.agents.find({}).sort({ createdAt: -1 });
    res.json(agents.map(a => ({
      id: a._id, nom: a.nom, prenom: a.prenom, username: a.username,
      role: a.role, telephone: a.telephone, balance: a.balance,
      credit: a.credit, limiteGain: a.limiteGain, actif: a.actif,
      deviceId: a.deviceId, createdAt: a.createdAt,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/agents', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prenom, username, password, telephone, role, credit, limiteGain } = req.body;
    if (!nom || !username || !password) return res.status(400).json({ message: 'Champs obligatwa manke' });
    const exists = await db.agents.findOne({ username });
    if (exists) return res.status(400).json({ message: 'Username deja pran' });
    const agent = await db.agents.insert({
      nom, prenom, username, telephone,
      password: bcrypt.hashSync(password, 10),
      role: role || 'agent',
      credit: credit || 'Illimité',
      limiteGain: limiteGain || 'Illimité',
      balance: 0, actif: true, createdAt: new Date(),
    });
    res.json({ id: agent._id, ...agent, password: undefined });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/agents/:id', auth, adminOnly, async (req, res) => {
  try {
    const { password, ...data } = req.body;
    const update = { ...data };
    if (password) update.password = bcrypt.hashSync(password, 10);
    await db.agents.update({ _id: req.params.id }, { $set: update });
    res.json({ message: 'Agent mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/agents/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.agents.update({ _id: req.params.id }, { $set: { actif: false } });
    res.json({ message: 'Agent désactivé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TIRAGES ───────────────────────────────────────────────────
router.put('/tirages/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.tirages.update({ _id: req.params.id }, { $set: req.body });
    res.json({ message: 'Tirage mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── FICHES (admin view) ───────────────────────────────────────
router.get('/fiches', auth, adminOnly, async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    let fiches = await db.fiches.find(agentId ? { agentId } : {}).sort({ dateVente: -1 });

    if (debut || fin) {
      fiches = fiches.filter(f => {
        const d = new Date(f.dateVente);
        if (debut && d < new Date(debut)) return false;
        if (fin   && d > new Date(fin + 'T23:59:59')) return false;
        return true;
      });
    }

    const result = await Promise.all(fiches.slice(0, 200).map(async f => {
      const t = await db.tirages.findOne({ _id: f.tirageId });
      const a = await db.agents.findOne({ _id: f.agentId });
      return {
        ticket: f.ticket, total: f.total, statut: f.statut,
        date: f.dateVente, tirage: t?.nom,
        agent: `${a?.prenom || ''} ${a?.nom || ''}`.trim(),
      };
    }));

    res.json({ fiches: result, count: result.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── BOULES BLOQUÉES ───────────────────────────────────────────
router.get('/boules-bloquees', auth, adminOnly, async (req, res) => {
  try {
    const boules = await db.boules.find({});
    res.json(boules);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/boules-bloquees', auth, adminOnly, async (req, res) => {
  try {
    const b = await db.boules.insert({ ...req.body, createdAt: new Date() });
    res.json(b);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/boules-bloquees/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.boules.remove({ _id: req.params.id });
    res.json({ message: 'Boule débloquée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

// ── RÉSULTATS / LOTS GAGNANTS ─────────────────────────────────
router.get('/resultats', auth, async (req, res) => {
  try {
    const resultats = await db.resultats.find({}).sort({ date: -1 });
    res.json(resultats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/resultats', auth, adminOnly, async (req, res) => {
  try {
    const { tirage, date, lot1, lot2, lot3 } = req.body;
    if (!tirage || !lot1) return res.status(400).json({ message: 'Tirage ak 1er lot obligatwa' });
    const r = await db.resultats.insert({ tirage, date: date || new Date(), lot1, lot2, lot3, createdAt: new Date() });
    res.json(r);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/resultats/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.resultats.remove({ _id: req.params.id });
    res.json({ message: 'Résultat supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PRIMES ────────────────────────────────────────────────────
router.get('/primes', auth, async (req, res) => {
  try {
    const primes = await db.primes.find({});
    res.json(primes);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/primes', auth, adminOnly, async (req, res) => {
  try {
    const primes = req.body;
    for (const p of primes) {
      if (p._id) await db.primes.update({ _id: p._id }, { $set: p });
      else await db.primes.insert({ ...p, createdAt: new Date() });
    }
    res.json({ message: 'Primes mises à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── LIMITES ───────────────────────────────────────────────────
router.get('/limites', auth, async (req, res) => {
  try {
    let limites = await db.limites.findOne({ type: 'general' });
    if (!limites) {
      limites = { type:'general', borlette:2000, loto3:150, mariage:50, loto4:25, loto5:3 };
      await db.limites.insert(limites);
    }
    res.json(limites);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/limites', auth, adminOnly, async (req, res) => {
  try {
    const exists = await db.limites.findOne({ type: 'general' });
    if (exists) await db.limites.update({ type: 'general' }, { $set: req.body });
    else await db.limites.insert({ type: 'general', ...req.body });
    res.json({ message: 'Limites mises à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POS ───────────────────────────────────────────────────────
router.get('/pos', auth, adminOnly, async (req, res) => {
  try {
    const pos = await db.pos.find({}).sort({ createdAt: -1 });
    res.json(pos);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/pos', auth, adminOnly, async (req, res) => {
  try {
    const { posId, nom, adresse, telephone, agentId } = req.body;
    if (!posId || !nom) return res.status(400).json({ message: 'POS ID ak non obligatwa' });
    const exists = await db.pos.findOne({ posId });
    if (exists) return res.status(400).json({ message: 'POS ID deja enregistre' });
    const p = await db.pos.insert({ posId, nom, adresse, telephone, agentId, actif: true, createdAt: new Date() });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/pos/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.pos.remove({ _id: req.params.id });
    res.json({ message: 'POS supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PAIEMENT ──────────────────────────────────────────────────
router.post('/paiement', auth, adminOnly, async (req, res) => {
  try {
    const { agentId, type, montant, note } = req.body;
    if (!agentId || !type || !montant) return res.status(400).json({ message: 'Champs manquants' });
    const p = await db.paiements.insert({ agentId, type, montant: Number(montant), note, date: new Date(), createdAt: new Date() });
    // Mettre à jour balance agent
    const delta = type === 'depot' ? Number(montant) : -Number(montant);
    await db.agents.update({ _id: agentId }, { $inc: { balance: delta } });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TOGGLE AGENT ──────────────────────────────────────────────
router.put('/agents/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const agent = await db.agents.findOne({ _id: req.params.id });
    if (!agent) return res.status(404).json({ message: 'Agent pa trouve' });
    await db.agents.update({ _id: req.params.id }, { $set: { actif: !agent.actif } });
    res.json({ message: 'Statut agent chanje', actif: !agent.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
