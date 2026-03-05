# 🎰 LA-PROBITE-BORLETTE — Système Complet

## Architecture
```
┌─────────────────────────────────────────────────┐
│  borlette-backend/  ← API Node.js (port 5000)   │
│  borlette-web/      ← Dashboard Next.js (3000)  │
│  borlette-pos/      ← App Android Expo           │
└─────────────────────────────────────────────────┘
```

## 🚀 DÉMARRAGE RAPIDE

### ÉTAPE 1 — Backend API
```powershell
cd borlette-backend
npm install
npm start
# → http://localhost:5000
```
Comptes créés automatiquement:
- Admin: username=`admin`  password=`admin123`
- Agent: username=`dave`   password=`1234`

### ÉTAPE 2 — Page Web (nouveau terminal)
```powershell
cd borlette-web
npm install
npm run dev
# → http://localhost:3000
```
Connectez-vous avec admin/admin123

### ÉTAPE 3 — App POS (Expo Go)
```powershell
cd borlette-pos
npm install
npx expo start --tunnel
# Scanner QR avec Expo Go
```

### ÉTAPE 4 — Connecter POS au Backend
1. Trouvez votre IP Windows:
   ```powershell
   ipconfig
   # → IPv4 Address: 192.168.1.100 (exemple)
   ```
2. Dans l'app POS → **LOAD SERVEUR**
3. Entrez: `http://192.168.1.100:5000`
4. Login: `dave` / `1234`

## 📁 Structure des fichiers

### borlette-backend/
```
src/
  index.js          ← Serveur Express
  database.js       ← NeDB (pas besoin Visual Studio)
  middleware/auth.js ← JWT verification
  routes/
    auth.js         ← POST /api/auth/login
    agent.js        ← GET  /api/agent/info
    tirages.js      ← GET  /api/tirages/disponibles
    fiches.js       ← CRUD /api/fiches
    rapport.js      ← GET  /api/rapport/*
    admin.js        ← GET  /api/admin/* (admin only)
data/               ← Base de données (créé auto)
```

### borlette-web/
```
pages/
  index.js          ← Login
  dashboard.js      ← Dashboard principal
  agents.js         ← Gestion agents
  rapport/          ← Rapports
utils/api.js        ← Connexion au backend
.env.local          ← NEXT_PUBLIC_API_URL=http://localhost:5000
```

### borlette-pos/
```
src/
  screens/
    LoginScreen.js      ← Connexion
    ServerScreen.js     ← Choix serveur
    HomeScreen.js       ← Accueil
    NouvellFichScreen.js ← Créer fiche
    ChacheFichScreen.js  ← Chercher fiche
    FichMwenYoScreen.js  ← Mes fiches
    RapoScreen.js        ← Rapports
    TicketScreen.js      ← Ticket 50mm
    PrinterScreen.js     ← Config Bluetooth
  utils/
    api.js              ← Connexion backend
    printer.js          ← Impression Bluetooth 50mm
    deviceId.js         ← ID unique appareil
```

## 🔑 Routes API Complètes

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | /api/auth/login | Non | Connexion |
| GET | /api/agent/info | Agent | Info agent |
| GET | /api/tirages/disponibles | Agent | Tirages actifs |
| POST | /api/fiches | Agent | Créer fiche |
| GET | /api/fiches/:ticket | Agent | Chercher ticket |
| GET | /api/fiches/mes-fiches | Agent | Mes fiches |
| DELETE | /api/fiches/:ticket | Agent | Éliminer |
| GET | /api/rapport/partiel | Agent | Rapport |
| GET | /api/admin/stats | Admin | Statistiques |
| GET | /api/admin/agents | Admin | Liste agents |
| POST | /api/admin/agents | Admin | Créer agent |
| PUT | /api/admin/agents/:id | Admin | Modifier agent |

## 🖨 Impression Bluetooth 50mm
- Format: 50mm (32 chars/ligne)
- Dans l'app: Ticket → ⚙️ Konfigire Imprimant
- Imprimantes compatibles: GOOJPRT, Rongta, Xprinter

## 🌐 Mise en Production (VPS)
```bash
# Backend sur VPS
npm install -g pm2
pm2 start src/index.js --name borlette-api
pm2 save

# Web sur Vercel (gratuit)
npx vercel --prod
# Ajouter variable: NEXT_PUBLIC_API_URL=https://votre-vps.com
```
