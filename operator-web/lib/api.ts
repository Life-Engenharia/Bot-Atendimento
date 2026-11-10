/** Cliente HTTP do painel. As chamadas vão para /api/* (rewrite do next.config.mjs → OPERATOR_BACKEND_URL). */

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem('operatorToken') || ''}`,
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor de atendimento. Verifique se o backend está ativo e tente novamente.',
    );
  }
  const raw = r.status === 204 ? '' : await r.text().catch(() => '');
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const errorMessage = body && typeof body === 'object' && 'error' in body ? String(body.error) : undefined;
  if (!r.ok) throw new Error(errorMessage || `A API retornou HTTP ${r.status}.`);
  return body as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
