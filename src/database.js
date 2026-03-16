require('dotenv').config();
const path    = require('path');
const bcrypt  = require('bcryptjs');

// ── DETEKSYON: MongoDB oswa NeDB ─────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || null;

let db = {};
let connectMongo = async () => {};

if (MONGO_URI) {
  // ════ MONGODB ATLAS ═══════════════════════════════════════
  const { MongoClient, ObjectId } = require('mongodb');

  function makeCol(col) {
    return {
      async find(q={})        { return col.find(conv(q)).toArray().then(ds=>ds.map(m2n)); },
      async findOne(q={})     { const d=await col.findOne(conv(q)); return d?m2n(d):null; },
      async insert(data)      { const r=await col.insertOne({...data,createdAt:data.createdAt||new Date()}); return m2n({...data,_id:r.insertedId}); },
      async update(q,u,o={})  { const mq=conv(q),mu=u.$set||u.$inc?u:{$set:u}; if(o.upsert)await col.updateOne(mq,mu,{upsert:true}); else if(o.multi)await col.updateMany(mq,mu); else await col.updateOne(mq,mu); return 1; },
      async remove(q,o={})    { const mq=conv(q); if(o.multi)await col.deleteMany(mq); else await col.deleteOne(mq); return 1; },
      async count(q={})       { return col.countDocuments(conv(q)); },
    };
  }

  function conv(q) {
    if (!q||typeof q!=='object') return q||{};
    const o={};
    for(const[k,v]of Object.entries(q)){
      if(k==='_id'&&typeof v==='string'&&v.length===24){try{o._id=new ObjectId(v);continue;}catch{}}
      if(k==='$or'&&Array.isArray(v)){o.$or=v.map(conv);continue;}
      o[k]=v;
    }
    return o;
  }
  function m2n(d){return d?{...d,_id:d._id?.toString?.()??d._id}:null;}

  const COLS=['agents','tirages','fiches','rows','resultats','pos','primes',
    'limites','boules','paiements','config','logs','transactions',
    'succursales','doleances','settings'];

  connectMongo = async () => {
    const client = new MongoClient(MONGO_URI,{serverSelectionTimeoutMS:10000});
    await client.connect();
    const mdb = client.db('borlette');
    console.log('✅ MongoDB Atlas konekte!');
    COLS.forEach(n => { db[n] = makeCol(mdb.collection(n)); });
    await seed();
  };

} else {
  // ════ NEDB (lokàl / Railway san MongoDB) ══════════════════
  const Datastore = require('nedb-promises');
  const DATA_DIR  = process.env.NODE_ENV==='production' ? '/tmp/borlette-data' : './data';
  require('fs').mkdirSync(DATA_DIR,{recursive:true});

  const COLS = ['agents','tirages','fiches','rows','resultats','pos','primes',
    'limites','boules','paiements','config','logs','transactions',
    'succursales','doleances','settings'];

  COLS.forEach(n => {
    db[n] = Datastore.create({filename:path.join(DATA_DIR,n+'.db'),autoload:true});
  });

  connectMongo = async () => {
    console.log('⚠️  MongoDB URI pa defini — itilizasyon NeDB (done nan /tmp)');
    await seed();
  };
}

// ── SEED ─────────────────────────────────────────────────────
async function seed() {
  try {
    if (!await db.agents.findOne({username:'superadmin'})) {
      await db.agents.insert({
        nom:'Super',prenom:'Admin',username:'superadmin',
        password:bcrypt.hashSync('super2026!',10),
        role:'superadmin',actif:true,balance:0,
        credit:'Illimité',limiteGain:'Illimité',createdAt:new Date(),
      });
      console.log('✅ SuperAdmin kreye: superadmin/super2026!');
    }
    if (!await db.agents.findOne({username:'admin'})) {
      await db.agents.insert({
        nom:'Admin',prenom:'LA-PROBITE',username:'admin',
        password:bcrypt.hashSync('admin123',10),
        role:'admin',actif:true,balance:0,
        credit:'Illimité',limiteGain:'Illimité',createdAt:new Date(),
      });
      console.log('✅ Admin kreye: admin/admin123');
    }

    if (await db.tirages.count({})===0) {
      const T=[
        {nom:'Florida matin',  etat:'Florida',  ouverture:'10:00',fermeture:'10:30',actif:true},
        {nom:'Florida soir',   etat:'Florida',  ouverture:'21:00',fermeture:'21:30',actif:true},
        {nom:'New-york matin', etat:'New-York', ouverture:'12:29',fermeture:'12:30',actif:true},
        {nom:'New-york soir',  etat:'New-York', ouverture:'22:30',fermeture:'23:00',actif:true},
        {nom:'Georgia-Matin',  etat:'Georgia',  ouverture:'12:29',fermeture:'12:30',actif:true},
        {nom:'Georgia-Soir',   etat:'Georgia',  ouverture:'18:00',fermeture:'18:30',actif:true},
        {nom:'Ohio matin',     etat:'Ohio',     ouverture:'10:30',fermeture:'11:00',actif:true},
        {nom:'Ohio soir',      etat:'Ohio',     ouverture:'22:00',fermeture:'22:30',actif:true},
        {nom:'Chicago matin',  etat:'Chicago',  ouverture:'09:00',fermeture:'09:30',actif:true},
        {nom:'Chicago soir',   etat:'Chicago',  ouverture:'20:00',fermeture:'20:30',actif:true},
        {nom:'Maryland midi',  etat:'Maryland', ouverture:'13:00',fermeture:'13:30',actif:true},
        {nom:'Maryland soir',  etat:'Maryland', ouverture:'19:00',fermeture:'19:30',actif:true},
        {nom:'Tennessee matin',etat:'Tennessee',ouverture:'11:00',fermeture:'11:30',actif:true},
        {nom:'Tennessee soir', etat:'Tennessee',ouverture:'21:30',fermeture:'22:00',actif:true},
      ];
      for(const t of T) await db.tirages.insert({...t,createdAt:new Date()});
      console.log('✅ Tirages kreye');
    }

    if (await db.primes.count({})===0) {
      const P=[
        {code:'20', cat:'general',type:'P0', label:'Borlette',            prime:'50|20|10',prime1:50, prime2:20,prime3:10},
        {code:'30', cat:'general',type:'P1', label:'Loto 3',              prime:'500',     prime1:500},
        {code:'40', cat:'general',type:'MAR',label:'Mariage',             prime:'1000',    prime1:1000},
        {code:'41', cat:'general',type:'L41',label:'L401',                prime:'5000',    prime1:5000},
        {code:'42', cat:'general',type:'L42',label:'L402',                prime:'5000',    prime1:5000},
        {code:'43', cat:'general',type:'L43',label:'L403',                prime:'5000',    prime1:5000},
        {code:'51', cat:'general',type:'L51',label:'L501',                prime:'25000',   prime1:25000},
        {code:'52', cat:'general',type:'L52',label:'L502',                prime:'25000',   prime1:25000},
        {code:'53', cat:'general',type:'L53',label:'L503',                prime:'25000',   prime1:25000},
        {code:'44', cat:'general',type:'MG', label:'Mariage Gratuit',     prime:'3000',    prime1:3000},
        {code:'105',cat:'general',type:'TF1',label:'Tet fich loto3 dwat', prime:'500',     prime1:500},
        {code:'106',cat:'general',type:'TF2',label:'Tet fich mariaj dwat',prime:'500',     prime1:500},
        {code:'107',cat:'general',type:'TF3',label:'Tet fich loto3 gauch',prime:'500',     prime1:500},
        {code:'108',cat:'general',type:'TF4',label:'Tet fich mariaj gauch',prime:'500',    prime1:500},
        {code:'BP1',cat:'paire',  type:'BP1',label:'Boul Pè',             prime:'10',      prime1:10},
        {code:'BP2',cat:'paire',  type:'BP2',label:'Grappe 3 boul',       prime:'100',     prime1:100},
        {code:'BP3',cat:'paire',  type:'BP3',label:'Grappe 4 boul',       prime:'500',     prime1:500},
        {code:'BP4',cat:'paire',  type:'BP4',label:'Grappe 5 boul',       prime:'2000',    prime1:2000},
      ];
      for(const p of P) await db.primes.insert(p);
      console.log('✅ Primes kreye');
    }
  } catch(e){console.error('Seed error:',e.message);}
}

module.exports = { db, connectMongo };
