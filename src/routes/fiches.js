const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function genTicket() {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const r = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${d}-${r}`;
}

// POST /api/fiches — Créer une fiche
router.post('/', auth, async (req, res) => {
  try {
    const { tirageId, rows, total, posId, posName } = req.body;
    if (!tirageId) return res.status(400).json({ message: 'Tiraj obligatwa' });
    if (!rows?.length) return res.status(400).json({ message: 'Omwen yon boul obligatwa' });

    const ticket = genTicket();
    const now    = new Date();
    const tirage = await db.tirages.findOne({ _id: tirageId });
    const agent  = await db.agents.findOne({ _id: req.user.id });

    const fiche = await db.fiches.insert({
      ticket, agentId: req.user.id, tirageId,
      total: Number(total) || 0,
      statut: 'actif',
      dateVente: now,
      posId: posId || null,
      posName: posName || null,
    });

    for (const row of rows) {
      await db.rows.insert({
        ficheId: fiche._id,
        boule:   row.boule,
        type:    row.type || 'P0',
        mise:    Number(row.mise) || Number(row.montant) || 0,
      });
    }

    // Log audit
    db.logs.insert({ userId: req.user?.id, username: req.user?.username, role: req.user?.role,
      action: 'Kreye Fich', methode: 'POST', route: '/api/fiches', statut: 'success',
      details: { ticket, total }, createdAt: new Date() }).catch(()=>{});

    res.json({
      ticket, total,
      tirage:    tirage?.nom || 'N/A',
      agent:     `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
      telephone: agent?.telephone,
      date:      now,
      rows,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fiches/mes-fiches
router.get('/mes-fiches', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let fiches = await db.fiches.find({ agentId: req.user.id }).sort({ dateVente: -1 });

    if (debut || fin) {
      fiches = fiches.filter(f => {
        const d = new Date(f.dateVente);
        if (debut && d < new Date(debut)) return false;
        if (fin   && d > new Date(fin + 'T23:59:59')) return false;
        return true;
      });
    }

    const result = await Promise.all(fiches.slice(0, 100).map(async f => {
      const rows = await db.rows.find({ ficheId: f._id });
      const tirage = await db.tirages.findOne({ _id: f.tirageId });
      return { ...f, rows, tirage: tirage?.nom };
    }));

    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fiches/:ticket — Chercher une fiche
router.get('/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    const rows   = await db.rows.find({ ficheId: fiche._id });
    const tirage = await db.tirages.findOne({ _id: fiche.tirageId });
    const agent  = await db.agents.findOne({ _id: fiche.agentId });
    res.json({ ...fiche, rows, tirage, agent });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/fiches/:ticket — Éliminer une fiche
router.delete('/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    await db.fiches.update({ ticket: req.params.ticket }, { $set: { statut: 'elimine', dateElimine: new Date() } });
    res.json({ message: 'Fich elimine' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});


// PUT /api/fiches/approuver/:ticket
router.put('/approuver/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    await db.fiches.update(
      { ticket: req.params.ticket },
      { $set: { statut: 'elimine', dateElimine: new Date(), approuveePar: req.user.username } }
    );
    db.logs.insert({ userId: req.user?.id, username: req.user?.username,
      action: 'Aprouve Eliminasyon', details: { ticket: req.params.ticket }, createdAt: new Date() }).catch(()=>{});
    res.json({ message: 'Eliminasyon aprouve' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/fiches/refuser/:ticket
router.put('/refuser/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    await db.fiches.update(
      { ticket: req.params.ticket },
      { $set: { demandeElimination: false, refusePar: req.user.username } }
    );
    res.json({ message: 'Demann refize' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
