const path = require('path');
const Datastore = require('nedb-promises');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/tmp/borlette-data' : './data';

require('fs').mkdirSync(DATA_DIR, { recursive: true });

const db = {
  agents:    Datastore.create({ filename: path.join(DATA_DIR, 'agents.db'),    autoload: true }),
  tirages:   Datastore.create({ filename: path.join(DATA_DIR, 'tirages.db'),   autoload: true }),
  fiches:    Datastore.create({ filename: path.join(DATA_DIR, 'fiches.db'),    autoload: true }),
  rows:      Datastore.create({ filename: path.join(DATA_DIR, 'rows.db'),      autoload: true }),
  resultats: Datastore.create({ filename: path.join(DATA_DIR, 'resultats.db'), autoload: true }),
  pos:       Datastore.create({ filename: path.join(DATA_DIR, 'pos.db'),       autoload: true }),
  primes:    Datastore.create({ filename: path.join(DATA_DIR, 'primes.db'),    autoload: true }),
  limites:   Datastore.create({ filename: path.join(DATA_DIR, 'limites.db'),   autoload: true }),
  boules:    Datastore.create({ filename: path.join(DATA_DIR, 'boules.db'),    autoload: true }),
  paiements: Datastore.create({ filename: path.join(DATA_DIR, 'paiements.db'), autoload: true }),
  config:       Datastore.create({ filename: path.join(DATA_DIR, 'config.db'),       autoload: true }),
  logs:         Datastore.create({ filename: path.join(DATA_DIR, 'logs.db'),         autoload: true }),
  transactions: Datastore.create({ filename: path.join(DATA_DIR, 'transactions.db'), autoload: true }),
};

// Seed données par défaut
async function seed() {
  try {
    // Admin
    const admin = await db.agents.findOne({ username: 'admin' });
    if (!admin) {
      await db.agents.insert({
        nom: 'Admin', prenom: 'Super', username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin', actif: true, balance: 0,
        credit: 'Illimité', limiteGain: 'Illimité',
        createdAt: new Date(),
      });
      console.log('✅ Admin créé: admin/admin123');
    }

    // Agent démo
    const dave = await db.agents.findOne({ username: 'dave' });
    if (!dave) {
      await db.agents.insert({
        nom: 'Dave', prenom: 'Agent', username: 'dave',
        password: bcrypt.hashSync('1234', 10),
        role: 'agent', actif: true, balance: 0,
        credit: 'Illimité', limiteGain: 'Illimité',
        createdAt: new Date(),
      });
      console.log('✅ Agent créé: dave/1234');
    }

    // Tirages par défaut
    const tiragesCount = await db.tirages.count({});
    if (tiragesCount === 0) {
      const tirages = [
        { nom:'Florida matin',   etat:'Florida',   ouverture:'10:00', fermeture:'10:30', prime:100, limite:2000, actif:true },
        { nom:'Florida soir',    etat:'Florida',   ouverture:'21:00', fermeture:'21:30', prime:100, limite:2000, actif:true },
        { nom:'New-york matin',  etat:'New-York',  ouverture:'12:29', fermeture:'12:30', prime:100, limite:2000, actif:true },
        { nom:'New-york soir',   etat:'New-York',  ouverture:'22:30', fermeture:'23:00', prime:100, limite:2000, actif:true },
        { nom:'Georgia-Matin',   etat:'Georgia',   ouverture:'12:29', fermeture:'12:30', prime:100, limite:2000, actif:true },
        { nom:'Georgia-Soir',    etat:'Georgia',   ouverture:'18:00', fermeture:'18:30', prime:100, limite:2000, actif:true },
        { nom:'Ohio matin',      etat:'Ohio',      ouverture:'10:30', fermeture:'11:00', prime:100, limite:2000, actif:true },
        { nom:'Ohio soir',       etat:'Ohio',      ouverture:'22:00', fermeture:'22:30', prime:100, limite:2000, actif:true },
        { nom:'Chicago matin',   etat:'Chicago',   ouverture:'09:00', fermeture:'09:30', prime:100, limite:2000, actif:true },
        { nom:'Chicago soir',    etat:'Chicago',   ouverture:'20:00', fermeture:'20:30', prime:100, limite:2000, actif:true },
        { nom:'Maryland midi',   etat:'Maryland',  ouverture:'13:00', fermeture:'13:30', prime:100, limite:2000, actif:true },
        { nom:'Maryland soir',   etat:'Maryland',  ouverture:'19:00', fermeture:'19:30', prime:100, limite:2000, actif:true },
        { nom:'Tennessee matin', etat:'Tennessee', ouverture:'11:00', fermeture:'11:30', prime:100, limite:2000, actif:true },
        { nom:'Tennessee soir',  etat:'Tennessee', ouverture:'21:30', fermeture:'22:00', prime:100, limite:2000, actif:true },
      ];
      for (const t of tirages) await db.tirages.insert({ ...t, createdAt: new Date() });
      console.log('✅ Tirages créés');
    }

    // Primes par défaut
    const primesCount = await db.primes.count({});
    if (primesCount === 0) {
      const primes = [
        { type:'P0',  label:'Borlette', prime1:60,   prime2:20, prime3:10 },
        { type:'P1',  label:'Loto3 P1', prime1:400,  prime2:0,  prime3:0  },
        { type:'P2',  label:'Loto3 P2', prime1:200,  prime2:0,  prime3:0  },
        { type:'P3',  label:'Loto3 P3', prime1:100,  prime2:0,  prime3:0  },
        { type:'MAR', label:'Mariage',  prime1:500,  prime2:0,  prime3:0  },
        { type:'L4',  label:'Loto4',    prime1:3000, prime2:0,  prime3:0  },
      ];
      for (const p of primes) await db.primes.insert(p);
      console.log('✅ Primes créées');
    }

  } catch (err) { console.error('Seed error:', err.message); }
}

seed();
module.exports = db;
