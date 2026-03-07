const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'superviseur') 
    return res.status(403).json({ message: 'Accès refusé' });
  next();
}

// ── STATS ─────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const agents     = await db.agents.count({ role: 'agent', actif: true });
    const pos        = await db.pos.count({ actif: true });
    const allFiches  = await db.fiches.find({ statut: { $ne: 'elimine' } });
    const todayFiches= allFiches.filter(f => new Date(f.dateVente) >= today);
    const totalVente = allFiches.reduce((s, f) => s + (f.total||0), 0);
    const todayVente = todayFiches.reduce((s, f) => s + (f.total||0), 0);
    // POS connectés (actifs dans les 5 dernières minutes)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const posConnectes = await db.pos.count({ lastSeen: { $gte: fiveMinAgo } });
    res.json({
      totalAgents: agents, totalPos: pos, posConnectes,
      totalFiches: allFiches.length, fichesAujourdhui: todayFiches.length,
      venteTotal: totalVente.toFixed(2), venteAujourdhui: todayVente.toFixed(2),
      commission: (totalVente * 0.10).toFixed(2),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── HEARTBEAT POS (connecté en temps réel) ────────────────────
router.post('/pos/heartbeat', auth, async (req, res) => {
  try {
    const { posId } = req.body;
    if (posId) await db.pos.update({ posId }, { $set: { lastSeen: new Date(), online: true } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── AGENTS ────────────────────────────────────────────────────
router.get('/agents', auth, async (req, res) => {
  try {
    const agents = await db.agents.find({}).sort({ createdAt: -1 });
    res.json(agents.map(a => ({
      id: a._id, nom: a.nom, prenom: a.prenom, username: a.username,
      role: a.role, telephone: a.telephone, balance: a.balance,
      credit: a.credit, limiteGain: a.limiteGain, actif: a.actif,
      deviceId: a.deviceId, superviseurId: a.superviseurId, createdAt: a.createdAt,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/agents', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prenom, username, password, telephone, role, credit, limiteGain, superviseurId, prepaye, montantPrepaye } = req.body;
    if (!nom || !username || !password) return res.status(400).json({ message: 'Champs obligatwa manke' });
    const exists = await db.agents.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Username deja pran' });
    const agent = await db.agents.insert({
      nom, prenom, telephone,
      username: username.toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      role: role || 'agent',
      credit: credit || 'Illimité',
      limiteGain: limiteGain || 'Illimité',
      superviseurId: superviseurId || null,
      prepaye: prepaye || false,
      montantPrepaye: montantPrepaye || 0,
      balance: prepaye ? (montantPrepaye || 0) : 0,
      actif: true, createdAt: new Date(),
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

router.put('/agents/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const agent = await db.agents.findOne({ _id: req.params.id });
    if (!agent) return res.status(404).json({ message: 'Agent pa trouve' });
    await db.agents.update({ _id: req.params.id }, { $set: { actif: !agent.actif } });
    res.json({ message: 'Statut chanje', actif: !agent.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── SUPERVISEURS ──────────────────────────────────────────────
router.get('/superviseurs', auth, async (req, res) => {
  try {
    const sups = await db.agents.find({ role: 'superviseur', actif: true });
    res.json(sups.map(s => ({ id: s._id, nom: s.nom, prenom: s.prenom, username: s.username })));
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
    const { debut, fin, agentId, posId, tirage } = req.query;
    let fiches = await db.fiches.find(agentId ? { agentId } : {}).sort({ dateVente: -1 });
    if (debut || fin) {
      fiches = fiches.filter(f => {
        const d = new Date(f.dateVente || f.createdAt);
        if (debut && d < new Date(debut)) return false;
        if (fin   && d > new Date(fin + 'T23:59:59')) return false;
        return true;
      });
    }
    // Filtre par tirage si spécifié
    if (tirage && tirage !== 'Tout') {
      fiches = fiches.filter(f => f.tirage === tirage || f.tirageNom === tirage);
    }
    const result = await Promise.all(fiches.slice(0, 500).map(async f => {
      const t = await db.tirages.findOne({ _id: f.tirageId }).catch(() => null);
      const a = await db.agents.findOne({ _id: f.agentId }).catch(() => null);
      const p = await db.pos.findOne({ posId: f.posId || a?.deviceId }).catch(() => null);

      const dateVente = f.dateVente || f.createdAt || new Date();
      const dt = new Date(dateVente);
      const pad = n => String(n).padStart(2,'0');
      const heure = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

      return {
        ticket:   f.ticket,
        total:    f.total || 0,
        vente:    f.total || 0,
        statut:   f.statut,
        date:     dateVente,
        heure:    heure,
        tirage:   t?.nom || f.tirage || f.tirageNom || '—',
        agent:    `${a?.prenom||''} ${a?.nom||''}`.trim() || '—',
        posId:    f.posId || a?.deviceId || '—',
        posNom:   p?.nom || a?.username || '—',
        succursale: p?.succursale || a?.succursale || '—',
        rows:     f.rows || [],
      };
    }));
    res.json({ fiches: result, count: result.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── RÉSULTATS ─────────────────────────────────────────────────
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
    const r = await db.resultats.insert({ tirage, date: date ? new Date(date) : new Date(), lot1, lot2: lot2||'', lot3: lot3||'', createdAt: new Date() });
    // Broadcast WebSocket — tous les POS reçoivent le résultat en temps réel
    const broadcast = req.app?.locals?.broadcast;
    if (broadcast) broadcast({ type: 'nouveau_resultat', tirage, lot1, lot2: lot2||'', lot3: lot3||'', date: r.date, ts: Date.now() });
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
    let primes = await db.primes.find({});
    if (primes.length === 0) {
      const defaults = [
        { type:'P0', label:'Borlette',  prime1:60, prime2:20, prime3:10 },
        { type:'P1', label:'Loto3 P1',  prime1:400, prime2:0, prime3:0 },
        { type:'P2', label:'Loto3 P2',  prime1:200, prime2:0, prime3:0 },
        { type:'P3', label:'Loto3 P3',  prime1:100, prime2:0, prime3:0 },
        { type:'MAR', label:'Mariage',  prime1:500, prime2:0, prime3:0 },
        { type:'L4',  label:'Loto4',    prime1:3000, prime2:0, prime3:0 },
      ];
      for (const p of defaults) await db.primes.insert(p);
      primes = await db.primes.find({});
    }
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
      limites = { type:'general', borlette:2000, loto3:150, mariage:50, loto4:25 };
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

// ── BOULES BLOQUÉES ───────────────────────────────────────────
router.get('/boules-bloquees', auth, async (req, res) => {
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

// ── POS ───────────────────────────────────────────────────────
router.get('/pos', auth, async (req, res) => {
  try {
    const pos = await db.pos.find({}).sort({ createdAt: -1 });
    res.json(pos);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/pos', auth, adminOnly, async (req, res) => {
  try {
    const { posId, nom, adresse, telephone, agentId, succursale, prime, agentPct, supPct, credit, prepaye, montantPrepaye } = req.body;
    if (!posId || !nom) return res.status(400).json({ message: 'POS ID ak non obligatwa' });
    const exists = await db.pos.findOne({ posId });
    if (exists) return res.status(400).json({ message: 'POS ID deja enregistre' });
    const p = await db.pos.insert({
      posId, nom, adresse, telephone, agentId,
      succursale, prime: prime||'60|20|10',
      agentPct: agentPct||0, supPct: supPct||0,
      credit: credit||'Illimité',
      prepaye: prepaye||false,
      montantPrepaye: montantPrepaye||0,
      actif: true, online: false,
      createdAt: new Date(),
    });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/pos/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.pos.update({ _id: req.params.id }, { $set: req.body });
    res.json({ message: 'POS mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/pos/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.pos.remove({ _id: req.params.id });
    res.json({ message: 'POS supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/pos/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const p = await db.pos.findOne({ _id: req.params.id });
    if (!p) return res.status(404).json({ message: 'POS pa trouve' });
    await db.pos.update({ _id: req.params.id }, { $set: { actif: !p.actif } });
    res.json({ actif: !p.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PAIEMENT ──────────────────────────────────────────────────
router.post('/paiement', auth, adminOnly, async (req, res) => {
  try {
    const { agentId, type, montant, note } = req.body;
    if (!agentId || !type || !montant) return res.status(400).json({ message: 'Champs manquants' });
    const p = await db.paiements.insert({ agentId, type, montant: Number(montant), note, date: new Date(), createdAt: new Date() });
    const delta = type === 'depot' ? Number(montant) : -Number(montant);
    await db.agents.update({ _id: agentId }, { $inc: { balance: delta } });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TÊTE FICHE ────────────────────────────────────────────────
router.get('/tete-fiche', auth, async (req, res) => {
  try {
    let tete = await db.config.findOne({ type: 'tete_fiche' });
    if (!tete) {
      tete = { type:'tete_fiche', ligne1:'LA-PROBITE-BORLETTE', ligne2:'Sistèm Jesyon Loto', ligne3:'', ligne4:'', actif: true };
      await db.config.insert(tete);
    }
    res.json(tete);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/tete-fiche', auth, adminOnly, async (req, res) => {
  try {
    const exists = await db.config.findOne({ type: 'tete_fiche' });
    if (exists) await db.config.update({ type: 'tete_fiche' }, { $set: req.body });
    else await db.config.insert({ type: 'tete_fiche', ...req.body });
    res.json({ message: 'Tête fiche mise à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── MARIAGE GRATUIT ───────────────────────────────────────────
router.get('/mariage-gratuit', auth, async (req, res) => {
  try {
    let config = await db.config.findOne({ type: 'mariage_gratuit' });
    if (!config) {
      config = { type:'mariage_gratuit', actif: false, zones: [], montantMin: 100 };
      await db.config.insert(config);
    }
    res.json(config);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/mariage-gratuit', auth, adminOnly, async (req, res) => {
  try {
    const exists = await db.config.findOne({ type: 'mariage_gratuit' });
    if (exists) await db.config.update({ type: 'mariage_gratuit' }, { $set: req.body });
    else await db.config.insert({ type: 'mariage_gratuit', ...req.body });
    res.json({ message: 'Mariage gratuit mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── CONNECTÉS EN TEMPS RÉEL ───────────────────────────────────
router.get('/pos-connectes', auth, async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const connectes = await db.pos.find({ lastSeen: { $gte: fiveMinAgo }, actif: true });
    res.json({ count: connectes.length, pos: connectes });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PRÉ-PAYER UN AGENT ────────────────────────────────────────
router.post('/prepaye', auth, adminOnly, async (req, res) => {
  try {
    const { agentId, montant, jours, type } = req.body;
    if (!agentId || !montant) return res.status(400).json({ message: 'agentId ak montant obligatwa' });
    const expiration = new Date(Date.now() + (jours || 30) * 24 * 60 * 60 * 1000);
    await db.agents.update({ _id: agentId }, { $set: { prepaye: true, montantPrepaye: montant, prepayeExpire: expiration, prepayeType: type || 'abonnement' } });
    await db.transactions.insert({ agentId, type: 'prepaye', montant: parseFloat(montant), jours: jours || 30, date: new Date(), note: `Prépaiement ${type} ${jours}j` });
    res.json({ message: 'Prépaiement aktivé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

// ── LOGS AUDIT ────────────────────────────────────────────────
router.get('/logs', auth, adminOnly, async (req, res) => {
  try {
    const { debut, fin, userId, action } = req.query;
    let logs = await db.logs.find({}).sort({ createdAt: -1 });
    if (debut) logs = logs.filter(l => new Date(l.createdAt) >= new Date(debut));
    if (fin)   logs = logs.filter(l => new Date(l.createdAt) <= new Date(fin + 'T23:59:59'));
    if (userId) logs = logs.filter(l => l.userId === userId);
    if (action) logs = logs.filter(l => l.action?.toLowerCase().includes(action.toLowerCase()));
    res.json(logs.slice(0, 500));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/logs', auth, async (req, res) => {
  try {
    const { action, details } = req.body;
    const log = await db.logs.insert({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      role: req.user.role,
      action, details,
      createdAt: new Date(),
    });
    // Broadcast log to admin
    const broadcast = req.app?.locals?.broadcast;
    if (broadcast) broadcast({ type: 'new_log', log });
    res.json(log);
  } catch (err) { res.status(500).json({ message: err.message }); }
});
