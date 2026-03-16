/**
 * ═══════════════════════════════════════════════════════════════
 *  LISANS POS — Sistèm ekspirasyon ak verifikasyon
 * ═══════════════════════════════════════════════════════════════
 */
const express = require('express');
const { db }   = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin')
    return res.status(403).json({ message: 'Admin sèlman' });
  next();
};

// ── GET /api/licence/pos/:posId — Verifye lisans POS ─────────
router.get('/pos/:posId', auth, async (req, res) => {
  try {
    const pos = await db.pos.findOne({ _id: req.params.posId });
    if (!pos) return res.status(404).json({ message: 'POS pa jwenn' });

    const now     = new Date();
    const exp     = pos.licence?.expiration ? new Date(pos.licence.expiration) : null;
    const expire  = exp ? now > exp : false;
    const jousReste = exp ? Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) : null;

    res.json({
      posId: pos._id, posName: pos.nom || pos.posId,
      licence: pos.licence || null,
      expire, jousReste,
      actif: pos.actif && !expire,
      message: expire
        ? `❌ Lisans ekspire depi ${new Date(exp).toLocaleDateString('fr')}`
        : jousReste !== null && jousReste <= 7
          ? `⚠️ Lisans ekspire nan ${jousReste} jou`
          : '✅ Lisans valid',
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PUT /api/licence/pos/:posId — Ajoute/Renouvle lisans POS ─
router.put('/pos/:posId', auth, adminOnly, async (req, res) => {
  try {
    const { duree, type } = req.body; // duree = jou
    const pos = await db.pos.findOne({ _id: req.params.posId });
    if (!pos) return res.status(404).json({ message: 'POS pa jwenn' });

    const expiration = new Date();
    expiration.setDate(expiration.getDate() + (duree || 30));

    await db.pos.update({ _id: req.params.posId }, {
      $set: {
        licence: {
          actif: true,
          debut: new Date(),
          expiration,
          duree: duree || 30,
          type: type || 'mensuel',
          kreePar: req.user.username,
          kreeAt: new Date(),
        }
      }
    });

    await db.logs.insert({
      userId: req.user?.id, username: req.user?.username,
      action: 'Lisans POS Renouvle',
      details: { posId: req.params.posId, duree, expiration },
      createdAt: new Date()
    });

    res.json({ success: true, expiration, jousReste: duree || 30 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET /api/licence/all — Lis tout lisans POS ───────────────
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const posList = await db.pos.find({});
    const now     = new Date();

    const result = posList.map(p => {
      const exp       = p.licence?.expiration ? new Date(p.licence.expiration) : null;
      const jousReste = exp ? Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) : null;
      const expire    = exp ? now > exp : false;
      return {
        _id: p._id, nom: p.nom || p.posId, posId: p.posId,
        actif: p.actif,
        licence: p.licence || null,
        jousReste, expire,
        statutLicence: expire ? 'expire'
          : jousReste !== null && jousReste <= 7 ? 'expirantBiento'
          : jousReste !== null ? 'valid' : 'sanLicence',
      };
    });

    res.json(result.sort((a, b) => {
      const order = { expire: 0, expirantBiento: 1, sanLicence: 2, valid: 3 };
      return (order[a.statutLicence] || 3) - (order[b.statutLicence] || 3);
    }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Middleware pou verifye lisans nan login ───────────────────
// Sèvi pa auth.js avan koneksyon POS
async function verifiyeLisansPOS(posRecord) {
  if (!posRecord.licence) return { valid: true, warn: false }; // Pa gen lisans = libre
  const exp = new Date(posRecord.licence.expiration);
  const now = new Date();
  if (now > exp) {
    return { valid: false, message: `❌ Lisans POS ekspire depi ${exp.toLocaleDateString('fr')}. Kontakte admin ou a.` };
  }
  const jous = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  if (jous <= 7) {
    return { valid: true, warn: true, message: `⚠️ Lisans ekspire nan ${jous} jou` };
  }
  return { valid: true, warn: false };
}

module.exports = router;
module.exports.verifiyeLisansPOS = verifiyeLisansPOS;
