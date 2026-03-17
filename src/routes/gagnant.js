/**
 * ═══════════════════════════════════════════════════════════════
 *  KALKIL GAGNANT OTOMATIK — LA-PROBITE-BORLETTE
 *  Lè rezilta antre → sytèm kalkile tout fich gagnant otomatikman
 * ═══════════════════════════════════════════════════════════════
 */
const express = require('express');
const { db }   = require('../database');
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
// Parse prime string "50|20|10" → [60, 20, 10] oswa [500] pou yon sèl valè
function parsePrime(p) {
  if (!p) return [0];
  const str = String(p);
  if (str.includes('|')) return str.split('|').map(Number);
  return [Number(str) || 0];
}

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
      // Sipòte format "50|20|10" ak ansyen format prime1/prime2/prime3
      const prStr = primeConfig.prime || primeConfig.prime1 || '50|20|10';
      const parts = parsePrime(prStr);
      const [m1, m2, m3] = [parts[0]||50, parts[1]||20, parts[2]||10];
      if (boule === lot1_2d) {
        return { gagne: true, gain: mise * m1, description: `Borlette 1e (${m1}x) — ${boule}=${lot1}` };
      }
      if (boule === lot2_2d && lot2) {
        return { gagne: true, gain: mise * m2, description: `Borlette 2e (${m2}x) — ${boule}=${lot2}` };
      }
      if (boule === lot3_2d && lot3) {
        return { gagne: true, gain: mise * m3, description: `Borlette 3e (${m3}x) — ${boule}=${lot3}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'MAR': { // Mariage — 2 boules match lot1 ak lot2
      // Row boule format: "12*34" (astèris) oswa "12-34" (tiret) — sipòte 2 fòma
      const sep = boule.includes('*') ? '*' : '-';
      const parts = boule.split(sep);
      if (parts.length !== 2) return { gagne: false, gain: 0 };
      const b1 = parts[0].padStart(2, '0');
      const b2 = parts[1].padStart(2, '0');
      // Règ ofisyèl: 6 kombinèzon — b1+b2 ka parèt nan nenpòt pozisyon
      const match = (b1 === lot1_2d && b2 === lot2_2d)
                 || (b1 === lot2_2d && b2 === lot1_2d)
                 || (b1 === lot1_2d && b2 === lot3_2d)
                 || (b1 === lot3_2d && b2 === lot1_2d)
                 || (b1 === lot2_2d && b2 === lot3_2d)
                 || (b1 === lot3_2d && b2 === lot2_2d);
      if (match) {
        const pc = primesMap['MAR'] || primesMap['mar'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'1000')[0]||1000;
        return { gagne: true, gain: mise * mult, description: `Mariage (${mult}x) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'P1': { // Loto3 P1 — 3 dènye chif lot1
      const lot1_3d = String(resultat.lot1 || '').padStart(3, '0').slice(-3);
      const b3 = String(row.boule).padStart(3, '0').slice(-3);
      if (b3 === lot1_3d) {
        const pc = primesMap['P1'] || primesMap['loto3'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
        return { gagne: true, gain: mise * mult, description: `Loto3 P1 (${mult}x) — ${b3}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'P2': { // Loto3 P2 — 3 dènye chif lot2
      const lot2_3d = String(resultat.lot2 || '').padStart(3, '0').slice(-3);
      const b3 = String(row.boule).padStart(3, '0').slice(-3);
      if (b3 === lot2_3d) {
        const pc = primesMap['P2'] || primesMap['P1'] || primesMap['loto3'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
        return { gagne: true, gain: mise * mult, description: `Loto3 P2 (${mult}x) — ${b3}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'P3': { // Loto3 P3 — 3 dènye chif lot3
      const lot3_3d = String(resultat.lot3 || '').padStart(3, '0').slice(-3);
      const b3 = String(row.boule).padStart(3, '0').slice(-3);
      if (b3 === lot3_3d) {
        const pc = primesMap['P3'] || primesMap['P1'] || primesMap['loto3'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
        return { gagne: true, gain: mise * mult, description: `Loto3 P3 (${mult}x) — ${b3}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'L4': { // Loto4 — 4 chif nan 3 pozisyon diferan
      const b4 = String(row.boule).padStart(4, '0').slice(-4);
      // Lotto.ht règ: 4 chif ka match nan pozisyon 2-5, 2-3+6-7, oswa 4-7
      // lot gen 7 chif: d1 d2 d3 d4 d5 d6 d7
      const lot7 = String(resultat.lot1 || '').padStart(7, '0');
      const pos1 = lot7.slice(1, 5); // pozisyon 2-5  (x0123xx)
      const pos2 = lot7.slice(1, 3) + lot7.slice(5, 7); // pozisyon 2-3+6-7 (x01xx23)
      const pos3 = lot7.slice(3, 7); // pozisyon 4-7  (xxx0123)
      // Si lot kout (2 chif sèlman), itilize kalkil senp: 4 dènye chif
      const lot1_4d = String(resultat.lot1 || '').padStart(4, '0').slice(-4);

      // Jwenn prime L4 — chèche L4, L41, L42, L43
      const pc = primesMap['L4'] || primesMap['L41'] || primesMap['L42'] || primesMap['L43'] || primeConfig;
      const mult = parsePrime(pc.prime||pc.prime1||'5000')[0]||5000;

      if (b4 === lot1_4d || b4 === pos1 || b4 === pos2 || b4 === pos3) {
        return { gagne: true, gain: mise * mult, description: `Loto4 (${mult}x) — ${b4}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'MG': { // Mariage Gratuit — ×2000 (ofisyèl lotto.ht)
      if (boule === lot1_2d || boule === lot2_2d) {
        const pc = primesMap['MG'] || primesMap['Mariage Gratuit'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'2000')[0]||2000;
        return { gagne: true, gain: mise * mult, description: `Mariage Gratuit (×${mult}) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    // ── TÈT FICH — boule ki sòti sou tèt fich la ──────────────
    case 'TF':   // Tèt Fich Borlette Normal
    case 'TF1': {
      const pc = primesMap['TF'] || primesMap['TF1'] || primesMap['Tet fich'] || primeConfig;
      const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
      if (boule === lot1_2d) {
        return { gagne: true, gain: mise * mult, description: `Tèt Fich (×${mult}) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'TF2': { // Tèt Fich Loto3
      const lot1_3d = String(resultat.lot1 || '').padStart(3, '0').slice(-3);
      const b3 = String(row.boule).padStart(3, '0').slice(-3);
      const pc = primesMap['TF2'] || primesMap['Tet fich loto3'] || primeConfig;
      const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
      if (b3 === lot1_3d) {
        return { gagne: true, gain: mise * mult, description: `Tèt Fich Loto3 (×${mult}) — ${b3}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'TF3': { // Tèt Fich Mariage Dwat (Droite)
      const sep3 = boule.includes('*') ? '*' : '-';
      const parts3 = boule.split(sep3);
      if (parts3.length !== 2) return { gagne: false, gain: 0 };
      const b1 = parts3[0].padStart(2,'0'), b2 = parts3[1].padStart(2,'0');
      const match3 = (b1===lot1_2d&&b2===lot2_2d);
      if (match3) {
        const pc = primesMap['TF3'] || primesMap['Tet fich mariaj dwat'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
        return { gagne: true, gain: mise * mult, description: `TF Mariage Dwat (×${mult}) — ${boule}` };
      }
      return { gagne: false, gain: 0 };
    }

    case 'TF4': { // Tèt Fich Mariage Gauche (Gòch)
      const sep4 = boule.includes('*') ? '*' : '-';
      const parts4 = boule.split(sep4);
      if (parts4.length !== 2) return { gagne: false, gain: 0 };
      const b1g = parts4[0].padStart(2,'0'), b2g = parts4[1].padStart(2,'0');
      // Gòch = inversé (lot2 anvan lot1)
      const match4 = (b1g===lot2_2d&&b2g===lot1_2d);
      if (match4) {
        const pc = primesMap['TF4'] || primesMap['Tet fich mariaj gauch'] || primeConfig;
        const mult = parsePrime(pc.prime||pc.prime1||'500')[0]||500;
        return { gagne: true, gain: mise * mult, description: `TF Mariage Gòch (×${mult}) — ${boule}` };
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

    // Mapping: type DB → type POS (pou kalkil ka jwenn prime kòrèk)
    // Type DB: 'Borlette','Loto 3','Mariage','L4O1','L4O2','L4O3','Mariage Gratuit','Tet fich...'
    // Type POS: 'P0','P1','P2','P3','MAR','L4','MG','TF1','TF2','TF3','TF4'
    const DB_TO_POS = {
      'Borlette': 'P0',
      'Loto 3': 'P1',  // Loto3 P1 pa default
      'Mariage': 'MAR',
      'L4O1': 'L41', 'L4O2': 'L42', 'L4O3': 'L43',
      'Mariage Gratuit': 'MG',
      'Tet fich': 'TF',
      'Tet fich loto3': 'TF2',
      'Tet fich mariaj dwat': 'TF3',
      'Tet fich mariaj gauch': 'TF4',
    };
    for (const [dbType, posType] of Object.entries(DB_TO_POS)) {
      if (primesMap[dbType] && !primesMap[posType]) {
        primesMap[posType] = primesMap[dbType];
      }
    }
    // Loto3 P2/P3 itilize menm prime ak P1
    if (primesMap['P1'] && !primesMap['P2']) primesMap['P2'] = primesMap['P1'];
    if (primesMap['P1'] && !primesMap['P3']) primesMap['P3'] = primesMap['P1'];
    // L4 jwenn nan L41/L42/L43
    if (!primesMap['L4'] && (primesMap['L41']||primesMap['L42']||primesMap['L43'])) {
      primesMap['L4'] = primesMap['L41'] || primesMap['L42'] || primesMap['L43'];
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

// GET /api/gagnant/liste?debut=&fin=
router.get('/liste', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let query = { statut: 'gagnant' };
    if (debut) query.dateVente = { $gte: new Date(debut) };
    if (fin)   query.dateVente = { ...(query.dateVente||{}), $lte: new Date(fin+'T23:59:59') };
    const isAgent = req.user?.role === 'agent';
    if (isAgent) query.agentId = req.user.id;
    const fiches = await db.fiches.find(query).sort({ dateVente: -1 });
    res.json(fiches);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/gagnant/payer/:ticket
router.put('/payer/:ticket', auth, adminOnly, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    await db.fiches.update({ ticket: req.params.ticket }, {
      $set: { paye: true, datePaye: new Date(), payePar: req.user.username }
    });
    const broadcast = req.app?.locals?.broadcast;
    if (broadcast) broadcast({ type:'fich_paye', ticket: req.params.ticket,
      gain: fiche.gainTotal||0, ts: Date.now() });
    res.json({ ok: true, gain: fiche.gainTotal || 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
