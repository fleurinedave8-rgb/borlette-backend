const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../database');
const router  = express.Router();

const auth = require('../middleware/auth');
const JWT_SECRET = auth.SECRET || process.env.JWT_SECRET || 'laprobite2026secretkey';

// ══════════════════════════════════════════════════════════════
//  POST /api/auth/login
//  SEKIRITE: sèlman POS ki anrejistre ka konekte
// ══════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { username, password, deviceId } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username ak modpas obligatwa' });

    const agent = await db.agents.findOne({ username: username.toLowerCase().trim() });
    if (!agent) return res.status(401).json({ message: 'Username ou modpas pa kòrèk' });
    if (!agent.actif) return res.status(401).json({ message: 'Kont ou bloke. Kontakte administratè a.' });

    const valid = await bcrypt.compare(password, agent.password);
    if (!valid) return res.status(401).json({ message: 'Username ou modpas pa kòrèk' });

    // ── ADMIN — pa bezwen verifikasyon POS ────────────────
    if (agent.role === 'admin' || agent.role === 'superadmin') {
      if (deviceId) await db.agents.update({ _id: agent._id }, { $set: { deviceId, lastLogin: new Date() } });
      const token = jwt.sign({ id: agent._id, username: agent.username, role: agent.role }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({
        token,
        user: { id: agent._id, nom: agent.nom, prenom: agent.prenom, username: agent.username, role: agent.role, telephone: agent.telephone, balance: agent.balance, credit: agent.credit }
      });
    }

    // ── AGENT — verifikasyon POS obligatwa ────────────────
    if (!deviceId) {
      return res.status(403).json({ message: 'Aparèy pa idantifye. Ale nan ⚙ LOAD SERVEUR pou konfigire.', code: 'NO_DEVICE_ID' });
    }

    // Chèche POS pa: deviceId, posId, oswa agentUsername
    const posRecord = await db.pos.findOne({
      $or: [
        { deviceId: deviceId },
        { posId:    deviceId },
        { agentUsername: agent.username },
        { agentId: agent._id },
      ],
      actif: true
    });

    if (!posRecord) {
      return res.status(403).json({
        message: `❌ POS ou a pa anrejistre.\n\nDevice ID:\n${deviceId}\n\nKopye Device ID sa a ba Admin ou a pou li anrejistre aparèy ou nan:\nWeb Admin → Agents/POS → Nouvo POS`,
        deviceId: deviceId,
        code: 'POS_NOT_REGISTERED'
      });
    }

    // Asosye deviceId ak POS si pa deja fèt
    await db.pos.update({ _id: posRecord._id }, { $set: { deviceId, lastSeen: new Date(), agentId: agent._id, agentUsername: agent.username } });
    await db.agents.update({ _id: agent._id }, { $set: { deviceId, lastLogin: new Date(), posId: posRecord._id } });

    const token = jwt.sign(
      { id: agent._id, username: agent.username, role: agent.role, posId: posRecord._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Tete fich — info POS pou enpresyon
    const tete = posRecord.tete || {};

    res.json({
      token,
      user: {
        id: agent._id, nom: agent.nom, prenom: agent.prenom,
        username: agent.username, role: agent.role,
        telephone: agent.telephone, balance: agent.balance, credit: agent.credit,
      },
      pos: {
        id: posRecord._id,
        posId: posRecord.posId,
        nom: posRecord.nom,
        adresse: posRecord.adresse,
        telephone: posRecord.telephone,
        // Tete fich pou enpresyon
        tete: {
          ligne1: tete.ligne1 || posRecord.nom || 'LA-PROBITE-BORLETTE',
          ligne2: tete.ligne2 || posRecord.adresse || '',
          ligne3: tete.ligne3 || posRecord.telephone || '',
          ligne4: tete.ligne4 || 'Fich sa valid pou 90 jou',
        }
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
