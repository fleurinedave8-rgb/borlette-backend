/**
 * database.js — NeDB + MongoDB Atlas sipò
 * Si MONGODB_URI defini → itilize MongoDB (done pèmanan)
 * Sinon → itilize NeDB lokal
 */
const path = require('path');
const bcrypt = require('bcryptjs');

let db = {};
let isMongoDb = false;

async function initDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (mongoUri) {
    // ── MONGODB ATLAS ──────────────────────────────────────────
    try {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(mongoUri);
      await client.connect();
      const mdb = client.db('borlette');
      console.log('✅ MongoDB Atlas konekte');
      isMongoDb = true;

      // Wrapper pou MongoDB — menm API ak NeDB
      const makeCol = (colName) => {
        const col = mdb.collection(colName);
        return {
          find: (q={}) => ({
            sort: (s) => ({
              then: (cb) => col.find(q).sort(s).toArray().then(docs => {
                docs.forEach(d => { if(d._id) d._id = String(d._id); });
                return cb(docs);
              }),
              toArray: () => col.find(q).sort(s).toArray().then(docs => {
                docs.forEach(d => { if(d._id) d._id = String(d._id); });
                return docs;
              })
            }),
            then: (cb) => col.find(q).toArray().then(docs => {
              docs.forEach(d => { if(d._id) d._id = String(d._id); });
              return cb(docs);
            }),
            toArray: () => col.find(q).toArray().then(docs => {
              docs.forEach(d => { if(d._id) d._id = String(d._id); });
              return docs;
            })
          }),
          findOne: async (q={}) => {
            const { ObjectId } = require('mongodb');
            if (q._id && typeof q._id === 'string' && q._id.length === 24) {
              try { q._id = new ObjectId(q._id); } catch(e) {}
            }
            const doc = await col.findOne(q);
            if (doc) doc._id = String(doc._id);
            return doc;
          },
          insert: async (doc) => {
            const result = await col.insertOne({...doc, createdAt: doc.createdAt||new Date()});
            return {...doc, _id: String(result.insertedId)};
          },
          update: async (q, update) => {
            const { ObjectId } = require('mongodb');
            if (q._id && typeof q._id === 'string' && q._id.length === 24) {
              try { q._id = new ObjectId(q._id); } catch(e) {}
            }
            await col.updateMany(q, update);
            return 1;
          },
          remove: async (q) => {
            const { ObjectId } = require('mongodb');
            if (q._id && typeof q._id === 'string' && q._id.length === 24) {
              try { q._id = new ObjectId(q._id); } catch(e) {}
            }
            await col.deleteMany(q);
            return 1;
          },
          count: (q={}) => col.countDocuments(q),
          ensureIndex: () => Promise.resolve(),
        };
      };

      db = {
        agents:   makeCol('agents'),
        pos:      makeCol('pos'),
        fiches:   makeCol('fiches'),
        rows:     makeCol('rows'),
        tirages:  makeCol('tirages'),
        primes:   makeCol('primes'),
        boules:   makeCol('boules'),
        resultats:makeCol('resultats'),
        logs:     makeCol('logs'),
        config:   makeCol('config'),
        paiements:makeCol('paiements'),
        licences: makeCol('licences'),
      };

    } catch(err) {
      console.error('❌ MongoDB echwe — itilize NeDB:', err.message);
      await initNeDB();
    }
  } else {
    await initNeDB();
  }

  await seedAdmin();
}

async function initNeDB() {
  const Datastore = require('nedb-promises');
  console.log('📁 NeDB lokal itilize');

  const mkDb = (name) => {
    const store = Datastore.create({
      filename: path.join('/tmp', `borlette_${name}.db`),
      autoload: true,
    });
    return {
      find: (q={}) => ({
        sort: (s) => ({
          then: async (cb) => { const d = await store.find(q).sort(s); return cb(d); },
          toArray: () => store.find(q).sort(s),
        }),
        then: async (cb) => { const d = await store.find(q); return cb(d); },
        toArray: () => store.find(q),
      }),
      findOne: (q={}) => store.findOne(q),
      insert:  (doc)  => store.insert(doc),
      update:  (q,u,opts={}) => store.update(q, u, {multi:true,...opts}),
      remove:  (q,opts={})   => store.remove(q, {multi:true,...opts}),
      count:   (q={}) => store.count(q),
      ensureIndex: (opts) => store.ensureIndex(opts),
    };
  };

  db = {
    agents:   mkDb('agents'),
    pos:      mkDb('pos'),
    fiches:   mkDb('fiches'),
    rows:     mkDb('rows'),
    tirages:  mkDb('tirages'),
    primes:   mkDb('primes'),
    boules:   mkDb('boules'),
    resultats:mkDb('resultats'),
    logs:     mkDb('logs'),
    config:   mkDb('config'),
    paiements:mkDb('paiements'),
    licences: mkDb('licences'),
  };
}

async function seedAdmin() {
  try {
    const existing = await db.agents.findOne({ role: { $in: ['admin','superadmin'] } });
    if (!existing) {
      await db.agents.insert({
        nom: 'Admin', prenom: 'Super',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin', actif: true,
        credit: 'Illimité', balance: 0,
        createdAt: new Date(),
      });
      console.log('✅ Admin kreye: admin/admin123');
    }
  } catch(e) {
    console.error('Seed admin erè:', e.message);
  }
}

const connectMongo = initDatabase; // alias pou kompatibilite
module.exports = { initDatabase, connectMongo, db: new Proxy({}, {
  get: (_, key) => db[key]
}) };
