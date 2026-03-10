/**
 * ═══════════════════════════════════════════════════════════════
 *  KALKIL GAGNANT OTOMATIK — LA-PROBITE-BORLETTE
 *  Lè rezilta antre → sytèm kalkile tout fich gagnant otomatikman
 * ═══════════════════════════════════════════════════════════════
 */
const express = require('express');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin')
    return res.status(403).json({ message: 'Aksè refize — admin sèlman' });
  next();
};

/**
 * Kalkile si yon row genyen dapre rezilta tiraj
 * @param {object} row - { boule, type, mise }
 * @param {object} resultat - { lot1, lot2, lot3 }
 * @param {object} primes - { P0, MAR, P1, P2, P3, L4 }
 * @returns {{ gagne: boolean, gain: number, description: string }}
 */
function kalkilRow(row, resultat, primesMap) {
  const boule = String(row.boule).padStart(2, '0');
  const mise  = Number(row.mise) || 0;
  const type  = row.type || 'P0';

  const lot1  = String(resultat.lot1 || '').padStart(2, '0');
  const lot2  = String(resultat.lot2 || '').padStart(2, '0');
  const lot3  = String(resultat.lot3 || '').padStart(2, '0');

  // Extrac dernye 2 chif si lot gen plis chif
  const lot1_2d = lot1.slice(-2);
  const lot2_2d = lot2.slice(-2);
  const lot3_2d = lot3.slice(-2);

  const primeConfig = primesMap[type] || {};

  switch (type) {
    case 'P0': { // Borlette — match lot1, lot2, lot3
      if (boule === lot1_2d) {
        const mult = Number(primeConfig.prime1) || 60;
        return { gagne: true, gain: mise * mult, description: `Borlette 1ey (${mult}x) — ${boule}=${lot1}` };
      }
      if (boule === lot2_2d && primeConfig.prime2) {
        const mult = Number(primeConfig.prime2) || 20;
        return { gagne: true, gain: mise * mult, description: `Borlette 2èm (${mult}x) — ${boule}=${lot2}` };
      }
      if (boule === lot3_2d && primeConfig.prime3) {
        const mult = Number(primeConfig.prime3) || 10;
        return { gagne: true, gain: mise * mult, description: `Borlette 3èm (${mult}x) — ${boule}=${lot3}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'MAR': { // Mariage — 2 boules match lot1 ak lot2
      // Row boule format: "12-34" (2 boules)
      const parts = boule.split('-');
      if (parts.length !== 2) return { gagne: false, gain: 0 };
      const b1 = parts[0].padStart(2, '0');
      const b2 = parts[1].padStart(2, '0');
      const match = (b1 === lot1_2d && b2 === lot2_2d) || (b1 === lot2_2d && b2 === lot1_2d);
      if (match) {
        const mult = Number(primeConfig.prime1) || 500;
        return { gagne: true, gain: mise * mult, description: `Mariage (${mult}x) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'P1': { // Loto3 P1 — 3 chif exact order lot1
      const lot1_3d = String(resultat.lot1 || '').padStart(3, '0').slice(-3);
      if (boule === lot1_3d) {
        const mult = Number(primeConfig.prime1) || 400;
        return { gagne: true, gain: mise * mult, description: `Loto3 P1 (${mult}x) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'P2': { // Loto3 P2 — 3 chif exact lot2
      const lot2_3d = String(resultat.lot2 || '').padStart(3, '0').slice(-3);
      if (boule === lot2_3d) {
        const mult = Number(primeConfig.prime1) || 200;
        return { gagne: true, gain: mise * mult, description: `Loto3 P2 (${mult}x) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'P3': { // Loto3 P3 — 3 chif exact lot3
      const lot3_3d = String(resultat.lot3 || '').padStart(3, '0').slice(-3);
      if (boule === lot3_3d) {
        const mult = Number(primeConfig.prime1) || 100;
        return { gagne: true, gain: mise * mult, description: `Loto3 P3 (${mult}x) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'L4': { // Loto4 — 4 chif exact
      const lot1_4d = String(resultat.lot1 || '').padStart(4, '0').slice(-4);
      if (boule === lot1_4d) {
        const mult = Number(primeConfig.prime1) || 3000;
        return { gagne: true, gain: mise * mult, description: `Loto4 (${mult}x) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    default:
      return { gagne: false, gain: 0 };
  }
}

/**
 * POST /api/gagnant/calculer
 * Deklancha kalkil gagnant pou yon tiraj + rezilta
 * Se route sa a ki rele chak fwa rezilta antre
 */
router.post('/calculer', auth, adminOnly, async (req, res) => {
  try {
    const { tirageId, resultatId, lot1, lot2, lot3 } = req.body;
    if (!tirageId || !lot1)
      return res.status(400).json({ message: 'tirageId ak lot1 obligatwa' });

    const tirage = await db.tirages.findOne({ _id: tirageId });
    if (!tirage) return res.status(404).json({ message: 'Tiraj pa jwenn' });

    // Chaje tout primes
    const primesList = await db.primes.find({});
    const primesMap  = {};
    for (const p of primesList) {
      primesMap[p.type] = p;
    }

    const resultat = { lot1, lot2: lot2||'', lot3: lot3||'' };

    // Chaje tout fiches ACTIF pou tiraj sa a
    const fiches = await db.fiches.find({ tirageId, statut: 'actif' });

    let totalGagnant = 0;
    let totalGain    = 0;
    const gagnants   = [];
    const broadcast  = req.app?.locals?.broadcast;

    for (const fiche of fiches) {
      const rows = await db.rows.find({ ficheId: fiche._id });
      let fichGagne   = false;
      let fichGainTot = 0;
      const rowsGagne = [];

      for (const row of rows) {
        const kalkil = kalkilRow(row, resultat, primesMap);
        if (kalkil.gagne) {
          fichGagne   = true;
          fichGainTot += kalkil.gain;
          rowsGagne.push({ ...row, gain: kalkil.gain, description: kalkil.description });
          // Mete ajou row
          await db.rows.update({ _id: row._id }, {
            $set: { gagne: true, gain: kalkil.gain, description: kalkil.description }
          });
        }
      }

      if (fichGagne) {
        // Mete ajou fich a gagnant
        await db.fiches.update({ _id: fiche._id }, {
          $set: {
            statut: 'gagnant',
            gainTotal: fichGainTot,
            dateGagnant: new Date(),
            resultatId: resultatId || null,
            lot1, lot2: lot2||'', lot3: lot3||'',
          }
        });

        // Mete ajan an kredi
        const agent = await db.agents.findOne({ _id: fiche.agentId });
        if (agent) {
          const agentPct   = (agent.agentPct || 10) / 100;
          const commission = fiche.total * agentPct;
          await db.agents.update({ _id: agent._id }, {
            $set: { balance: (agent.balance || 0) + commission }
          });
        }

        totalGagnant++;
        totalGain += fichGainTot;
        gagnants.push({
          ticket: fiche.ticket,
          agent:  `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
          agentId: fiche.agentId,
          gain:   fichGainTot,
          rows:   rowsGagne,
        });

        // Broadcast WebSocket — fich gagnant
        if (broadcast) {
          broadcast({
            type: 'fich_gagnant',
            ticket: fiche.ticket,
            tirage: tirage.nom,
            gain:   fichGainTot,
            lot1, lot2, lot3,
            ts: Date.now(),
          });
        }
      }
    }

    // Log
    await db.logs.insert({
      userId: req.user?.id, username: req.user?.username, role: req.user?.role,
      action: 'Kalkil Gagnant', methode: 'POST', route: '/api/gagnant/calculer',
      statut: 'success',
      details: { tirage: tirage.nom, lot1, lot2, lot3, totalGagnant, totalGain },
      createdAt: new Date()
    });

    // Broadcast rezilta global
    if (broadcast) {
      broadcast({
        type: 'nouveau_resultat',
        tirage: tirage.nom, lot1, lot2: lot2||'', lot3: lot3||'',
        totalGagnant, totalGain,
        date: new Date().toISOString(), ts: Date.now(),
      });
    }

    res.json({
      success: true,
      tirage: tirage.nom,
      lot1, lot2: lot2||'', lot3: lot3||'',
      fichesVerifye: fiches.length,
      totalGagnant,
      totalGain: totalGain.toFixed(2),
      gagnants,
    });

  } catch (err) {
    console.error('[GAGNANT]', err.message);
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/gagnant/liste
 * Lis tout fiches gagnant avèk filtre
 */
router.get('/liste', auth, async (req, res) => {
  try {
    const { debut, fin, tirageId } = req.query;
    let query = { statut: 'gagnant' };

    // Agent wè sèlman pa fiches pa li
    if (req.user?.role === 'agent') query.agentId = req.user.id;

    let fiches = await db.fiches.find(query).sort({ dateGagnant: -1 });

    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin + 'T23:59:59'));
    if (tirageId) fiches = fiches.filter(f => f.tirageId === tirageId);

    const result = await Promise.all(fiches.slice(0, 200).map(async f => {
      const tirage = await db.tirages.findOne({ _id: f.tirageId });
      const agent  = await db.agents.findOne({ _id: f.agentId });
      const rows   = await db.rows.find({ ficheId: f._id, gagne: true });
      return {
        ...f,
        tirage:  tirage?.nom,
        agent:   `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
        agentTel: agent?.telephone,
        rowsGagne: rows,
      };
    }));

    const totalGain = result.reduce((s, f) => s + (f.gainTotal || 0), 0);
    res.json({ fiches: result, count: result.length, totalGain: totalGain.toFixed(2) });

  } catch (err) { res.status(500).json({ message: err.message }); }
});

/**
 * GET /api/gagnant/stats-tirage/:tirageId
 * Statistik gagnant pou yon tiraj espesifik
 */
router.get('/stats-tirage/:tirageId', auth, async (req, res) => {
  try {
    const fiches = await db.fiches.find({ tirageId: req.params.tirageId, statut: 'gagnant' });
    const total  = await db.fiches.find({ tirageId: req.params.tirageId, statut: { $ne: 'elimine' } });
    const gain   = fiches.reduce((s, f) => s + (f.gainTotal || 0), 0);
    const vente  = total.reduce((s, f) => s + (f.total || 0), 0);
    res.json({
      fichesVendu: total.length, fichesGagnant: fiches.length,
      totalVente: vente.toFixed(2), totalGain: gain.toFixed(2),
      profit: (vente - gain).toFixed(2),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/**
 * POST /api/gagnant/payer/:ticket
 * Make yon fich gagnant kòm peye
 */
router.post('/payer/:ticket', auth, adminOnly, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    if (fiche.statut !== 'gagnant') return res.status(400).json({ message: 'Fich pa gagnant' });
    if (fiche.peye) return res.status(400).json({ message: 'Fich deja peye' });

    await db.fiches.update({ ticket: req.params.ticket }, {
      $set: { peye: true, datePaiement: new Date(), payePar: req.user.username }
    });

    await db.logs.insert({
      userId: req.user?.id, username: req.user?.username,
      action: 'Paye Gagnant', details: { ticket: req.params.ticket, gain: fiche.gainTotal },
      createdAt: new Date()
    });

    res.json({ success: true, message: 'Fich make kòm peye' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
module.exports.kalkilRow = kalkilRow;
