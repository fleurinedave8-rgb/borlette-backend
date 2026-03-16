/**
 * database.js — MongoDB Atlas (done pèmanan)
 * Menm API ke NeDB: find, findOne, insert, update, remove, count
 * Pa gen chanjman nan lòt fichye yo
 */
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || null;

// ── WRAPPER — imite API NeDB pou MongoDB ────────────────────
function createCollection(db, name) {
  const col = db.collection(name);

  return {
    // find — retounen array
    find: (query = {}, opts = {}) => ({
      sort: (sortObj) => ({
        then: async (resolve, reject) => {
          try {
            const mQuery = convertQuery(query);
            let cursor = col.find(mQuery);
            if (sortObj) cursor = cursor.sort(sortObj);
            resolve(await cursor.toArray());
          } catch(e) { reject(e); }
        },
        // Si pa gen .sort().then() — retounen promise
        [Symbol.toStringTag]: 'Promise',
      }),
      // Dirèk kòm promise
      then: async (resolve, reject) => {
        try {
          const mQuery = convertQuery(query);
          let cursor = col.find(mQuery);
          resolve(await cursor.toArray());
        } catch(e) { reject(e); }
      },
      [Symbol.toStringTag]: 'Promise',
    }),

    // find retounen promise dirèk (pa chained)
    async find(query = {}) {
      const mQuery = convertQuery(query);
      return col.find(mQuery).toArray();
    },

    async findOne(query = {}) {
      const mQuery = convertQuery(query);
      const doc = await col.findOne(mQuery);
      return doc ? mongoToNedb(doc) : null;
    },

    async insert(data) {
      const doc = { ...data, createdAt: data.createdAt || new Date() };
      const r = await col.insertOne(doc);
      return { ...doc, _id: r.insertedId.toString() };
    },

    async update(query, update, opts = {}) {
      const mQuery = convertQuery(query);
      const mUpdate = convertUpdate(update);
      if (opts.upsert) {
        await col.updateOne(mQuery, mUpdate, { upsert: true });
      } else if (opts.multi) {
        await col.updateMany(mQuery, mUpdate);
      } else {
        await col.updateOne(mQuery, mUpdate);
      }
      return 1;
    },

    async remove(query, opts = {}) {
      const mQuery = convertQuery(query);
      if (opts.multi) await col.deleteMany(mQuery);
      else await col.deleteOne(mQuery);
      return 1;
    },

    async count(query = {}) {
      const mQuery = convertQuery(query);
      return col.countDocuments(mQuery);
    },
  };
}

// Konvèti query NeDB → MongoDB (_id string → ObjectId)
function convertQuery(q) {
  if (!q || typeof q !== 'object') return q;
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (k === '_id' && typeof v === 'string') {
      try { out._id = new ObjectId(v); } catch { out._id = v; }
    } else if (k === '$or' && Array.isArray(v)) {
      out.$or = v.map(convertQuery);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Konvèti update NeDB → MongoDB
function convertUpdate(u) {
  if (u.$set || u.$inc || u.$push || u.$pull) return u;
  return { $set: u };
}

// Konvèti _id ObjectId → string
function mongoToNedb(doc) {
  if (!doc) return null;
  return { ...doc, _id: doc._id?.toString() || doc._id };
}

// ── DATABASE SETUP ──────────────────────────────────────────
let dbInstance = null;
const db = {};

async function connectMongo() {
  if (!MONGO_URI) throw new Error('MONGODB_URI pa defini');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log('✅ MongoDB Atlas konekte!');
  dbInstance = client.db('borlette');

  const COLLECTIONS = [
    'agents','tirages','fiches','rows','resultats','pos',
    'primes','limites','boules','paiements','config',
    'logs','transactions','succursales','doleances','settings'
  ];

  for (const name of COLLECTIONS) {
    db[name] = createCollection(dbInstance, name);
  }

  await seed();
  return db;
}

// ── SEED DONE DEFÒLT ────────────────────────────────────────
async function seed() {
  try {
    const superadmin = await db.agents.findOne({ username: 'superadmin' });
    if (!superadmin) {
      await db.agents.insert({
        nom:'Super', prenom:'Admin', username:'superadmin',
        password: bcrypt.hashSync('super2026!', 10),
        role:'superadmin', actif:true, balance:0,
        credit:'Illimité', limiteGain:'Illimité', createdAt:new Date(),
      });
      console.log('✅ SuperAdmin kreye');
    }

    const admin = await db.agents.findOne({ username: 'admin' });
    if (!admin) {
      await db.agents.insert({
        nom:'Admin', prenom:'LA-PROBITE', username:'admin',
        password: bcrypt.hashSync('admin123', 10),
        role:'admin', actif:true, balance:0,
        credit:'Illimité', limiteGain:'Illimité', createdAt:new Date(),
      });
      console.log('✅ Admin kreye');
    }

    const tiragesCount = await db.tirages.count({});
    if (tiragesCount === 0) {
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
      for (const t of tirages) await db.tirages.insert({ ...t, createdAt:new Date() });
      console.log('✅ Tirages kreye');
    }

    const primesCount = await db.primes.count({});
    if (primesCount === 0) {
      const primes = [
        { code:'20',  type:'P0',  cat:'general', label:'Borlette',         prime:'50|20|10', prime1:50,    prime2:20, prime3:10  },
        { code:'30',  type:'P1',  cat:'general', label:'Loto 3',           prime:'500',      prime1:500,   prime2:0,  prime3:0   },
        { code:'40',  type:'MAR', cat:'general', label:'Mariage',          prime:'1000',     prime1:1000,  prime2:0,  prime3:0   },
        { code:'41',  type:'L41', cat:'general', label:'L401',             prime:'5000',     prime1:5000,  prime2:0,  prime3:0   },
        { code:'42',  type:'L42', cat:'general', label:'L402',             prime:'5000',     prime1:5000,  prime2:0,  prime3:0   },
        { code:'43',  type:'L43', cat:'general', label:'L403',             prime:'5000',     prime1:5000,  prime2:0,  prime3:0   },
        { code:'51',  type:'L51', cat:'general', label:'L501',             prime:'25000',    prime1:25000, prime2:0,  prime3:0   },
        { code:'52',  type:'L52', cat:'general', label:'L502',             prime:'25000',    prime1:25000, prime2:0,  prime3:0   },
        { code:'53',  type:'L53', cat:'general', label:'L503',             prime:'25000',    prime1:25000, prime2:0,  prime3:0   },
        { code:'44',  type:'MG',  cat:'general', label:'Mariage Gratuit',  prime:'3000',     prime1:3000,  prime2:0,  prime3:0   },
        { code:'105', type:'TF1', cat:'general', label:'Tet fich loto3 dwat', prime:'500',   prime1:500,   prime2:0,  prime3:0   },
        { code:'106', type:'TF2', cat:'general', label:'Tet fich mariaj dwat',prime:'500',   prime1:500,   prime2:0,  prime3:0   },
        { code:'107', type:'TF3', cat:'general', label:'Tet fich loto3 gauch',prime:'500',   prime1:500,   prime2:0,  prime3:0   },
        { code:'108', type:'TF4', cat:'general', label:'Tet fich mariaj gauch',prime:'500',  prime1:500,   prime2:0,  prime3:0   },
      ];
      for (const p of primes) await db.primes.insert(p);
      console.log('✅ Primes kreye');
    }
  } catch(err) { console.error('Seed error:', err.message); }
}

module.exports = { db, connectMongo };
