const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

router.get('/disponibles', auth, async (req, res) => {
  try {
    const tirages = await db.tirages.find({ actif: true }).sort({ nom: 1 });
    res.json(tirages.map(t => ({ id: t._id, nom: t.nom })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/', auth, async (req, res) => {
  try {
    const tirages = await db.tirages.find({}).sort({ nom: 1 });
    res.json(tirages.map(t => ({ id: t._id, nom: t.nom, actif: t.actif })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
