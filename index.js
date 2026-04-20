require('dotenv').config()
const express  = require('express')
const cors     = require('cors')
const { Pool } = require('pg')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const multer   = require('multer')
const path     = require('path')
const fs       = require('fs')
const swaggerUi = require('swagger-ui-express')
const swaggerJsdoc = require('swagger-jsdoc')

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GeoMonitor API',
      version: '1.0.0',
      description: '지반 계측 모니터링 시스템 API',
    },
    servers: [{ url: 'https://yuhyun-sensor-monitoring-back.onrender.com' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: '인증', description: '회원가입 / 로그인 / 로그아웃' },
      { name: '센서', description: '센서 조회 및 측정값' },
      { name: '알람', description: '알람 조회 및 처리' },
      { name: '대시보드', description: '대시보드 요약' },
      { name: '현장', description: '현장 추가 / 수정' },
      { name: '사용자', description: '사용자 관리' },
      { name: '파일', description: '파일 업로드 / 다운로드' },
      { name: '시스템', description: '헬스체크' },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['시스템'],
          summary: 'DB 연결 상태 확인',
          responses: { 200: { description: 'DB 연결 정상' } }
        }
      },
      '/api/auth/register': {
        post: {
          tags: ['인증'],
          summary: '회원가입',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: {
              username: { type: 'string', example: 'user1' },
              email: { type: 'string', example: 'user1@example.com' },
              password: { type: 'string', example: 'password123' },
              role: { type: 'string', example: 'user' }
            }, required: ['username', 'email', 'password'] } } }
          },
          responses: { 201: { description: '회원가입 성공' } }
        }
      },
      '/api/auth/login': {
        post: {
          tags: ['인증'],
          summary: '로그인',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: {
              email: { type: 'string', example: 'admin@geomonitor.com' },
              password: { type: 'string', example: 'admin1234' }
            }, required: ['email', 'password'] } } }
          },
          responses: { 200: { description: '로그인 성공 (JWT 토큰 반환)' } }
        }
      },
      '/api/auth/logout': {
        post: { tags: ['인증'], summary: '로그아웃', security: [{ bearerAuth: [] }], responses: { 200: { description: '로그아웃 성공' } } }
      },
      '/api/auth/me': {
        get: { tags: ['인증'], summary: '내 정보 조회', security: [{ bearerAuth: [] }], responses: { 200: { description: '사용자 정보' } } }
      },
      '/api/sensors': {
        get: {
          tags: ['센서'],
          summary: '센서 목록 조회',
          parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['normal', 'warning', 'danger', 'offline'] } }],
          responses: { 200: { description: '센서 목록' } }
        }
      },
      '/api/sensors/{id}': {
        get: {
          tags: ['센서'],
          summary: '센서 상세 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '센서 상세' } }
        }
      },
      '/api/sensors/{id}/measurements': {
        get: {
          tags: ['센서'],
          summary: '센서 측정값 조회',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'from', in: 'query', schema: { type: 'string' } },
            { name: 'to', in: 'query', schema: { type: 'string' } },
            { name: 'depthLabel', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { 200: { description: '측정값 목록' } }
        }
      },
      '/api/sensors/{id}/depths': {
        get: {
          tags: ['센서'],
          summary: '센서 깊이 목록 조회',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '깊이 목록' } }
        }
      },
      '/api/alarms': {
        get: {
          tags: ['알람'],
          summary: '알람 목록 조회',
          parameters: [
            { name: 'acknowledged', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { 200: { description: '알람 목록' } }
        }
      },
      '/api/alarms/{id}/acknowledge': {
        patch: {
          tags: ['알람'],
          summary: '알람 확인 처리',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: { acknowledgedBy: { type: 'string' } } } } }
          },
          responses: { 200: { description: '알람 확인 완료' } }
        }
      },
      '/api/dashboard': {
        get: { tags: ['대시보드'], summary: '대시보드 요약 조회', responses: { 200: { description: '대시보드 데이터' } } }
      },
      '/api/users': {
        get: { tags: ['사용자'], summary: '전체 사용자 목록 (admin)', security: [{ bearerAuth: [] }], responses: { 200: { description: '사용자 목록' } } }
      },
      '/api/users/active': {
        get: { tags: ['사용자'], summary: '활성 사용자 목록 (admin)', security: [{ bearerAuth: [] }], responses: { 200: { description: '활성 사용자 목록' } } }
      },
      '/api/users/{id}/deactivate': {
        patch: { tags: ['사용자'], summary: '사용자 비활성화 (admin)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '비활성화 완료' } } }
      },
      '/api/users/{id}/activate': {
        patch: { tags: ['사용자'], summary: '사용자 활성화 (admin)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '활성화 완료' } } }
      },
      '/api/users/{id}': {
        delete: { tags: ['사용자'], summary: '사용자 삭제 (admin)', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '삭제 완료' } } }
      },
      '/api/files': {
        get: { tags: ['파일'], summary: '파일 목록 조회', security: [{ bearerAuth: [] }], responses: { 200: { description: '파일 목록' } } }
      },
      '/api/files/upload': {
        post: {
          tags: ['파일'],
          summary: '파일 업로드',
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } }
          },
          responses: { 201: { description: '업로드 성공' } }
        }
      },
      '/api/files/{id}/download': {
        get: { tags: ['파일'], summary: '파일 다운로드', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '파일 다운로드' } } }
      },
      '/api/files/{id}': {
        delete: { tags: ['파일'], summary: '파일 삭제', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: '삭제 완료' } } }
      },
      '/api/ingest': {
        post: {
          tags: ['센서'],
          summary: '센서 데이터 수신 (에이전트용)',
          security: [],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              sensorCode: { type: 'string' },
              measurements: { type: 'array', items: { type: 'object' } }
            } } } }
          },
          responses: { 200: { description: '수신 성공' } }
        }
      },
      '/api/sites': {
        get: {
          tags: ['현장'],
          summary: '현장 목록 조회',
          responses: { 200: { description: '현장 목록' } }
        },
        post: {
          tags: ['현장'],
          summary: '현장 추가',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string', example: '현장 A' },
              location: { type: 'string', example: '서울특별시 마포구' },
              description: { type: 'string', example: '현장 설명' },
              managers: { type: 'array', items: { type: 'string' } }
            }, required: ['name'] } } }
          },
          responses: { 201: { description: '현장 추가 성공' } }
        }
      },
      '/api/sites/{id}': {
        patch: {
          tags: ['현장'],
          summary: '현장 수정 (담당자 포함)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string' },
              location: { type: 'string' },
              description: { type: 'string' },
              managers: { type: 'array', items: { type: 'string' } }
            } } } }
          },
          responses: { 200: { description: '수정 완료' } }
        }
      },
      '/api/sensors/{id}/threshold': {
        patch: {
          tags: ['센서'],
          summary: '센서 임계값 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              threshold_normal_max: { type: 'number', example: -21.5 },
              threshold_warning_max: { type: 'number', example: -21.0 },
              threshold_danger_min: { type: 'number', example: -20.5 }
            } } } }
          },
          responses: { 200: { description: '임계값 수정 완료' } }
        }
      },
      '/api/sensors/{id}/site': {
        patch: {
          tags: ['센서'],
          summary: '센서 소속 현장 변경/미배정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              site_code: { type: 'string', example: 'site-main', description: '빈 문자열이면 미배정 처리' }
            } } } }
          },
          responses: { 200: { description: '현장 변경 완료' } }
        }
      },
      '/api/users/list': {
        get: {
          tags: ['사용자'],
          summary: '사용자 목록 조회 (인증 없음)',
          responses: { 200: { description: '활성 사용자 목록' } }
        }
      },
      '/api/users/{id}/edit': {
        patch: {
          tags: ['사용자'],
          summary: '사용자 정보 수정 (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              username: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string' },
              phone: { type: 'string' }
            } } } }
          },
          responses: { 200: { description: '수정 완료' } }
        }
      },
    }
  },
  apis: [],
}

const swaggerSpec = swaggerJsdoc(swaggerOptions)

const app = express()
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const JWT_SECRET = process.env.JWT_SECRET || 'geomonitor-jwt-secret-2026'
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

const NON_MULTIMONITOR = ['admin', 'Administrator', 'Manager', 'Operator', 'Monitor']

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: '접근 권한이 없습니다.' })
    }
    next()
  }
}

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
    const { rows } = await pool.query(`SELECT * FROM sites ORDER BY id`)
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
  const { name, location, description, managers, floor_plan_url } = req.body
  try {
    await pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
    await pool.query(
      `UPDATE sites SET name=$1, location=$2, description=$3, managers=$4, floor_plan_url=$5 WHERE id=$6`,
      [name, location, description, JSON.stringify(managers || []), floor_plan_url || null, req.params.id])
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
             s.criteria_unit, s.criteria_unit_name, s.formula
      FROM sensors s
      LEFT JOIN sensor_status ss ON s.id = ss.sensor_id
      LEFT JOIN sites si ON s.site_id = si.id
      ${where} ORDER BY s.id`, params)

    const result = await Promise.all(rows.map(async (s) => {
      if (s.sensor_code === '80053' && s.current_value !== null) {
        const initRow = await pool.query(
          `SELECT value FROM measurements WHERE sensor_id=$1 AND depth_label='1' ORDER BY measured_at ASC LIMIT 1`,
          [s.id])
        if (initRow.rows.length > 0) {
          const raw = parseFloat(s.current_value)
          // Polynomial (메인)
          const A = 7.080e-8, B = -0.012296, C = 106.0458
          const polyM = parseFloat(((A * raw * raw + B * raw + C) * 0.70307).toFixed(4))
          return { ...s, current_value: polyM }
        }
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
             si.floor_plan_url AS site_floor_plan_url
      FROM sensors s
      LEFT JOIN sensor_status ss ON s.id = ss.sensor_id
      LEFT JOIN sites si ON s.site_id = si.id
      WHERE s.id = $1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const sensor = rows[0]

    if (sensor.sensor_code === '80053' && sensor.current_value !== null) {
      const raw = parseFloat(sensor.current_value)
      // Polynomial (메인)
      const A = 7.080e-8, B = -0.012296, C = 106.0458
      sensor.current_value = parseFloat(((A * raw * raw + B * raw + C) * 0.70307).toFixed(4))
    }
    res.json(sensor)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.patch('/api/sensors/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { name, manage_no, sensor_type, unit, field, formula,
    level1_upper, level1_lower, level2_upper, level2_lower,
    criteria_unit, criteria_unit_name, install_date, location_desc,
    formula_params } = req.body
  try {
    const fields = []
    const values = []
    let idx = 1
    if (name !== undefined)               { fields.push(`name=$${idx++}`);               values.push(name) }
    if (manage_no !== undefined)          { fields.push(`manage_no=$${idx++}`);          values.push(manage_no) }
    if (sensor_type !== undefined)        { fields.push(`sensor_type=$${idx++}`);        values.push(sensor_type) }
    if (unit !== undefined)               { fields.push(`unit=$${idx++}`);               values.push(unit) }
    if (field !== undefined)              { fields.push(`field=$${idx++}`);              values.push(field) }
    if (formula !== undefined)            { fields.push(`formula=$${idx++}`);            values.push(formula) }
    if (level1_upper !== undefined)       { fields.push(`level1_upper=$${idx++}`);       values.push(level1_upper) }
    if (level1_lower !== undefined)       { fields.push(`level1_lower=$${idx++}`);       values.push(level1_lower) }
    if (level2_upper !== undefined)       { fields.push(`level2_upper=$${idx++}`);       values.push(level2_upper) }
    if (level2_lower !== undefined)       { fields.push(`level2_lower=$${idx++}`);       values.push(level2_lower) }
    if (criteria_unit !== undefined)      { fields.push(`criteria_unit=$${idx++}`);      values.push(criteria_unit) }
    if (criteria_unit_name !== undefined) { fields.push(`criteria_unit_name=$${idx++}`); values.push(criteria_unit_name) }
    if (fields.length === 0) return res.status(400).json({ error: '수정할 항목이 없습니다.' })
    if (install_date !== undefined)       { fields.push(`install_date=$${idx++}`);       values.push(install_date) }
    if (location_desc !== undefined)      { fields.push(`location_desc=$${idx++}`);      values.push(location_desc) }
    if (formula_params !== undefined)     { fields.push(`formula_params=$${idx++}`);     values.push(JSON.stringify(formula_params)) }
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
    if (from) { params.push(from + 'T00:00:00+09:00'); where += ` AND m.measured_at >= $${params.length}` }
    if (to)   { params.push(to   + 'T23:59:59+09:00'); where += ` AND m.measured_at <= $${params.length}` }

    const sensorCheck = await pool.query(
      `SELECT sensor_code FROM sensors WHERE id=$1`, [req.params.id])
    const is80053 = sensorCheck.rows.length > 0 && sensorCheck.rows[0].sensor_code === '80053'

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

    // 80053 계산식 적용 (Polynomial 메인, Linear 서브 둘 다 반환)
    if (is80053 && rows.length > 0) {
      // 날짜 범위와 무관하게 해당 depth의 전체 기간 첫 번째 raw값을 initRaw로 사용
      const currentDepth = rows[0].depth_label
      const initRow = await pool.query(
        `SELECT value FROM measurements WHERE sensor_id=$1 AND depth_label=$2 ORDER BY measured_at ASC LIMIT 1`,
        [req.params.id, currentDepth]
      )
      const initRaw = initRow.rows.length > 0 ? parseFloat(initRow.rows[0].value) : parseFloat(rows[0].value)
      const converted = rows.map(r => {
        const raw = parseFloat(r.value)
        const dl = r.depth_label

        // Polynomial 계수 (수정된 B값)
        const A = dl === '1' ? 7.080e-8  : 1.429e-7
        const B = dl === '1' ? -0.012296 : -0.015320
        const C = dl === '1' ? 106.0458  : 118.4773

        // Linear 계수
        const G = dl === '1' ? 0.012044 : 0.013450

        // Polynomial
        const polyPsi = A * raw * raw + B * raw + C
        const polyM   = parseFloat((polyPsi * 0.70307).toFixed(4))

        // Linear
        const linearPsi = G * (initRaw - raw)
        const linearM   = parseFloat((linearPsi * 0.70307).toFixed(4))

        return {
          ...r,
          value: polyM,
          linear_value: linearM,
          raw_value: raw,
        }
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
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' })
  try {
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    await pool.query(`UPDATE sensors SET floor_plan_url=$1 WHERE id=$2`, [base64, req.params.id])
    res.json({ success: true, floor_plan_url: base64 })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 현장 평면도 업로드
app.post('/api/sites/:id/floor-plan', requireAuth, requireRole(NON_MULTIMONITOR), floorPlanUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' })
  try {
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    await pool.query(`UPDATE sites SET floor_plan_url=$1 WHERE id=$2`, [base64, req.params.id])
    res.json({ success: true, floor_plan_url: base64 })
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

// 앱 시작 시 필요한 컬럼 자동 생성
pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
  .then(() => console.log('[DB] sensors.floor_plan_url 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

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

pool.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS floor_plan_url TEXT`)
  .then(() => console.log('[DB] sites.floor_plan_url 컬럼 확인 완료'))
  .catch(err => console.error('[DB] 컬럼 생성 오류:', err.message))

// 임시 — formula_params 컬럼 강제 생성 (1회 사용 후 제거)
app.get('/api/admin/migrate', async (req, res) => {
  try {
    await pool.query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS formula_params JSONB`)
    const check = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'sensors' AND column_name = 'formula_params'
    `)
    res.json({ success: true, columns: check.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => console.log(`GeoMonitor API listening on port ${PORT}`))