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
