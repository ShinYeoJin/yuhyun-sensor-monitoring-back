const express = require('express')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const pool    = require('../db')
const { JWT_SECRET, requireAuth } = require('../middleware/auth')

const router = express.Router()

router.post('/api/auth/register', async (req, res) => {
  const { username, email, password, phone = '' } = req.body
  const role = 'MultiMonitor'
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email, password 필수' })
  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, email, role, phone`,
      [username, email, hash, role, phone])
    res.status(201).json({ success: true, user: rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '이미 존재하는 username 또는 email' })
    res.status(500).json({ error: err.message })
  }
})

router.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ error: 'email, password 필수' })
  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE email=$1 AND is_deleted=false`, [email])
    if (rows.length === 0) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' })
    const user = rows[0]
    if (!user.is_active) return res.status(401).json({ error: '비활성화된 계정입니다' })
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' })
    await pool.query(`UPDATE users SET last_login=NOW() WHERE id=$1`, [user.id])
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET, { expiresIn: '24h' })
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/auth/logout', requireAuth, (req, res) => {
  res.json({ success: true, message: '로그아웃 완료' })
})

router.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE id=$1`, [req.user.id])
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
