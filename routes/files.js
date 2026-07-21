const express = require('express')
const fs      = require('fs')
const pool    = require('../db')
const { requireAuth } = require('../middleware/auth')
const { upload } = require('../config/upload')

const router = express.Router()

router.post('/api/files/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO files (filename, original_name, file_path, file_size, mime_type, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.file.filename, req.file.originalname, req.file.path, req.file.size, req.file.mimetype, req.user.id])
    res.status(201).json({ success: true, file: rows[0] })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/api/files', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.username AS uploaded_by_name FROM files f LEFT JOIN users u ON f.uploaded_by=u.id ORDER BY f.created_at DESC`)
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/api/files/:id/download', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없습니다' })
    const file = rows[0]
    if (!fs.existsSync(file.file_path)) return res.status(404).json({ error: '파일이 서버에 없습니다' })
    res.download(file.file_path, file.original_name)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/api/files/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM files WHERE id=$1`, [req.params.id])
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없습니다' })
    const file = rows[0]
    if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path)
    await pool.query(`DELETE FROM files WHERE id=$1`, [req.params.id])
    res.json({ success: true, message: '파일 삭제 완료' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
