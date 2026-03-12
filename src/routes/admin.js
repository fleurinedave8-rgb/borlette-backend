const { calculerGagnants } = require('./scraper');
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'superviseur') 
    return res.status(403).json({ message: 'Accès refusé' });
  next();
}

// ── STATS ─────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  try {
    const now   = new Date();
    const today = new Date(); today.setHours(0,0,0,0);
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
    const fiveMinAgo = new Date(Date.now() - 5*60*1000);

    // Agents & POS
    const allAgents  = await db.agents.find({});
    const allPos     = await db.pos.find({});
    const agents     = allAgents.filter(a => a.role==='agent' && a.actif);
    const posActifs  = allPos.filter(p => p.actif);
    const posOnline  = allPos.filter(p => p.lastSeen && new Date(p.lastSeen) >= fiveMinAgo);

    // Fiches
    const allFiches    = await db.fiches.find({});
    const actifFiches  = allFiches.filter(f => f.statut !== 'elimine');
    const todayFiches  = actifFiches.filter(f => new Date(f.dateVente) >= today);
    const weekFiches   = actifFiches.filter(f => new Date(f.dateVente) >= weekAgo);
    const gagnantFiches= allFiches.filter(f => f.statut === 'gagnant');
    const elimFiches   = allFiches.filter(f => f.statut === 'elimine');

    // Ventes
    const venteTotal   = actifFiches.reduce((s,f) => s+(f.total||0), 0);
    const venteJodi    = todayFiches.reduce((s,f) => s+(f.total||0), 0);
    const venteSemaine = weekFiches.reduce((s,f)  => s+(f.total||0), 0);
    const totalGagne   = gagnantFiches.reduce((s,f)=> s+(f.montantGagne||0), 0);

    // Commission mwayen
    const agentsData = await db.agents.find({ role:'agent' });
    const avgPct = agentsData.length > 0
      ? agentsData.reduce((s,a) => s+(a.agentPct||10), 0) / agentsData.length
      : 10;
    const commJodi = venteJodi * avgPct / 100;
    const agentsActifList   = agentsData.filter(a => a.actif !== false);
    const agentsInactifList = agentsData.filter(a => a.actif === false);

    // Vant pa tiraj jodi a
    const tirages = await db.tirages.find({});
    const ventePaTiraj = [];
    for (const t of tirages) {
      const tf = todayFiches.filter(f => f.tirageId === t._id);
      if (tf.length > 0) {
        ventePaTiraj.push({ nom: t.nom, fiches: tf.length, vente: tf.reduce((s,f)=>s+(f.total||0),0) });
      }
    }
    ventePaTiraj.sort((a,b) => b.vente - a.vente);

    // Top 5 ajan pa vant jodi a
    const agentMap = {};
    for (const f of todayFiches) {
      if (!agentMap[f.agentId]) agentMap[f.agentId] = { fiches:0, vente:0 };
      agentMap[f.agentId].fiches++;
      agentMap[f.agentId].vente += f.total||0;
    }
    const topAgents = await Promise.all(
      Object.entries(agentMap)
        .sort((a,b) => b[1].vente - a[1].vente)
        .slice(0,5)
        .map(async ([id, data]) => {
          const a = await db.agents.findOne({ _id: id });
          return { nom: `${a?.prenom||''} ${a?.nom||''}`.trim(), ...data, pct: a?.agentPct||10 };
        })
    );

    // Dènye rezilta
    const denniResulat = await db.resultats.find({}).sort({ createdAt:-1 });
    const latestRes = {};
    denniResulat.slice(0,20).forEach(r => {
      if (!latestRes[r.tirage]) latestRes[r.tirage] = r;
    });

    res.json({
      // Agents & POS
      totalAgents: agents.length,
      agentsActif: agentsActifList.length,
      agentsInactif: agentsInactifList.length,
      agentsActifList: agentsActifList.map(a => ({
        _id: a._id, nom: a.nom, prenom: a.prenom,
        username: a.username, telephone: a.telephone,
        actif: a.actif !== false,
      })),
      agentsInactifList: agentsInactifList.map(a => ({
        _id: a._id, nom: a.nom, prenom: a.prenom,
        username: a.username, telephone: a.telephone,
        actif: false,
      })),
      totalPos: posActifs.length,
      posOnline: posOnline.length,
      totalPos_all: allPos.length,

      // Fiches
      totalFiches: actifFiches.length,
      fichesJodi: todayFiches.length,
      fichesSemaine: weekFiches.length,
      fichesGagnant: gagnantFiches.length,
      fichesElimine: elimFiches.length,

      // Ventes
      venteTotal: venteTotal.toFixed(2),
      venteJodi: venteJodi.toFixed(2),
      venteSemaine: venteSemaine.toFixed(2),
      totalGagne: totalGagne.toFixed(2),
      commJodi: commJodi.toFixed(2),

      // Détail
      ventePaTiraj,
      topAgents,
      latestResultats: Object.values(latestRes),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── HEARTBEAT POS (connecté en temps réel) ────────────────────
router.post('/pos/heartbeat', auth, async (req, res) => {
  try {
    const { posId } = req.body;
    if (posId) await db.pos.update({ posId }, { $set: { lastSeen: new Date(), online: true } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── AGENTS ────────────────────────────────────────────────────
router.get('/agents', auth, async (req, res) => {
  try {
    const agents = await db.agents.find({}).sort({ createdAt: -1 });
    res.json(agents.map(a => ({
      id: a._id, nom: a.nom, prenom: a.prenom, username: a.username,
      role: a.role, telephone: a.telephone, balance: a.balance,
      credit: a.credit, limiteGain: a.limiteGain, actif: a.actif,
      deviceId: a.deviceId, superviseurId: a.superviseurId, createdAt: a.createdAt,
    })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/agents', auth, adminOnly, async (req, res) => {
  try {
    const { nom, prenom, username, password, telephone, role, credit, limiteGain, superviseurId, prepaye, montantPrepaye } = req.body;
    if (!nom || !username || !password) return res.status(400).json({ message: 'Champs obligatwa manke' });
    const exists = await db.agents.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Username deja pran' });
    const agent = await db.agents.insert({
      nom, prenom, telephone,
      username: username.toLowerCase(),
      password: bcrypt.hashSync(password, 10),
      role: role || 'agent',
      credit: credit || 'Illimité',
      limiteGain: limiteGain || 'Illimité',
      superviseurId: superviseurId || null,
      prepaye: prepaye || false,
      montantPrepaye: montantPrepaye || 0,
      balance: prepaye ? (montantPrepaye || 0) : 0,
      actif: true, createdAt: new Date(),
    });
    res.json({ id: agent._id, ...agent, password: undefined });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/agents/:id', auth, adminOnly, async (req, res) => {
  try {
    const { password, ...data } = req.body;
    const update = { ...data };
    if (password) update.password = bcrypt.hashSync(password, 10);
    await db.agents.update({ _id: req.params.id }, { $set: update });
    res.json({ message: 'Agent mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/agents/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.agents.update({ _id: req.params.id }, { $set: { actif: false } });
    res.json({ message: 'Agent désactivé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/agents/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const agent = await db.agents.findOne({ _id: req.params.id });
    if (!agent) return res.status(404).json({ message: 'Agent pa trouve' });
    await db.agents.update({ _id: req.params.id }, { $set: { actif: !agent.actif } });
    res.json({ message: 'Statut chanje', actif: !agent.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── SUPERVISEURS ──────────────────────────────────────────────
router.get('/superviseurs', auth, async (req, res) => {
  try {
    const sups = await db.agents.find({ role: 'superviseur', actif: true });
    res.json(sups.map(s => ({ id: s._id, nom: s.nom, prenom: s.prenom, username: s.username })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TIRAGES ───────────────────────────────────────────────────

// ── FÈMTI / OUVÈTI TIRAJ ─────────────────────────────────────
router.put('/tirages/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const t = await db.tirages.findOne({ _id: req.params.id });
    if (!t) return res.status(404).json({ message: 'Tiraj pa jwenn' });
    await db.tirages.update({ _id: req.params.id }, { $set: { actif: !t.actif, updatedAt: new Date() } });
    const action = t.actif ? 'fèmen' : 'ouvri';
    console.log(`[TIRAJ] ${t.nom} ${action}`);
    res.json({ message: `Tiraj ${action}`, actif: !t.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/admin/tirages/:id (modifier)
router.put('/tirages/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.tirages.update({ _id: req.params.id }, { $set: req.body });
    res.json({ message: 'Tirage mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── FICHES (admin view) ───────────────────────────────────────
router.get('/fiches', auth, adminOnly, async (req, res) => {
  try {
    const { debut, fin, agentId, posId, tirage } = req.query;
    let fiches = await db.fiches.find(agentId ? { agentId } : {}).sort({ dateVente: -1 });
    if (debut || fin) {
      fiches = fiches.filter(f => {
        const d = new Date(f.dateVente || f.createdAt);
        if (debut && d < new Date(debut)) return false;
        if (fin   && d > new Date(fin + 'T23:59:59')) return false;
        return true;
      });
    }
    // Filtre par tirage si spécifié
    if (tirage && tirage !== 'Tout') {
      fiches = fiches.filter(f => f.tirage === tirage || f.tirageNom === tirage);
    }
    const result = await Promise.all(fiches.slice(0, 500).map(async f => {
      const t = await db.tirages.findOne({ _id: f.tirageId }).catch(() => null);
      const a = await db.agents.findOne({ _id: f.agentId }).catch(() => null);
      const p = await db.pos.findOne({ posId: f.posId || a?.deviceId }).catch(() => null);

      const dateVente = f.dateVente || f.createdAt || new Date();
      const dt = new Date(dateVente);
      const pad = n => String(n).padStart(2,'0');
      const heure = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

      return {
        ticket:   f.ticket,
        total:    f.total || 0,
        vente:    f.total || 0,
        statut:   f.statut,
        date:     dateVente,
        heure:    heure,
        tirage:   t?.nom || f.tirage || f.tirageNom || '—',
        agent:    `${a?.prenom||''} ${a?.nom||''}`.trim() || '—',
        posId:    f.posId || a?.deviceId || '—',
        posNom:   p?.nom || a?.username || '—',
        succursale: p?.succursale || a?.succursale || '—',
        rows:     f.rows || [],
      };
    }));
    res.json({ fiches: result, count: result.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── RÉSULTATS ─────────────────────────────────────────────────
router.get('/resultats', auth, async (req, res) => {
  try {
    const resultats = await db.resultats.find({}).sort({ date: -1 });
    res.json(resultats);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/resultats', auth, adminOnly, async (req, res) => {
  try {
    const { tirage, date, lot1, lot2, lot3 } = req.body;
    if (!tirage || !lot1) return res.status(400).json({ message: 'Tirage ak 1er lot obligatwa' });

    // Jwenn tiraj pa nom
    const tirageDoc = await db.tirages.findOne({ nom: tirage });

    // Sove rezilta
    const r = await db.resultats.insert({
      tirage, tirageId: tirageDoc?._id || null,
      date: date ? new Date(date) : new Date(),
      lot1, lot2: lot2||'', lot3: lot3||'',
      createdAt: new Date()
    });

    // ── KALKIL GAGNANT OTOMATIK ───────────────────────────────
    let totalGagnant = 0;
    let totalGain    = 0;
    const broadcast  = req.app?.locals?.broadcast;

    if (tirageDoc) {
      try {
        const { kalkilRow } = require('./gagnant');
        const primesList = await db.primes.find({});
        const primesMap  = {};
        for (const p of primesList) primesMap[p.type] = p;

        const fiches = await db.fiches.find({ tirageId: tirageDoc._id, statut: 'actif' });

        for (const fiche of fiches) {
          const rows = await db.rows.find({ ficheId: fiche._id });
          let fichGagne = false, fichGain = 0;

          for (const row of rows) {
            const kalkil = kalkilRow(row, { lot1, lot2: lot2||'', lot3: lot3||'' }, primesMap);
            if (kalkil.gagne) {
              fichGagne = true;
              fichGain += kalkil.gain;
              await db.rows.update({ _id: row._id }, {
                $set: { gagne: true, gain: kalkil.gain, description: kalkil.description }
              });
            }
          }

          if (fichGagne) {
            await db.fiches.update({ _id: fiche._id }, {
              $set: { statut: 'gagnant', gainTotal: fichGain, dateGagnant: new Date(),
                lot1, lot2: lot2||'', lot3: lot3||'', resultatId: r._id }
            });

            // Komisyon ajan
            const agent = await db.agents.findOne({ _id: fiche.agentId });
            if (agent) {
              const comm = fiche.total * ((agent.agentPct || 10) / 100);
              await db.agents.update({ _id: agent._id }, { $set: { balance: (agent.balance||0) + comm } });
            }

            totalGagnant++;
            totalGain += fichGain;

            // Notifye POS — fich gagnant
            if (broadcast) broadcast({
              type: 'fich_gagnant', ticket: fiche.ticket,
              tirage, gain: fichGain, lot1, lot2: lot2||'', lot3: lot3||'', ts: Date.now()
            });
          }
        }

        console.log(`[GAGNANT] ${tirage}: ${totalGagnant} gagnant, ${totalGain.toFixed(2)} HTG`);
      } catch (ge) {
        console.error('[GAGNANT ERROR]', ge.message);
      }
    }

    // Broadcast WebSocket — tous les POS & web reçoivent le résultat
    if (broadcast) broadcast({
      type: 'nouveau_resultat', tirage, lot1, lot2: lot2||'', lot3: lot3||'',
      totalGagnant, totalGain: totalGain.toFixed(2),
      date: r.date, ts: Date.now()
    });

    await db.logs.insert({
      userId: req.user?.id, username: req.user?.username, role: req.user?.role,
      action: 'Antre Rezilta', details: { tirage, lot1, lot2, lot3, totalGagnant, totalGain },
      createdAt: new Date()
    });

    res.json({ ...r, totalGagnant, totalGain: totalGain.toFixed(2),
      message: totalGagnant > 0 ? `✅ ${totalGagnant} fich gagnant kalkile` : '✅ Rezilta antre' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/resultats/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.resultats.remove({ _id: req.params.id });
    res.json({ message: 'Résultat supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PRIMES ────────────────────────────────────────────────────
router.get('/primes', auth, async (req, res) => {
  try {
    let primes = await db.primes.find({});
    if (primes.length === 0) {
      const defaults = [
        { type:'P0', label:'Borlette',  prime1:60, prime2:20, prime3:10 },
        { type:'P1', label:'Loto3 P1',  prime1:400, prime2:0, prime3:0 },
        { type:'P2', label:'Loto3 P2',  prime1:200, prime2:0, prime3:0 },
        { type:'P3', label:'Loto3 P3',  prime1:100, prime2:0, prime3:0 },
        { type:'MAR', label:'Mariage',  prime1:500, prime2:0, prime3:0 },
        { type:'L4',  label:'Loto4',    prime1:3000, prime2:0, prime3:0 },
      ];
      for (const p of defaults) await db.primes.insert(p);
      primes = await db.primes.find({});
    }
    res.json(primes);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/primes', auth, adminOnly, async (req, res) => {
  try {
    const primes = req.body;
    for (const p of primes) {
      if (p._id) await db.primes.update({ _id: p._id }, { $set: p });
      else await db.primes.insert({ ...p, createdAt: new Date() });
    }
    res.json({ message: 'Primes mises à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── LIMITES ───────────────────────────────────────────────────
router.get('/limites', auth, async (req, res) => {
  try {
    let limites = await db.limites.findOne({ type: 'general' });
    if (!limites) {
      limites = { type:'general', borlette:2000, loto3:150, mariage:50, loto4:25 };
      await db.limites.insert(limites);
    }
    res.json(limites);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/limites', auth, adminOnly, async (req, res) => {
  try {
    const exists = await db.limites.findOne({ type: 'general' });
    if (exists) await db.limites.update({ type: 'general' }, { $set: req.body });
    else await db.limites.insert({ type: 'general', ...req.body });
    res.json({ message: 'Limites mises à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── BOULES BLOQUÉES ───────────────────────────────────────────
router.get('/boules-bloquees', auth, async (req, res) => {
  try {
    const boules = await db.boules.find({});
    res.json(boules);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/boules-bloquees', auth, adminOnly, async (req, res) => {
  try {
    const b = await db.boules.insert({ ...req.body, createdAt: new Date() });
    res.json(b);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/boules-bloquees/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.boules.remove({ _id: req.params.id });
    res.json({ message: 'Boule débloquée' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── POS ───────────────────────────────────────────────────────
router.get('/pos', auth, async (req, res) => {
  try {
    const pos = await db.pos.find({}).sort({ createdAt: -1 });
    res.json(pos);
  } catch (err) { res.status(500).json({ message: err.message }); }
});


// ── MESSAGE ADMIN POU POS ─────────────────────────────────────
// GET /api/admin/pos/message — retounen mesaj + tiraj pou yon POS
router.get('/pos/message', auth, async (req, res) => {
  try {
    const posRecord = await db.pos.findOne({
      $or: [
        { deviceId: req.user.deviceId },
        { agentUsername: req.user.username },
        { agentId: req.user.id },
      ]
    });
    const tirages = await db.tirages.find({ actif: true });
    const resultats = await db.resultats.find({}).sort({ createdAt: -1 });

    // Dènye rezilta pa tiraj
    const latest = {};
    resultats.slice(0, 50).forEach(r => {
      if (!latest[r.tirage]) latest[r.tirage] = r;
    });

    res.json({
      message:  posRecord?.messageAdmin || null,
      tirages:  tirages.map(t => ({ nom: t.nom, actif: t.actif })),
      resultats: Object.values(latest).slice(0, 14),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/pos', auth, adminOnly, async (req, res) => {
  try {
    const { posId, nom, adresse, telephone, agentId, agentUsername, succursale, prime, agentPct, supPct, credit, prepaye, montantPrepaye, tete, messageAdmin } = req.body;
    if (!posId || !nom) return res.status(400).json({ message: 'POS ID ak non obligatwa' });
    const exists = await db.pos.findOne({ posId });
    if (exists) return res.status(400).json({ message: 'POS ID deja enregistre' });
    const p = await db.pos.insert({
      posId, nom, adresse, telephone, agentId, agentUsername,
      succursale, prime: prime||'60|20|10',
      agentPct: agentPct||0, supPct: supPct||0,
      credit: credit||'Illimité',
      prepaye: prepaye||false,
      montantPrepaye: montantPrepaye||0,
      // Tete fich pou enpresyon (ligne1-4)
      tete: tete || {
        ligne1: nom || 'LA-PROBITE-BORLETTE',
        ligne2: adresse || '',
        ligne3: telephone || '',
        ligne4: 'Fich sa valid pou 90 jou',
      },
      messageAdmin: messageAdmin || '',
      actif: true, online: false,
      createdAt: new Date(),
    
        logo: req.body.logo || '',});
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/pos/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.pos.update({ _id: req.params.id }, { $set: req.body });
    res.json({ message: 'POS mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/pos/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.pos.remove({ _id: req.params.id });
    res.json({ message: 'POS supprimé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── MODIFYE LIMITE + KREDI AJAN ─────────────────────────────
router.put('/agents/:id/limite', auth, adminOnly, async (req, res) => {
  try {
    const { limiteGain, credit, agentPct } = req.body;
    const update = {};
    if (limiteGain !== undefined) update.limiteGain = limiteGain;
    if (credit     !== undefined) update.credit     = credit;
    if (agentPct   !== undefined) update.agentPct   = parseFloat(agentPct) || 0;
    await db.agents.update({ _id: req.params.id }, { $set: update });
    res.json({ message: 'Limite mete ajou', ...update });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/pos/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const p = await db.pos.findOne({ _id: req.params.id });
    if (!p) return res.status(404).json({ message: 'POS pa trouve' });
    await db.pos.update({ _id: req.params.id }, { $set: { actif: !p.actif } });
    res.json({ actif: !p.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PAIEMENT ──────────────────────────────────────────────────
router.get('/paiement', auth, adminOnly, async (req, res) => {
  try {
    const { agentId, debut, fin } = req.query;
    let trans = await db.transactions.find(agentId ? { agentId } : {}).sort({ createdAt: -1 });
    if (debut) trans = trans.filter(t => new Date(t.createdAt) >= new Date(debut));
    if (fin)   trans = trans.filter(t => new Date(t.createdAt) <= new Date(fin + 'T23:59:59'));
    res.json(trans.slice(0, 200));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/paiement', auth, adminOnly, async (req, res) => {
  try {
    const { agentId, type, montant, note } = req.body;
    if (!agentId || !type || !montant) return res.status(400).json({ message: 'Champs manquants' });
    const p = await db.paiements.insert({ agentId, type, montant: Number(montant), note, date: new Date(), createdAt: new Date() });
    const delta = type === 'depot' ? Number(montant) : -Number(montant);
    await db.agents.update({ _id: agentId }, { $inc: { balance: delta } });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TÊTE FICHE ────────────────────────────────────────────────
router.get('/tete-fiche', auth, async (req, res) => {
  try {
    let tete = await db.config.findOne({ type: 'tete_fiche' });
    if (!tete) {
      tete = { type:'tete_fiche', ligne1:'LA-PROBITE-BORLETTE', ligne2:'Sistèm Jesyon Loto', ligne3:'', ligne4:'', actif: true };
      await db.config.insert(tete);
    }
    res.json(tete);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/tete-fiche', auth, adminOnly, async (req, res) => {
  try {
    const exists = await db.config.findOne({ type: 'tete_fiche' });
    if (exists) await db.config.update({ type: 'tete_fiche' }, { $set: req.body });
    else await db.config.insert({ type: 'tete_fiche', ...req.body });
    res.json({ message: 'Tête fiche mise à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── MARIAGE GRATUIT ───────────────────────────────────────────
router.get('/mariage-gratuit', auth, async (req, res) => {
  try {
    let config = await db.config.findOne({ type: 'mariage_gratuit' });
    if (!config) {
      config = { type:'mariage_gratuit', actif: false, zones: [], montantMin: 100 };
      await db.config.insert(config);
    }
    res.json(config);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/mariage-gratuit', auth, adminOnly, async (req, res) => {
  try {
    const exists = await db.config.findOne({ type: 'mariage_gratuit' });
    if (exists) await db.config.update({ type: 'mariage_gratuit' }, { $set: req.body });
    else await db.config.insert({ type: 'mariage_gratuit', ...req.body });
    res.json({ message: 'Mariage gratuit mis à jour' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── CONNECTÉS EN TEMPS RÉEL ───────────────────────────────────
router.get('/pos-connectes', auth, async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const connectes = await db.pos.find({ lastSeen: { $gte: fiveMinAgo }, actif: true });
    res.json({ count: connectes.length, pos: connectes });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PRÉ-PAYER UN AGENT ────────────────────────────────────────
router.post('/prepaye', auth, adminOnly, async (req, res) => {
  try {
    const { agentId, montant, jours, type } = req.body;
    if (!agentId || !montant) return res.status(400).json({ message: 'agentId ak montant obligatwa' });
    const expiration = new Date(Date.now() + (jours || 30) * 24 * 60 * 60 * 1000);
    await db.agents.update({ _id: agentId }, { $set: { prepaye: true, montantPrepaye: montant, prepayeExpire: expiration, prepayeType: type || 'abonnement' } });
    await db.transactions.insert({ agentId, type: 'prepaye', montant: parseFloat(montant), jours: jours || 30, date: new Date(), note: `Prépaiement ${type} ${jours}j` });
    res.json({ message: 'Prépaiement aktivé' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});



// ── LOGS AUDIT ────────────────────────────────────────────────
router.get('/logs', auth, adminOnly, async (req, res) => {
  try {
    const { debut, fin, userId, action } = req.query;
    let logs = await db.logs.find({}).sort({ createdAt: -1 });
    if (debut) logs = logs.filter(l => new Date(l.createdAt) >= new Date(debut));
    if (fin)   logs = logs.filter(l => new Date(l.createdAt) <= new Date(fin + 'T23:59:59'));
    if (userId) logs = logs.filter(l => l.userId === userId);
    if (action) logs = logs.filter(l => l.action?.toLowerCase().includes(action.toLowerCase()));
    res.json(logs.slice(0, 500));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/logs', auth, async (req, res) => {
  try {
    const { action, details } = req.body;
    const log = await db.logs.insert({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      role: req.user.role,
      action, details,
      createdAt: new Date(),
    });
    // Broadcast log to admin
    const broadcast = req.app?.locals?.broadcast;
    if (broadcast) broadcast({ type: 'new_log', log });
    res.json(log);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  SUCCURSAL CRUD
// ══════════════════════════════════════════════════════════════
router.get('/succursales', auth, async (req, res) => {
  try {
    const list = await db.succursales.find({}).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/succursales', auth, adminOnly, async (req, res) => {
  try {
    const { nom, limite, prime, limiteGain, message, mariage, bank } = req.body;
    if (!nom) return res.status(400).json({ message: 'Non succursal obligatwa' });
    const exists = await db.succursales.findOne({ nom: nom.trim() });
    if (exists) return res.status(400).json({ message: 'Succursal sa a deja egziste' });
    const s = await db.succursales.insert({
      nom: nom.trim(), limite: limite || 'Illimité',
      prime: prime || '60/20/10', limiteGain: limiteGain || 'Illimité',
      message: message || '', mariage: mariage || false,
      bank: bank || '', actif: true, createdAt: new Date(),
    });
    res.json(s);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/succursales/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.succursales.update({ _id: req.params.id }, { $set: { ...req.body, updatedAt: new Date() } });
    res.json({ message: 'Succursal mete ajou' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/succursales/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const s = await db.succursales.findOne({ _id: req.params.id });
    if (!s) return res.status(404).json({ message: 'Pa jwenn' });
    await db.succursales.update({ _id: req.params.id }, { $set: { actif: !s.actif } });
    res.json({ actif: !s.actif });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/succursales/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.succursales.remove({ _id: req.params.id });
    res.json({ message: 'Succursal efase' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
//  DOLEANCES
// ══════════════════════════════════════════════════════════════
router.get('/doleances', auth, adminOnly, async (req, res) => {
  try {
    const list = await db.doleances.find({}).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/doleances', async (req, res) => {
  try {
    const { sujet, nom, telephone, email, description, type } = req.body;
    if (!sujet || !description) return res.status(400).json({ message: 'Sujet ak deskripsyon obligatwa' });
    const d = await db.doleances.insert({
      sujet, nom: nom || 'Anonyme', telephone: telephone || '',
      email: email || '', description, type: type || 'doleance',
      statut: 'nouveau', createdAt: new Date(),
    });
    res.json(d);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/doleances/:id/statut', auth, adminOnly, async (req, res) => {
  try {
    await db.doleances.update({ _id: req.params.id }, { $set: { statut: req.body.statut, updatedAt: new Date() } });
    res.json({ message: 'Statut mete ajou' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── wout ki te gen module.exports anba yo — yo transfere nan fen ───

// ── GET ROWS POU YON FICH ─────────────────────────────────────
router.get('/fiches/:ticket/rows', auth, adminOnly, async (req, res) => {
  try {
    const fiche = await db.fiches.findOne({ ticket: req.params.ticket });
    if (!fiche) return res.status(404).json({ message: 'Fich pa jwenn' });
    const rows = await db.rows.find({ ficheId: fiche._id });
    res.json({ rows, fiche });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── ELIMINE FICH ──────────────────────────────────────────────
router.put('/fiches/:ticket/elimine', auth, adminOnly, async (req, res) => {
  try {
    await db.fiches.update({ ticket: req.params.ticket }, { $set: { statut: 'elimine', eliminePar: req.user.id, elimineAt: new Date() } });
    res.json({ message: 'Fich elimine' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── BLOKE FICH ────────────────────────────────────────────────
router.put('/fiches/:ticket/bloke', auth, adminOnly, async (req, res) => {
  try {
    await db.fiches.update({ ticket: req.params.ticket }, { $set: { statut: 'bloke', blokePar: req.user.id, blokeAt: new Date() } });
    res.json({ message: 'Fich bloke' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── FICHES PA AJAN ────────────────────────────────────────────
router.get('/fiches-agent/:agentId', auth, adminOnly, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    let fiches = await db.fiches.find({ agentId: req.params.agentId }).sort({ dateVente: -1 });
    if (debut || fin) {
      fiches = fiches.filter(f => {
        const d = new Date(f.dateVente || f.createdAt);
        if (debut && d < new Date(debut)) return false;
        if (fin   && d > new Date(fin + 'T23:59:59')) return false;
        return true;
      });
    }
    const result = await Promise.all(fiches.slice(0, 300).map(async f => {
      const t = await db.tirages.findOne({ _id: f.tirageId }).catch(() => null);
      const rows = await db.rows.find({ ficheId: f._id }).catch(() => []);
      return {
        ticket: f.ticket, total: f.total || 0, statut: f.statut,
        date: f.dateVente || f.createdAt,
        tirage: t?.nom || f.tirage || '—',
        rows,
      };
    }));
    res.json({ fiches: result, count: result.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── MODIFYE POS AVÈK LOGO (base64) ───────────────────────────
router.put('/pos/:id/full', auth, adminOnly, async (req, res) => {
  try {
    const { nom, posId, adresse, telephone, actif, logo } = req.body;
    const update = {};
    if (nom       !== undefined) update.nom       = nom;
    if (posId     !== undefined) update.posId     = posId;
    if (adresse   !== undefined) update.adresse   = adresse;
    if (telephone !== undefined) update.telephone = telephone;
    if (actif     !== undefined) update.actif     = actif;
    if (logo      !== undefined) update.logo      = logo; // base64 string
    update.updatedAt = new Date();
    await db.pos.update({ _id: req.params.id }, { $set: update });
    res.json({ message: 'POS mete ajou', ...update });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── LIMITE PA AJAN ─────────────────────────────────────────────
router.get('/agents/:id/limites', auth, adminOnly, async (req, res) => {
  try {
    const agent = await db.agents.findOne({ _id: req.params.id });
    if (!agent) return res.status(404).json({ message: 'Ajan pa jwenn' });
    res.json({ limites: agent.limites || {}, agent: { _id: agent._id, nom: agent.nom, prenom: agent.prenom, username: agent.username } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/agents/:id/limites', auth, adminOnly, async (req, res) => {
  try {
    // { borlette, loto3, mariage, l4p1, l4p2, l4p3,
    //   tetFichLoto3Dwat, tetFichMariaj, tetFichLoto3Goch, tetFichMariajGoch }
    await db.agents.update({ _id: req.params.id }, { $set: { limites: req.body, limitesUpdatedAt: new Date() } });
    res.json({ message: 'Limites ajan mete ajou' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
