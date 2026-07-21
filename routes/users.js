const express  = require('express')
const bcrypt   = require('bcryptjs')
const pool     = require('../db')
const { requireAuth, requireRole, NON_MULTIMONITOR } = require('../middleware/auth')

const router = express.Router()

router.get('/api/users', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, phone, is_active, is_deleted, created_at, last_login FROM users ORDER BY created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/api/users/active', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE is_active=true AND is_deleted=false ORDER BY created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/api/users/list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, phone, is_active FROM users WHERE is_deleted=false ORDER BY created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/users/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { username, email, role } = req.body
  try {
    await pool.query(
      `UPDATE users SET username=$1, email=$2, role=$3 WHERE id=$4`,
      [username, email, role, req.params.id])
    res.json({ success: true, message: '사용자 정보 수정 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/users/:id/deactivate', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '사용자 비활성화 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/users/:id/activate', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_active=true WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '사용자 활성화 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/api/users/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_deleted=true, is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '사용자 삭제 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/users/:id/edit', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { username, email, role, phone = '' } = req.body
  try {
    await pool.query(
      `UPDATE users SET username=$1, email=$2, role=$3, phone=$4 WHERE id=$5`,
      [username, email, role, phone, req.params.id])
    res.json({ success: true, message: '사용자 정보 수정 완료' })
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: '이미 존재하는 username 또는 email' })
    res.status(500).json({ error: err.message })
  }
})

router.patch('/api/users/:id/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' })
  // 본인 비밀번호만 변경 가능
  if (String(req.user.id) !== String(req.params.id))
    return res.status(403).json({ error: '본인 비밀번호만 변경할 수 있습니다.' })
  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' })
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
    if (!valid) return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' })
    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, req.params.id])
    res.json({ success: true, message: '비밀번호가 변경되었습니다.' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
