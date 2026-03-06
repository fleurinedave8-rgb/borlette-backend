const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../database');
const router  = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'laprobite2026secretkey';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username ak modpas obligatwa' });

    const agent = await db.agents.findOne({ username: username.toLowerCase().trim() });
    if (!agent) return res.status(401).json({ message: 'Username ou modpas pa kòrèk' });
    if (!agent.actif) return res.status(401).json({ message: 'Kont ou bloke. Kontakte administratè a.' });

    const valid = await bcrypt.compare(password, agent.password);
    if (!valid) return res.status(401).json({ message: 'Username ou modpas pa kòrèk' });

    // Mettre à jour deviceId si fourni
    if (deviceId) await db.agents.update({ _id: agent._id }, { $set: { deviceId, lastLogin: new Date() } });

    const token = jwt.sign(
      { id: agent._id, username: agent.username, role: agent.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: agent._id, nom: agent.nom, prenom: agent.prenom,
        username: agent.username, role: agent.role,
        telephone: agent.telephone, balance: agent.balance,
        credit: agent.credit,
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { nom, prenom, username, password, telephone } = req.body;
    if (!nom || !username || !password) return res.status(400).json({ message: 'Champs obligatwa manke' });

    const exists = await db.agents.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Username deja pran' });

    const agent = await db.agents.insert({
      nom, prenom, telephone,
      username: username.toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      role: 'agent', credit: 0, balance: 0,
      actif: true, createdAt: new Date(),
    });

    const token = jwt.sign({ id: agent._id, username: agent.username, role: agent.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: agent._id, nom, prenom, username, role: 'agent' } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
