const express = require('express');
const { db }  = require('../database');
const router  = express.Router();

function labelTirage(nom) {
  if (!nom) return '—';
  const n = nom.toLowerCase();
  if (n.includes('matin')||n.includes('midi')) return nom.replace(/matin/i,'(M)').replace(/midi/i,'(M)');
  if (n.includes('soir')) return nom.replace(/soir/i,'(S)');
  return nom;
}
const isMatin = (nom) => !!(nom||'').toLowerCase().match(/matin|midi/);
const isSoir  = (nom) => !!(nom||'').toLowerCase().includes('soir');

// ── FICHES GAGNANT ─────────────────────────────────────────────
router.get('/gagnant', require('../middleware/auth'), async (req, res) => {
  try {
    const { debut, fin, agentId, tirage, statut } = req.query;
    const isAgent = req.user?.role === 'agent';

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
    if (statut === 'payee')    fiches = fiches.filter(f => f.paye);
    if (statut === 'nonpayee') fiches = fiches.filter(f => !f.paye);

    const result = await Promise.all(fiches.map(async f => {
      const tirageDoc = await db.tirages.findOne({ _id: f.tirageId });
      const agent     = await db.agents.findOne({ _id: f.agentId });
      const rows      = await db.rows.find({ ficheId: f._id });
      return {
        ...f,
        tirage:  tirageDoc?.nom || '—',
        agent:   `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
        rows,
        mise:    rows.reduce((s,r)=>s+(r.mise||0),0),
        gain:    f.gainTotal || f.montantGagne || f.gain || 0,
        paye:    f.paye || false,
      };
    }));

    const totalMise = result.reduce((s,f)=>s+(f.mise||0),0);
    const totalGain = result.reduce((s,f)=>s+(f.gain||0),0);
    res.json({ fiches: result, count: result.length,
      totalMise: totalMise.toFixed(2), totalGain: totalGain.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── ELIMINE ────────────────────────────────────────────────────
router.get('/eliminer', require('../middleware/auth'), async (req, res) => {
  try {
    const { debut, fin, agentId, tirage } = req.query;
    const isAgent = req.user?.role === 'agent';
    let query = { statut: { $in: ['elimine','bloque'] } };
    if (isAgent) query.agentId = req.user.id || req.user._id;
    else if (agentId && agentId !== 'Tout') query.agentId = agentId;

    let fiches = await db.fiches.find(query);
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
      return { ...f, tirage: tirageDoc?.nom||'—', agent: `${agent?.prenom||''} ${agent?.nom||''}`.trim(),
        rows, mise: rows.reduce((s,r)=>s+(r.mise||0),0) };
    }));
    const totalMise = result.reduce((s,f)=>s+(f.mise||0),0);
    res.json({ fiches: result, count: result.length, totalMise: totalMise.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── TRANSACTIONS ───────────────────────────────────────────────
router.get('/transactions', require('../middleware/auth'), async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    const isAgent = req.user?.role === 'agent';
    const query = isAgent ? { agentId: req.user.id||req.user._id }
      : agentId ? { agentId } : {};
    let paiements = await db.paiements.find(query);
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
router.get('/statistiques', require('../middleware/auth'), async (req, res) => {
  try {
    const { tirage, date } = req.query;
    const today = date || new Date().toISOString().split('T')[0];
    const debut = new Date(today); debut.setHours(0,0,0,0);
    const fin   = new Date(today); fin.setHours(23,59,59,999);
    let fiches = await db.fiches.find({ statut: { $ne:'elimine' } });
    fiches = fiches.filter(f => { const d=new Date(f.dateVente); return d>=debut&&d<=fin; });
    if (tirage && tirage !== 'TOUT') {
      const t = await db.tirages.findOne({ nom: tirage });
      if (t) fiches = fiches.filter(f => f.tirageId === t._id);
    }
    const stats = {};
    for (const f of fiches) {
      const rows = await db.rows.find({ ficheId: f._id });
      for (const r of rows) {
        const key = `${r.type}-${r.boule}`;
        if (!stats[key]) stats[key] = { type:r.type, boule:r.boule, quantite:0, montant:0 };
        stats[key].quantite++;
        stats[key].montant += r.mise||0;
      }
    }
    res.json(Object.values(stats).sort((a,b)=>b.montant-a.montant));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── JOURNALIER KONPLÈ — pa ajan, san komisyon ──────────────────
router.get('/journalier', require('../middleware/auth'), async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    const isAgent = req.user?.role === 'agent';

    const d1 = debut ? new Date(debut) : (() => { const d=new Date(); d.setHours(0,0,0,0); return d; })();
    const d2 = fin   ? new Date(fin+'T23:59:59') : (() => { const d=new Date(); d.setHours(23,59,59,999); return d; })();

    let fiches = await db.fiches.find({});
    fiches = fiches.filter(f => { const d=new Date(f.dateVente); return d>=d1&&d<=d2; });

    if (isAgent) {
      const myId = req.user.id || req.user._id;
      fiches = fiches.filter(f => f.agentId === myId);
    } else if (agentId && agentId !== 'Tout') {
      fiches = fiches.filter(f => f.agentId === agentId);
    }

    // Stats global
    const vendu   = fiches.filter(f => f.statut !== 'elimine');
    const gagnant = fiches.filter(f => f.statut === 'gagnant');
    const elimine = fiches.filter(f => f.statut === 'elimine');

    const totalVente  = vendu.reduce((s,f)=>s+(f.total||0),0);
    const totalGain   = gagnant.reduce((s,f)=>s+(f.gainTotal||f.montantGagne||f.gain||0),0);
    const totalElim   = elimine.reduce((s,f)=>s+(f.total||0),0);
    // Defisi = vente - gain (pa gen komisyon)
    const bilan = totalVente - totalGain;

    // Detay pa ajan
    const agentMap = {};
    for (const f of fiches) {
      const k = f.agentId || 'unknown';
      if (!agentMap[k]) agentMap[k] = { ficheCount:0, vente:0, gain:0, elimine:0 };
      if (f.statut !== 'elimine') agentMap[k].vente += f.total||0;
      if (f.statut === 'gagnant') agentMap[k].gain  += f.gainTotal||f.montantGagne||f.gain||0;
      if (f.statut === 'elimine') agentMap[k].elimine += f.total||0;
      agentMap[k].ficheCount++;
    }

    const agents = await Promise.all(Object.entries(agentMap).map(async ([id, d]) => {
      const a = await db.agents.findOne({ _id: id }).catch(()=>null);
      const net = d.vente - d.gain;
      return {
        id, agent: `${a?.prenom||''} ${a?.nom||''}`.trim() || a?.username || id,
        username: a?.username||'—',
        ficheCount: d.ficheCount,
        vente:   d.vente.toFixed(2),
        gain:    d.gain.toFixed(2),
        elimine: d.elimine.toFixed(2),
        net:     net.toFixed(2),
        statut:  net < 0 ? 'defisi' : 'profit',
      };
    }));

    res.json({
      fiches: vendu.length, fichesGagnant: gagnant.length, fichesElimine: elimine.length,
      vente: totalVente.toFixed(2), gain: totalGain.toFixed(2),
      elimine: totalElim.toFixed(2), bilan: bilan.toFixed(2),
      statutBilan: bilan < 0 ? 'defisi' : 'profit',
      agents,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── VANT MATEN / SWAR — pa ajan, konplè ───────────────────────
router.get('/partiel', require('../middleware/auth'), async (req, res) => {
  try {
    const { date, agentId } = req.query;
    const isAgent = req.user?.role === 'agent';
    const d = date ? new Date(date) : new Date();
    d.setHours(0,0,0,0);
    const dEnd = new Date(d); dEnd.setHours(23,59,59,999);

    let fiches = await db.fiches.find({});
    fiches = fiches.filter(f => {
      const dt = new Date(f.dateVente);
      return dt >= d && dt <= dEnd;
    });

    if (isAgent) fiches = fiches.filter(f=>f.agentId===(req.user.id||req.user._id));
    else if (agentId && agentId !== 'Tout') fiches = fiches.filter(f=>f.agentId===agentId);

    // Separe maten (< 14h) ak swar (>= 14h) pa nom tiraj
    const matin = fiches.filter(f => {
      const h = new Date(f.dateVente).getHours();
      return h < 14 || isMatin(f.tirage);
    });
    const soir = fiches.filter(f => {
      const h = new Date(f.dateVente).getHours();
      return h >= 14 || isSoir(f.tirage);
    });

    // Pa ajan — maten
    const matinAgents = {};
    for (const f of matin) {
      const k = f.agentId||'?';
      if (!matinAgents[k]) matinAgents[k] = { ficheCount:0, vente:0, gain:0 };
      if (f.statut!=='elimine') matinAgents[k].vente += f.total||0;
      if (f.statut==='gagnant') matinAgents[k].gain  += f.gainTotal||f.montantGagne||0;
      matinAgents[k].ficheCount++;
    }
    // Pa ajan — swar
    const soirAgents = {};
    for (const f of soir) {
      const k = f.agentId||'?';
      if (!soirAgents[k]) soirAgents[k] = { ficheCount:0, vente:0, gain:0 };
      if (f.statut!=='elimine') soirAgents[k].vente += f.total||0;
      if (f.statut==='gagnant') soirAgents[k].gain  += f.gainTotal||f.montantGagne||0;
      soirAgents[k].ficheCount++;
    }

    const buildAgents = async (map) => Promise.all(Object.entries(map).map(async ([id,d])=>{
      const a = await db.agents.findOne({_id:id}).catch(()=>null);
      return {
        id, agent:`${a?.prenom||''} ${a?.nom||''}`.trim()||a?.username||id,
        ficheCount:d.ficheCount, vente:d.vente.toFixed(2), gain:d.gain.toFixed(2),
        net:(d.vente-d.gain).toFixed(2),
      };
    }));

    const [mAgents, sAgents] = await Promise.all([buildAgents(matinAgents), buildAgents(soirAgents)]);

    res.json({
      matin: {
        fiches: matin.length,
        vente:  matin.reduce((s,f)=>s+(f.total||0),0).toFixed(2),
        gain:   matin.reduce((s,f)=>s+(f.gainTotal||f.montantGagne||0),0).toFixed(2),
        agents: mAgents,
      },
      soir: {
        fiches: soir.length,
        vente:  soir.reduce((s,f)=>s+(f.total||0),0).toFixed(2),
        gain:   soir.reduce((s,f)=>s+(f.gainTotal||f.montantGagne||0),0).toFixed(2),
        agents: sAgents,
      },
      total: {
        fiches: fiches.length,
        vente:  fiches.reduce((s,f)=>s+(f.total||0),0).toFixed(2),
      },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── VANT FIN TIRAJ — pa ajan konplè ───────────────────────────
router.get('/tirage', require('../middleware/auth'), async (req, res) => {
  try {
    const { debut, fin, tirage, agentId } = req.query;
    const isAgent = req.user?.role === 'agent';
    let query = {};
    if (debut) query.dateVente = { $gte: new Date(debut) };
    if (fin)   query.dateVente = { ...(query.dateVente||{}), $lte: new Date(fin+'T23:59:59') };
    if (tirage && tirage !== 'Tout') query.tirage = tirage;
    if (isAgent) query.agentId = req.user.id;
    else if (agentId && agentId !== 'Tout') query.agentId = agentId;

    const fiches = await db.fiches.find(query);
    const vente  = fiches.reduce((s,f)=>s+(f.total||0),0);
    const ganyan = fiches.filter(f=>f.statut==='gagnant')
      .reduce((s,f)=>s+(f.gainTotal||f.montantGagne||0),0);
    const net = vente - ganyan;

    // Pa ajan
    const agentMap = {};
    for (const f of fiches) {
      const k = f.agentId || 'inconnu';
      if (!agentMap[k]) agentMap[k] = { ficheCount:0, vente:0, gain:0, fiches:[] };
      agentMap[k].ficheCount++;
      if (f.statut !== 'elimine') agentMap[k].vente += f.total||0;
      if (f.statut==='gagnant')   agentMap[k].gain  += f.gainTotal||f.montantGagne||0;
      agentMap[k].fiches.push({ ticket:f.ticket, tirage:f.tirage,
        total:f.total||0, statut:f.statut, dateVente:f.dateVente });
    }

    const agents = await Promise.all(Object.entries(agentMap).map(async ([id,d])=>{
      const a = await db.agents.findOne({_id:id}).catch(()=>null);
      return {
        _id:id, nom:a?.nom||'', prenom:a?.prenom||'', username:a?.username||id,
        succursale:a?.succursale||'—', ficheCount:d.ficheCount,
        vente:d.vente, gain:d.gain, net:d.vente-d.gain,
        fiches:d.fiches.slice(0,50),
      };
    }));
    agents.sort((a,b)=>b.vente-a.vente);

    res.json({ vente, ganyan, net, fiches:fiches.length,
      qtyPos:new Set(fiches.map(f=>f.posId)).size, agents });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── DEFISI / PROFIT — san komisyon ────────────────────────────
router.get('/defisi', require('../middleware/auth'), async (req, res) => {
  try {
    const { debut, fin, agentId } = req.query;
    const isAgent = req.user?.role === 'agent';

    const d1 = debut ? new Date(debut) : (() => { const d=new Date(); d.setHours(0,0,0,0); return d; })();
    const d2 = fin   ? new Date(fin+'T23:59:59') : (() => { const d=new Date(); d.setHours(23,59,59,999); return d; })();

    let fiches = await db.fiches.find({});
    fiches = fiches.filter(f => { const d=new Date(f.dateVente); return d>=d1&&d<=d2; });

    if (isAgent) fiches = fiches.filter(f=>f.agentId===(req.user.id||req.user._id));
    else if (agentId && agentId !== 'Tout') fiches = fiches.filter(f=>f.agentId===agentId);

    const agentMap = {};
    for (const f of fiches) {
      const k = f.agentId||'unknown';
      if (!agentMap[k]) agentMap[k] = { vente:0, gain:0, elimine:0, ficheCount:0 };
      agentMap[k].ficheCount++;
      if (f.statut !== 'elimine') agentMap[k].vente += f.total||0;
      if (f.statut === 'gagnant') agentMap[k].gain  += f.gainTotal||f.montantGagne||f.gain||0;
      if (f.statut === 'elimine') agentMap[k].elimine+= f.total||0;
    }

    const rows = await Promise.all(Object.entries(agentMap).map(async ([id,d]) => {
      const a = await db.agents.findOne({_id:id});
      // DEFISI = vente - gain (SANS komisyon)
      // Si negatif: admin dwe peye ajan diferans
      const net = d.vente - d.gain;
      return {
        agent:      `${a?.prenom||''} ${a?.nom||''}`.trim() || id,
        username:   a?.username||'—',
        ficheCount: d.ficheCount,
        vente:      d.vente.toFixed(2),
        gain:       d.gain.toFixed(2),
        elimine:    d.elimine.toFixed(2),
        net:        net.toFixed(2),
        // Negatif = defisi (admin dwe mete lajan pou peye)
        // Pozitif = profit (admin kenbe lajan)
        status: net < 0 ? 'defisi' : net === 0 ? 'zero' : 'profit',
      };
    }));

    rows.sort((a,b) => parseFloat(a.net) - parseFloat(b.net));

    const totalVente = rows.reduce((s,r)=>s+parseFloat(r.vente),0);
    const totalGain  = rows.reduce((s,r)=>s+parseFloat(r.gain),0);
    const totalNet   = rows.reduce((s,r)=>s+parseFloat(r.net),0);

    res.json({ rows, totalVente:totalVente.toFixed(2),
      totalGain:totalGain.toFixed(2), totalNet:totalNet.toFixed(2) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
