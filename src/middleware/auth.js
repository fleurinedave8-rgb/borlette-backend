const jwt = require('jsonwebtoken');

// ⚠️ KRITIK: JWT_SECRET dwe nan Railway env vars
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('⚠️  ATENSIYON: JWT_SECRET pa defini nan env vars! Itilize valè defòlt — CHANJE SA NAN PWODUKSYON!');
}
const SECRET = JWT_SECRET || 'laprobite_' + Math.random().toString(36).slice(2) + '_2026';

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
