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
  agents:    mkDb('agents'),
  pos:       mkDb('pos'),
  fiches:    mkDb('fiches'),
  rows:      mkDb('rows'),
  tirages:   mkDb('tirages'),
  primes:    mkDb('primes'),
  boules:    mkDb('boules'),
  resultats: mkDb('resultats'),
  logs:      mkDb('logs'),
  config:    mkDb('config'),
  paiements: mkDb('paiements'),
  licences:  mkDb('licences'),
};

async function connectMongo() {
  // Kreye admin si pa egziste
  try {
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
  } catch(e) {
    console.error('Seed erè:', e.message);
  }
  console.log('✅ NeDB lokal prèt');
}

module.exports = { db, connectMongo };
