const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'geomonitor-jwt-secret-2026'

const NON_MULTIMONITOR = ['admin', 'Administrator', 'Manager', 'Operator', 'Monitor']

function requireKey(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.AGENT_API_KEY)
    return res.status(401).json({ error: 'Unauthorized' })
  next()
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' })
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' })
    }
    next()
  }
}

module.exports = { JWT_SECRET, requireAuth, requireRole, requireKey, NON_MULTIMONITOR }
