import {
  VeyraRelayError,
  type VeyraAssertionProvider,
  type VeyraClientSecretProvider,
  type VeyraProvider,
  type VeyraProxyProvider,
} from 'veyra-sdk-react-native';

/**
 * The values the providers read, from the gitignored `veyra.config.ts` (copy
 * `veyra.config.example.ts`). There is no mode: which provider the app passes is chosen in code,
 * in {@link appProvider}, and each provider reads only its own values.
 */
export interface ConnectionSettings {
  /** OAuth client id issued by Veyra (the assertion and client-secret providers). */
  clientId: string;
  /** The client-secret provider only — deprecated. */
  clientSecret: string;
  /** Your bank backend (the assertion and proxy providers), e.g. https://bank-backend.example */
  bankBackendBaseUrl: string;
  /**
   * PLACEHOLDER for your bank app's own logged-in session, sent to your bank backend as a bearer
   * token; empty means nobody is signed in. Not a Veyra credential.
   */
  bankSessionToken: string;
}

type Fetch = typeof fetch;

/** An untouched template value counts as unset. */
const setting = (v: string | undefined): string => {
  const t = (v ?? '').trim();
  return t.startsWith('your-') ? '' : t;
};

/**
 * The provider this app passes to `Veyra.initialize` — one for both SDKs. There is no mode: the SDK
 * works out how to reach Veyra from the kind of provider it is given, so switching is returning a
 * different one here.
 *
 * Return ONE of the three. The sample ships with the client-secret provider so it runs with just
 * your onboarding client id and secret — **for testing only**; a real app returns
 * {@link assertionProvider} or {@link proxyProvider}.
 */
export function appProvider(settings: ConnectionSettings): VeyraProvider {
  return clientSecretProvider(settings);
  // return assertionProvider(settings);
  // return proxyProvider(settings);
}

/** Your client id, and the bank backend that signs the assertion. */
export function assertionProvider(settings: ConnectionSettings, http: Fetch = fetch): VeyraAssertionProvider {
  return bankBackendAssertionProvider(setting(settings.clientId), bankBackend(settings), bankSession(settings), http);
}

/** Only the bank backend that relays the SDK's calls — no client id, no secret. */
export function proxyProvider(settings: ConnectionSettings, http: Fetch = fetch): VeyraProxyProvider {
  return bankBackendRelay(bankBackend(settings), bankSession(settings), http);
}

/** Deprecated, testing only: just the client id and secret. */
export function clientSecretProvider(settings: ConnectionSettings): VeyraClientSecretProvider {
  return clientSecretCredentials(setting(settings.clientId), setting(settings.clientSecret));
}

function bankSession(settings: ConnectionSettings): () => string | null {
  return () => setting(settings.bankSessionToken) || null;
}

/**
 * The deprecated client-secret provider — **for testing only**, e.g. against UAT before your bank
 * backend can sign assertions. A secret inside an app can be extracted: ship
 * {@link bankBackendAssertionProvider} or {@link bankBackendRelay} instead.
 */
export function clientSecretCredentials(clientId: string, clientSecret: string): VeyraClientSecretProvider {
  return { providerType: 'AUTHENTICATION', clientId, clientSecret };
}

function bankBackend(settings: ConnectionSettings): string {
  const base = setting(settings.bankBackendBaseUrl).replace(/\/+$/, '');
  if (!base) throw new Error('VEYRA_CONNECTION.bankBackendBaseUrl must be set in veyra.config.ts for this provider');
  return base;
}

/**
 * The assertion provider: fetch a short-lived assertion for the signed-in user from **your bank
 * backend's endpoint** (`POST {base}/sdk-assertion`). Your backend signs a JWT with at least `iss`,
 * `sub`, `aud` equal to the `audience` the SDK passes here, `iat`, `exp` ≤ 5 min and a unique `jti`;
 * `cnf.jkt` (the `jkt` the SDK passes here) and `acr` are optional. Request `{"audience": …, "jkt": …}` with your
 * app's session; response `{"assertion": "<compact JWT>"}`.
 * Resolves null when no user is signed in (no session, or 401) — the SDK then fails the call with
 * NOT_AUTHENTICATED and sends nothing; any other failure rejects, with the same effect.
 */
export function bankBackendAssertionProvider(
  clientId: string,
  baseUrl: string,
  session: () => string | null,
  http: Fetch = fetch
): VeyraAssertionProvider {
  return {
    providerType: 'AUTHENTICATION',
    clientId, // the OAuth client id Veyra issued to this app (public, not a secret)
    assertion: async (audience, jkt) => {
      const token = session();
      if (!token) return null; // logged out
      const res = await http(`${baseUrl}/sdk-assertion`, {
        method: 'POST',
        // Your bank session, not a Veyra credential.
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audience, jkt }),
      });
      return parseAssertion(res.status, await res.text());
    },
  };
}

/** The assertion from your backend's answer: null on 401 (no session), throws otherwise. */
export function parseAssertion(status: number, body: string): string | null {
  if (status === 401) return null;
  if (status < 200 || status > 299) throw new Error(`sdk-assertion answered HTTP ${status}`);
  let assertion: unknown;
  try {
    assertion = JSON.parse(body)?.assertion;
  } catch {
    assertion = undefined;
  }
  if (typeof assertion !== 'string' || assertion === '') {
    throw new Error('sdk-assertion answered without an assertion');
  }
  return assertion;
}

/**
 * The proxy provider: send every SDK call through **your bank backend**. The SDK's envelope goes,
 * unchanged, as the body of `POST {base}/veyra-relay/{method}`; your backend authenticates to
 * Veyra with its own client-credentials token, forwards path/query/headers/body to the Veyra API
 * unmodified, and answers with Veyra's response body — returned here unchanged.
 *
 * This is called from the SDK's background work too (status polling, key refresh, credit
 * confirmations), so it must not depend on a screen being up.
 */
export function bankBackendRelay(
  baseUrl: string,
  session: () => string | null,
  http: Fetch = fetch
): VeyraProxyProvider {
  const forward = (method: string) => async (envelope: string): Promise<string> => {
    const token = session();
    let res: Response;
    try {
      res = await http(`${baseUrl}/veyra-relay/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: envelope, // the envelope, unmodified
      });
    } catch (e) {
      // fetch rejects the same way whether the request never left the phone or the connection
      // dropped after it was written, so this cannot prove "never sent": neverSent stays false,
      // and a payment stays pending and is reconciled — the safe direction.
      throw new VeyraRelayError('OTHER', false, null, (e as Error)?.message);
    }
    const body = await res.text();
    // Your backend relays Veyra's status: a non-2xx came back from Veyra (or your backend), so
    // the request was delivered and may have been processed.
    if (res.status < 200 || res.status > 299) throw new VeyraRelayError('OTHER', false, res.status);
    return body; // Veyra's body, unmodified
  };
  return {
    providerType: 'PROXY',
    post: forward('post'),
    get: forward('get'),
    put: forward('put'),
    delete: forward('delete'),
    patch: forward('patch'),
  };
}
