const express = require('express')
const pool    = require('../db')
const { requireAuth, requireKey } = require('../middleware/auth')

const router = express.Router()

// 에이전트 상태 heartbeat (에이전트가 주기적으로 보고)
router.post('/api/agent/heartbeat', requireKey, async (req, res) => {
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
router.get('/api/agent/status', requireAuth, async (req, res) => {
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

module.exports = router
