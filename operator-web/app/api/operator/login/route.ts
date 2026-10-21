import { NextResponse } from 'next/server';

type LoginSession = { token?: string; user?: { name?: string; role?: string } };

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let email = '';
  let password = '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    email = String(body.email || '');
    password = String(body.password || '');
  } else {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Formulário de login inválido.' }, { status: 400 });
    }
    email = String(form.get('email') || '');
    password = String(form.get('password') || '');
  }
  const backend = process.env.OPERATOR_BACKEND_URL || 'http://127.0.0.1:3000';
  let response: Response;
  try {
    response = await fetch(`${backend}/api/operator/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível conectar ao backend. Verifique se o servidor está ligado.' },
      { status: 503 },
    );
  }
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let error: { error?: string } = {};
    try {
      error = raw ? (JSON.parse(raw) as { error?: string }) : {};
    } catch {
      error = {};
    }
    const message = error.error || `Backend indisponível (${response.status}).`;
    if (contentType.includes('application/json'))
      return NextResponse.json({ error: message }, { status: response.status });
    return NextResponse.redirect(new URL(`/?loginError=${encodeURIComponent(message)}`, request.url), 303);
  }
  const raw = await response.text().catch(() => '');
  let session: LoginSession | null = null;
  try {
    session = raw ? (JSON.parse(raw) as LoginSession) : null;
  } catch {
    session = null;
  }
  if (!session?.token || !session?.user)
    return NextResponse.json({ error: 'O backend retornou uma sessão inválida.' }, { status: 502 });
  if (contentType.includes('application/json')) return NextResponse.json(session);
  const target = new URL('/', request.url);
  target.hash = new URLSearchParams({
    operatorToken: session.token,
    operatorName: session.user.name || 'Operador',
    operatorRole: session.user.role || 'viewer',
  }).toString();
  return NextResponse.redirect(target, 303);
}
