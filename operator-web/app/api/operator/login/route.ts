import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let email = '';
  let password = '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    email = String(body.email || '');
    password = String(body.password || '');
  } else {
    const form = await request.formData();
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
    const error = await response.json().catch(() => ({ error: 'E-mail ou senha inválidos.' }));
    if (contentType.includes('application/json'))
      return NextResponse.json(
        { error: error.error || 'E-mail ou senha inválidos.' },
        { status: response.status },
      );
    return NextResponse.redirect(new URL(`/?loginError=${encodeURIComponent(error.error || 'E-mail ou senha inválidos.')}`, request.url), 303);
  }
  const session = await response.json().catch(() => null);
  if (!session?.token || !session?.user)
    return NextResponse.json({ error: 'O backend retornou uma sessão inválida.' }, { status: 502 });
  if (contentType.includes('application/json')) return NextResponse.json(session);
  const target = new URL('/', request.url);
  target.hash = new URLSearchParams({
    operatorToken: session.token,
    operatorName: session.user.name,
    operatorRole: session.user.role,
  }).toString();
  return NextResponse.redirect(target, 303);
}
