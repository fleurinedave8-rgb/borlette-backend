const express = require('express');
const { db }   = require('../database');
const auth    = require('../middleware/auth');
const router  = express.Router();

const TIRAGES_LIST = [
  'Georgia-Matin','Georgia-Soir','Florida matin','Florida soir',
  'New-york matin','New-york soir','Ohio matin','Ohio soir',
  'Chicago matin','Chicago soir','Maryland midi','Maryland soir',
  'Tennessee matin','Tennessee soir',
];

// Flt tiraj — retounen "Florida matin" => "Florida (M)" etc.
function labelTirage(nom) {
  if (!nom) return '—';
  const n = nom.toLowerCase();
  if (n.includes('matin') || n.includes('midi')) return nom.replace(/matin/i,'(M)').replace(/midi/i,'(M)');
  if (n.includes('soir'))  return nom.replace(/soir/i,'(S)');
  return nom;
}

// ── PARTIEL ────────────────────────────────────────────────────
router.get('/partiel', auth, async (req, res) => {
  try {
    const date  = req.query.date || new Date().toISOString().split('T')[0];
    const debut = new Date(date);
    const fin   = new Date(date + 'T23:59:59');
    const agentId = req.query.agentId || req.user.id || req.user._id;

    // Ajan sèlman wè pwòp fichè yo si role===agent
    const isAgent = req.user.role === 'agent';
    const query = isAgent ? { agentId: req.user.id || req.user._id }
      : (agentId === 'tout' ? {} : { agentId });

    let fiches = await db.fiches.find({ ...query, statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => {
      const d = new Date(f.dateVente);
      return d >= debut && d <= fin;
    });
    const vente = fiches.reduce((s, f) => s + (f.total||0), 0);
    res.json({ date, fichesVendu: fiches.length, vente: vente.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TIRAGE ─────────────────────────────────────────────────────
router.get('/tirage', auth, async (req, res) => {
  try {
    const { debut, fin, tirage } = req.query;
    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });
    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin+'T23:59:59'));
    if (tirage && tirage !== 'tout') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }
    const vente = fiches.reduce((s, f) => s + (f.total||0), 0);
    res.json({ debut, fin, tirage: tirage||'tout', fichesVendu: fiches.length, vente: vente.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GAGNANT ────────────────────────────────────────────────────
router.get('/gagnant', auth, async (req, res) => {
  try {
    const { debut, fin, agentId, tirage, statut } = req.query;
    const isAgent = req.user.role === 'agent';

    let query = { statut: 'gagnant' };
    if (isAgent) query.agentId = req.user.id || req.user._id;
    else if (agentId && agentId !== 'Tout') query.agentId = agentId;

    let fiches = await db.fiches.find(query);
    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin+'T23:59:59'));

    if (tirage && tirage !== 'Tout') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }
    // Filtre payee/nonpayee
    if (statut === 'payee')    fiches = fiches.filter(f => f.paye === true);
    if (statut === 'nonpayee') fiches = fiches.filter(f => !f.paye);

    const result = await Promise.all(fiches.map(async f => {
      const tirageDoc = await db.tirages.findOne({ _id: f.tirageId });
      const agent     = await db.agents.findOne({ _id: f.agentId });
      const rows      = await db.rows.find({ ficheId: f._id });
      return {
        ...f,
        tirage:    tirageDoc?.nom || '—',
        tirageLabel: labelTirage(tirageDoc?.nom),
        agent:     `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
        rows,
        mise:  rows.reduce((s,r) => s + (r.mise||0), 0),
        gain:  f.montantGagne || f.gain || 0,
        paye:  f.paye || false,
      };
    }));

    const totalMise = result.reduce((s,f) => s + (f.mise||0), 0);
    const totalGain = result.reduce((s,f) => s + (f.gain||0), 0);
    res.json({ fiches: result, count: result.length,
      totalMise: totalMise.toFixed(2), totalGain: totalGain.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── ELIMINE / BLOKE ────────────────────────────────────────────
router.get('/eliminer', auth, async (req, res) => {
  try {
    const { debut, fin, agentId, tirage } = req.query;
    const isAgent = req.user.role === 'agent';

    let query = { statut: { $in: ['elimine','bloque'] } };
    if (isAgent) query.agentId = req.user.id || req.user._id;
    else if (agentId && agentId !== 'Tout') query.agentId = agentId;

    let fiches = await db.fiches.find(query).sort({ dateElimine: -1 });
    if (debut) fiches = fiches.filter(f => new Date(f.dateVente) >= new Date(debut));
    if (fin)   fiches = fiches.filter(f => new Date(f.dateVente) <= new Date(fin+'T23:59:59'));

    if (tirage && tirage !== 'Tout') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }

    const result = await Promise.all(fiches.slice(0,200).map(async f => {
      const tirageDoc = await db.tirages.findOne({ _id: f.tirageId });
      const agent     = await db.agents.findOne({ _id: f.agentId });
      const rows      = await db.rows.find({ ficheId: f._id });
      return {
        ...f,
        tirage:      tirageDoc?.nom || '—',
        tirageLabel: labelTirage(tirageDoc?.nom),
        agent:       `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
        rows,
        mise: rows.reduce((s,r) => s + (r.mise||0), 0),
      };
    }));

    const totalMise = result.reduce((s,f) => s + (f.mise||0), 0);
    res.json({ fiches: result, count: result.length, totalMise: totalMise.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TRANSACTIONS ───────────────────────────────────────────────
router.get('/transactions', auth, async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    const isAgent = req.user.role === 'agent';
    const query = isAgent ? { agentId: req.user.id||req.user._id }
      : agentId ? { agentId } : {};
    let paiements = await db.paiements.find(query).sort({ date: -1 });
    if (debut) paiements = paiements.filter(p => new Date(p.date) >= new Date(debut));
    if (fin)   paiements = paiements.filter(p => new Date(p.date) <= new Date(fin+'T23:59:59'));
    const result = await Promise.all(paiements.map(async p => {
      const agent = await db.agents.findOne({ _id: p.agentId });
      return { ...p, agent: `${agent?.prenom||''} ${agent?.nom||''}`.trim() };
    }));
    res.json(Array.isArray(result) ? result : []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── STATISTIQUES ───────────────────────────────────────────────
router.get('/statistiques', auth, async (req, res) => {
  try {
    const { tirage, date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    const debut = new Date(today);
    const fin   = new Date(today + 'T23:59:59');
    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => new Date(f.dateVente) >= debut && new Date(f.dateVente) <= fin);
    if (tirage && tirage !== 'TOUT') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }
    const stats = {};
    for (const f of fiches) {
      const rows = await db.rows.find({ ficheId: f._id });
      for (const r of rows) {
        const key = `${r.type}-${r.boule}`;
        if (!stats[key]) stats[key] = { type: r.type, boule: r.boule, quantite: 0, montant: 0 };
        stats[key].quantite++;
        stats[key].montant += r.mise || 0;
      }
    }
    res.json(Object.values(stats).sort((a,b) => b.montant - a.montant));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── JOURNALIER KONPLÈ ──────────────────────────────────────────
router.get('/journalier', auth, async (req, res) => {
  try {
    const { debut, fin } = req.query;
    const isAgent = req.user.role === 'agent';

    const d1 = debut ? new Date(debut) : (() => { const d=new Date(); d.setHours(0,0,0,0); return d; })();
    const d2 = fin   ? new Date(fin+'T23:59:59') : (() => { const d=new Date(); d.setHours(23,59,59,999); return d; })();

    // Fiches pou peryòd la (pa elimine)
    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => {
      const d = new Date(f.dateVente);
      return d >= d1 && d <= d2;
    });

    // Tout POS
    const allPos    = await db.pos.find({});
    const allAgents = await db.agents.find({ role:'agent' });

    // Si se ajan ki mande, filtre sèlman li menm
    if (isAgent) {
      const myId = req.user.id || req.user._id;
      fiches = fiches.filter(f => f.agentId === myId);
    }

    // Regwoupe pa ajan/POS
    const posMap = {};
    for (const f of fiches) {
      const key = f.agentId || 'unknown';
      if (!posMap[key]) posMap[key] = { fichesCount:0, vente:0, agentId: f.agentId };
      posMap[key].fichesCount++;
      posMap[key].vente += f.total || 0;
    }

    // Konstitye table ajan
    let rowNo = 1;
    const agentRows = await Promise.all(
      Object.values(posMap).map(async entry => {
        const a   = await db.agents.findOne({ _id: entry.agentId });
        const pos = allPos.find(p => p.agentUsername === a?.username || p.agentId === entry.agentId);
        // Pa gen komisyon — kalkil sèlman vente - gain
        const vente     = entry.vente;
        const apaye     = vente;          // tout fich vann = deja paye
        const komisyon  = vente * pct / 100;
        const ppSans    = vente - komisyon;
        const pctSup    = a?.supPct || 0;
        const bFinal    = ppSans - (ppSans * pctSup / 100);

        return {
          no:       rowNo++,
          posId:    pos?.posId || a?.username || '—',
          agent:    `${a?.prenom||''} ${a?.nom||''}`.trim() || a?.username || '—',
          tfiche:   entry.fichesCount,
          vente:    vente.toFixed(2),
          apaye:    apaye.toFixed(2),
          pctAgent: komisyon.toFixed(2),
          ppSans:   ppSans.toFixed(2),
          pctSup:   pctSup,
          bFinal:   bFinal.toFixed(2),
        };
      })
    );

    // Total ajan
    const totVente   = agentRows.reduce((s,r) => s+parseFloat(r.vente),0);
    const totApaye   = agentRows.reduce((s,r) => s+parseFloat(r.apaye),0);
    const totKomisyon= agentRows.reduce((s,r) => s+parseFloat(r.pctAgent),0);
    const totPPSans  = agentRows.reduce((s,r) => s+parseFloat(r.ppSans),0);
    const totBFinal  = agentRows.reduce((s,r) => s+parseFloat(r.bFinal),0);

    // Superviseur (admin) — 1 liy rezime
    const adminUser  = await db.agents.findOne({ role:'admin' });
    const supPct     = adminUser?.supPct || 0;
    const superviseurs = [{
      superviseur:  adminUser ? `${adminUser.prenom||''} ${adminUser.nom||''}`.trim() || 'Admin' : 'Admin',
      totalVentes:  totVente.toFixed(2),
      apaye:        totApaye.toFixed(2),
      pourcentage:  supPct,
      balance:      (totVente * (1 - supPct/100)).toFixed(2),
    }];

    // Recap final
    const recap = {
      tfiche:      agentRows.reduce((s,r) => s+r.tfiche, 0),
      vente:       totVente.toFixed(2),
      apaye:       totApaye.toFixed(2),
      pctAgent:    totKomisyon.toFixed(2),
      balSans:     totPPSans.toFixed(2),
      balAvec:     totBFinal.toFixed(2),
      pctSup:      supPct,
      balSupSans:  (totVente * (1-supPct/100)).toFixed(2),
      balSupAvec:  totBFinal.toFixed(2),
    };

    // Nombre POS aktif pou peryòd la
    const posActifs = new Set(Object.values(posMap).map(e => e.agentId)).size;

    res.json({
      debut: d1.toISOString().split('T')[0],
      fin:   d2.toISOString().split('T')[0],
      qtyPos: posActifs,
      agents: agentRows,
      superviseurs,
      recap,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DEFISI ────────────────────────────────────────────────────
router.get('/defisi', auth, async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    const isAgent = req.user.role === 'agent';

    const d1 = debut ? new Date(debut) : (() => { const d=new Date(); d.setHours(0,0,0,0); return d; })();
    const d2 = fin   ? new Date(fin+'T23:59:59') : (() => { const d=new Date(); d.setHours(23,59,59,999); return d; })();

    let fiches = await db.fiches.find({});
    fiches = fiches.filter(f => {
      const d = new Date(f.dateVente);
      return d >= d1 && d <= d2;
    });

    if (isAgent) fiches = fiches.filter(f => f.agentId === (req.user.id||req.user._id));
    else if (agentId && agentId !== 'Tout') fiches = fiches.filter(f => f.agentId === agentId);

    // Regwoupe pa ajan
    const agentMap = {};
    for (const f of fiches) {
      const k = f.agentId;
      if (!agentMap[k]) agentMap[k] = { vente:0, gain:0, elimine:0, ficheCount:0 };
      agentMap[k].ficheCount++;
      if (f.statut !== 'elimine') agentMap[k].vente += f.total||0;
      if (f.statut === 'gagnant') agentMap[k].gain  += f.montantGagne||f.gain||0;
      if (f.statut === 'elimine') agentMap[k].elimine+= f.total||0;
    }

    const rows = await Promise.all(Object.entries(agentMap).map(async ([id, d]) => {
      const a  = await db.agents.findOne({ _id: id });
      // Kalkil defisi: vente - gain (pa gen komisyon)
      // Si negatif: admin dwe peye ajan diferans lan
      const net = d.vente - d.gain;
      return {
        agent:      `${a?.prenom||''} ${a?.nom||''}`.trim() || id,
        username:   a?.username || '—',
        ficheCount: d.ficheCount,
        vente:      d.vente.toFixed(2),
        gain:       d.gain.toFixed(2),
        elimine:    d.elimine.toFixed(2),
        net:        net.toFixed(2),
        // Defisi: mise - gain = montant admin dwe peye ajan
        // Profit: mise - gain = benefis bank
        status: net < 0 ? 'defisi' : net === 0 ? 'zero' : 'profit',
      };
    }));

    rows.sort((a,b) => parseFloat(a.net) - parseFloat(b.net));

    const totalVente = rows.reduce((s,r) => s+parseFloat(r.vente), 0);
    const totalGain  = rows.reduce((s,r) => s+parseFloat(r.gain),  0);
    const totalNet   = rows.reduce((s,r) => s+parseFloat(r.net),   0);

    res.json({
      rows,
      totalVente: totalVente.toFixed(2),
      totalGain:  totalGain.toFixed(2),
      totalNet:   totalNet.toFixed(2),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

// ── WOUT SIPLEMANTÈ ────────────────────────────────────────

// GET /api/rapport/statistiques?date=
router.get('/statistiques', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const d = date ? new Date(date) : new Date();
    d.setHours(0,0,0,0);
    const dEnd = new Date(d); dEnd.setHours(23,59,59,999);
    const isAgent = req.user?.role === 'agent';
    let query = { dateVente: { $gte: d, $lte: dEnd } };
    if (isAgent) query.agentId = req.user.id;
    const fiches = await db.fiches.find(query);
    const vente = fiches.reduce((s,f) => s+(f.total||0), 0);
    const ganyan = fiches.filter(f => f.statut==='gagnant').reduce((s,f)=>s+(f.gainTotal||0),0);
    const elimine = fiches.filter(f => f.statut==='elimine').reduce((s,f)=>s+(f.total||0),0);
    res.json({ vente, ganyan, elimine, bilan: vente-ganyan, fiches: fiches.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/partiel?date=  (ventes matin/soir)
router.get('/partiel', auth, async (req, res) => {
  try {
    const { date } = req.query;
    const d = date ? new Date(date) : new Date();
    d.setHours(0,0,0,0);
    const dEnd = new Date(d); dEnd.setHours(23,59,59,999);
    const isAgent = req.user?.role === 'agent';
    let query = { dateVente: { $gte: d, $lte: dEnd } };
    if (isAgent) query.agentId = req.user.id;
    const fiches = await db.fiches.find(query);
    const matin = fiches.filter(f => new Date(f.dateVente).getHours() < 14);
    const soir  = fiches.filter(f => new Date(f.dateVente).getHours() >= 14);
    res.json({
      matin: { fiches: matin.length, vente: matin.reduce((s,f)=>s+(f.total||0),0) },
      soir:  { fiches: soir.length,  vente: soir.reduce((s,f)=>s+(f.total||0),0) },
      total: { fiches: fiches.length, vente: fiches.reduce((s,f)=>s+(f.total||0),0) },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/rapport/tirage?debut=&fin=&tirage=&agentId=
router.get('/tirage', auth, async (req, res) => {
  try {
    const { debut, fin, tirage, agentId } = req.query;
    let query = {};
    if (debut) query.dateVente = { $gte: new Date(debut) };
    if (fin)   query.dateVente = { ...(query.dateVente||{}), $lte: new Date(fin+'T23:59:59') };
    if (tirage && tirage !== 'Tout') query.tirage = tirage;
    const isAgent = req.user?.role === 'agent';
    if (isAgent) query.agentId = req.user.id;
    else if (agentId && agentId !== 'Tout') query.agentId = agentId;

    const fiches = await db.fiches.find(query);
    const vente  = fiches.reduce((s,f) => s+(f.total||0), 0);
    const ganyan = fiches.filter(f=>f.statut==='gagnant')
      .reduce((s,f)=>s+(f.gainTotal||f.montantGagne||0), 0);
    const net    = vente - ganyan;

    // Detay pa ajan
    const agentMap = {};
    for (const f of fiches) {
      const k = f.agentId || 'inconnu';
      if (!agentMap[k]) agentMap[k] = { ficheCount:0, vente:0, gain:0, fiches:[] };
      agentMap[k].ficheCount++;
      agentMap[k].vente += f.total||0;
      if (f.statut==='gagnant') agentMap[k].gain += f.gainTotal||f.montantGagne||0;
      agentMap[k].fiches.push({
        ticket: f.ticket, tirage: f.tirage,
        total: f.total||0, statut: f.statut,
        dateVente: f.dateVente,
      });
    }

    const agents = await Promise.all(Object.entries(agentMap).map(async ([id, d]) => {
      const a = await db.agents.findOne({ _id: id }).catch(()=>null);
      return {
        _id:       id,
        nom:       a?.nom||'', prenom: a?.prenom||'',
        username:  a?.username||id,
        succursale:a?.succursale||'—',
        ficheCount:d.ficheCount,
        vente:     d.vente,
        gain:      d.gain,
        net:       d.vente - d.gain,
        fiches:    d.fiches.slice(0,50),
      };
    }));

    agents.sort((a,b) => b.vente - a.vente);

    res.json({
      vente, ganyan, net, fiches: fiches.length,
      qtyPos: new Set(fiches.map(f=>f.posId)).size,
      agents,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
