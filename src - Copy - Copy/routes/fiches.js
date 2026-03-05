const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function genTicket() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2,5).toUpperCase();
}

// POST /api/fiches
router.post('/', auth, async (req, res) => {
  try {
    const { tirages, entries, total } = req.body;
    if (!tirages?.length) return res.status(400).json({ message: 'Tiraj obligatwa' });
    if (!entries?.length)  return res.status(400).json({ message: 'Omwen yon boul obligatwa' });

    const ticket = genTicket();
    const now    = new Date().toISOString();
    const tirage = await db.tirages.findOne({ _id: tirages[0] });
    const agent  = await db.agents.findOne({ _id: req.user.id });

    const fiche = await db.fiches.insert({
      ticket, agentId: req.user.id, tirageId: tirages[0],
      total, statut: 'actif', dateVente: now,
    });

    for (const e of entries) {
      await db.rows.insert({ ficheId: fiche._id, boule: e.boule, type: e.type || 'P0', montant: e.montant });
    }

    res.json({
      ticket, total,
      tirage:    tirage?.nom || 'N/A',
      agent:     `${agent?.prenom || ''} ${agent?.nom || ''}`.trim(),
      telephone: agent?.telephone,
      date:      now,
      rows:      entries,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fiches/mes-fiches
router.get('/mes-fiches', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let query = { agentId: req.user.id, statut: { $ne: 'elimine' } };

    const fiches = await db.fiches.find(query).sort({ dateVente: -1 });

    // Filter by date
    let filtered = fiches;
    if (debut || fin) {
      filtered = fiches.filter(f => {
        const d = new Date(f.dateVente);
        const debutDate = debut ? new Date(debut.split('/').reverse().join('-')) : null;
        const finDate   = fin   ? new Date(fin.split('/').reverse().join('-') + 'T23:59:59') : null;
        if (debutDate && d < debutDate) return false;
        if (finDate   && d > finDate)   return false;
        return true;
      });
    }

    // Populate tirages
    const result = await Promise.all(filtered.map(async f => {
      const t = await db.tirages.findOne({ _id: f.tirageId });
      return { ticket: f.ticket, tirage: t?.nom, date: f.dateVente, total: f.total, statut: f.statut };
    }));

    res.json({ fiches: result, count: result.length, total: result.reduce((s, f) => s + f.total, 0) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fiches/:ticket
router.get('/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Ticket pa trouve' });

    const tirage = await db.tirages.findOne({ _id: fiche.tirageId });
    const agent  = await db.agents.findOne({ _id: fiche.agentId });
    const rows   = await db.rows.find({ ficheId: fiche._id });

    res.json({
      ticket:    fiche.ticket,
      tirage:    tirage?.nom,
      agent:     `${agent?.prenom || ''} ${agent?.nom || ''}`.trim(),
      telephone: agent?.telephone,
      date:      fiche.dateVente,
      total:     fiche.total,
      statut:    fiche.statut,
      rows,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/fiches/:ticket
router.delete('/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket, agentId: req.user.id });
    if (!fiche) return res.status(404).json({ message: 'Ticket pa trouve' });
    if (fiche.statut === 'elimine') return res.status(400).json({ message: 'Ticket deja elimine' });
    await db.fiches.update({ _id: fiche._id }, { $set: { statut: 'elimine' } });
    res.json({ message: 'Ticket elimine avèk siksè' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
