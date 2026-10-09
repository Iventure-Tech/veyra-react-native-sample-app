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
  type ConnectionSettings,
} from '../src/connection';

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

const settings = (over: Partial<ConnectionSettings> = {}): ConnectionSettings => ({
  clientId: 'id',
  clientSecret: 'secret',
  bankBackendBaseUrl: 'https://bank.example/',
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
  it('the assertion provider carries the client id', () => {
    const auth = assertionProvider(settings());
    expect(auth.providerType).toBe('AUTHENTICATION');
    expect(typeof auth.assertion).toBe('function');
    expect(auth.clientId).toBe('id');
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
  it('posts the thumbprint and audience with the bank session and returns the assertion', async () => {
    const { http, calls } = fakeFetch([{ status: 200, body: '{"assertion":"eyJ.a.b"}' }]);
    const provider = bankBackendAssertionProvider('client-id', 'https://bank.example', () => 'bank-session', http);
    expect(provider.providerType).toBe('AUTHENTICATION');
    expect(provider.clientId).toBe('client-id');
    await expect(provider.assertion('https://api.uat.veyra.co', 'JKT-1')).resolves.toBe('eyJ.a.b');
    expect(calls[0].url).toBe('https://bank.example/sdk-assertion');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ audience: 'https://api.uat.veyra.co', jkt: 'JKT-1' });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer bank-session');
  });

  it('no session means no assertion and no call', async () => {
    const { http, calls } = fakeFetch([]);
    await expect(bankBackendAssertionProvider('client-id', 'https://bank.example', () => null, http).assertion('https://api.uat.veyra.co', 'JKT')).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('parse rules: null on 401, throws on anything else unusable', () => {
    expect(parseAssertion(401, '')).toBeNull();
    expect(parseAssertion(200, '{"assertion":"x"}')).toBe('x');
    expect(() => parseAssertion(500, '')).toThrow();
    expect(() => parseAssertion(200, '{"other":1}')).toThrow();
    expect(() => parseAssertion(200, '{"assertion":""}')).toThrow();
    expect(() => parseAssertion(200, 'not json')).toThrow();
  });
});

describe('bankBackendRelay', () => {
  it('forwards the envelope unchanged and returns the body unchanged', async () => {
    const veyraBody = '{"response_code":"00","weird":"ü ✓"}';
    const envelope = '{"v":1,"path":"/paymentgateway/v1/payment","headers":{},"body":"{}"}';
    const { http, calls } = fakeFetch([{ status: 200, body: veyraBody }]);
    const relay = bankBackendRelay('https://bank.example', () => 'bank-session', http);
    await expect(relay.patch(envelope)).resolves.toBe(veyraBody);
    expect(calls[0].url).toBe('https://bank.example/veyra-relay/patch');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(envelope);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer bank-session');
  });

  it('each method has its own route', async () => {
    const { http, calls } = fakeFetch(Array.from({ length: 5 }, () => ({ status: 200, body: 'ok' })));
    const r = bankBackendRelay('https://bank.example', () => null, http);
    await r.post('{}');
    await r.get('{}');
    await r.put('{}');
    await r.delete('{}');
    await r.patch('{}');
    expect(calls.map((c) => c.url)).toEqual(
      ['post', 'get', 'put', 'delete', 'patch'].map((m) => `https://bank.example/veyra-relay/${m}`)
    );
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
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
