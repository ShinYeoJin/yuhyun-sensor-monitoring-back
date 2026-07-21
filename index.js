require('dotenv').config()
const express  = require('express')

const cors     = require('cors')
const swaggerUi = require('swagger-ui-express')

const swaggerSpec = require('./swagger/spec')
const { JWT_SECRET, requireAuth, requireRole, requireKey, NON_MULTIMONITOR } = require('./middleware/auth')
const { UPLOAD_DIR, upload, floorPlanUpload } = require('./config/upload')
const authRoutes  = require('./routes/auth')
const userRoutes  = require('./routes/users')
const fileRoutes  = require('./routes/files')
const siteRoutes    = require('./routes/sites')
const sensorRoutes  = require('./routes/sensors')
const pool = require('./db')

const app = express()


app.use(cors({ origin: [process.env.FRONTEND_URL || '*', 'http://localhost:3000'] }))
app.use(express.json({ limit: '20mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
app.use(authRoutes)
app.use(userRoutes)
app.use(fileRoutes)
app.use(siteRoutes)
app.use(sensorRoutes)

function evalStatus(value, sensor) {
  const dMin = sensor.threshold_danger_min
  const nMax = sensor.threshold_normal_max
  if (dMin !== null && dMin !== '' && value >= Number(dMin)) return 'danger'
  if (nMax !== null && nMax !== '' && value > Number(nMax)) return 'warning'
  return 'normal'
}

async function maybeCreateAlarm(client, sensor, status, value) {
  if (status === 'normal' || status === 'offline') return
  const dup = await client.query(
    `SELECT id FROM alarm_events WHERE sensor_id=$1 AND severity=$2 AND is_acknowledged=false LIMIT 1`,
    [sensor.id, status])
  if (dup.rows.length > 0) return
  const threshVal = status === 'danger' ? sensor.threshold_danger_min : sensor.threshold_normal_max
  await client.query(
    `INSERT INTO alarm_events (sensor_id, severity, message, triggered_value, threshold_value) VALUES ($1,$2,$3,$4,$5)`,
    [sensor.id, status,
      status === 'danger' ? `위험 임계값(${threshVal}) 초과 — 즉시 점검 필요` : `주의 임계값(${threshVal}) 도달 — 모니터링 강화 필요`,
      value, threshVal])
}

app.post('/api/ingest', requireKey, async (req, res) => {
  const { sensorCode, measurements, rawFile } = req.body
  if (!sensorCode || !Array.isArray(measurements) || measurements.length === 0)
    return res.status(400).json({ error: 'sensorCode and measurements required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let { rows } = await client.query('SELECT * FROM sensors WHERE sensor_code=$1 AND is_active=true', [sensorCode])
    if (rows.length === 0) {
      // 새 센서 자동 등록
      console.log(`[자동 등록] 새 센서 감지: ${sensorCode}`)
      const manageNo = 'MN-AUTO-' + sensorCode
      const newSensor = await client.query(
        `INSERT INTO sensors (sensor_code, name, manage_no, unit, sensor_type, is_active)
        VALUES ($1,$2,$3,$4,$5,true) RETURNING *`,
        [sensorCode, sensorCode, manageNo, '-', 'unknown'])
      rows = newSensor.rows
    }
    const sensor = rows[0]
    let inserted = 0
    for (const m of measurements) {
      // 80053 센서 raw=0 또는 비정상 데이터 수신 차단
      if (sensor.sensor_code === '80053' && (m.value === 0 || m.value === null || parseFloat(m.value) < 100)) {
        console.log(`[필터링] 비정상 데이터 차단: sensorCode=${sensorCode}, value=${m.value}, measuredAt=${m.measuredAt}`)
        continue
      }
      const r = await client.query(
        `INSERT INTO measurements (sensor_id, measured_at, value, depth_label, raw_file)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT ON CONSTRAINT uq_meas_sensor_time_depth DO NOTHING
         RETURNING id`,
        [sensor.id, m.measuredAt, m.value, m.depthLabel != null ? String(m.depthLabel) : null, rawFile ?? null])
      if (r.rowCount > 0) inserted++
    }
    if (sensor.sensor_type === 'water_level') {
      const latest = [...measurements].sort((a,b) => a.measuredAt > b.measuredAt ? -1 : 1)[0]
      const status = evalStatus(latest.value, sensor)
      await client.query(
        `INSERT INTO sensor_status (sensor_id, current_value, status, last_measured, updated_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (sensor_id) DO UPDATE SET current_value=$2, status=$3, last_measured=$4, updated_at=NOW()`,
        [sensor.id, latest.value, status, latest.measuredAt])
      await maybeCreateAlarm(client, sensor, status, latest.value)
    } else {
      const latest = [...measurements].sort((a,b) => a.measuredAt > b.measuredAt ? -1 : 1)[0]
      await client.query(
        `INSERT INTO sensor_status (sensor_id, current_value, status, last_measured, updated_at) VALUES ($1,$2,'normal',$3,NOW()) ON CONFLICT (sensor_id) DO UPDATE SET current_value=$2, status='normal', last_measured=$3, updated_at=NOW()`,
        [sensor.id, latest.value, latest.measuredAt])
    }
    await client.query('COMMIT')
    res.json({ success: true, sensorCode, inserted, total: measurements.length })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[ingest error]', err.message)
    res.status(500).json({ error: err.message })
  } finally { client.release() }
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

app.patch('/api/alarms/:id/acknowledge', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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

// ─── 계산식 관리 API ───────────────────────────────────────────────────────────
// 계산식 목록 조회 (전체 공개)
app.get('/api/formulas', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM formulas WHERE is_active=true ORDER BY id`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 계산식 추가 (관리자만)
app.post('/api/formulas', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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
app.patch('/api/formulas/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, expression, description } = req.body
  try {
    const { rows } = await pool.query(
      `UPDATE formulas SET name=$1, expression=$2, description=$3 WHERE id=$4 RETURNING *`,
      [name, expression, description, req.params.id])
    res.json({ success: true, formula: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 계산식 삭제 (관리자만)
app.delete('/api/formulas/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE formulas SET is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 현장 평면도 이미지 서빙
app.get('/api/sites/:id/floor-plan-image', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT floor_plan_url FROM sites WHERE id=$1`, [req.params.id]
    )
    if (rows.length === 0 || !rows[0].floor_plan_url) return res.status(404).json({ error: 'Not found' })
    const base64 = rows[0].floor_plan_url
    const matches = base64.match(/^data:(.+);base64,(.+)$/)
    if (!matches) return res.status(400).json({ error: 'Invalid format' })
    const mimeType = matches[1]
    const buffer = Buffer.from(matches[2], 'base64')
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 현장 센서 아이콘 위치 저장
app.patch('/api/sites/:id/sensor-positions', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { positions } = req.body
    await pool.query(
      `UPDATE sites SET sensor_positions=$1 WHERE id=$2`,
      [JSON.stringify(positions), req.params.id]
    )
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now')
    res.json({ status: 'ok', db: 'connected', serverTime: rows[0].now })
  } catch { res.status(500).json({ status: 'error', db: 'disconnected' }) }
})

const PORT = process.env.PORT || 4000

// ─── 재수집 요청 API ────────────────────────────────────────────────────────
// 에이전트가 주기적으로 폴링해서 pending 요청을 가져감
app.get('/api/recollect/pending', requireKey, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM recollect_requests WHERE status='pending' ORDER BY created_at ASC LIMIT 10`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 에이전트가 처리 완료 후 상태 업데이트
app.patch('/api/recollect/:id/done', requireKey, async (req, res) => {
  const { result } = req.body  // 'success' | 'error: ...'
  try {
    await pool.query(
      `UPDATE recollect_requests SET status='done', result=$1, done_at=NOW() WHERE id=$2`,
      [result || 'success', req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 관리자 웹에서 재수집 요청 생성
app.post('/api/recollect', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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
app.get('/api/recollect', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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
app.delete('/api/recollect/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`DELETE FROM recollect_requests WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 에이전트 상태 heartbeat (에이전트가 주기적으로 보고)
app.post('/api/agent/heartbeat', requireKey, async (req, res) => {
  const { agentId = 'default', status = 'online', info = {} } = req.body
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_status (
        agent_id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(20),
        info JSONB,
        last_seen TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await pool.query(`
      INSERT INTO agent_status (agent_id, status, info, last_seen)
      VALUES ($1,$2,$3,NOW())
      ON CONFLICT (agent_id) DO UPDATE SET status=$2, info=$3, last_seen=NOW()`,
      [agentId, status, JSON.stringify(info)])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 에이전트 상태 조회 (관리자)
app.get('/api/agent/status', requireAuth, async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_status (
        agent_id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(20),
        info JSONB,
        last_seen TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    const { rows } = await pool.query(`SELECT * FROM agent_status ORDER BY last_seen DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 주소 검색 API 추가
app.get('/api/geocode', async (req, res) => {
  const { query } = req.query
  if (!query) return res.status(400).json({ error: 'query 필수' })
  try {
    const response = await fetch(
      `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`,
      { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_KEY}` } }
    )
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

pool.query(`
  ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION
`)
  .then(() => console.log('[DB] sites.latitude/longitude 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

// 앱 시작 시 필요한 컬럼 자동 생성
pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
  .then(() => console.log('[DB] sensors.floor_plan_url 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS sensor_positions JSONB DEFAULT '{}'`)
  .then(() => console.log('[DB] sites.sensor_positions 컬럼 확인 완료'))
  .catch(console.error)

// 80053 비정상 데이터 자동 정리 (앱 시작 시 1회 실행)
pool.query(`
  DELETE FROM measurements 
  WHERE sensor_id = 7 
  AND value < 100 
  AND depth_label IS NOT NULL
`).then(r => console.log(`[DB] 80053 비정상 데이터 ${r.rowCount}건 정리 완료`))
  .catch(err => console.error('[DB] 비정상 데이터 정리 오류:', err.message))

pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS formula_params JSONB`)
  .then(() => console.log('[DB] sensors.formula_params 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS correction_params JSONB`)
  .then(() => console.log('[DB] sensors.correction_params 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS depth_criteria JSONB`)
  .then(() => console.log('[DB] sensors.depth_criteria 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

// Phase 1: 계산식 일반화 마이그레이션
pool.query(`ALTER TABLE formulas ADD COLUMN IF NOT EXISTS expression TEXT`)
  .then(() => console.log('[DB] formulas.expression 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`ALTER TABLE formulas ADD COLUMN IF NOT EXISTS variables JSONB`)
  .then(() => console.log('[DB] formulas.variables 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`ALTER TABLE formulas ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false`)
  .then(() => console.log('[DB] formulas.is_custom 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS formula_id INTEGER`)
  .then(() => console.log('[DB] sensors.formula_id 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

pool.query(`
  INSERT INTO formulas (name, expression, variables, is_custom, is_active)
  VALUES ('Linear', 'G * (I - R) * K',
    '{"G":"선형계수","I":"초기원시값(자동)","R":"현재원시값","K":"단위변환계수(psi→m)"}',
    false, true),
  ('Polynomial', '(A * R^2 + B * R + C) * K',
    '{"A":"2차계수","B":"1차계수","C":"상수항","R":"현재원시값","K":"단위변환계수(psi→m)"}',
    false, true)
  ON CONFLICT (name) DO NOTHING
`).then(() => console.log('[DB] 기본 계산식(Linear/Polynomial) 확인 완료'))
  .catch(err => console.error('[DB] 기본 계산식 등록 오류:', err.message))

pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
  .then(() => console.log('[DB] sites.floor_plan_url 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))


app.listen(PORT, () => console.log(`GeoMonitor API listening on port ${PORT}`))