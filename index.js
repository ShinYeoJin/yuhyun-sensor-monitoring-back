require('dotenv').config()
const express  = require('express')
const cors     = require('cors')
const { Pool } = require('pg')

const app = express()
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

app.use(cors({
  origin: [process.env.FRONTEND_URL || '*', 'http://localhost:3000'],
}))
app.use(express.json({ limit: '20mb' }))

function requireKey(req, res, next) {
  if (req.headers['x-api-key'] !== process.env.AGENT_API_KEY)
    return res.status(401).json({ error: 'Unauthorized' })
  next()
}

function evalStatus(value, sensor) {
  const dMin = sensor.threshold_danger_min
  const nMax = sensor.threshold_normal_max
  if (dMin !== null && value >= Number(dMin)) return 'danger'
  if (nMax !== null && value >  Number(nMax)) return 'warning'
  return 'normal'
}

async function maybeCreateAlarm(client, sensor, status, value) {
  if (status === 'normal' || status === 'offline') return
  const dup = await client.query(
    `SELECT id FROM alarm_events WHERE sensor_id=$1 AND severity=$2 AND is_acknowledged=false LIMIT 1`,
    [sensor.id, status]
  )
  if (dup.rows.length > 0) return
  const threshVal = status === 'danger' ? sensor.threshold_danger_min : sensor.threshold_normal_max
  await client.query(
    `INSERT INTO alarm_events (sensor_id, severity, message, triggered_value, threshold_value) VALUES ($1,$2,$3,$4,$5)`,
    [sensor.id, status,
      status === 'danger' ? `위험 임계값(${threshVal}) 초과 — 즉시 점검 필요` : `주의 임계값(${threshVal}) 도달 — 모니터링 강화 필요`,
      value, threshVal]
  )
}

app.post('/api/ingest', requireKey, async (req, res) => {
  const { sensorCode, measurements, rawFile } = req.body
  if (!sensorCode || !Array.isArray(measurements) || measurements.length === 0)
    return res.status(400).json({ error: 'sensorCode and measurements required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM sensors WHERE sensor_code=$1 AND is_active=true', [sensorCode])
    if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: `Sensor not found: ${sensorCode}` }) }
    const sensor = rows[0]
    let inserted = 0
    for (const m of measurements) {
      const r = await client.query(
        `INSERT INTO measurements (sensor_id, measured_at, value, depth_label, raw_file) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sensor_id, measured_at, depth_label) DO NOTHING RETURNING id`,
        [sensor.id, m.measuredAt, m.value, m.depthLabel ?? null, rawFile ?? null]
      )
      if (r.rowCount > 0) inserted++
    }
    if (sensor.sensor_type === 'water_level') {
      const latest = [...measurements].sort((a,b) => a.measuredAt > b.measuredAt ? -1 : 1)[0]
      const status = evalStatus(latest.value, sensor)
      await client.query(
        `INSERT INTO sensor_status (sensor_id, current_value, status, last_measured, updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (sensor_id) DO UPDATE SET current_value=$2, status=$3, last_measured=$4, updated_at=NOW()`,
        [sensor.id, latest.value, status, latest.measuredAt]
      )
      await maybeCreateAlarm(client, sensor, status, latest.value)
    } else {
      const latest = [...measurements].sort((a,b) => a.measuredAt > b.measuredAt ? -1 : 1)[0]
      await client.query(
        `INSERT INTO sensor_status (sensor_id, status, last_measured, updated_at) VALUES ($1,'normal',$2,NOW()) ON CONFLICT (sensor_id) DO UPDATE SET status='normal', last_measured=$2, updated_at=NOW()`,
        [sensor.id, latest.measuredAt]
      )
    }
    await client.query('COMMIT')
    res.json({ success: true, sensorCode, inserted, total: measurements.length })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[ingest error]', err.message)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
})

app.get('/api/sensors', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.sensor_code, s.manage_no, s.name, s.sensor_type, s.unit, s.field,
             s.location_desc, s.install_date, s.threshold_normal_max, s.threshold_warning_max, s.threshold_danger_min,
             ss.current_value, ss.status, ss.last_measured, si.name AS site_name, si.site_code
      FROM sensors s
      LEFT JOIN sensor_status ss ON s.id = ss.sensor_id
      LEFT JOIN sites si ON s.site_id = si.id
      WHERE s.is_active = true ORDER BY s.id`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sensors/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*, ss.current_value, ss.status, ss.last_measured, si.name AS site_name, si.site_code
      FROM sensors s
      LEFT JOIN sensor_status ss ON s.id = ss.sensor_id
      LEFT JOIN sites si ON s.site_id = si.id
      WHERE s.id = $1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sensors/:id/measurements', async (req, res) => {
  const { from, to, depthLabel, limit = 2000 } = req.query
  try {
    const params = [req.params.id]
    let where = 'WHERE m.sensor_id=$1'
    if (from)       { params.push(from);       where += ` AND m.measured_at >= $${params.length}` }
    if (to)         { params.push(to);         where += ` AND m.measured_at <= $${params.length}` }
    if (depthLabel) { params.push(depthLabel); where += ` AND m.depth_label = $${params.length}` }
    else            { where += ' AND m.depth_label IS NULL' }
    params.push(Number(limit))
    const { rows } = await pool.query(
      `SELECT m.measured_at, m.value, m.depth_label FROM measurements m ${where} ORDER BY m.measured_at ASC LIMIT $${params.length}`, params)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sensors/:id/depths', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT depth_label FROM measurements WHERE sensor_id=$1 AND depth_label IS NOT NULL ORDER BY depth_label`, [req.params.id])
    res.json(rows.map(r => r.depth_label))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/alarms', async (req, res) => {
  const { acknowledged, limit = 50 } = req.query
  try {
    let where = ''
    if (acknowledged === 'false') where = 'WHERE ae.is_acknowledged = false'
    const { rows } = await pool.query(`
      SELECT ae.*, s.name AS sensor_name, s.manage_no, s.sensor_code, s.unit, si.name AS site_name
      FROM alarm_events ae
      JOIN sensors s ON ae.sensor_id = s.id
      JOIN sites si ON s.site_id = si.id
      ${where} ORDER BY ae.triggered_at DESC LIMIT $1`, [Number(limit)])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/alarms/:id/acknowledge', async (req, res) => {
  const { acknowledgedBy = '관리자' } = req.body
  try {
    await pool.query(
      `UPDATE alarm_events SET is_acknowledged=true, acknowledged_by=$1, acknowledged_at=NOW() WHERE id=$2`,
      [acknowledgedBy, req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/dashboard', async (req, res) => {
  try {
    const [statusRes, alarmRes, recentRes] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS cnt FROM sensor_status GROUP BY status`),
      pool.query(`SELECT COUNT(*) AS cnt FROM alarm_events WHERE is_acknowledged=false`),
      pool.query(`
        SELECT ae.id, ae.severity, ae.message, ae.triggered_at,
               s.manage_no AS sensor_id, s.name AS sensor_name, si.name AS site_name
        FROM alarm_events ae
        JOIN sensors s ON ae.sensor_id=s.id
        JOIN sites si ON s.site_id=si.id
        ORDER BY ae.triggered_at DESC LIMIT 5`),
    ])
    const counts = {}
    statusRes.rows.forEach(r => { counts[r.status] = parseInt(r.cnt) })
    res.json({
      totalSensors: Object.values(counts).reduce((a,b)=>a+b, 0),
      normalCount: counts.normal || 0, warningCount: counts.warning || 0,
      dangerCount: counts.danger || 0, offlineCount: counts.offline || 0,
      activeAlarms: parseInt(alarmRes.rows[0].cnt), recentAlarms: recentRes.rows,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now')
    res.json({ status: 'ok', db: 'connected', serverTime: rows[0].now })
  } catch { res.status(500).json({ status: 'error', db: 'disconnected' }) }
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`GeoMonitor API listening on port ${PORT}`))
