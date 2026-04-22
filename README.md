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
- **PDF 변환**: pdf-to-png-converter (PDF 업로드 시 PNG 자동 변환)
- **API 문서**: Swagger UI (swagger-ui-express)
- **배포**: Render ($7/월)

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
| POST | /api/auth/register | 회원가입 (기본 role: MultiMonitor) | - |
| POST | /api/auth/login | 로그인 | - |
| POST | /api/auth/logout | 로그아웃 | JWT |
| GET | /api/auth/me | 내 정보 (토큰 유효성 검증용) | JWT |
| GET | /api/sensors | 센서 목록 | - |
| GET | /api/sensors/:id | 센서 상세 (has_floor_plan, has_site_floor_plan, sensor_positions 포함) | - |
| GET | /api/sensors/:id/measurements | 측정값 (from/to 시간 포함 시 정확한 시각 필터링) | - |
| GET | /api/sensors/:id/depths | 깊이 목록 | - |
| PATCH | /api/sensors/:id | 센서 정보 수정 (formula_params, correction_params 포함) | JWT + NonMultiMonitor |
| PATCH | /api/sensors/:id/threshold | 임계값 수정 | JWT + NonMultiMonitor |
| PATCH | /api/sensors/:id/site | 센서 소속 현장 변경 | JWT + NonMultiMonitor |
| POST | /api/sensors/:id/floor-plan | 평면도 업로드 → 해당 센서의 현장(sites)에 저장 | JWT + NonMultiMonitor |
| GET | /api/sensors/:id/floor-plan-image | 센서 평면도 이미지 서빙 (현장 평면도 반환) | - |
| POST | /api/ingest | 센서 데이터 수신 (depthLabel 문자열 강제 변환) | API Key |
| GET | /api/alarms | 알람 목록 | - |
| PATCH | /api/alarms/:id/acknowledge | 알람 확인 | JWT + NonMultiMonitor |
| GET | /api/dashboard | 대시보드 요약 | - |
| GET | /api/sites | 현장 목록 (has_floor_plan boolean, sensor_positions 포함) | - |
| POST | /api/sites | 현장 추가 | JWT + NonMultiMonitor |
| PATCH | /api/sites/:id | 현장 수정 | JWT + NonMultiMonitor |
| DELETE | /api/sites/:id | 현장 삭제 | JWT + NonMultiMonitor |
| POST | /api/sites/:id/floor-plan | 현장 평면도 업로드 (PDF→PNG 자동 변환, base64 DB 저장) | JWT + NonMultiMonitor |
| GET | /api/sites/:id/floor-plan-image | 현장 평면도 이미지 서빙 | - |
| PATCH | /api/sites/:id/sensor-positions | 센서 아이콘 위치 저장 | JWT + NonMultiMonitor |
| GET | /api/users | 사용자 목록 | JWT + NonMultiMonitor |
| GET | /api/users/list | 사용자 목록 (인증 없음) | - |
| PATCH | /api/users/:id/edit | 사용자 수정 | JWT + NonMultiMonitor |
| PATCH | /api/users/:id/password | 비밀번호 변경 | JWT (본인만) |
| PATCH | /api/users/:id/deactivate | 비활성화 | JWT + NonMultiMonitor |
| PATCH | /api/users/:id/activate | 활성화 | JWT + NonMultiMonitor |
| DELETE | /api/users/:id | 삭제 | JWT + NonMultiMonitor |
| GET | /api/formulas | 계산식 목록 | - |
| POST | /api/formulas | 계산식 추가 | JWT + NonMultiMonitor |
| PATCH | /api/formulas/:id | 계산식 수정 | JWT + NonMultiMonitor |
| DELETE | /api/formulas/:id | 계산식 삭제 | JWT + NonMultiMonitor |
| GET | /api/files | 파일 목록 | JWT |
| POST | /api/files/upload | 파일 업로드 | JWT |
| GET | /api/files/:id/download | 다운로드 | JWT |
| DELETE | /api/files/:id | 파일 삭제 | JWT |
| POST | /api/recollect | 재수집 요청 등록 | JWT + NonMultiMonitor |
| GET | /api/recollect | 재수집 요청 목록 | JWT |
| GET | /api/recollect/pending | 처리 대기 요청 조회 (에이전트용) | API Key |
| PATCH | /api/recollect/:id/done | 재수집 완료 처리 (에이전트용) | API Key |
| DELETE | /api/recollect/:id | 재수집 요청 취소 | JWT |
| POST | /api/agent/heartbeat | 에이전트 온라인 상태 보고 | API Key |
| GET | /api/agent/status | 에이전트 상태 조회 | - |
| GET | /api/health | 헬스체크 | - |

## 🗄 데이터베이스 구조
```
sites               - 현장 정보 (managers 컬럼 포함)
sensors             - 센서 정보 (임계값, formula, level1_upper, level1_lower,
                      level2_upper, level2_lower, criteria_unit, criteria_unit_name 포함)
formulas            - 계산식 목록
measurements        - 측정값 누적 데이터
                      (value: Polynomial 계산값, linear_value: Linear 계산값, raw_value: 원시값)
sensor_status       - 센서 현재 상태
alarm_events        - 알람 발생 이력
users               - 사용자 정보 (phone 컬럼 포함)
files               - 업로드 파일 정보
recollect_requests  - 재수집 요청 이력 (최초 호출 시 자동 생성)
agent_status        - 에이전트 상태 (최초 호출 시 자동 생성)

sensors 테이블 추가 컬럼:
- floor_plan_url:    센서별 평면도 (base64, 미사용 예정 → 현장 평면도로 통일)
- formula_params:    계산식 계수값 (JSONB)
- correction_params: depth별 보정값 (JSONB)
  예: { "1": 0.5, "2": -0.3, "3": 0.0 }

sites 테이블 추가 컬럼:
- floor_plan_url:      현장별 평면도 (base64, PNG/JPG로 변환 저장)
- sensor_positions:    센서 아이콘 위치 (JSONB)
  예: { "7:1": { "label": "80053 1번", "x": 0.3, "y": 0.5 } }
```

## 🖼 평면도 관리 구조

```
평면도는 현장(sites) 단위로 통일 관리

업로드 흐름:
  센서 상세 페이지 업로드 → POST /api/sensors/:id/floor-plan
    → 해당 센서의 site_id로 sites.floor_plan_url에 저장

  현장 편집 모달 업로드 → POST /api/sites/:id/floor-plan
    → sites.floor_plan_url에 저장

이미지 서빙:
  GET /api/sensors/:id/floor-plan-image → 해당 센서의 현장 평면도 반환
  GET /api/sites/:id/floor-plan-image   → 현장 평면도 반환

PDF 자동 변환:
  업로드 파일이 application/pdf인 경우 pdf-to-png-converter로
  첫 페이지 PNG 변환 후 저장 → 모든 브라우저에서 img 태그로 표시 가능
```

## 🤖 에이전트 v2.1

현장 PC(Windows)에 설치된 Node.js 에이전트가 1시간마다 센서 txt 파일을 읽어 API로 전송합니다.

```
C:\geomonitor-agent\
├── agent.js          # 에이전트 메인 파일 (v2.1)
├── package.json
├── .env
├── .last_sent.json   # 마지막 전송 시간 추적
└── .known_folders.json # 알려진 센서 폴더 목록
```

### v2.1 추가 기능
- **Heartbeat**: 5분마다 백엔드에 온라인 상태 전송 → 재수집 탭에서 에이전트 온라인/오프라인 확인 가능
- **재수집 폴링**: 매 실행마다 pending 재수집 요청 확인 후 처리
- **80053 비정상 데이터 필터링**: sendBatch에서 value < 100 데이터 전송 제외

### 에이전트 실행 (pm2)
```powershell
cd C:\geomonitor-agent
pm2 start agent.js --name geomonitor-agent
pm2 save
pm2 logs geomonitor-agent
```

### Windows 자동 실행 설정
- Windows 작업 스케줄러로 PC 로그인 시 pm2 자동 실행 설정 완료 (2026.04.09)
- PC 재시작 후 별도 터미널 명령어 입력 불필요
- `pm2 status` 명령어로 실행 상태 확인 가능

### 새 센서 자동 감지 및 반자동 등록
- 에이전트가 기존에 없던 새 센서 파일 감지 시 자동으로 DB 등록
- 자동 등록 임시값: 관리번호 `MN-AUTO-{센서코드}`, 센서 종류 `unknown`, 단위 `-`
- 이후 관리자가 센서 관리 → 센서 정의 탭 → 편집 버튼에서 수동으로 정보 수정 필요

## 🔢 80053 수위계 계산식

`GET /api/sensors`, `GET /api/sensors/:id`, `GET /api/sensors/:id/measurements` 에서
80053 센서의 경우 raw 데이터에 계산식 적용 후 반환

### Linear (메인) — linear_value 필드
```
P(psi) = G × (초기값 - 현재값)
P(m) = P(psi) × 0.70307

depth_label 1번: G=0.012044
depth_label 2,3번: G=0.013450
```

### Polynomial (서브) — value 필드
```
P(psi) = A × R² + B × R + C
P(m) = P(psi) × 0.70307

depth_label 1번 (302555): A=7.080E-08, B=-0.012296, C=106.0458
depth_label 2,3번 (302554): A=1.429E-07, B=-0.015320, C=118.4773
온도 보정 K=0 처리
```

### current_value 반환 기준
- `GET /api/sensors` 및 `GET /api/sensors/:id` 에서 80053 센서의 `current_value`는
  **Linear(메인) 계산값**으로 반환 (depth_label 1번 기준)

### measurements API 시간 필터링
- `from`, `to` 파라미터에 `T`가 포함된 경우 (예: `2026-04-22T16:00:00`) 해당 시각 그대로 사용
- `T`가 없는 경우 (예: `2026-04-22`) 자동으로 `T00:00:00+09:00`, `T23:59:59+09:00` 추가
- 일별 특정 시각 조회 시 프론트에서 `T` 포함 형식으로 전달

## 📌 버전

- **v1.0.0** (2026.04.03)
- **v1.1.0** (2026.04.15) — 80053 Polynomial/Linear 계산식, 재수집 API, 에이전트 heartbeat API, depthLabel 타입 수정
- **v1.2.0** (2026.04.20) — correction_params(보정값) 기능 추가, PATCH /api/sensors/:id 버그 수정, 센서 목록 current_value Linear 기준으로 변경
- **v1.3.0** (2026.04.22) — 평면도 현장 단위 통일, PDF→PNG 자동 변환 (pdf-to-png-converter), 평면도 이미지 서빙 API 분리, sensor_positions API 추가, measurements 시간 필터링 정확도 개선

## ⚠️ 주의사항

### 권한 관리
- **NonMultiMonitor**: `Administrator`, `Manager`, `Operator`, `Monitor` 역할
- **MultiMonitor**: 센서 조회 및 파일 관리만 가능
- 최소 1개 이상의 관리자 계정을 항상 유지할 것

### 파일 저장
- Render 특성상 서버 재시작 시 업로드된 파일이 삭제될 수 있음
- **평면도는 DB(base64)에 저장되므로 서버 재시작 후에도 유지됨**

### 데이터베이스
- AWS RDS db.t3.micro 사용 중 (월 약 $20~25 비용 발생)
- 24시간 센서 데이터 수신 환경에 최적화

### DB 비밀번호 자동 교체
- AWS Secrets Manager 자동 교체 비활성화 완료 (2026.04.09)
- DB 연결 오류 발생 시 AWS Secrets Manager에서 최신 비밀번호 확인 후 Render 환경변수 DATABASE_URL 업데이트 필요

### 80053 비정상 데이터(raw=0) 3단계 방어
1. /api/ingest: value < 100 차단 (DB 저장 자체 방지)
2. 앱 시작 시: 기존 비정상 데이터 자동 삭제
3. 에이전트: 전송 전 value < 100 필터링

### PATCH /api/sensors/:id 주의사항
- `fields.length === 0` 체크는 반드시 모든 필드 추가 후 마지막에 위치해야 함
- correction_params, formula_params만 단독 전송 시에도 정상 저장되어야 함

### 새 API 추가 시 주의사항
- `POST /api/sensors/:id/floor-plan`: sensors가 아닌 sites 테이블에 저장 (현장 단위 통일)
- `PATCH /api/sites/:id/sensor-positions`: positions JSON 객체 전체를 교체 방식으로 저장
- 평면도 서빙 API는 인증 없이 공개 (`requireAuth` 없음) — img 태그에서 직접 호출하기 때문
