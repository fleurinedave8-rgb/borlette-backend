const express = require('express');
const { db }   = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

// GET /api/tirages/disponibles
router.get('/disponibles', async (req, res) => {
  try {
    const tirages = await db.tirages.find({ actif: true });
    res.json(tirages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/tirages (tous)
router.get('/', async (req, res) => {
  try {
    const tirages = await db.tirages.find({});
    res.json(tirages);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/tirages
router.post('/', auth, async (req, res) => {
  try {
    const t = await db.tirages.insert({ ...req.body, createdAt: new Date() });
    res.json(t);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/tirages/:id
router.put('/:id', auth, async (req, res) => {
  try {
    await db.tirages.update({ _id: req.params.id }, { $set: req.body });
    res.json({ message: 'Tirage mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/tirages/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.tirages.remove({ _id: req.params.id });
    res.json({ message: 'Tirage supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

// PUT /api/tirages/:id/ouvri  — Admin ouvri manyèlman
router.put('/:id/ouvri', auth, async (req, res) => {
  try {
    await db.tirages.update({ _id: req.params.id }, {
      $set: { ouvertManyel: true, ferméManyel: false, dernyeAksyon: new Date(), aksyonPar: req.user.username }
    });
    res.json({ ok: true, message: 'Tiraj ouvri' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/tirages/:id/femen  — Admin fèmen manyèlman
router.put('/:id/femen', auth, async (req, res) => {
  try {
    await db.tirages.update({ _id: req.params.id }, {
      $set: { ouvertManyel: false, ferméManyel: true, dernyeAksyon: new Date(), aksyonPar: req.user.username }
    });
    res.json({ ok: true, message: 'Tiraj fèmen' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/tirages/:id/auto  — Retounen nan otomatik
router.put('/:id/auto', auth, async (req, res) => {
  try {
    await db.tirages.update({ _id: req.params.id }, {
      $set: { ouvertManyel: null, ferméManyel: null, dernyeAksyon: new Date() }
    });
    res.json({ ok: true, message: 'Mode otomatik' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
