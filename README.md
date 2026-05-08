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
- **수식 계산**: mathjs (계산식 일반화 — v1.5.0, package.json에 반드시 명시)
- **파일 업로드**: multer
- **PDF 변환**: pdf-to-png-converter (PDF 업로드 시 PNG 자동 변환)
- **API 문서**: Swagger UI (swagger-ui-express)
- **배포**: Render ($7/월, 슬립 없음)

## 📁 프로젝트 구조
```
index.js          # 메인 서버 파일
uploads/          # 업로드된 파일 저장 디렉토리
package.json      # 패키지 정보 (mathjs: ^13.0.0 포함)
.env              # 환경변수 (gitignore)
```

## 🚀 로컬 실행 방법
```bash
npm install
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
| POST | /api/auth/register | 회원가입 (기본 role: MultiMonitor) | - |
| POST | /api/auth/login | 로그인 | - |
| POST | /api/auth/logout | 로그아웃 | JWT |
| GET | /api/auth/me | 내 정보 (토큰 유효성 검증용) | JWT |
| GET | /api/sensors | 센서 목록 (formula_params 기반 계산값 반환) | - |
| GET | /api/sensors/:id | 센서 상세 (current_value, has_floor_plan, sensor_positions, depth_criteria 포함) | - |
| PATCH | /api/sensors/:id/threshold | 센서 임계값 수정 | JWT + NonMultiMonitor |
| PATCH | /api/sensors/:id/site | 센서 소속 현장 변경 | JWT + NonMultiMonitor |
| PATCH | /api/sensors/:id | 센서 정보 수정 (formula_params, correction_params, depth_criteria, formula_id 포함) | JWT + NonMultiMonitor |
| GET | /api/sensors/:id/measurements | 센서 측정값 조회 (formula_params 기반 계산, from/to 시간 포함 시 정확한 시각 필터링) | - |
| GET | /api/sensors/:id/depths | 센서 깊이 목록 (80053 전용) | - |
| POST | /api/ingest | 센서 데이터 수신 (depthLabel 문자열 강제 변환) | API Key |
| POST | /api/sensors/:id/floor-plan | 평면도 업로드 → 해당 센서의 현장(sites)에 저장 | JWT + NonMultiMonitor |
| GET | /api/sensors/:id/floor-plan-image | 센서 평면도 이미지 서빙 (현장 평면도 반환) | - |
| POST | /api/sites/:id/floor-plan | 현장 평면도 업로드 (PDF→PNG 자동 변환, base64 DB 저장) | JWT + NonMultiMonitor |
| GET | /api/sites/:id/floor-plan-image | 현장 평면도 이미지 서빙 | - |
| PATCH | /api/sites/:id/sensor-positions | 센서 아이콘 위치 저장 | JWT + NonMultiMonitor |
| GET | /api/alarms | 알람 목록 | - |
| PATCH | /api/alarms/:id/acknowledge | 알람 확인 | JWT + NonMultiMonitor |
| GET | /api/dashboard | 대시보드 요약 | - |
| GET | /api/sites | 현장 목록 조회 (has_floor_plan boolean, sensor_positions 포함) | - |
| POST | /api/sites | 현장 추가 | JWT + NonMultiMonitor |
| PATCH | /api/sites/:id | 현장 수정 (이름/위치/설명/담당자만 — floor_plan_url 미포함) | JWT + NonMultiMonitor |
| DELETE | /api/sites/:id | 현장 삭제 | JWT + NonMultiMonitor |
| GET | /api/users | 전체 사용자 목록 | JWT + NonMultiMonitor |
| GET | /api/users/list | 사용자 목록 (인증 없음) | - |
| PATCH | /api/users/:id/edit | 사용자 정보 수정 | JWT + NonMultiMonitor |
| PATCH | /api/users/:id/password | 비밀번호 변경 | JWT (본인만) |
| PATCH | /api/users/:id/deactivate | 사용자 비활성화 | JWT + NonMultiMonitor |
| PATCH | /api/users/:id/activate | 사용자 활성화 | JWT + NonMultiMonitor |
| DELETE | /api/users/:id | 사용자 삭제 | JWT + NonMultiMonitor |
| GET | /api/files | 파일 목록 | JWT |
| POST | /api/files/upload | 파일 업로드 | JWT |
| GET | /api/files/:id/download | 다운로드 | JWT |
| DELETE | /api/files/:id | 파일 삭제 | JWT |
| POST | /api/recollect | 재수집 요청 등록 | JWT + NonMultiMonitor |
| GET | /api/recollect | 재수집 요청 목록 조회 | JWT |
| GET | /api/recollect/pending | 처리 대기 요청 조회 (에이전트용) | API Key |
| PATCH | /api/recollect/:id/done | 재수집 완료 처리 (에이전트용) | API Key |
| DELETE | /api/recollect/:id | 재수집 요청 취소 | JWT |
| POST | /api/agent/heartbeat | 에이전트 온라인 상태 보고 | API Key |
| GET | /api/agent/status | 에이전트 상태 조회 | - |
| GET | /api/formulas | 계산식 목록 (expression, variables, is_custom 포함) | - |
| POST | /api/formulas | 계산식 추가 | JWT + NonMultiMonitor |
| PATCH | /api/formulas/:id | 계산식 수정 | JWT + NonMultiMonitor |
| DELETE | /api/formulas/:id | 계산식 삭제 (is_active=false) | JWT + NonMultiMonitor |
| GET | /api/health | 헬스체크 | - |

## 🗄 데이터베이스 구조
```
sites               - 현장 정보 (managers 컬럼 포함)
sensors             - 센서 정보 (임계값, formula, level1_upper, level1_lower,
                      level2_upper, level2_lower, criteria_unit, criteria_unit_name 포함)
formulas            - 계산식 목록 (name UNIQUE, expression, variables, is_custom, is_active)
measurements        - 측정값 누적 데이터 (id, sensor_id, measured_at, value, depth_label, raw_file, created_at)
                      ※ linear_value, raw_value 컬럼 없음 — API에서 계산 후 반환
sensor_status       - 센서 현재 상태
alarm_events        - 알람 발생 이력
users               - 사용자 정보 (phone 컬럼 포함)
files               - 업로드 파일 정보
recollect_requests  - 재수집 요청 이력 (최초 호출 시 자동 생성)
agent_status        - 에이전트 상태 (최초 호출 시 자동 생성)

sensors 테이블 추가 컬럼 (자동 마이그레이션):
- formula_params:    계산식 계수값 (JSONB)
  신규 구조: { "1": {"G":0.012044,"K":0.703,"A":7.08e-8,"B":-0.012296,"C":106.0458,"I":8184.18}, ... }
  구구조 (호환): { "coeffA": "7.08e-8", "coeffG": "0.012044", "initVal": "8184.18", ... }
- formula_id:        연결된 계산식 ID (INTEGER)
- correction_params: depth별 보정값 (JSONB) 예: { "1": 0.5, "2": -0.3, "3": 0.0 }
- depth_criteria:    depth별 1차 관리기준 (JSONB) 예: { "1": { "upper": -1.0, "lower": -5.0 }, ... }
- floor_plan_url:    센서별 평면도 (미사용 → 현장 평면도로 통일)

formulas 테이블 추가 컬럼 (자동 마이그레이션):
- expression:  수식 문자열 (TEXT) 예: "G * (I - R) * K"
- variables:   변수 설명 (JSONB) 예: {"G":"선형계수","R":"현재원시값"}
- is_custom:   유저 직접 입력 여부 (BOOLEAN DEFAULT false)
※ name 컬럼 UNIQUE 제약 (DBeaver 직접 실행):
  ALTER TABLE formulas ADD CONSTRAINT formulas_name_unique UNIQUE (name);

sites 테이블 추가 컬럼 (자동 마이그레이션):
- floor_plan_url:    현장별 평면도 (base64, PNG/JPG로 변환 저장)
                     ※ PATCH /api/sites/:id 로는 절대 변경되지 않음
- sensor_positions:  센서 아이콘 위치 및 이름 (JSONB)
  예: { "7:1": { "label": "WL-01", "x": 0.3, "y": 0.5 } }
```

## 🖼 평면도 관리 구조

```
평면도는 현장(sites) 단위로 통일 관리

업로드 흐름:
  센서 상세 페이지 업로드 → POST /api/sensors/:id/floor-plan
    → 해당 센서의 site_id로 sites.floor_plan_url에 저장
  현장 편집 모달/현장 상세 페이지 업로드 → POST /api/sites/:id/floor-plan
    → sites.floor_plan_url에 저장
  ※ PATCH /api/sites/:id (현장 편집 저장)는 floor_plan_url 미변경

이미지 서빙:
  GET /api/sensors/:id/floor-plan-image → 해당 센서의 현장 평면도 반환
  GET /api/sites/:id/floor-plan-image   → 현장 평면도 반환

PDF 자동 변환:
  업로드 파일이 application/pdf인 경우 pdf-to-png-converter로
  첫 페이지 PNG 변환 후 저장
```

## 📐 1차 관리기준 구조

```
일반 센서: sensors.level1_upper / sensors.level1_lower 컬럼 사용
80053 수위계: sensors.depth_criteria JSONB 컬럼 사용
  { "1": { upper, lower }, "2": {...}, "3": {...} }
※ 자동계산 방식 폐기 → 관리자 직접 입력 방식
```

## 🔢 계산식 일반화 (v1.5.0)

### 공통 계산 함수
```js
// calculateValue(expression, params) — mathjs evaluate() 사용, 에러 시 null 반환
// applyFormula(rawValue, initRawValue, expression, formulaParams, depthKey)
//   — depth별 파라미터 자동 선택, 변수: R(원시값), I(초기값), G, A, B, C, K
```

### 기본 계산식 (formulas 테이블 자동 등록)
| 이름 | 수식 |
|------|------|
| Linear | `G * (I - R) * K` |
| Polynomial | `(A * R^2 + B * R + C) * K` |

### measurements API 반환 구조
```js
{
  value: polyVal ?? linearVal ?? raw,  // Poly 우선, 없으면 Linear, 없으면 raw
  linear_value: linearVal,             // Linear 계산값 (항상 반환)
  raw_value: raw,                      // 원시값 (항상 보존)
}
```

### sensors 목록 API current_value 계산 (v1.6.0 수정)
- `SELECT`에 `s.formula_params` 포함 필수 (누락 시 raw값 그대로 반환되는 버그 수정)
- Linear 계산값으로 반환 (80053 기준)

### I(초기값) 처리
- formula_params에 `I` 키로 저장된 경우 해당 값을 initRawValue로 우선 사용
- 없으면 measurements 테이블에서 가장 오래된 데이터의 value를 initRawValue로 사용

### 80053 formula_params DB 저장 (DBeaver)
```sql
UPDATE sensors
SET formula_params = '{
  "1": {"G": 0.012044, "K": 0.703, "A": 7.08e-8, "B": -0.012296, "C": 106.0458},
  "2": {"G": 0.013450, "K": 0.703, "A": 1.429e-7, "B": -0.01532, "C": 118.4773},
  "3": {"G": 0.013450, "K": 0.703, "A": 1.429e-7, "B": -0.01532, "C": 118.4773}
}'::jsonb
WHERE sensor_code = '80053';
```

### ⚠️ params 변수명 충돌 주의
measurements API에서 SQL params 배열과 formula params 객체 변수명이 반드시 달라야 함:
- SQL params 배열: `params`
- formula params 객체: `formulaParams`, `rowFormulaParams`

## 🔢 80053 수위계 계산식 (참고)

### Linear (메인) — linear_value 필드
```
P(psi) = G × (초기값 - 현재값)
P(m) = P(psi) × 0.70307
depth 1번: G=0.012044 / depth 2,3번: G=0.013450
```

### Polynomial (서브) — value 필드
```
P(psi) = A × R² + B × R + C
P(m) = P(psi) × 0.70307
depth 1번: A=7.08e-8, B=-0.012296, C=106.0458
depth 2,3번: A=1.429e-7, B=-0.015320, C=118.4773
```

## 🤖 에이전트 v2.1 (+ 패치)

현장 PC(Windows)에 설치된 Node.js 에이전트가 1시간마다 센서 txt 파일을 읽어 API로 전송합니다.

```
C:\geomonitor-agent\
├── agent.js          # 에이전트 메인 파일 (v2.1 패치)
├── package.json
├── .env
├── .last_sent.json   # 마지막 전송 시간 추적
└── .known_folders.json
```

### v2.1 기능
- **Heartbeat**: 5분마다 온라인 상태 전송
- **재수집 폴링**: 매 실행마다 pending 재수집 요청 확인 후 처리
- **80053 비정상 데이터 필터링**: value < 100 데이터 전송 제외

### v2.1 패치 — 데이터 누락 방지
- **filterNew() 48시간 안전망**: 항상 최근 48시간 데이터 재확인
- **processRecollectRequests() last_sent 업데이트 제거**: 재수집이 정기 전송의 last_sent를 덮어쓰지 않음

### 에이전트 실행 (pm2)
```powershell
pm2 start agent.js --name geomonitor-agent
pm2 save
pm2 logs geomonitor-agent
pm2 status
```

### Windows 자동 실행
- Windows 작업 스케줄러로 PC 로그인 시 pm2 자동 실행 설정 완료
- 새 센서 자동 감지 시 DB 임시값으로 등록 → 관리자가 센서 정의 탭에서 수정

## 📌 버전

- **v1.0.0** (2026.04.03) — 초기 배포
- **v1.1.0** (2026.04.15) — 80053 Polynomial/Linear 계산식, 재수집 API, 에이전트 heartbeat API, depthLabel 타입 수정
- **v1.2.0** (2026.04.20) — correction_params(보정값) 기능 추가, PATCH /api/sensors/:id 버그 수정, 센서 목록 current_value Linear 기준으로 변경
- **v1.3.0** (2026.04.22) — 평면도 현장 단위 통일, PDF→PNG 자동 변환 (pdf-to-png-converter), 평면도 이미지 서빙 API 분리, sensor_positions API 추가, measurements 시간 필터링 정확도 개선
- **v1.4.0** (2026.04.23) — depth_criteria JSONB 컬럼 추가, PATCH /api/sensors/:id depth_criteria 지원, 1차 관리기준 자동계산 폐기(직접 입력 방식 전환)
- **v1.4.1** (2026.04.24) — PATCH /api/sites/:id에서 floor_plan_url 업데이트 제거 (현장 편집 저장 시 평면도 삭제 버그 수정)
- **v1.5.0** (2026.05.04~06) — 계산식 일반화
  - mathjs 도입 (`"mathjs": "^13.0.0"` package.json 명시 필수)
  - calculateValue / applyFormula 공통 함수 추가
  - formulas 테이블: expression, variables, is_custom 컬럼 추가
  - formulas name UNIQUE 제약 추가
  - Linear/Polynomial 기본 계산식 서버 시작 시 자동 등록
  - sensors 테이블: formula_id 컬럼 추가
  - sensors 목록/상세/measurements API 80053 하드코딩 → formula_params 기반 일반화
  - PATCH /api/sensors/:id formula_id 저장 지원
  - measurements API SQL params vs formulaParams 변수명 충돌 수정
  - 에이전트 v2.1 패치: filterNew() 48시간 안전망, processRecollectRequests() last_sent 업데이트 제거
- **v1.6.0** (2026.05.07~08)
  - **sensors 목록 쿼리에 formula_params 컬럼 추가**: current_value raw값 표시 버그 수정
  - **formula_params에 I(초기값) 저장 지원**: measurements API에서 formula_params.I 우선 사용

## ⚠️ 주의사항

### 권한 관리
- **NonMultiMonitor**: `Administrator`, `Manager`, `Operator`, `Monitor` 역할
- **MultiMonitor**: 센서 조회 및 파일 관리만 가능
- 최소 1개 이상의 관리자 계정을 항상 유지할 것

### 파일 저장
- Render 특성상 서버 재시작 시 업로드된 파일 삭제 가능
- **평면도는 DB(base64)에 저장되므로 서버 재시작 후에도 유지됨**

### 데이터베이스
- AWS RDS db.t3.micro (월 약 $20~25)
- DB 비밀번호 자동 교체 비활성화 완료 (2026.04.09)
- DB 연결 오류 시 AWS Secrets Manager에서 최신 비밀번호 확인 후 Render 환경변수 DATABASE_URL 업데이트

### 80053 비정상 데이터(raw=0) 3단계 방어
1. /api/ingest: value < 100 차단
2. 앱 시작 시: 기존 비정상 데이터 자동 삭제
3. 에이전트: 전송 전 value < 100 필터링

### PATCH /api/sensors/:id 주의사항
- `fields.length === 0` 체크는 반드시 모든 필드 추가 후 마지막에 위치
- correction_params, formula_params, depth_criteria만 단독 전송 시에도 정상 저장

### 평면도 관련 API 주의사항
- `PATCH /api/sites/:id`: 이름/위치/설명/담당자만 업데이트, `floor_plan_url` 컬럼 건드리지 않음
- `POST /api/sites/:id/floor-plan`: 평면도 전용 업로드 API
- `PATCH /api/sites/:id/sensor-positions`: positions JSON 객체 전체 교체 방식
- 평면도 서빙 API는 인증 없이 공개 (`requireAuth` 없음)
- `depth_criteria` 저장 시 JSON.stringify() 적용 필요

### mathjs 패키지 주의사항
- `package.json`에 `"mathjs": "^13.0.0"` 반드시 명시
- Render 배포 시 `Cannot find module 'mathjs'` 오류 발생 시 package.json 확인

### formula_params 구조
- 80053: depth별 신구조 `{ "1": {G,K,A,B,C,I}, ... }` 사용
- 일반 센서: 기존 구조 `{ "coeffA": ..., "coeffG": ... }` 유지 가능
- 프론트에서 `base.A || base.coeffA` 호환 처리 적용됨
- I(초기값): formula_params['1'].I 또는 formula_params.I로 저장
