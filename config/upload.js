const multer = require('multer')
const path   = require('path')
const fs     = require('fs')

// 프로젝트 루트 기준 절대 경로 (config/ 한 단계 위)
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

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

module.exports = { UPLOAD_DIR, upload, floorPlanUpload }
