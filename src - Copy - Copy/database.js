// database.js - NeDB (pure JavaScript, aucune compilation nécessaire)
const Datastore = require('nedb-promises');
const bcrypt    = require('bcryptjs');
const path      = require('path');
const fs        = require('fs');

// Sur Railway/cloud : utiliser /tmp/data (éphémère mais fonctionne)
// En local : utiliser ../../data (persistant)
const DATA_DIR = process.env.DATA_DIR
  || (process.env.NODE_ENV === 'production'
      ? path.join('/tmp', 'borlette-data')
      : path.join(__dirname, '../../data'));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
console.log('📂 Data directory:', DATA_DIR);

const db = {
  agents:     Datastore.create({ filename: path.join(DATA_DIR, 'agents.db'),     autoload: true }),
  tirages:    Datastore.create({ filename: path.join(DATA_DIR, 'tirages.db'),    autoload: true }),
  fiches:     Datastore.create({ filename: path.join(DATA_DIR, 'fiches.db'),     autoload: true }),
  rows:       Datastore.create({ filename: path.join(DATA_DIR, 'rows.db'),       autoload: true }),
  boules:     Datastore.create({ filename: path.join(DATA_DIR, 'boules.db'),     autoload: true }),
  resultats:  Datastore.create({ filename: path.join(DATA_DIR, 'resultats.db'),  autoload: true }),
  primes:     Datastore.create({ filename: path.join(DATA_DIR, 'primes.db'),     autoload: true }),
  paiements:  Datastore.create({ filename: path.join(DATA_DIR, 'paiements.db'),  autoload: true }),
  limites:    Datastore.create({ filename: path.join(DATA_DIR, 'limites.db'),    autoload: true }),
  pos:        Datastore.create({ filename: path.join(DATA_DIR, 'pos.db'),        autoload: true }),
};

async function seed() {
  // ── TIRAGES ────────────────────────────────────────────
  const tirageCount = await db.tirages.count({});
  if (tirageCount === 0) {
    const noms = [
      'Florida matin','Florida soir',
      'New-york matin','New-york soir',
      'Georgia-Matin','Georgia-Soir',
    ];
    for (const nom of noms) {
      await db.tirages.insert({ nom, actif: true, createdAt: new Date() });
    }
    console.log('✅ Tirages créés');
  }

  // ── AGENTS ────────────────────────────────────────────
  const adminExists = await db.agents.findOne({ username: 'admin' });
  if (!adminExists) {
    await db.agents.insert({
      nom:'Admin', prenom:'Super', username:'admin',
      password: bcrypt.hashSync('admin123', 10),
      role:'admin', credit:'Illimité', limiteGain:'Illimité',
      balance:0, actif:true, createdAt: new Date()
    });
    await db.agents.insert({
      nom:'Fleurine', prenom:'Dave', username:'dave',
      password: bcrypt.hashSync('1234', 10),
      role:'agent', credit:'Illimité', limiteGain:'Illimité',
      balance:0, actif:true, createdAt: new Date()
    });
    console.log('✅ Agents créés: admin/admin123 | dave/1234');
  }

  // ── PRIMES PAR DÉFAUT ─────────────────────────────────
  const primesCount = await db.primes.count({});
  if (primesCount === 0) {
    const primes = [
      { code:'BOR',  type:'Borlette',  prime:60,    description:'1er chif - 60x' },
      { code:'BOR2', type:'Borlette',  prime:20,    description:'2em chif - 20x' },
      { code:'BOR3', type:'Borlette',  prime:10,    description:'3em chif - 10x' },
      { code:'L3',   type:'Loto3',     prime:500,   description:'Loto 3 - 500x' },
      { code:'MAR',  type:'Mariage',   prime:1000,  description:'Mariage - 1000x' },
      { code:'L4P1', type:'Loto4',     prime:5000,  description:'L4 1er - 5000x' },
      { code:'L4P2', type:'Loto4',     prime:2500,  description:'L4 2em - 2500x' },
      { code:'L4P3', type:'Loto4',     prime:1000,  description:'L4 3em - 1000x' },
      { code:'L5P1', type:'Loto5',     prime:25000, description:'L5 1er - 25000x' },
      { code:'L5P2', type:'Loto5',     prime:12500, description:'L5 2em - 12500x' },
      { code:'L5P3', type:'Loto5',     prime:5000,  description:'L5 3em - 5000x' },
    ];
    for (const p of primes) await db.primes.insert({ ...p, createdAt: new Date() });
    console.log('✅ Primes créées');
  }
}

seed().catch(console.error);
module.exports = db;
