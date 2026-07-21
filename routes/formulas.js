const express = require('express')
const pool    = require('../db')
const { requireAuth, requireRole, NON_MULTIMONITOR } = require('../middleware/auth')

const router = express.Router()

// 계산식 목록 조회 (전체 공개)
router.get('/api/formulas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM formulas WHERE is_active=true ORDER BY id`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 계산식 추가 (관리자만)
router.post('/api/formulas', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, expression, description } = req.body
  if (!name || !expression) return res.status(400).json({ error: '이름과 계산식은 필수입니다.' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO formulas (name, expression, description) VALUES ($1,$2,$3) RETURNING *`,
      [name, expression, description || ''])
    res.status(201).json({ success: true, formula: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 계산식 수정 (관리자만)
router.patch('/api/formulas/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, expression, description } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE formulas SET name=$1, expression=$2, description=$3 WHERE id=$4 RETURNING *`,
      [name, expression, description, req.params.id])
    res.json({ success: true, formula: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 계산식 삭제 (관리자만)
router.delete('/api/formulas/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE formulas SET is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
