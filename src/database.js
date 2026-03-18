const path    = require('path');
const Datastore = require('nedb-promises');
const bcrypt  = require('bcryptjs');

const DB_DIR = '/tmp';

function mkDb(name) {
  const store = Datastore.create({
    filename: path.join(DB_DIR, `borlette_${name}.db`),
    autoload: true,
  });
  return {
    find:    (q={})      => ({ 
      sort: (s) => store.find(q).sort(s),
      then: (cb) => store.find(q).then(cb),
    }),
    findOne: (q={})      => store.findOne(q),
    insert:  (doc)       => store.insert(doc),
    update:  (q,u,opt={})=> store.update(q, u, {multi:true,...opt}),
    remove:  (q,opt={})  => store.remove(q, {multi:true,...opt}),
    count:   (q={})      => store.count(q),
    ensureIndex: (opt)   => store.ensureIndex(opt),
  };
}

const db = {
  agents:      mkDb('agents'),
  pos:         mkDb('pos'),
  fiches:      mkDb('fiches'),
  rows:        mkDb('rows'),
  tirages:     mkDb('tirages'),
  primes:      mkDb('primes'),
  boules:      mkDb('boules'),
  resultats:   mkDb('resultats'),
  logs:        mkDb('logs'),
  config:      mkDb('config'),
  paiements:   mkDb('paiements'),
  licences:    mkDb('licences'),
  transactions:mkDb('transactions'),
  succursales: mkDb('succursales'),
  doleances:   mkDb('doleances'),
};

async function connectMongo() {
  try {
    // ── Admin pa defòlt ──────────────────────────────────
    const existing = await db.agents.findOne({ role: 'admin' });
    if (!existing) {
      await db.agents.insert({
        nom:'Admin', prenom:'Super', username:'admin',
        password: bcrypt.hashSync('admin123', 10),
        role:'admin', actif:true,
        credit:'Illimité', balance:0,
        createdAt: new Date(),
      });
      console.log('✅ Admin kreye: admin/admin123');
    }

    // ── Tiraj pa defòlt si DB vid ────────────────────────
    const tirageCount = await db.tirages.count({});
    if (tirageCount === 0) {
      const TIRAGES = [
        { nom:'Florida matin',   actif:true, ouverture:'10:00', fermeture:'10:30' },
        { nom:'Florida soir',    actif:true, ouverture:'21:00', fermeture:'21:30' },
        { nom:'New-york matin',  actif:true, ouverture:'12:29', fermeture:'12:30' },
        { nom:'New-york soir',   actif:true, ouverture:'22:30', fermeture:'23:00' },
        { nom:'Georgia-Matin',   actif:true, ouverture:'12:29', fermeture:'12:30' },
        { nom:'Georgia-Soir',    actif:true, ouverture:'18:00', fermeture:'18:30' },
        { nom:'Ohio matin',      actif:true, ouverture:'10:30', fermeture:'11:00' },
        { nom:'Ohio soir',       actif:true, ouverture:'22:00', fermeture:'22:30' },
        { nom:'Maryland midi',   actif:true, ouverture:'13:00', fermeture:'13:30' },
        { nom:'Maryland soir',   actif:true, ouverture:'19:00', fermeture:'19:30' },
        { nom:'Tennessee matin', actif:true, ouverture:'11:00', fermeture:'11:30' },
        { nom:'Tennessee soir',  actif:true, ouverture:'21:30', fermeture:'22:00' },
      ];
      for (const t of TIRAGES) {
        await db.tirages.insert({ ...t, createdAt: new Date() });
      }
      console.log(`✅ ${TIRAGES.length} tiraj defòlt kreye`);
    }
  } catch(e) {
    console.error('Seed erè:', e.message);
  }
  console.log('✅ NeDB lokal prèt');
}

module.exports = { db, connectMongo };
