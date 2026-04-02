const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://yuhyun-sensor-monitoring-back.onrender.com'

async function request(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('gm_token') : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '요청 실패')
  return data
}

// ─── 인증 ───────────────────────────────────────────────────────────────────
export const authApi = {
  register: (body: { username: string; email: string; password: string; role?: string }) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  logout: () =>
    request('/api/auth/logout', { method: 'POST' }),

  me: () => request('/api/auth/me'),
}

// ─── 센서 ───────────────────────────────────────────────────────────────────
export const sensorApi = {
  getAll: (status?: string) =>
    request(`/api/sensors${status ? `?status=${status}` : ''}`),

  getById: (id: number) =>
    request(`/api/sensors/${id}`),

  getMeasurements: (id: number, params?: { from?: string; to?: string; depthLabel?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (params?.from) q.set('from', params.from)
    if (params?.to) q.set('to', params.to)
    if (params?.depthLabel) q.set('depthLabel', params.depthLabel)
    if (params?.limit) q.set('limit', String(params.limit))
    return request(`/api/sensors/${id}/measurements?${q.toString()}`)
  },

  getDepths: (id: number) =>
    request(`/api/sensors/${id}/depths`),
}

// ─── 알람 ───────────────────────────────────────────────────────────────────
export const alarmApi = {
  getAll: (acknowledged?: boolean) =>
    request(`/api/alarms${acknowledged !== undefined ? `?acknowledged=${acknowledged}` : ''}`),

  acknowledge: (id: number, acknowledgedBy?: string) =>
    request(`/api/alarms/${id}/acknowledge`, { method: 'PATCH', body: JSON.stringify({ acknowledgedBy }) }),
}

// ─── 대시보드 ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  get: () => request('/api/dashboard'),
}

// ─── 사용자 관리 ─────────────────────────────────────────────────────────────
export const userApi = {
  getAll: () => request('/api/users'),
  getActive: () => request('/api/users/active'),
  getList: () => request('/api/users/list'),
  edit: (id: number, body: { username: string; email: string; role: string }) =>
    request(`/api/users/${id}/edit`, { method: 'PATCH', body: JSON.stringify(body) }),
  deactivate: (id: number) => request(`/api/users/${id}/deactivate`, { method: 'PATCH' }),
  activate: (id: number) => request(`/api/users/${id}/activate`, { method: 'PATCH' }),
  delete: (id: number) => request(`/api/users/${id}`, { method: 'DELETE' }),
}

// ─── 파일 ───────────────────────────────────────────────────────────────────
export const fileApi = {
  getAll: () => request('/api/files'),

  upload: (file: File) => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('gm_token') : null
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE}/api/files/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json())
  },

  download: (id: number) => {
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('gm_token') : null
    return fetch(`${API_BASE}/api/files/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },

  delete: (id: number) => request(`/api/files/${id}`, { method: 'DELETE' }),
}