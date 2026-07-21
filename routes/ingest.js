const express = require('express')
const pool    = require('../db')
const { requireKey } = require('../middleware/auth')

const router = express.Router()

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

router.post('/api/ingest', requireKey, async (req, res) => {
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

module.exports = router
