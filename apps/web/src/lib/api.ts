// Em dev: usar NEXT_PUBLIC_API_URL (ex: http://localhost:3001)
// Em produção atrás do nginx: string vazia → URL relativa (/api/...) → mesmo host
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('adlogs_token') : null;

  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    const error = await res.json().catch(() => ({ message: 'Não autorizado' }));
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      localStorage.removeItem('adlogs_token');
      window.location.href = '/login';
    }
    throw new Error((error as { message?: string }).message ?? 'Não autorizado');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Erro desconhecido' }));
    throw new Error((error as { message?: string }).message ?? 'Erro na requisição');
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
