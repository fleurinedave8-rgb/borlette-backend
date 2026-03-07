// auditLog.js — Middleware traçabilité automatique
const db = require('../database');

const ACTION_MAP = {
  'POST /api/auth/login':          'Koneksyon',
  'POST /api/fiches':              'Kreye Fich',
  'DELETE /api/fiches':            'Elimine Fich',
  'POST /api/admin/agents':        'Ajoute Ajan',
  'DELETE /api/admin/agents':      'Efase Ajan',
  'POST /api/admin/resultats':     'Antre Rezilta',
  'PUT /api/admin/tete-fiche':     'Modifye Tête Fiche',
  'POST /api/admin/boules-bloquees': 'Bloke Boule',
  'DELETE /api/admin/boules-bloquees': 'Debloke Boule',
  'POST /api/admin/paiement':      'Paiement',
  'POST /api/admin/prepaye':       'Pre-Paye',
  'PUT /api/admin/primes':         'Modifye Prime',
  'POST /api/admin/tirages':       'Ajoute Tiraj',
  'PUT /api/admin/tirages':        'Modifye Tiraj',
};

async function auditLog(req, res, next) {
  const origJson = res.json.bind(res);
  const startTime = Date.now();

  res.json = function(data) {
    // Log sèlman si aksyon enpòtan + metòd modifikasyon
    const key = `${req.method} ${req.route?.path ? req.baseUrl + req.route.path : req.originalUrl.split('?')[0]}`;
    const action = ACTION_MAP[`${req.method} ${req.originalUrl.split('?')[0]}`] ||
                   (req.method !== 'GET' ? `${req.method} ${req.originalUrl.split('?')[0]}` : null);

    if (action && req.user) {
      const log = {
        userId:    req.user.id || req.user._id,
        username:  req.user.username,
        role:      req.user.role,
        action:    action,
        methode:   req.method,
        route:     req.originalUrl,
        ip:        req.ip || req.connection?.remoteAddress || '—',
        statut:    res.statusCode < 400 ? 'success' : 'error',
        duree:     `${Date.now() - startTime}ms`,
        createdAt: new Date(),
        body:      req.method !== 'GET' ? sanitizeBody(req.body) : undefined,
      };
      db.logs.insert(log).catch(() => {});
    }
    return origJson(data);
  };
  next();
}

function sanitizeBody(body) {
  if (!body) return {};
  const safe = { ...body };
  delete safe.password;
  delete safe.token;
  return safe;
}

module.exports = auditLog;
