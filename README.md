# GeoMonitor 백엔드

> 지반 계측 센서 실시간 모니터링 시스템 - 백엔드 API

## 📋 프로젝트 개요

GeoMonitor 백엔드는 지반 계측 센서 데이터를 수신·저장·제공하는 REST API 서버입니다.
현장 PC에 설치된 에이전트로부터 1시간마다 센서 데이터를 수신하며, JWT 기반 인증을 제공합니다.

## 🔗 배포 URL

- **API 서버**: https://yuhyun-sensor-monitoring-back.onrender.com
- **Swagger UI**: https://yuhyun-sensor-monitoring-back.onrender.com/api-docs
- **헬스체크**: https://yuhyun-sensor-monitoring-back.onrender.com/api/health

## 🛠 기술 스택

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (AWS RDS db.t3.micro)
- **인증**: JWT (jsonwebtoken)
- **암호화**: bcryptjs
- **파일 업로드**: multer
- **API 문서**: Swagger UI (swagger-ui-express)
- **배포**: Render

## 📁 프로젝트 구조
```
index.js          # 메인 서버 파일
uploads/          # 업로드된 파일 저장 디렉토리
package.json      # 패키지 정보
.env              # 환경변수 (gitignore)
```

## 🚀 로컬 실행 방법
```bash
# 패키지 설치
npm install

# 서버 실행
node index.js
```

## 🔐 환경변수
```env
DATABASE_URL=postgresql://...
AGENT_API_KEY=geomonitor-secret-2026
FRONTEND_URL=https://yuhyun-sensor-monitoring-front.vercel.app
JWT_SECRET=geomonitor-jwt-secret-2026
PORT=4000
```

## 📡 주요 API

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| POST | /api/auth/register | 회원가입 | - |
| POST | /api/auth/login | 로그인 | - |
| POST | /api/auth/logout | 로그아웃 | JWT |
| GET | /api/auth/me | 내 정보 | JWT |
| GET | /api/sensors | 센서 목록 | - |
| GET | /api/sensors/:id | 센서 상세 | - |
| GET | /api/sensors/:id/measurements | 측정값 | - |
| GET | /api/sensors/:id/depths | 깊이 목록 | - |
| PATCH | /api/sensors/:id/threshold | 임계값 수정 | - |
| POST | /api/ingest | 센서 데이터 수신 | API Key |
| GET | /api/alarms | 알람 목록 | - |
| PATCH | /api/alarms/:id/acknowledge | 알람 확인 | - |
| GET | /api/dashboard | 대시보드 요약 | - |
| GET | /api/users | 사용자 목록 | JWT+Admin |
| PATCH | /api/users/:id/edit | 사용자 수정 | JWT+Admin |
| PATCH | /api/users/:id/deactivate | 비활성화 | JWT+Admin |
| PATCH | /api/users/:id/activate | 활성화 | JWT+Admin |
| DELETE | /api/users/:id | 삭제 | JWT+Admin |
| GET | /api/files | 파일 목록 | JWT |
| POST | /api/files/upload | 파일 업로드 | JWT |
| GET | /api/files/:id/download | 다운로드 | JWT |
| DELETE | /api/files/:id | 파일 삭제 | JWT |
| GET | /api/health | 헬스체크 | - |

## 🗄 데이터베이스 구조
```
sites           - 현장 정보
sensors         - 센서 정보 (임계값 포함)
measurements    - 측정값 누적 데이터
sensor_status   - 센서 현재 상태
alarm_events    - 알람 발생 이력
users           - 사용자 정보
files           - 업로드 파일 정보
```

## 🤖 에이전트

현장 PC(Windows)에 설치된 Node.js 에이전트가 1시간마다 센서 txt 파일을 읽어 API로 전송합니다.
```
C:\geomonitor-agent\
├── agent.js      # 에이전트 메인 파일
├── package.json
└── .env
```

**에이전트 실행 (pm2):**
```powershell
cd C:\geomonitor-agent
pm2 start agent.js --name geomonitor-agent
pm2 save
```

## 📌 버전

- **v1.0.0** (2026.04.03)