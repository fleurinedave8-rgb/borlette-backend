const express = require('express');
const { db }   = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function genTicket() {
  const now = new Date();
  const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const r = Math.random().toString(36).substring(2,6).toUpperCase();
  return `${d}-${r}`;
}

// ═══════════════════════════════════════════════════════════
//  POST /api/fiches — Créer une fiche AVEC verifikasyon
// ═══════════════════════════════════════════════════════════
router.post('/', auth, async (req, res) => {
  try {
    const { tirageId, rows, total, posId, posName } = req.body;
    if (!tirageId) return res.status(400).json({ message: 'Tiraj obligatwa' });
    if (!rows?.length) return res.status(400).json({ message: 'Omwen yon boul obligatwa' });

    // ── 1. Verifye tiraj toujou ouvè ─────────────────────────
    const tirage = await db.tirages.findOne({ _id: tirageId });
    if (!tirage) return res.status(400).json({ message: 'Tiraj pa jwenn' });
    if (!tirage.actif) return res.status(400).json({ message: `❌ Tiraj "${tirage.nom}" fèmen — pa ka vann ankò` });

    // ── 2. Chaje limite jeneral ───────────────────────────────
    let limites = await db.limites.findOne({ type: 'general' });
    if (!limites) limites = { borlette: 0, loto3: 0, mariage: 0, l4o1: 0, l4o2: 0, l4o3: 0 };

    // ── 3. Chaje boules bloke ─────────────────────────────────
    const boulesBloquees = await db.boules.find({ actif: true });

    // ── 4. Verifye chak row ───────────────────────────────────
    for (const row of rows) {
      const boule = String(row.boule).padStart(2, '0');
      const type  = row.type || 'P0';
      const mise  = Number(row.mise) || Number(row.montant) || 0;

      // Verifikasyon boule bloke
      const blokaj = boulesBloquees.find(b => {
        const matchBoule = String(b.boule).padStart(2,'0') === boule;
        const matchTirage = !b.tirage || b.tirage === 'Tout' || b.tirage === tirage.nom;
        return matchBoule && matchTirage;
      });

      if (blokaj && blokaj.type === 'blokaj') {
        return res.status(400).json({
          message: `🚫 Boule ${boule} bloke pou tiraj ${tirage.nom}`,
          boule, code: 'BOULE_BLOQUEE'
        });
      }

      // Verifikasyon limite mise
      if (blokaj && blokaj.type === 'limite' && blokaj.limite > 0) {
        if (mise > blokaj.limite) {
          return res.status(400).json({
            message: `⚠️ Boule ${boule}: mise ${mise} HTG depase limite ${blokaj.limite} HTG`,
            boule, code: 'LIMITE_BOULE_DEPASSE'
          });
        }
      }

      // Verifikasyon limite jeneral pa type
      const limiteKey = {
        'P0': 'borlette', 'MAR': 'mariage',
        'P1': 'loto3', 'P2': 'loto3', 'P3': 'loto3',
        'L4O1': 'l4o1', 'L4O2': 'l4o2', 'L4O3': 'l4o3',
      }[type];

      if (limiteKey && limites[limiteKey] > 0 && mise > limites[limiteKey]) {
        return res.status(400).json({
          message: `⚠️ Mise ${mise} HTG depase limite ${type} (max: ${limites[limiteKey]} HTG)`,
          boule, type, code: 'LIMITE_GENERALE_DEPASSE'
        });
      }
    }

    // ── 5. Kreye fich ─────────────────────────────────────────
    const ticket = genTicket();
    const now    = new Date();
    const agent  = await db.agents.findOne({ _id: req.user.id });

    const fiche = await db.fiches.insert({
      ticket, agentId: req.user.id, tirageId,
      total: Number(total) || 0,
      statut: 'actif',
      dateVente: now,
      posId: posId || null,
      posName: posName || null,
    });

    for (const row of rows) {
      await db.rows.insert({
        ficheId: fiche._id,
        boule:   String(row.boule).padStart(2,'0'),
        type:    row.type || 'P0',
        mise:    Number(row.mise) || Number(row.montant) || 0,
      });
    }

    db.logs.insert({
      userId: req.user?.id, username: req.user?.username, role: req.user?.role,
      action: 'Kreye Fich', methode: 'POST', route: '/api/fiches', statut: 'success',
      details: { ticket, total }, createdAt: new Date()
    }).catch(()=>{});

    // Broadcast tan reyèl pou dashboard admin
    const broadcast = req.app?.locals?.broadcast;
    if (broadcast) {
      const agentInfo = await db.agents.findOne({ _id: req.user.id }).catch(() => null);
      broadcast({
        type: 'nouvelle_fiche',
        ticket, total: Number(total) || 0,
        tirage: tirage?.nom || tirageId,
        agent: `${agentInfo?.prenom||''} ${agentInfo?.nom||''}`.trim(),
        posId: posId || agentInfo?.deviceId || '',
        heure: new Date().toLocaleTimeString('fr', { hour:'2-digit', minute:'2-digit' }),
        date: new Date().toISOString(),
        rows: rows || [],
        statut: 'actif',
      });
    }

    res.json({
      ticket, total,
      tirage:    tirage?.nom || 'N/A',
      agent:     `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
      telephone: agent?.telephone,
      date:      now,
      rows,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fiches/mes-fiches
router.get('/mes-fiches', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let fiches = await db.fiches.find({ agentId: req.user.id }).sort({ dateVente: -1 });
    if (debut || fin) {
      fiches = fiches.filter(f => {
        const d = new Date(f.dateVente);
        if (debut && d < new Date(debut)) return false;
        if (fin   && d > new Date(fin + 'T23:59:59')) return false;
        return true;
      });
    }
    const result = await Promise.all(fiches.slice(0, 100).map(async f => {
      const rows = await db.rows.find({ ficheId: f._id });
      const tirage = await db.tirages.findOne({ _id: f.tirageId });
      return { ...f, rows, tirage: tirage?.nom };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/fiches/:ticket
router.get('/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    const rows   = await db.rows.find({ ficheId: fiche._id });
    const tirage = await db.tirages.findOne({ _id: fiche.tirageId });
    const agent  = await db.agents.findOne({ _id: fiche.agentId });
    res.json({ ...fiche, rows, tirage, agent });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/fiches/:ticket
router.delete('/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    if (fiche.statut === 'elimine') return res.status(400).json({ message: 'Fich deja elimine' });

    // Verifye tiraj pa encore fermé
    const tirage = await db.tirages.findOne({ _id: fiche.tirageId });
    if (tirage && !tirage.actif) {
      return res.status(400).json({ message: '❌ Tiraj fèmen — pa ka elimine fich' });
    }

    await db.fiches.update(
      { ticket: req.params.ticket },
      { $set: { statut: 'elimine', dateElimine: new Date(), elimineBy: req.user.username } }
    );
    res.json({ message: 'Fich elimine' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/fiches/approuver/:ticket
router.put('/approuver/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    await db.fiches.update(
      { ticket: req.params.ticket },
      { $set: { statut: 'elimine', dateElimine: new Date(), approuveePar: req.user.username } }
    );
    db.logs.insert({ userId: req.user?.id, username: req.user?.username,
      action: 'Aprouve Eliminasyon', details: { ticket: req.params.ticket }, createdAt: new Date() }).catch(()=>{});
    res.json({ message: 'Eliminasyon aprouve' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/fiches/refuser/:ticket
router.put('/refuser/:ticket', auth, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    await db.fiches.update(
      { ticket: req.params.ticket },
      { $set: { demandeElimination: false, refusePar: req.user.username } }
    );
    res.json({ message: 'Demann refize' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
