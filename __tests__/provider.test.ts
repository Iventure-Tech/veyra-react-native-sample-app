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
  bankSessionToken: 'bank-session',
  ...over,
});

describe('appProvider', () => {
  it('has no mode: the sample ships the testing-only client-secret provider', () => {
    const p = appProvider(settings()) as { providerType: string; clientId: string; clientSecret: string };
    expect(p.providerType).toBe('AUTHENTICATION');
    expect(p.clientSecret).toBe('secret');
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

  it('the proxy provider needs no client id or secret', () => {
    const p = proxyProvider(settings({ clientId: '', clientSecret: '' }));
    expect(p.providerType).toBe('PROXY');
    expect('clientId' in p).toBe(false);
  });

  it('the client-secret provider never reads the bank backend', () => {
    const c = clientSecretProvider(settings({ bankBackendBaseUrl: '', bankSessionToken: '' }));
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
  const provider = (http: typeof fetch, session: () => string | null = () => 'bank-session') =>
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
    await expect(provider(http, () => null).assertion('https://api.uat.veyra.co', 'JKT')).resolves.toBeNull();
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
    const relay = bankBackendRelay('https://bank.example', () => 'bank-session', http);
    await expect(relay.patch(envelope)).resolves.toBe(veyraBody);
    expect(calls[0].url).toBe('https://bank.example/issuertokengateway/v1');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(envelope);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer bank-session');
  });

  it('every method posts to the one issuer token gateway endpoint', async () => {
    const { http, calls } = fakeFetch(Array.from({ length: 5 }, () => ({ status: 200, body: 'ok' })));
    const r = bankBackendRelay('https://bank.example', () => null, http);
    await r.post('{}');
    await r.get('{}');
    await r.put('{}');
    await r.delete('{}');
    await r.patch('{}');
    expect(calls.map((c) => c.url)).toEqual(Array(5).fill('https://bank.example/issuertokengateway/v1'));
    expect(calls.map((c) => c.init.method)).toEqual(Array(5).fill('POST'));
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('returns a PROXY_FAILED body unchanged for the SDK to read', async () => {
    const proxyFailed =
      '{"response_status":"PROXY_FAILED","response_status_reason":"UPSTREAM_TIMEOUT","never_sent":false}';
    const { http } = fakeFetch([{ status: 200, body: proxyFailed }]);
    await expect(bankBackendRelay('https://bank.example', () => 's', http).post('{}')).resolves.toBe(proxyFailed);
  });

  it('a non-2xx was delivered: may have been sent, with its status', async () => {
    const { http } = fakeFetch([{ status: 503, body: '' }]);
    const failure = await bankBackendRelay('https://bank.example', () => 's', http)
      .post('{}')
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ kind: 'OTHER', neverSent: false, httpStatus: 503 });
  });

  it('a fetch failure cannot prove the request never left: neverSent stays false', async () => {
    const { http } = fakeFetch([new TypeError('Network request failed')]);
    const failure = await bankBackendRelay('https://bank.example', () => 's', http)
      .get('{}')
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ kind: 'OTHER', neverSent: false, httpStatus: null });
  });
});
