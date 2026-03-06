const express = require('express');
const db      = require('../database');
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
