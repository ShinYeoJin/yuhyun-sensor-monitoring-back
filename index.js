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
const alarmRoutes   = require('./routes/alarms')
const formulaRoutes = require('./routes/formulas')
const ingestRoutes    = require('./routes/ingest')
const recollectRoutes = require('./routes/recollect')
const agentRoutes     = require('./routes/agent')
const systemRoutes    = require('./routes/system')
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
app.use(alarmRoutes)
app.use(formulaRoutes)
app.use(ingestRoutes)
app.use(recollectRoutes)
app.use(agentRoutes)
app.use(systemRoutes)

const PORT = process.env.PORT || 4000

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