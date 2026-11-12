// Prueba de humo: recorre el sistema completo a través del gateway, como lo haría el frontend.
//
// Uso:
//   node scripts/smoke-test.mjs                                   (local, docker compose)
//   node scripts/smoke-test.mjs https://gateway-xxx.up.railway.app (Railway)
//
// Es el MISMO script en ambos casos: si pasa en local y falla en Railway, el problema
// es de configuración (variables, red privada), no de código.
const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/+$/, '');
let failures = 0;

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, requestId: res.headers.get('x-request-id') };
}

function check(name, condition, detail) {
  console.log(`${condition ? 'OK   ' : 'FALLA'} ${name}`);
  if (!condition) {
    failures++;
    console.log('      ', JSON.stringify(detail));
  }
}

console.log(`Probando ${base}\n`);

const health = await call('GET', '/health');
check('gateway /health responde 200', health.status === 200, health);

const email = `demo+${Date.now()}@tms.test`;
const password = 'una-clave-larga';

const reg = await call('POST', '/auth/register', { body: { email, password } });
check('registro → 201 (pasa por gateway hasta auth)', reg.status === 201, reg);

const dup = await call('POST', '/auth/register', { body: { email, password } });
check('registro duplicado → 409', dup.status === 409, dup);

const bad = await call('POST', '/auth/login', { body: { email, password: 'otra-clave-mala' } });
check('login con clave mala → 401', bad.status === 401, bad);

const login = await call('POST', '/auth/login', { body: { email, password } });
check('login → 200 con accessToken', login.status === 200 && typeof login.data.accessToken === 'string', login);
const token = login.data.accessToken;

const noToken = await call('GET', '/orders');
check('GET /orders sin token → 401 (lo corta el gateway)', noToken.status === 401, noToken);

const fake = await call('GET', '/orders', { token: `${token.slice(0, -4)}AAAA` });
check('GET /orders con firma alterada → 401', fake.status === 401, fake);

// Ataque clásico: un token "sin firma" que dice "alg": "none" y afirma ser cualquier usuario.
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  sub: '00000000-0000-0000-0000-000000000000',
  email: 'intruso@tms.test',
  iss: 'tms-auth',
  aud: 'tms-api',
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.`;
const none = await call('GET', '/orders', { token: unsigned });
check('GET /orders con token "alg: none" (sin firma) → 401', none.status === 401, none);

const created = await call('POST', '/orders', {
  token,
  body: { origin: 'Miami, FL', destination: 'Atlanta, GA', weightKg: 1250.5 },
});
check('POST /orders → 201 (gateway verifica, orders verifica otra vez)', created.status === 201, created);

const list = await call('GET', '/orders', { token });
check(
  'GET /orders → lista con la orden creada',
  list.status === 200 && Array.isArray(list.data) && list.data.some((o) => o.id === created.data?.id),
  list,
);

const one = await call('GET', `/orders/${created.data?.id}`, { token });
check('GET /orders/:id → 200', one.status === 200, one);

check('el gateway devuelve x-request-id', Boolean(one.requestId), one);

const jwks = await call('GET', '/.well-known/jwks.json');
check('el JWKS de auth NO es accesible en la raíz del gateway → 404', jwks.status === 404, jwks);

console.log(failures ? `\n${failures} prueba(s) fallaron.` : '\nTodo en orden.');
process.exit(failures ? 1 : 0);
