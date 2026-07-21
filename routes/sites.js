const express = require('express')
const pool    = require('../db')
const { requireAuth, requireRole, NON_MULTIMONITOR } = require('../middleware/auth')

const router = express.Router()

router.get('/api/sites', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
    const { rows } = await pool.query(`
      SELECT id, site_code, name, location, description, managers,
             (floor_plan_url IS NOT NULL) AS has_floor_plan,
             sensor_positions, latitude, longitude
      FROM sites ORDER BY id`)
    res.json(rows.map(s => ({ ...s, managers: JSON.parse(s.managers || '[]') })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/api/sites', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, location, description, managers, floor_plan_url } = req.body
  if (!name) return res.status(400).json({ error: '현장명 필수' })
  try {
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
    const site_code = 'site-' + Date.now()
    const { rows } = await pool.query(
      `INSERT INTO sites (site_code, name, location, description, managers, floor_plan_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [site_code, name, location || '', description || '', JSON.stringify(managers || []), floor_plan_url || null])
    res.status(201).json({ success: true, site: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/sites/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, location, description, managers, latitude, longitude } = req.body
  try {
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
    await pool.query(
      `UPDATE sites SET name=$1, location=$2, description=$3, managers=$4, latitude=$5, longitude=$6 WHERE id=$7`,
      [name, location, description, JSON.stringify(managers || []), latitude ?? null, longitude ?? null, req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/api/sites/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM sites WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '현장을 찾을 수 없습니다.' })
    // 해당 현장 소속 센서들 미배정 처리
    await pool.query(`UPDATE sensors SET site_id=NULL WHERE site_id=$1`, [req.params.id])
    await pool.query(`DELETE FROM sites WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '현장이 삭제되었습니다.' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/sensors/:id/site', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { site_code } = req.body
  try {
    if (!site_code) {
      // site_code가 없으면 미배정 처리
      await pool.query(`UPDATE sensors SET site_id=NULL WHERE id=$1`, [req.params.id])
      return res.json({ success: true, message: '센서 미배정 처리 완료' })
    }
    const site = await pool.query(`SELECT id FROM sites WHERE site_code=$1`, [site_code])
    if (site.rows.length === 0) return res.status(404).json({ error: '현장을 찾을 수 없습니다' })
    await pool.query(`UPDATE sensors SET site_id=$1 WHERE id=$2`, [site.rows[0].id, req.params.id])
    res.json({ success: true, message: '센서 소속 현장 변경 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
