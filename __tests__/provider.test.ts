/**
 * The app's connection to Veyra: no default mode, and the two bank-backend callbacks — the
 * assertion provider and the relay — behave like the native samples' (same endpoints, same
 * null-on-401, same envelope-in / body-out, and never claiming "never sent" without proof).
 */
import { describe, expect, it, jest } from '@jest/globals';
import {
  appProvider,
  assertionProvider,
  clientSecretProvider,
  proxyProvider,
  bankBackendAssertionProvider,
  bankBackendRelay,
  bankSession,
  parseAssertion,
  type ProviderSettings,
} from '../src/provider';

// The wrapper's entry point starts its native bridge on import, which a unit test has none of;
// these tests need only its real VeyraRelayError.
jest.mock('veyra-sdk-react-native', () => ({
  VeyraRelayError: (jest.requireActual('veyra-sdk-react-native/src/connection') as {
    VeyraRelayError: unknown;
  }).VeyraRelayError,
}));

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that records each call and answers from `answers` in order (or throws). */
function fakeFetch(answers: Array<{ status: number; body: string } | Error>) {
  const calls: Call[] = [];
  const http = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (next === undefined) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return { status: next.status, text: async () => next.body } as Response;
  }) as unknown as typeof fetch;
  return { http, calls };
}

const settings = (over: Partial<ProviderSettings> = {}): ProviderSettings => ({
  clientId: 'id',
  clientSecret: 'secret',
  bankBackendBaseUrl: 'https://bank.example/',
  bankClientId: 'bank-id',
  bankClientSecret: 'bank-secret',
  username: 'ada',
  password: 'p@ss w&rd',
  ...over,
});

describe('appProvider', () => {
  it('has no mode: the sample ships the proxy provider', () => {
    const p = appProvider(settings()) as { providerType: string; clientId?: string; clientSecret?: string };
    expect(p.providerType).toBe('PROXY');
    expect(p.clientId).toBeUndefined();
    expect(p.clientSecret).toBeUndefined();
  });

  it('refuses without the bank backend, naming it', () => {
    expect(() => appProvider(settings({ bankBackendBaseUrl: '' }))).toThrow(/bankBackendBaseUrl/);
  });
});

describe('each provider reads only its own values', () => {
  it('the assertion provider carries only the Veyra client id', () => {
    const auth = assertionProvider(settings());
    expect(auth.providerType).toBe('AUTHENTICATION');
    expect(typeof auth.assertion).toBe('function');
    expect(auth.clientId).toBe('id');
    expect(Object.keys(auth).sort()).toEqual(['assertion', 'clientId', 'providerType']);
  });

  it('the assertion provider needs the bank client', () => {
    expect(() => assertionProvider(settings({ bankClientId: '' }))).toThrow(/bankClientId/);
    expect(() => assertionProvider(settings({ bankClientSecret: ' ' }))).toThrow(/bankClientSecret/);
    expect(() => assertionProvider(settings({ bankClientId: 'your-bank-client-id' }))).toThrow(/bankClientId/);
  });

  it('the proxy provider needs the bank client to log in', () => {
    expect(() => proxyProvider(settings({ bankClientId: '' }))).toThrow(/bankClientId/);
  });

  it('the proxy provider needs no Veyra client id or secret', () => {
    const p = proxyProvider(settings({ clientId: '', clientSecret: '' }));
    expect(p.providerType).toBe('PROXY');
    expect('clientId' in p).toBe(false);
  });

  it('the client-secret provider never reads the bank backend', () => {
    const c = clientSecretProvider(settings({ bankBackendBaseUrl: '', username: '' }));
    expect(c.clientId).toBe('id');
    expect(c.clientSecret).toBe('secret');
    expect(Object.keys(c).sort()).toEqual(['clientId', 'clientSecret', 'providerType']);
  });

  it('the bank-backend providers need the bank backend URL', () => {
    expect(() => proxyProvider(settings({ bankBackendBaseUrl: '' }))).toThrow(/bankBackendBaseUrl/);
    expect(() => assertionProvider(settings({ bankBackendBaseUrl: ' ' }))).toThrow(/bankBackendBaseUrl/);
  });

  it('treats untouched template values as unset', () => {
    expect(clientSecretProvider(settings({ clientId: 'your-client-id' })).clientId).toBe('');
  });
});

describe('bankBackendAssertionProvider', () => {
  const provider = (http: typeof fetch, session: () => Promise<string | null> = async () => 'bank-session') =>
    bankBackendAssertionProvider('client-id', 'bank-id', 'bank-secret', 'https://bank.example', session, http);

  it('exchanges the bank session for an assertion at the token endpoint', async () => {
    const { http, calls } = fakeFetch([{ status: 200, body: '{"access_token":"eyJ.a.b","token_type":"N_A"}' }]);
    const p = provider(http);
    expect(p.providerType).toBe('AUTHENTICATION');
    expect(p.clientId).toBe('client-id');
    await expect(p.assertion('https://api.uat.veyra.co', 'JKT-1')).resolves.toBe('eyJ.a.b');
    expect(calls[0].url).toBe('https://bank.example/oauth2/token');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('bank-id:bank-secret').toString('base64')}`);
    expect(Object.fromEntries(new URLSearchParams(calls[0].init.body as string))).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'bank-session',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      audience: 'https://api.uat.veyra.co',
    });
  });

  it('no session means no assertion and no call', async () => {
    const { http, calls } = fakeFetch([]);
    await expect(provider(http, async () => null).assertion('https://api.uat.veyra.co', 'JKT')).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('a refused session (401) means no assertion', async () => {
    const { http } = fakeFetch([{ status: 401, body: '' }]);
    await expect(provider(http).assertion('https://api.uat.veyra.co', 'JKT')).resolves.toBeNull();
  });

  it('an error answer rejects and quotes the server', async () => {
    const { http } = fakeFetch([{ status: 400, body: '{"error":"invalid_grant"}' }]);
    await expect(provider(http).assertion('https://api.uat.veyra.co', 'JKT')).rejects.toThrow(/HTTP 400.*invalid_grant/);
  });

  it('parse rules: null on 401, throws on anything else unusable', () => {
    expect(parseAssertion(401, '')).toBeNull();
    expect(parseAssertion(200, '{"access_token":"x"}')).toBe('x');
    expect(() => parseAssertion(500, '')).toThrow();
    expect(() => parseAssertion(200, '{"other":1}')).toThrow();
    expect(() => parseAssertion(200, '{"access_token":""}')).toThrow();
    expect(() => parseAssertion(200, 'not json')).toThrow();
  });
});

describe('bankBackendRelay', () => {
  it('forwards the envelope unchanged and returns the body unchanged', async () => {
    const veyraBody = '{"response_code":"00","weird":"ü ✓"}';
    const envelope =
      '{"version":1,"service":"SOFTPOS","method":"PATCH","path":"/merchants/M1","headers":{},"body":"{}"}';
    const { http, calls } = fakeFetch([{ status: 200, body: veyraBody }]);
    const relay = bankBackendRelay('https://bank.example', async () => 'bank-session', http);
    await expect(relay.send(envelope)).resolves.toBe(veyraBody);
    expect(calls[0].url).toBe('https://bank.example/issuertokengateway/v1/proxy');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(envelope);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer bank-session');
  });

  it('every call, whatever its method, posts to the one issuer token gateway endpoint', async () => {
    const { http, calls } = fakeFetch(Array.from({ length: 5 }, () => ({ status: 200, body: 'ok' })));
    const r = bankBackendRelay('https://bank.example', async () => 'bank-session', http);
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      await r.send(JSON.stringify({ version: 1, method: m }));
    }
    expect(calls.map((c) => c.url)).toEqual(Array(5).fill('https://bank.example/issuertokengateway/v1/proxy'));
    expect(calls.map((c) => c.init.method)).toEqual(Array(5).fill('POST'));
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer bank-session');
  });

  it('no bank session: the call never leaves the device', async () => {
    const { http, calls } = fakeFetch([]);
    const failure = await bankBackendRelay('https://bank.example', async () => null, http)
      .send('{}')
      .catch((e) => e);
    expect(failure.neverSent).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('a failed bank login: the call never leaves the device', async () => {
    const { http, calls } = fakeFetch([]);
    const failure = await bankBackendRelay(
      'https://bank.example',
      async () => {
        throw new Error('bank login answered HTTP 503');
      },
      http
    )
      .send('{}')
      .catch((e) => e);
    expect(failure.neverSent).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('returns a PROXY_FAILED body unchanged for the SDK to read', async () => {
    const proxyFailed =
      '{"response_status":"PROXY_FAILED","response_status_reason":"UPSTREAM_TIMEOUT","never_sent":false}';
    const { http } = fakeFetch([{ status: 200, body: proxyFailed }]);
    await expect(bankBackendRelay('https://bank.example', async () => 's', http).send('{}')).resolves.toBe(proxyFailed);
  });

  it('a non-2xx was delivered: may have been sent, with its status', async () => {
    const { http } = fakeFetch([{ status: 503, body: '' }]);
    const failure = await bankBackendRelay('https://bank.example', async () => 's', http)
      .send('{}')
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ kind: 'OTHER', neverSent: false, httpStatus: 503 });
  });

  it('a fetch failure cannot prove the request never left: neverSent stays false', async () => {
    const { http } = fakeFetch([new TypeError('Network request failed')]);
    const failure = await bankBackendRelay('https://bank.example', async () => 's', http)
      .send('{}')
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ kind: 'OTHER', neverSent: false, httpStatus: null });
  });
});

describe('bankSession', () => {
  const login = (status: number, body = '') => ({ status, body });
  const ok = (token: string, expiresIn = 3600) =>
    login(200, JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: expiresIn }));
  const form = (body: unknown) =>
    Object.fromEntries(
      String(body)
        .split('&')
        .map((kv) => kv.split('=').map(decodeURIComponent))
    );

  it('logs in with the password grant and the bank client', async () => {
    const { http, calls } = fakeFetch([ok('session-1')]);
    const s = bankSession('https://bank.example', 'bank-id', 'bank-secret', 'ada', 'p@ss w&rd', http);
    await expect(s.token()).resolves.toBe('session-1');
    expect(calls[0].url).toBe('https://bank.example/oauth2/token');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('bank-id:bank-secret')}`);
    expect(form(calls[0].init.body)).toEqual({ grant_type: 'password', username: 'ada', password: 'p@ss w&rd' });
  });

  it('is reused until it is about to expire, then renewed', async () => {
    let now = 1_000_000;
    const { http, calls } = fakeFetch([ok('session-1', 120), ok('session-2', 120)]);
    const s = bankSession('https://bank.example', 'b', 'c', 'ada', 'pw', http, () => now);
    await expect(s.token()).resolves.toBe('session-1');
    now += 60_000;
    await expect(s.token()).resolves.toBe('session-1');
    now += 31_000;
    await expect(s.token()).resolves.toBe('session-2');
    expect(calls).toHaveLength(2);
  });

  it('concurrent callers share one login', async () => {
    const { http, calls } = fakeFetch([ok('session-1')]);
    const s = bankSession('https://bank.example', 'b', 'c', 'ada', 'pw', http);
    await expect(Promise.all([s.token(), s.token(), s.token()])).resolves.toEqual(['session-1', 'session-1', 'session-1']);
    expect(calls).toHaveLength(1);
  });

  it('refused credentials mean nobody is signed in', async () => {
    const { http } = fakeFetch([login(400, '{"error":"invalid_grant"}'), login(401)]);
    const s = bankSession('https://bank.example', 'b', 'c', 'ada', 'wrong', http);
    await expect(s.token()).resolves.toBeNull();
    await expect(s.token()).resolves.toBeNull();
  });

  it('missing credentials send nothing', async () => {
    const { http, calls } = fakeFetch([]);
    await expect(bankSession('https://bank.example', 'b', 'c', '', 'pw', http).token()).resolves.toBeNull();
    await expect(bankSession('https://bank.example', 'b', 'c', 'ada', '', http).token()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('a server error rejects and caches nothing; clear forgets the session', async () => {
    const { http } = fakeFetch([login(503), ok('session-1'), ok('session-2')]);
    const s = bankSession('https://bank.example', 'b', 'c', 'ada', 'pw', http);
    await expect(s.token()).rejects.toThrow('bank login answered HTTP 503');
    await expect(s.token()).resolves.toBe('session-1');
    s.clear();
    await expect(s.token()).resolves.toBe('session-2');
  });
});
