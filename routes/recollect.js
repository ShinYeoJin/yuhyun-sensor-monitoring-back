const express = require('express')
const pool    = require('../db')
const { requireAuth, requireRole, requireKey, NON_MULTIMONITOR } = require('../middleware/auth')

const router = express.Router()

// 에이전트가 주기적으로 폴링해서 pending 요청을 가져감
router.get('/api/recollect/pending', requireKey, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM recollect_requests WHERE status='pending' ORDER BY created_at ASC LIMIT 10`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 에이전트가 처리 완료 후 상태 업데이트
router.patch('/api/recollect/:id/done', requireKey, async (req, res) => {
  const { result } = req.body  // 'success' | 'error: ...'
  try {
    await pool.query(
      `UPDATE recollect_requests SET status='done', result=$1, done_at=NOW() WHERE id=$2`,
      [result || 'success', req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 관리자 웹에서 재수집 요청 생성
router.post('/api/recollect', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { sensor_id, date_from, date_to, reason } = req.body
  if (!sensor_id) return res.status(400).json({ error: 'sensor_id 필수' })
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recollect_requests (
        id SERIAL PRIMARY KEY,
        sensor_id INT NOT NULL,
        date_from DATE,
        date_to DATE,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        result TEXT,
        requested_by INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        done_at TIMESTAMPTZ
      )
    `)
    const { rows } = await pool.query(
      `INSERT INTO recollect_requests (sensor_id, date_from, date_to, reason, requested_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [sensor_id, date_from || null, date_to || null, reason || '', req.user.id])
    res.status(201).json({ success: true, request: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 재수집 요청 목록 조회 (관리자)
router.get('/api/recollect', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recollect_requests (
        id SERIAL PRIMARY KEY,
        sensor_id INT NOT NULL,
        date_from DATE,
        date_to DATE,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        result TEXT,
        requested_by INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        done_at TIMESTAMPTZ
      )
    `)
    const { rows } = await pool.query(`
      SELECT r.*, s.name AS sensor_name, s.sensor_code, s.manage_no, u.username AS requested_by_name
      FROM recollect_requests r
      JOIN sensors s ON r.sensor_id = s.id
      LEFT JOIN users u ON r.requested_by = u.id
      ORDER BY r.created_at DESC LIMIT 100`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 재수집 요청 취소/삭제
router.delete('/api/recollect/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`DELETE FROM recollect_requests WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
