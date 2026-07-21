require('dotenv').config()
const { pdfToPng } = require('pdf-to-png-converter')
const { evaluate: mathEvaluate } = require('mathjs')
const express  = require('express')

// ─── 공통 계산 함수 ───────────────────────────────────────────────────────────
function calculateValue(expression, params) {
  if (!expression || !params) return null
  try {
    const result = mathEvaluate(expression, params)
    if (!isFinite(result) || isNaN(result)) return null
    return parseFloat(result.toFixed(4))
  } catch (err) { return null }
}

function applyFormula(rawValue, initRawValue, formulaExpression, formulaParams, depthKey) {
  if (!formulaExpression || rawValue === null || rawValue === undefined) return null
  let params = formulaParams || {}
  if (depthKey && params[depthKey] && typeof params[depthKey] === 'object') {
    params = params[depthKey]
  }
  return calculateValue(formulaExpression, {
    R: parseFloat(rawValue),
    I: initRawValue !== null && initRawValue !== undefined ? parseFloat(initRawValue) : parseFloat(rawValue),
    ...params
  })
}
const cors     = require('cors')
const { Pool } = require('pg')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const multer   = require('multer')
const path     = require('path')
const fs       = require('fs')
const swaggerUi = require('swagger-ui-express')

const swaggerSpec = require('./swagger/spec')
const { JWT_SECRET, requireAuth, requireRole, requireKey, NON_MULTIMONITOR } = require('./middleware/auth')

const app = express()
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

app.use(cors({ origin: [process.env.FRONTEND_URL || '*', 'http://localhost:3000'] }))
app.use(express.json({ limit: '20mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))

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

app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.post('/api/auth/logout', requireAuth, (req, res) => {
  res.json({ success: true, message: '로그아웃 완료' })
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE id=$1`, [req.user.id])
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/users', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, phone, is_active, is_deleted, created_at, last_login FROM users ORDER BY created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/users/active', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, last_login FROM users WHERE is_active=true AND is_deleted=false ORDER BY created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/users/list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, phone, is_active FROM users WHERE is_deleted=false ORDER BY created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/users/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { username, email, role } = req.body
  try {
    await pool.query(
      `UPDATE users SET username=$1, email=$2, role=$3 WHERE id=$4`,
      [username, email, role, req.params.id])
    res.json({ success: true, message: '사용자 정보 수정 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/users/:id/deactivate', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '사용자 비활성화 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/users/:id/activate', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_active=true WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '사용자 활성화 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/users/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    await pool.query(`UPDATE users SET is_deleted=true, is_active=false WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '사용자 삭제 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/users/:id/edit', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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

app.patch('/api/users/:id/password', requireAuth, async (req, res) => {
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

app.post('/api/files/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO files (filename, original_name, file_path, file_size, mime_type, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.file.filename, req.file.originalname, req.file.path, req.file.size, req.file.mimetype, req.user.id])
    res.status(201).json({ success: true, file: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.username AS uploaded_by_name FROM files f LEFT JOIN users u ON f.uploaded_by=u.id ORDER BY f.created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/files/:id/download', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없습니다' })
    const file = rows[0]
    if (!fs.existsSync(file.file_path)) return res.status(404).json({ error: '파일이 서버에 없습니다' })
    res.download(file.file_path, file.original_name)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/files/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없습니다' })
    const file = rows[0]
    if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path)
    await pool.query(`DELETE FROM files WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '파일 삭제 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

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

app.get('/api/sites', async (req, res) => {
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

app.post('/api/sites', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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

app.patch('/api/sites/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, location, description, managers, latitude, longitude } = req.body
  try {
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
    await pool.query(
      `UPDATE sites SET name=$1, location=$2, description=$3, managers=$4, latitude=$5, longitude=$6 WHERE id=$7`,
      [name, location, description, JSON.stringify(managers || []), latitude ?? null, longitude ?? null, req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/sites/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM sites WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '현장을 찾을 수 없습니다.' })
    // 해당 현장 소속 센서들 미배정 처리
    await pool.query(`UPDATE sensors SET site_id=NULL WHERE site_id=$1`, [req.params.id])
    await pool.query(`DELETE FROM sites WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '현장이 삭제되었습니다.' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})


app.patch('/api/sensors/:id/site', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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

app.get('/api/sensors', async (req, res) => {
  const { status } = req.query
  try {
    let where = 'WHERE s.is_active = true'
    const params = []
    if (status) { params.push(status); where += ` AND ss.status = $${params.length}` }
    const { rows } = await pool.query(`
      SELECT s.id, s.sensor_code, s.manage_no, s.name, s.sensor_type, s.unit, s.field,
       s.location_desc, s.install_date, s.threshold_normal_max, s.threshold_warning_max, s.threshold_danger_min,
       ss.current_value, ss.status, ss.last_measured, si.name AS site_name, si.site_code,
       s.level1_upper, s.level1_lower, s.level2_upper, s.level2_lower,
       s.criteria_unit, s.criteria_unit_name, s.formula, s.depth_criteria, s.formula_params
      FROM sensors s
      LEFT JOIN sensor_status ss ON s.id = ss.sensor_id
      LEFT JOIN sites si ON s.site_id = si.id
      ${where} ORDER BY s.id`, params)

      const result = await Promise.all(rows.map(async (s) => {
        if (s.formula_params && s.current_value !== null) {
          try {
            const fp = s.formula_params
            const isDepthParams = fp['1'] || fp['2'] || fp['3']
            const params = isDepthParams ? (fp['1'] || fp['2'] || fp['3']) : fp
            if (params.G !== undefined && params.K !== undefined) {
              const depthCond = isDepthParams ? `AND depth_label='1'` : `AND depth_label IS NULL`
              const initRow = await pool.query(
                `SELECT value FROM measurements WHERE sensor_id=$1 ${depthCond} ORDER BY measured_at ASC LIMIT 1`,
                [s.id])
              if (initRow.rows.length > 0) {
                const raw = parseFloat(s.current_value)
                const initRaw = parseFloat(initRow.rows[0].value)
                const computed = applyFormula(raw, initRaw, 'G * (I - R) * K', params, null)
                if (computed !== null) return { ...s, current_value: computed }
              }
            }
          } catch (e) { }
        }
        return s
      }))
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sensors/:id', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
    const { rows } = await pool.query(`
      SELECT s.*, ss.current_value, ss.status, ss.last_measured,
             si.name AS site_name, si.site_code, si.managers AS site_managers,
             si.id AS site_db_id,
             (s.floor_plan_url IS NOT NULL) AS has_floor_plan,
             (si.floor_plan_url IS NOT NULL) AS has_site_floor_plan,
             si.sensor_positions
      FROM sensors s
      LEFT JOIN sensor_status ss ON s.id = ss.sensor_id
      LEFT JOIN sites si ON s.site_id = si.id
      WHERE s.id = $1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const sensor = rows[0]

    if (sensor.formula_params && sensor.current_value !== null) {
      try {
        const fp = sensor.formula_params
        const isDepthParams = fp['1'] || fp['2'] || fp['3']
        const params = isDepthParams ? (fp['1'] || Object.values(fp)[0]) : fp
        if (params.G !== undefined && params.K !== undefined) {
          const depthCond = isDepthParams ? `AND depth_label='1'` : `AND depth_label IS NULL`
          const initRow = await pool.query(
            `SELECT value FROM measurements WHERE sensor_id=$1 ${depthCond} ORDER BY measured_at ASC LIMIT 1`,
            [sensor.id])
          if (initRow.rows.length > 0) {
            const raw = parseFloat(sensor.current_value)
            const initRaw = parseFloat(initRow.rows[0].value)
            const computed = applyFormula(raw, initRaw, 'G * (I - R) * K', params, null)
            if (computed !== null) sensor.current_value = computed
          }
        }
      } catch (e) { }
    }
    res.json(sensor)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/sensors/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, manage_no, sensor_type, unit, field, formula,
    level1_upper, level1_lower, level2_upper, level2_lower,
    criteria_unit, criteria_unit_name, install_date, location_desc,
    formula_params, correction_params, depth_criteria, formula_id } = req.body
  try {
    const fields = []
    const values = []
    let idx = 1
    if (name !== undefined)               { fields.push(`name=$${idx++}`);               values.push(name) }
    if (manage_no !== undefined)          { fields.push(`manage_no=$${idx++}`);          values.push(manage_no) }
    if (sensor_type !== undefined)        { fields.push(`sensor_type=$${idx++}`);        values.push(sensor_type) }
    if (unit !== undefined)               { fields.push(`unit=$${idx++}`);               values.push(unit) }
    if (field !== undefined)              { fields.push(`field=$${idx++}`);              values.push(field) }
    if (formula_id !== undefined)         { fields.push(`formula_id=$${idx++}`);         values.push(formula_id) }
    if (formula !== undefined)            { fields.push(`formula=$${idx++}`);            values.push(formula) }
    if (level1_upper !== undefined)       { fields.push(`level1_upper=$${idx++}`);       values.push(level1_upper) }
    if (level1_lower !== undefined)       { fields.push(`level1_lower=$${idx++}`);       values.push(level1_lower) }
    if (level2_upper !== undefined)       { fields.push(`level2_upper=$${idx++}`);       values.push(level2_upper) }
    if (level2_lower !== undefined)       { fields.push(`level2_lower=$${idx++}`);       values.push(level2_lower) }
    if (criteria_unit !== undefined)      { fields.push(`criteria_unit=$${idx++}`);      values.push(criteria_unit) }
    if (criteria_unit_name !== undefined) { fields.push(`criteria_unit_name=$${idx++}`); values.push(criteria_unit_name) }
    if (install_date !== undefined)       { fields.push(`install_date=$${idx++}`);       values.push(install_date) }
    if (location_desc !== undefined)      { fields.push(`location_desc=$${idx++}`);      values.push(location_desc) }
    if (formula_params !== undefined)     { fields.push(`formula_params=$${idx++}`);     values.push(JSON.stringify(formula_params)) }
    if (correction_params !== undefined)  { fields.push(`correction_params=$${idx++}`);  values.push(JSON.stringify(correction_params)) }
    if (depth_criteria !== undefined)     { fields.push(`depth_criteria=$${idx++}`);      values.push(JSON.stringify(depth_criteria)) }
    if (fields.length === 0) return res.status(400).json({ error: '수정할 항목이 없습니다.' })  // ← 맨 아래로 이동
    values.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE sensors SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`,
      values)
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true, message: '센서 정보 수정 완료', sensor: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/sensors/:id/threshold', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { threshold_normal_max, threshold_warning_max, threshold_danger_min } = req.body
  try {
    await pool.query(
      `UPDATE sensors SET threshold_normal_max=$1, threshold_warning_max=$2, threshold_danger_min=$3 WHERE id=$4`,
      [threshold_normal_max, threshold_warning_max, threshold_danger_min, req.params.id])
    res.json({ success: true, message: '임계값 수정 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/sensors/:id/measurements', async (req, res) => {
  const { from, to, depthLabel, limit = 2000 } = req.query
  try {
    const params = [req.params.id]
    let where = 'WHERE m.sensor_id=$1'
    if (from) {
      // T가 포함되어 있으면 이미 시간 정보가 있으므로 그대로 사용
      const fromStr = from.includes('T') ? from + '+09:00' : from + 'T00:00:00+09:00'
      params.push(fromStr); where += ` AND m.measured_at >= $${params.length}`
    }
    if (to) {
      const toStr = to.includes('T') ? to + '+09:00' : to + 'T23:59:59+09:00'
      params.push(toStr); where += ` AND m.measured_at <= $${params.length}`
    }

    const sensorCheck = await pool.query(
      `SELECT sensor_code, formula_params FROM sensors WHERE id=$1`, [req.params.id])
    const is80053 = sensorCheck.rows.length > 0 && sensorCheck.rows[0].sensor_code === '80053'
    const sensor = sensorCheck.rows.length > 0 ? sensorCheck.rows[0] : null

    if (depthLabel) {
      params.push(depthLabel)
      where += ` AND m.depth_label = $${params.length}`
    } else {
      const depthCheck = await pool.query(
        `SELECT depth_label FROM measurements WHERE sensor_id=$1 AND depth_label IS NULL LIMIT 1`, [req.params.id])
      if (depthCheck.rows.length > 0) {
        where += ' AND m.depth_label IS NULL'
      } else {
        // 80053은 기본 depth_label '1'
        const defaultDepth = is80053 ? '1' : null
        if (defaultDepth) {
          params.push(defaultDepth)
          where += ` AND m.depth_label = $${params.length}`
        } else {
          const firstDepth = await pool.query(
            `SELECT depth_label FROM measurements WHERE sensor_id=$1 AND depth_label IS NOT NULL ORDER BY depth_label LIMIT 1`, [req.params.id])
          if (firstDepth.rows.length > 0) {
            params.push(firstDepth.rows[0].depth_label)
            where += ` AND m.depth_label = $${params.length}`
          }
        }
      }
    }

    params.push(Number(limit))
    const { rows } = await pool.query(
      `SELECT m.measured_at, m.value, m.depth_label, m.value AS raw_value FROM measurements m ${where} ORDER BY m.measured_at ASC LIMIT $${params.length}`, params)

    // 일반화된 계산식 적용 (formula_params가 있는 센서)
    if (sensor.formula_params && rows.length > 0) {
      const fp = sensor.formula_params
      const isDepthParams = fp['1'] || fp['2'] || fp['3']
      const currentDepth = rows[0].depth_label
      const formulaParams = isDepthParams ? (fp[currentDepth] || fp['1'] || fp) : fp
    
      const depthCond = currentDepth ? `AND depth_label=$2` : `AND depth_label IS NULL`
      const initArgs = currentDepth ? [req.params.id, currentDepth] : [req.params.id]
      const initRow = await pool.query(
        `SELECT value FROM measurements WHERE sensor_id=$1 ${depthCond} ORDER BY measured_at ASC LIMIT 1`,
        initArgs)
      // formula_params에 수동 I값이 있으면 우선 사용
      const manualI = formulaParams?.I
      const initRaw = manualI !== undefined
        ? manualI
        : (initRow.rows.length > 0 ? parseFloat(initRow.rows[0].value) : parseFloat(rows[0].value))
    
      const hasLinear = formulaParams.G !== undefined && formulaParams.K !== undefined
      const hasPoly = formulaParams.A !== undefined && formulaParams.B !== undefined && formulaParams.C !== undefined && formulaParams.K !== undefined
    
      const converted = rows.map(r => {
        const raw = parseFloat(r.value)
        const rowFormulaParams = isDepthParams ? (fp[r.depth_label] || formulaParams) : formulaParams
    
        const linearVal = hasLinear
          ? applyFormula(raw, initRaw, 'G * (I - R) * K', rowFormulaParams, null)
          : null
        const polyVal = hasPoly
          ? applyFormula(raw, initRaw, '(A * R^2 + B * R + C) * K', rowFormulaParams, null)
          : null
    
        return { ...r, value: polyVal ?? linearVal ?? raw, linear_value: linearVal, raw_value: raw }
      })
      return res.json(converted)
    }
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

// 평면도 업로드용 multer (메모리 저장 — base64로 DB에 저장)
const floorPlanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('이미지(JPG, PNG) 또는 PDF 파일만 업로드 가능합니다.'))
  }
})

// 센서 평면도 업로드
app.post('/api/sensors/:id/floor-plan', requireAuth, requireRole(NON_MULTIMONITOR), floorPlanUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' })
    // 센서가 속한 현장 조회
    const sensorRow = await pool.query(`SELECT site_id FROM sensors WHERE id=$1`, [req.params.id])
    if (sensorRow.rows.length === 0) return res.status(404).json({ error: 'Sensor not found' })
    const siteId = sensorRow.rows[0].site_id
    if (!siteId) return res.status(400).json({ error: '센서에 현장이 배정되지 않았습니다.' })
    let imageBuffer = req.file.buffer
    let mimeType = req.file.mimetype
    if (req.file.mimetype === 'application/pdf') {
      const pages = await pdfToPng(req.file.buffer, { viewportScale: 2.0, pagesToProcess: [1] })
      if (!pages || pages.length === 0) return res.status(400).json({ error: 'PDF 변환 실패' })
      imageBuffer = pages[0].content
      mimeType = 'image/png'
    }
    const base64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`
    await pool.query(`UPDATE sites SET floor_plan_url=$1 WHERE id=$2`, [base64, siteId])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 현장 평면도 업로드
app.post('/api/sites/:id/floor-plan', requireAuth, requireRole(NON_MULTIMONITOR), floorPlanUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' })
    let imageBuffer = req.file.buffer
    let mimeType = req.file.mimetype
    if (req.file.mimetype === 'application/pdf') {
      const pages = await pdfToPng(req.file.buffer, { viewportScale: 2.0, pagesToProcess: [1] })
      if (!pages || pages.length === 0) return res.status(400).json({ error: 'PDF 변환 실패' })
      imageBuffer = pages[0].content
      mimeType = 'image/png'
    }
    const base64 = `data:${mimeType};base64,${imageBuffer.toString('base64')}`
    await pool.query(`UPDATE sites SET floor_plan_url=$1 WHERE id=$2`, [base64, req.params.id])
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 센서 평면도 이미지 서빙
app.get('/api/sensors/:id/floor-plan-image', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT si.floor_plan_url AS site_fp
      FROM sensors s
      LEFT JOIN sites si ON s.site_id = si.id
      WHERE s.id=$1
    `, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const base64 = rows[0].site_fp
    if (!base64) return res.status(404).json({ error: 'No floor plan' })
    const matches = base64.match(/^data:(.+);base64,(.+)$/)
    if (!matches) return res.status(400).json({ error: 'Invalid format' })
    const mimeType = matches[1]
    const buffer = Buffer.from(matches[2], 'base64')
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
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