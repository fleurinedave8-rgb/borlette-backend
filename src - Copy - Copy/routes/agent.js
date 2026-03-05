const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

router.get('/info', auth, async (req, res) => {
  try {
    const agent = await db.agents.findOne({ _id: req.user.id });
    if (!agent) return res.status(404).json({ message: 'Agent introuvable' });
    res.json({ balance: agent.balance?.toFixed(2) || '0.00', credit: agent.credit, limiteGain: agent.limiteGain, nom: agent.nom, prenom: agent.prenom, telephone: agent.telephone });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

// GET /api/agent/config
router.get('/config', auth, async (req, res) => {
  try {
    const agent = await db.agents.findOne({ _id: req.user.id });
    res.json(agent?.config || {});
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/agent/config
router.put('/config', auth, async (req, res) => {
  try {
    await db.agents.update({ _id: req.user.id }, { $set: { config: req.body } });
    res.json({ message: 'Configuration sauvegardée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
