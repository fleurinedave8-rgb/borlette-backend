/**
 * database.js — MongoDB Atlas wrapper
 * db objè a toujou disponib — koleksyon yo chaje apre connectMongo()
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || null;

// ── WRAPPER — imite API NeDB ─────────────────────────────────
function makeCol(col) {
  return {
    async find(query = {}) {
      return col.find(convertQuery(query)).toArray()
        .then(docs => docs.map(mongoToNedb));
    },
    async findOne(query = {}) {
      const doc = await col.findOne(convertQuery(query));
      return doc ? mongoToNedb(doc) : null;
    },
    async insert(data) {
      const doc = { ...data, createdAt: data.createdAt || new Date() };
      const r = await col.insertOne(doc);
      return mongoToNedb({ ...doc, _id: r.insertedId });
    },
    async update(query, update, opts = {}) {
      const mq = convertQuery(query);
      const mu = update.$set || update.$inc || update.$push
        ? update : { $set: update };
      if (opts.upsert) await col.updateOne(mq, mu, { upsert: true });
      else if (opts.multi) await col.updateMany(mq, mu);
      else await col.updateOne(mq, mu);
      return 1;
    },
    async remove(query, opts = {}) {
      const mq = convertQuery(query);
      if (opts.multi) await col.deleteMany(mq);
      else await col.deleteOne(mq);
      return 1;
    },
    async count(query = {}) {
      return col.countDocuments(convertQuery(query));
    },
    sort(query, sortObj) {
      return {
        async then(resolve, reject) {
          try {
            const docs = await col.find(convertQuery(query))
              .sort(sortObj).toArray();
            resolve(docs.map(mongoToNedb));
          } catch(e) { reject(e); }
        }
      };
    }
  };
}

function convertQuery(q) {
  if (!q || typeof q !== 'object') return q || {};
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (k === '_id') {
      if (typeof v === 'string' && v.length === 24) {
        try { out._id = new ObjectId(v); continue; } catch {}
      }
      out._id = v;
    } else if (k === '$or' && Array.isArray(v)) {
      out.$or = v.map(convertQuery);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mongoToNedb(doc) {
  if (!doc) return null;
  return { ...doc, _id: doc._id?.toString?.() || doc._id };
}

// ── DB OBJÈ — toujou disponib ────────────────────────────────
const COLS = [
  'agents','tirages','fiches','rows','resultats','pos',
  'primes','limites','boules','paiements','config',
  'logs','transactions','succursales','doleances','settings'
];

// Kreye proxy pou chak koleksyon — ap tann jiskaske konekte
const db = {};
const _pending = {};

COLS.forEach(name => {
  _pending[name] = null; // sera remplace apre koneksyon
  db[name] = new Proxy({}, {
    get(_, method) {
      return (...args) => {
        if (!_pending[name]) {
          return Promise.reject(
            new Error(`Database pa konekte toujou. Tann yon moman.`)
          );
        }
        return _pending[name][method](...args);
      };
    }
  });
});

// ── KONEKSYON ────────────────────────────────────────────────
async function connectMongo() {
  if (!MONGO_URI) {
    throw new Error(
      'MONGODB_URI pa defini nan variables Railway.\n' +
      'Ale sou Railway → Variables → Ajoute MONGODB_URI'
    );
  }

  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  const mdb = client.db('borlette');
  console.log('✅ MongoDB Atlas konekte!');

  // Aktive chak koleksyon
  COLS.forEach(name => {
    _pending[name] = makeCol(mdb.collection(name));
  });

  await seed();
  return db;
}

// ── SEED ─────────────────────────────────────────────────────
async function seed() {
  try {
    if (!await db.agents.findOne({ username: 'superadmin' })) {
      await db.agents.insert({
        nom:'Super', prenom:'Admin', username:'superadmin',
        password: bcrypt.hashSync('super2026!', 10),
        role:'superadmin', actif:true, balance:0,
        credit:'Illimité', limiteGain:'Illimité',
      });
      console.log('✅ SuperAdmin kreye');
    }
    if (!await db.agents.findOne({ username: 'admin' })) {
      await db.agents.insert({
        nom:'Admin', prenom:'LA-PROBITE', username:'admin',
        password: bcrypt.hashSync('admin123', 10),
        role:'admin', actif:true, balance:0,
        credit:'Illimité', limiteGain:'Illimité',
      });
      console.log('✅ Admin kreye');
    }

    if (await db.tirages.count({}) === 0) {
      const tirages = [
        { nom:'Florida matin',   etat:'Florida',   ouverture:'10:00', fermeture:'10:30', actif:true },
        { nom:'Florida soir',    etat:'Florida',   ouverture:'21:00', fermeture:'21:30', actif:true },
        { nom:'New-york matin',  etat:'New-York',  ouverture:'12:29', fermeture:'12:30', actif:true },
        { nom:'New-york soir',   etat:'New-York',  ouverture:'22:30', fermeture:'23:00', actif:true },
        { nom:'Georgia-Matin',   etat:'Georgia',   ouverture:'12:29', fermeture:'12:30', actif:true },
        { nom:'Georgia-Soir',    etat:'Georgia',   ouverture:'18:00', fermeture:'18:30', actif:true },
        { nom:'Ohio matin',      etat:'Ohio',      ouverture:'10:30', fermeture:'11:00', actif:true },
        { nom:'Ohio soir',       etat:'Ohio',      ouverture:'22:00', fermeture:'22:30', actif:true },
        { nom:'Chicago matin',   etat:'Chicago',   ouverture:'09:00', fermeture:'09:30', actif:true },
        { nom:'Chicago soir',    etat:'Chicago',   ouverture:'20:00', fermeture:'20:30', actif:true },
        { nom:'Maryland midi',   etat:'Maryland',  ouverture:'13:00', fermeture:'13:30', actif:true },
        { nom:'Maryland soir',   etat:'Maryland',  ouverture:'19:00', fermeture:'19:30', actif:true },
        { nom:'Tennessee matin', etat:'Tennessee', ouverture:'11:00', fermeture:'11:30', actif:true },
        { nom:'Tennessee soir',  etat:'Tennessee', ouverture:'21:30', fermeture:'22:00', actif:true },
      ];
      for (const t of tirages) await db.tirages.insert(t);
      console.log('✅ Tirages kreye');
    }

    if (await db.primes.count({}) === 0) {
      const primes = [
        { code:'20',  cat:'general', type:'P0',  label:'Borlette',             prime:'50|20|10', prime1:50,    prime2:20, prime3:10 },
        { code:'30',  cat:'general', type:'P1',  label:'Loto 3',               prime:'500',      prime1:500  },
        { code:'40',  cat:'general', type:'MAR', label:'Mariage',              prime:'1000',     prime1:1000 },
        { code:'41',  cat:'general', type:'L41', label:'L401',                 prime:'5000',     prime1:5000 },
        { code:'42',  cat:'general', type:'L42', label:'L402',                 prime:'5000',     prime1:5000 },
        { code:'43',  cat:'general', type:'L43', label:'L403',                 prime:'5000',     prime1:5000 },
        { code:'51',  cat:'general', type:'L51', label:'L501',                 prime:'25000',    prime1:25000 },
        { code:'52',  cat:'general', type:'L52', label:'L502',                 prime:'25000',    prime1:25000 },
        { code:'53',  cat:'general', type:'L53', label:'L503',                 prime:'25000',    prime1:25000 },
        { code:'44',  cat:'general', type:'MG',  label:'Mariage Gratuit',      prime:'3000',     prime1:3000 },
        { code:'105', cat:'general', type:'TF1', label:'Tet fich loto3 dwat',  prime:'500',      prime1:500  },
        { code:'106', cat:'general', type:'TF2', label:'Tet fich mariaj dwat', prime:'500',      prime1:500  },
        { code:'107', cat:'general', type:'TF3', label:'Tet fich loto3 gauch', prime:'500',      prime1:500  },
        { code:'108', cat:'general', type:'TF4', label:'Tet fich mariaj gauch',prime:'500',      prime1:500  },
        { code:'BP1', cat:'paire',   type:'BP1', label:'Boul Pè',              prime:'10',       prime1:10   },
        { code:'BP2', cat:'paire',   type:'BP2', label:'Grappe 3 boul',        prime:'100',      prime1:100  },
        { code:'BP3', cat:'paire',   type:'BP3', label:'Grappe 4 boul',        prime:'500',      prime1:500  },
        { code:'BP4', cat:'paire',   type:'BP4', label:'Grappe 5 boul',        prime:'2000',     prime1:2000 },
      ];
      for (const p of primes) await db.primes.insert(p);
      console.log('✅ Primes kreye');
    }
  } catch(e) { console.error('Seed error:', e.message); }
}

module.exports = { db, connectMongo };
