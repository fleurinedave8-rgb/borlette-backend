# 🚀 Guide de Déploiement — LA-PROBITE-BORLETTE Backend

## Option 1 : Railway (RECOMMANDÉ — Gratuit)

### Étapes :
1. Créer un compte sur https://railway.app
2. Cliquer **"New Project"** → **"Deploy from GitHub repo"**
3. Connecter votre compte GitHub
4. Uploader le dossier `borlette-backend` sur GitHub
5. Railway détecte automatiquement Node.js et démarre

### Variables d'environnement à configurer sur Railway :
```
JWT_SECRET=laprobite2026secretkey
NODE_ENV=production
PORT=5000
```

### URL finale exemple :
```
https://borlette-backend-production.up.railway.app
```

---

## Option 2 : Render (Gratuit)

1. Créer compte sur https://render.com
2. New → Web Service → connecter GitHub
3. Build Command: `npm install`
4. Start Command: `node src/index.js`
5. Ajouter les variables d'environnement

---

## Option 3 : VPS (Serveur privé)

### Installation sur Ubuntu/Debian :
```bash
# Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cloner le projet
git clone <votre-repo> borlette-backend
cd borlette-backend
npm install

# Configurer environnement
cp .env.example .env
nano .env  # Modifier JWT_SECRET

# Démarrer avec PM2 (daemon)
npm install -g pm2
pm2 start src/index.js --name borlette-api
pm2 startup
pm2 save
```

### Nginx (optionnel - port 80) :
```nginx
server {
    listen 80;
    server_name votre-domaine.com;
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## Après déploiement

### Configurer l'application Web (Next.js)
Modifier `.env.local` :
```
NEXT_PUBLIC_API_URL=https://votre-url-backend.railway.app
```

### Configurer l'application POS
Dans l'app POS → **LOAD SERVEUR** :
- URL: `https://votre-url-backend.railway.app`
- Nom: `LAPROBITE CENTRAL`

### Comptes par défaut :
| Utilisateur | Mot de passe | Rôle  |
|-------------|-------------|-------|
| admin       | admin123    | Admin |
| dave        | 1234        | Agent |

⚠️ **Changer les mots de passe après le premier login !**

---

## Endpoints API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET  | /api/health | Vérifier si le serveur fonctionne |
| POST | /api/auth/login | Connexion |
| GET  | /api/tirages/disponibles | Liste tirages actifs |
| POST | /api/fiches | Créer une fiche |
| GET  | /api/fiches/:ticket | Chercher une fiche |
| GET  | /api/admin/stats | Statistiques |
| GET  | /api/admin/agents | Liste agents |
| GET  | /api/rapport/partiel | Rapport partiel |
