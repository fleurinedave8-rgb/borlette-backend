const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'borlette-secret-2024';

module.exports = function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token requis' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};
