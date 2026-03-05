const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../database');
const router  = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'borlette-secret-2024';

router.post('/login', async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username ak modpas obligatwa' });

    const agent = await db.agents.findOne({ username, actif: true });
    if (!agent || !bcrypt.compareSync(password, agent.password))
      return res.status(401).json({ message: 'Non itilizatè oswa modpas enkòrèk' });

    if (deviceId) await db.agents.update({ _id: agent._id }, { $set: { deviceId } });

    const token = jwt.sign({ id: agent._id, username: agent.username, role: agent.role }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      token,
      user: { id: agent._id, nom: agent.nom, prenom: agent.prenom, username: agent.username, role: agent.role, telephone: agent.telephone, balance: agent.balance, credit: agent.credit, limiteGain: agent.limiteGain }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
