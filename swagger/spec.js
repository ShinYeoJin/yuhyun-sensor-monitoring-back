const swaggerJsdoc = require('swagger-jsdoc')

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'GeoMonitor API',
      version: '1.7.0',
      description: '지반 계측 모니터링 시스템 API\n\n**인증 방법**: 로그인 후 발급된 JWT 토큰을 Authorize 버튼에 입력\n\n**에이전트 전용 API** (`/api/ingest`, `/api/agent/*`, `/api/recollect/pending`)는 현장 PC 에이전트에서만 사용하며 앱 개발 시 불필요합니다.',
    },
    servers: [{ url: 'https://yuhyun-sensor-monitoring-back.onrender.com' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: '인증', description: '회원가입 / 로그인 / 로그아웃' },
      { name: '센서', description: '센서 조회 및 편집' },
      { name: '측정값', description: '센서 측정값 조회' },
      { name: '평면도', description: '센서 및 현장 평면도 업로드/조회' },
      { name: '알람', description: '알람 조회 및 처리' },
      { name: '대시보드', description: '대시보드 요약' },
      { name: '현장', description: '현장 추가 / 수정 / 삭제' },
      { name: '사용자', description: '사용자 관리' },
      { name: '파일', description: '파일 업로드 / 다운로드' },
      { name: '재수집', description: '데이터 재수집 요청' },
      { name: '에이전트', description: '에이전트 heartbeat 및 상태 조회' },
      { name: '계산식', description: '계산식 관리' },
      { name: '지오코딩', description: '주소 → 좌표 변환 (카카오 REST API 프록시)' },
      { name: '시스템', description: '헬스체크' },
    ],
    paths: {
      '/api/health': {
        get: { tags: ['시스템'], summary: 'DB 연결 상태 확인', security: [], responses: { 200: { description: 'DB 연결 정상' } } }
      },

      // ── 인증 ──
      '/api/auth/register': {
        post: {
          tags: ['인증'], summary: '회원가입', security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: {
              username: { type: 'string', example: 'user1' },
              email: { type: 'string', example: 'user1@example.com' },
              password: { type: 'string', example: 'password123' }
            }, required: ['username', 'email', 'password'] } } }
          },
          responses: { 201: { description: '회원가입 성공 (기본 role: MultiMonitor)' } }
        }
      },
      '/api/auth/login': {
        post: {
          tags: ['인증'], summary: '로그인', security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: {
              email: { type: 'string', example: 'admin@geomonitor.com' },
              password: { type: 'string', example: 'admin1234' }
            }, required: ['email', 'password'] } } }
          },
          responses: { 200: { description: '로그인 성공 — JWT 토큰 반환' } }
        }
      },
      '/api/auth/logout': {
        post: { tags: ['인증'], summary: '로그아웃', responses: { 200: { description: '로그아웃 성공' } } }
      },
      '/api/auth/me': {
        get: { tags: ['인증'], summary: '내 정보 조회 (토큰 유효성 검증)', responses: { 200: { description: '사용자 정보' } } }
      },

      // ── 센서 ──
      '/api/sensors': {
        get: {
          tags: ['센서'], summary: '센서 목록 조회', security: [],
          parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['normal', 'warning', 'danger', 'offline'] } }],
          responses: { 200: { description: '센서 목록 (80053은 Linear 기준 current_value)' } }
        }
      },
      '/api/sensors/{id}': {
        get: {
          tags: ['센서'], summary: '센서 상세 조회', security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '센서 상세 (has_floor_plan, has_site_floor_plan, sensor_positions, depth_criteria 포함)' } }
        }
      },
      '/api/sensors/{id}/threshold': {
        patch: {
          tags: ['센서'], summary: '센서 임계값 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              threshold_normal_max: { type: 'number', example: -7.0 },
              threshold_warning_max: { type: 'number', example: -6.0 },
              threshold_danger_min: { type: 'number', example: -5.0 }
            } } } }
          },
          responses: { 200: { description: '임계값 수정 완료' } }
        }
      },
      '/api/sensors/{id}/site': {
        patch: {
          tags: ['센서'], summary: '센서 소속 현장 변경',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              site_code: { type: 'string', example: 'site-main', description: '빈 문자열이면 미배정 처리' }
            } } } }
          },
          responses: { 200: { description: '현장 변경 완료' } }
        }
      },
      '/api/sensors/{id}#patch': {
        patch: {
          tags: ['센서'], summary: '센서 정보 수정 (formula_params, correction_params, depth_criteria 포함)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string' },
              manage_no: { type: 'string' },
              sensor_type: { type: 'string' },
              unit: { type: 'string' },
              field: { type: 'string' },
              formula: { type: 'string' },
              level1_upper: { type: 'number', example: -4.0 },
              level1_lower: { type: 'number', example: -11.0 },
              install_date: { type: 'string', example: '2026-04-07' },
              location_desc: { type: 'string' },
              formula_params: { type: 'object', example: { G: 0.012044, A: 7.08e-8, B: -0.012296, C: 106.0458 } },
              correction_params: { type: 'object', example: { '1': 0.5, '2': -0.3, '3': 0.0 } },
              depth_criteria: { type: 'object', example: { '1': { upper: -4.0, lower: -11.0 }, '2': { upper: -4.0, lower: -11.0 } } }
            } } } }
          },
          responses: { 200: { description: '센서 정보 수정 완료' } }
        }
      },

      // ── 측정값 ──
      '/api/sensors/{id}/measurements': {
        get: {
          tags: ['측정값'], summary: '센서 측정값 조회', security: [],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'from', in: 'query', schema: { type: 'string' }, description: 'T 포함 시 해당 시각 그대로 사용 (예: 2026-04-22T16:00:00)' },
            { name: 'to', in: 'query', schema: { type: 'string' } },
            { name: 'depthLabel', in: 'query', schema: { type: 'string', enum: ['1', '2', '3'] }, description: '80053 전용' },
            { name: 'limit', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { 200: { description: '측정값 목록 (value: Poly, linear_value: Linear, raw_value: 원시값)' } }
        }
      },
      '/api/sensors/{id}/depths': {
        get: {
          tags: ['측정값'], summary: '센서 깊이 목록 조회 (80053 전용)', security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '깊이 목록' } }
        }
      },
      '/api/ingest': {
        post: {
          tags: ['측정값'], summary: '센서 데이터 수신 (에이전트 전용)',
          security: [{ apiKeyAuth: [] }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              sensorCode: { type: 'string', example: '80053' },
              measurements: { type: 'array', items: { type: 'object' } }
            } } } }
          },
          responses: { 200: { description: '수신 성공' }, 403: { description: 'API Key 불일치' } }
        }
      },

      // ── 평면도 ──
      '/api/sensors/{id}/floor-plan': {
        post: {
          tags: ['평면도'], summary: '센서 평면도 업로드 → 해당 현장(sites)에 저장',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary', description: 'PNG/JPG/PDF (PDF는 자동 PNG 변환)' } } } } }
          },
          responses: { 200: { description: '업로드 성공' } }
        }
      },
      '/api/sensors/{id}/floor-plan-image': {
        get: {
          tags: ['평면도'], summary: '센서 평면도 이미지 서빙 (해당 현장 평면도 반환)', security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '이미지 binary' }, 404: { description: '평면도 없음' } }
        }
      },
      '/api/sites/{id}/floor-plan': {
        post: {
          tags: ['평면도'], summary: '현장 평면도 업로드 (base64 DB 저장)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary', description: 'PNG/JPG/PDF' } } } } }
          },
          responses: { 200: { description: '업로드 성공' } }
        }
      },
      '/api/sites/{id}/floor-plan-image': {
        get: {
          tags: ['평면도'], summary: '현장 평면도 이미지 서빙', security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '이미지 binary' }, 404: { description: '평면도 없음' } }
        }
      },
      '/api/sites/{id}/sensor-positions': {
        patch: {
          tags: ['평면도'], summary: '센서 아이콘 위치 저장',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              positions: { type: 'object', example: { '7:1': { label: 'WL-01', x: 0.3, y: 0.5 } } }
            } } } }
          },
          responses: { 200: { description: '저장 완료' } }
        }
      },

      // ── 알람 ──
      '/api/alarms': {
        get: {
          tags: ['알람'], summary: '알람 목록 조회', security: [],
          parameters: [
            { name: 'acknowledged', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { 200: { description: '알람 목록' } }
        }
      },
      '/api/alarms/{id}/acknowledge': {
        patch: {
          tags: ['알람'], summary: '알람 확인 처리',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '알람 확인 완료' } }
        }
      },

      // ── 대시보드 ──
      '/api/dashboard': {
        get: { tags: ['대시보드'], summary: '대시보드 요약 조회', security: [], responses: { 200: { description: '대시보드 데이터' } } }
      },

      // ── 현장 ──
      '/api/sites': {
        get: {
          tags: ['현장'], summary: '현장 목록 조회', security: [],
          responses: { 200: { description: '현장 목록 (has_floor_plan, sensor_positions, latitude, longitude 포함)' } }
        },
        post: {
          tags: ['현장'], summary: '현장 추가',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string', example: '김포 풍무 현장' },
              location: { type: 'string', example: '경기도 김포시' },
              description: { type: 'string' },
              managers: { type: 'array', items: { type: 'string' } },
              latitude: { type: 'number', example: 37.5665, description: '현장 위도' },
              longitude: { type: 'number', example: 126.9780, description: '현장 경도' }
            }, required: ['name'] } } }
          },
          responses: { 201: { description: '현장 추가 성공' } }
        }
      },
      '/api/sites/{id}': {
        patch: {
          tags: ['현장'], summary: '현장 수정 (이름/위치/설명/담당자/좌표 — floor_plan_url 미변경)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string' },
              location: { type: 'string' },
              description: { type: 'string' },
              managers: { type: 'array', items: { type: 'string' } },
              latitude: { type: 'number', example: 37.5665, description: '현장 위도' },
              longitude: { type: 'number', example: 126.9780, description: '현장 경도' }
            } } } }
          },
          responses: { 200: { description: '수정 완료 (평면도는 /floor-plan API로만 변경 가능)' } }
        },
        delete: {
          tags: ['현장'], summary: '현장 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '삭제 완료' } }
        }
      },

      // ── 사용자 ──
      '/api/users': {
        get: { tags: ['사용자'], summary: '전체 사용자 목록', responses: { 200: { description: '사용자 목록' } } }
      },
      '/api/users/list': {
        get: { tags: ['사용자'], summary: '사용자 목록 (인증 없음)', security: [], responses: { 200: { description: '활성 사용자 목록' } } }
      },
      '/api/users/{id}/edit': {
        patch: {
          tags: ['사용자'], summary: '사용자 정보 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              username: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string', enum: ['Administrator', 'Manager', 'Operator', 'Monitor', 'MultiMonitor'] },
              phone: { type: 'string' }
            } } } }
          },
          responses: { 200: { description: '수정 완료' } }
        }
      },
      '/api/users/{id}/password': {
        patch: {
          tags: ['사용자'], summary: '비밀번호 변경 (본인만)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              currentPassword: { type: 'string' },
              newPassword: { type: 'string' }
            }, required: ['currentPassword', 'newPassword'] } } }
          },
          responses: { 200: { description: '비밀번호 변경 완료' } }
        }
      },
      '/api/users/{id}/deactivate': {
        patch: {
          tags: ['사용자'], summary: '사용자 비활성화',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '비활성화 완료' } }
        }
      },
      '/api/users/{id}/activate': {
        patch: {
          tags: ['사용자'], summary: '사용자 활성화',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '활성화 완료' } }
        }
      },
      '/api/users/{id}': {
        delete: {
          tags: ['사용자'], summary: '사용자 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '삭제 완료' } }
        }
      },

      // ── 파일 ──
      '/api/files': {
        get: { tags: ['파일'], summary: '파일 목록 조회', responses: { 200: { description: '파일 목록' } } }
      },
      '/api/files/upload': {
        post: {
          tags: ['파일'], summary: '파일 업로드',
          requestBody: {
            content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } }
          },
          responses: { 201: { description: '업로드 성공' } }
        }
      },
      '/api/files/{id}/download': {
        get: {
          tags: ['파일'], summary: '파일 다운로드',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '파일 다운로드' } }
        }
      },
      '/api/files/{id}': {
        delete: {
          tags: ['파일'], summary: '파일 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '삭제 완료' } }
        }
      },

      // ── 재수집 ──
      '/api/recollect': {
        post: {
          tags: ['재수집'], summary: '재수집 요청 등록',
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              sensor_id: { type: 'integer' },
              from_date: { type: 'string', example: '2026-04-20' }
            }, required: ['sensor_id', 'from_date'] } } }
          },
          responses: { 201: { description: '요청 등록 완료' } }
        },
        get: { tags: ['재수집'], summary: '재수집 요청 목록 조회', responses: { 200: { description: '요청 목록' } } }
      },
      '/api/recollect/pending': {
        get: {
          tags: ['재수집'], summary: '처리 대기 요청 조회 (에이전트 전용)',
          security: [{ apiKeyAuth: [] }],
          responses: { 200: { description: '대기 요청 목록' } }
        }
      },
      '/api/recollect/{id}/done': {
        patch: {
          tags: ['재수집'], summary: '재수집 완료 처리 (에이전트 전용)',
          security: [{ apiKeyAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '완료 처리' } }
        }
      },
      '/api/recollect/{id}': {
        delete: {
          tags: ['재수집'], summary: '재수집 요청 취소',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '취소 완료' } }
        }
      },

      // ── 에이전트 ──
      '/api/agent/heartbeat': {
        post: {
          tags: ['에이전트'], summary: '에이전트 온라인 상태 보고',
          security: [{ apiKeyAuth: [] }],
          responses: { 200: { description: 'heartbeat 수신 완료' } }
        }
      },
      '/api/agent/status': {
        get: { tags: ['에이전트'], summary: '에이전트 상태 조회', security: [], responses: { 200: { description: '에이전트 온라인/오프라인 상태' } } }
      },

      // ── 지오코딩 ──
      '/api/geocode': {
        get: {
          tags: ['지오코딩'], summary: '주소 → 좌표 변환 (카카오 REST API 프록시)', security: [],
          description: '브라우저에서 카카오 REST API를 직접 호출하면 401 오류가 발생하므로, 서버에서 대신 호출하여 결과를 반환합니다. 환경변수 KAKAO_REST_KEY 필요.',
          parameters: [
            { name: 'query', in: 'query', required: true, schema: { type: 'string' }, description: '검색할 주소 (예: 경기도 김포시 풍무동)', example: '경기도 김포시 풍무동' }
          ],
          responses: {
            200: { description: '카카오 지오코딩 결과 (documents 배열 포함)' },
            400: { description: 'query 파라미터 누락' },
            500: { description: '카카오 API 호출 실패 또는 KAKAO_REST_KEY 미설정' }
          }
        }
      },

      // ── 계산식 ──
      '/api/formulas': {
        get: { tags: ['계산식'], summary: '계산식 목록 조회', security: [], responses: { 200: { description: '계산식 목록' } } },
        post: {
          tags: ['계산식'], summary: '계산식 추가',
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string' },
              formula: { type: 'string' },
              description: { type: 'string' }
            }, required: ['name', 'formula'] } } }
          },
          responses: { 201: { description: '계산식 추가 성공' } }
        }
      },
      '/api/formulas/{id}': {
        patch: {
          tags: ['계산식'], summary: '계산식 수정',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', properties: {
              name: { type: 'string' }, formula: { type: 'string' }, description: { type: 'string' }
            } } } }
          },
          responses: { 200: { description: '수정 완료' } }
        },
        delete: {
          tags: ['계산식'], summary: '계산식 삭제',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { 200: { description: '삭제 완료' } }
        }
      },
    }
  },
  apis: [],
}

module.exports = swaggerJsdoc(swaggerOptions)
