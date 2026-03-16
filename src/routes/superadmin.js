/**
 * ═══════════════════════════════════════════════════════════════
 *  SUPER ADMIN — MULTI-TENANT — LA-PROBITE-BORLETTE
 *  Gouvènen plizyè Admin/Borlette nan yon sèl platfòm
 * ═══════════════════════════════════════════════════════════════
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const { db }   = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

const superOnly = (req, res, next) => {
  if (req.user?.role !== 'superadmin')
    return res.status(403).json({ message: '🔐 Aksè refize — Super Admin sèlman' });
  next();
};

// ── GET /api/superadmin/stats — Vue global tout sistèm ───────
router.get('/stats', auth, superOnly, async (req, res) => {
  try {
    const admins    = await db.agents.find({ role: 'admin' });
    const agents    = await db.agents.find({ role: 'agent' });
    const pos       = await db.pos.find({});
    const allFiches = await db.fiches.find({});
    const today     = new Date().toISOString().split('T')[0];
    const fichesJodia = allFiches.filter(f => {
      if (!f.dateVente) return false;
      return new Date(f.dateVente).toISOString().split('T')[0] === today;
    });

    const venteTotal  = allFiches.reduce((s, f) => s + (f.total || 0), 0);
    const venteJodia  = fichesJodia.reduce((s, f) => s + (f.total || 0), 0);
    const gagnants    = allFiches.filter(f => f.statut === 'gagnant');
    const gainTotal   = gagnants.reduce((s, f) => s + (f.gainTotal || 0), 0);

    res.json({
      admins:    admins.length,
      agents:    agents.length,
      pos:       pos.length,
      posActif:  pos.filter(p => p.actif).length,
      fiches:    allFiches.length,
      fichesJodia: fichesJodia.length,
      venteTotal:  venteTotal.toFixed(2),
      venteJodia:  venteJodia.toFixed(2),
      gagnants:    gagnants.length,
      gainTotal:   gainTotal.toFixed(2),
      profit:      (venteTotal - gainTotal).toFixed(2),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/superadmin/admins — Lis tout admins ─────────────
router.get('/admins', auth, superOnly, async (req, res) => {
  try {
    const admins = await db.agents.find({ role: 'admin' }).sort({ createdAt: -1 });
    const result = await Promise.all(admins.map(async a => {
      const agentCount = await db.agents.count({ role: 'agent', createdBy: a._id });
      const posCount   = await db.pos.count({ adminId: a._id });
      const fiches     = await db.fiches.find({ adminId: a._id });
      const vente      = fiches.reduce((s, f) => s + (f.total||0), 0);
      return {
        _id: a._id, nom: a.nom, prenom: a.prenom, username: a.username,
        telephone: a.telephone, email: a.email,
        actif: a.actif, balance: a.balance || 0,
        createdAt: a.createdAt, lastLogin: a.lastLogin,
        licence: a.licence || null,
        agentCount, posCount, vente: vente.toFixed(2),
      };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/superadmin/admins — Kreye nouvo Admin ──────────
router.post('/admins', auth, superOnly, async (req, res) => {
  try {
    const { nom, prenom, username, password, telephone, email, licenceDuree } = req.body;
    if (!nom || !username || !password)
      return res.status(400).json({ message: 'Nom, username ak modpas obligatwa' });

    const exist = await db.agents.findOne({ username: username.toLowerCase().trim() });
    if (exist) return res.status(400).json({ message: 'Username deja egziste' });

    // Kalkile ekspirasyon lisans
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + (licenceDuree || 30));

    const hash = await bcrypt.hash(password, 10);
    const admin = await db.agents.insert({
      nom, prenom, username: username.toLowerCase().trim(),
      password: hash, role: 'admin',
      telephone: telephone || '', email: email || '',
      actif: true, balance: 0,
      credit: 'Illimité', limiteGain: 'Illimité',
      createdBy: req.user.id, // superadmin ki kreye l
      licence: {
        actif: true,
        debut: new Date(),
        expiration,
        duree: licenceDuree || 30,
        type: 'mensuel',
      },
      createdAt: new Date(),
    });

    await db.logs.insert({
      userId: req.user?.id, username: req.user?.username, role: req.user?.role,
      action: 'Kreye Admin', details: { username: admin.username },
      createdAt: new Date()
    });

    res.json({ ...admin, password: undefined });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PUT /api/superadmin/admins/:id — Modifye Admin ───────────
router.put('/admins/:id', auth, superOnly, async (req, res) => {
  try {
    const { nom, prenom, telephone, email, actif, password } = req.body;
    const update = { nom, prenom, telephone, email, actif, updatedAt: new Date() };
    if (password) update.password = await bcrypt.hash(password, 10);

    // Retire undefined
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    await db.agents.update({ _id: req.params.id, role: 'admin' }, { $set: update });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POST /api/superadmin/licence/:id — Renouvle Lisans ───────
router.post('/licence/:id', auth, superOnly, async (req, res) => {
  try {
    const { duree, type } = req.body; // duree en jou
    const admin = await db.agents.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Admin pa jwenn' });

    // Rekalkile ekspirasyon depi jodi
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + (duree || 30));

    await db.agents.update({ _id: req.params.id }, {
      $set: {
        licence: {
          actif: true,
          debut: new Date(),
          expiration,
          duree: duree || 30,
          type: type || 'mensuel',
          renouvleBy: req.user.username,
          renouvleAt: new Date(),
        }
      }
    });

    await db.logs.insert({
      userId: req.user?.id, username: req.user?.username,
      action: 'Renouvle Lisans', details: { adminId: req.params.id, duree, expiration },
      createdAt: new Date()
    });

    res.json({ success: true, expiration, message: `Lisans renouvle pou ${duree} jou` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/superadmin/licences — Tout lisans + statut ──────
router.get('/licences', auth, superOnly, async (req, res) => {
  try {
    const admins = await db.agents.find({ role: 'admin' });
    const now    = new Date();
    const result = admins.map(a => {
      const lic   = a.licence || {};
      const exp   = lic.expiration ? new Date(lic.expiration) : null;
      const jousReste = exp ? Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) : null;
      return {
        _id: a._id, nom: a.nom, prenom: a.prenom, username: a.username,
        actif: a.actif,
        licence: {
          ...lic,
          jousReste,
          expire: exp ? jousReste <= 0 : true,
          expirantBiento: jousReste !== null && jousReste <= 7 && jousReste > 0,
        }
      };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DELETE /api/superadmin/admins/:id — Dezaktive Admin ──────
router.delete('/admins/:id', auth, superOnly, async (req, res) => {
  try {
    await db.agents.update(
      { _id: req.params.id, role: 'admin' },
      { $set: { actif: false, dezaktiveBy: req.user.username, dezaktiveAt: new Date() } }
    );
    res.json({ success: true, message: 'Admin dezaktive' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/superadmin/logs — Logs global ───────────────────
router.get('/logs', auth, superOnly, async (req, res) => {
  try {
    const logs = await db.logs.find({}).sort({ createdAt: -1 });
    res.json(logs.slice(0, 500));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/superadmin/revenus — Revni global pa admin ──────
router.get('/revenus', auth, superOnly, async (req, res) => {
  try {
    const admins = await db.agents.find({ role: 'admin' });
    const now    = new Date();
    const debut  = new Date(now.getFullYear(), now.getMonth(), 1); // Debut mwa

    const result = await Promise.all(admins.map(async a => {
      const fiches = await db.fiches.find({ adminId: a._id });
      const ficheMwa = fiches.filter(f => f.dateVente && new Date(f.dateVente) >= debut);
      const venteTotal = fiches.reduce((s, f) => s + (f.total||0), 0);
      const venteMwa   = ficheMwa.reduce((s, f) => s + (f.total||0), 0);
      return {
        adminId: a._id, nom: `${a.prenom} ${a.nom}`, username: a.username,
        venteTotal: venteTotal.toFixed(2), venteMwa: venteMwa.toFixed(2),
        fichesTotal: fiches.length, fichesMwa: ficheMwa.length,
      };
    }));

    res.json(result.sort((a, b) => parseFloat(b.venteTotal) - parseFloat(a.venteTotal)));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
