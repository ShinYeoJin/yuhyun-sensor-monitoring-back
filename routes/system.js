const express = require('express')
const pool    = require('../db')

const router = express.Router()

router.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now')
    res.json({ status: 'ok', db: 'connected', serverTime: rows[0].now })
  } catch { res.status(500).json({ status: 'error', db: 'disconnected' }) }
})

// 주소 검색 API 추가
router.get('/api/geocode', async (req, res) => {
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

module.exports = router
