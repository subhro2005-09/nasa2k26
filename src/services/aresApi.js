const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, { method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`ARES API ${res.status} ${detail}`.trim());
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function quiet(fn) {
  try { return await fn(); } catch { return null; }
}

export async function getHealth() {
  return quiet(() => request('/health'));
}

export async function createMission(data) {
  return quiet(() => request('/api/missions', { method: 'POST', body: data }));
}

export async function analyzeMission(data) {
  return quiet(() => request('/api/navigation/analyze', { method: 'POST', body: data }));
}

export async function compareRoutes(data) {
  return quiet(() => request('/api/navigation/compare', { method: 'POST', body: data }));
}

export async function reportHazard(data) {
  return quiet(() => request('/api/navigation/hazard', { method: 'POST', body: data }));
}

export async function updateTelemetry(data) {
  return quiet(() => request('/api/telemetry/update', { method: 'POST', body: data }));
}
