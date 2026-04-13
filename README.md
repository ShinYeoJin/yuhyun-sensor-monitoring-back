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
| POST | /api/auth/register | 회원가입 | - (기본 role: MultiMonitor 자동 설정) |
| POST | /api/auth/login | 로그인 | - |
| POST | /api/auth/logout | 로그아웃 | JWT |
| GET | /api/auth/me | 내 정보 | JWT |
| GET | /api/sensors | 센서 목록 | - |
| GET | /api/sensors/:id | 센서 상세 | - |
| GET | /api/sensors/:id/measurements | 측정값 | - |
| GET | /api/sensors/:id/depths | 깊이 목록 | - |
| GET |    /api/formulas        | 계산식 목록 조회 |
| POST |   /api/formulas        | 계산식 추가 (관리자) |
| PATCH |  /api/formulas/:id    | 계산식 수정 (관리자) |
| DELETE | /api/formulas/:id    | 계산식 삭제 (관리자) |
| GET | /api/sensors | 80053 sensor_code일 경우 current_value를 계산값으로 변환 |
| GET | /api/sensors/:id | 동일 |
| GET | /api/sensors/:id/measurements | 전체 측정값 계산식 적용 후 반환 |
계산식: P(m) = G × (첫측정값 - 현재값) × 0.703
- depth_label "1": G = 0.012044
- depth_label "2", "3": G = 0.013450
| PATCH | /api/sensors/:id/threshold | 임계값 수정 | JWT + NonMultiMonitor |
| PATCH | /api/sensors/:id/site | 센서 소속 현장 변경 | JWT + NonMultiMonitor |
| POST | /api/ingest | 센서 데이터 수신 | API Key |
| GET | /api/alarms | 알람 목록 | - |
| PATCH | /api/alarms/:id/acknowledge | 알람 확인 | JWT + NonMultiMonitor |
| GET | /api/dashboard | 대시보드 요약 | - |
| GET | /api/sites | 현장 목록 | - |
| POST | /api/sites | 현장 추가 | JWT + NonMultiMonitor |
| PATCH | /api/sites/:id | 현장 수정 | JWT + NonMultiMonitor |
| DELETE | /api/sites/:id | 현장 삭제 | JWT + NonMultiMonitor |
| GET | /api/users | 사용자 목록 | JWT + NonMultiMonitor |
| GET | /api/users/list | 사용자 목록 (인증 없음) | - |
| PATCH | /api/users/:id/edit | 사용자 수정 | JWT + NonMultiMonitor |
| PATCH | /api/users/:id/password | 비밀번호 변경 | JWT (본인만) |
| PATCH | /api/users/:id/deactivate | 비활성화 | JWT + NonMultiMonitor |
| PATCH | /api/users/:id/activate | 활성화 | JWT + NonMultiMonitor |
| DELETE | /api/users/:id | 삭제 | JWT + NonMultiMonitor |
| GET | /api/files | 파일 목록 | JWT |
| POST | /api/files/upload | 파일 업로드 | JWT |
| GET | /api/files/:id/download | 다운로드 | JWT |
| DELETE | /api/files/:id | 파일 삭제 | JWT |
| GET | /api/health | 헬스체크 | - |

## 🗄 데이터베이스 구조
```
sites           - 현장 정보
sensors         - 센서 정보 (임계값 포함)
sensors 테이블:
- formula VARCHAR(100) DEFAULT '(A*X+B)'
- install_date (기존)
- location_desc (기존)
- level1_upper, level1_lower, level2_upper, level2_lower
- criteria_unit, criteria_unit_name
formulas 테이블 (신규):
- id, name, expression, description, is_active, created_at
measurements    - 측정값 누적 데이터
sensor_status   - 센서 현재 상태
alarm_events    - 알람 발생 이력
users           - 사용자 정보
files           - 업로드 파일 정보
sites 테이블에 managers 컬럼 추가 (담당자 목록)
users 테이블에 phone 컬럼 추가 (핸드폰번호)
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

### 새 센서 자동 감지 및 반자동 등록
- 에이전트가 기존에 없던 새 센서 파일을 감지하면 자동으로 DB에 등록
- 자동 등록 시 아래 임시값으로 저장됨
  - 관리번호: `MN-AUTO-{센서코드}`
  - 센서 종류: `unknown`
  - 단위: `-`
- 이후 관리자가 센서 관리 → 센서 정의 탭 → 편집 버튼에서 수동으로 정보 수정 필요
- **새 센서 감지 후 반드시 관리번호/센서 종류/단위/임계값을 수정해야 정상 모니터링 가능**

## 📌 버전

- **v1.0.0** (2026.04.03)

## ⚠️ 주의사항

### 권한 관리
- **NonMultiMonitor**: `admin`, `Administrator`, `Manager`, `Operator`, `Monitor` 역할을 가진 사용자
- **MultiMonitor** 역할은 센서 조회 및 파일 관리만 가능하며, 편집/삭제/사용자 관리/알람 처리 불가
- **본인 계정의 권한을 변경할 때는 반드시 다른 관리자 계정이 존재하는지 확인하세요.**
- 시스템에 관리자 계정이 본인 하나뿐인 상태에서 자신의 권한을 `MultiMonitor`로 변경하면 사용자 관리 기능을 사용할 수 없게 됩니다.
- 이 경우 UI에서 복구가 불가능하며 DB에 직접 접근하거나 별도 복구 작업이 필요합니다.
- **최소 1개 이상의 관리자 계정을 항상 유지하는 것을 권장합니다.**

### 파일 저장
- Render 무료 플랜 특성상 서버 재시작 시 업로드된 파일이 삭제될 수 있습니다.

### 데이터베이스
- AWS RDS db.t3.micro 사용 중 (월 약 2~3만원 비용 발생)

### DB 비밀번호 자동 교체
- AWS Secrets Manager가 RDS 비밀번호를 자동 교체할 수 있음
- 자동 교체 비활성화 완료 (2026.04.09)
- 만약 DB 연결 오류 발생 시 AWS Secrets Manager에서 최신 비밀번호 확인 후 Render 환경변수 DATABASE_URL 업데이트 필요