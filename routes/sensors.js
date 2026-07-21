const express    = require('express')
const { pdfToPng } = require('pdf-to-png-converter')
const pool       = require('../db')
const { requireAuth, requireRole, NON_MULTIMONITOR } = require('../middleware/auth')
const { floorPlanUpload } = require('../config/upload')
const { applyFormula } = require('../utils/formula')

const router = express.Router()

router.get('/api/sensors', async (req, res) => {
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

router.get('/api/sensors/:id', async (req, res) => {
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

router.patch('/api/sensors/:id', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
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
    if (fields.length === 0) return res.status(400).json({ error: '수정할 항목이 없습니다.' })
    values.push(req.params.id)
    const { rows } = await pool.query(
      `UPDATE sensors SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`,
      values)
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true, message: '센서 정보 수정 완료', sensor: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/api/sensors/:id/threshold', requireAuth, requireRole(NON_MULTIMONITOR), async (req, res) => {
  const { threshold_normal_max, threshold_warning_max, threshold_danger_min } = req.body
  try {
    await pool.query(
      `UPDATE sensors SET threshold_normal_max=$1, threshold_warning_max=$2, threshold_danger_min=$3 WHERE id=$4`,
      [threshold_normal_max, threshold_warning_max, threshold_danger_min, req.params.id])
    res.json({ success: true, message: '임계값 수정 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/api/sensors/:id/measurements', async (req, res) => {
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

router.get('/api/sensors/:id/depths', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT depth_label FROM measurements WHERE sensor_id=$1 AND depth_label IS NOT NULL ORDER BY depth_label`, [req.params.id])
    res.json(rows.map(r => r.depth_label))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// 센서 평면도 업로드
router.post('/api/sensors/:id/floor-plan', requireAuth, requireRole(NON_MULTIMONITOR), floorPlanUpload.single('file'), async (req, res) => {
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

// 센서 평면도 이미지 서빙
router.get('/api/sensors/:id/floor-plan-image', async (req, res) => {
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

module.exports = router
