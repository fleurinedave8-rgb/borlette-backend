const jwt = require('jsonwebtoken');

// ⚠️ KRITIK: JWT_SECRET dwe nan Railway env vars
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET manke nan env vars — itilize valè defòlt stab. Ajoute JWT_SECRET nan Railway!');
}
// ENPÒTAN: Sèvi yon valè STAB (pa random) pou token yo ret valid apre redémarrage
const SECRET = JWT_SECRET || 'laprobite_2026_xK9mN7qR4_STABLE_DEFAULT';

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token manke — konekte ou' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesyon ekspire — rekonnekte', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ message: 'Token invalide', code: 'TOKEN_INVALID' });
  }
};

module.exports.SECRET = SECRET;
