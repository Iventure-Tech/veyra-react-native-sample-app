import {
  VeyraRelayError,
  type AssertionProvider,
  type VeyraConnection,
  type ViaAppBackendConnection,
} from 'veyra-sdk-react-native';

/**
 * How this app connects both SDKs to Veyra, from the gitignored `veyra.config.ts` (copy
 * `veyra.config.example.ts`). The connection mode is the app's own decision, so there is no
 * default: an unset or unknown mode stops the app at launch, naming what to set. Both SDKs use
 * the same mode here for simplicity; a real app may choose per SDK.
 */
export interface ConnectionSettings {
  /** 'directWithAssertion' | 'viaAppBackend' | 'directWithClientSecret' (deprecated). Required. */
  mode: string;
  /** OAuth client id issued by Veyra (directWithAssertion, directWithClientSecret). */
  clientId: string;
  /** directWithClientSecret only — deprecated. */
  clientSecret: string;
  /** Your bank backend (directWithAssertion, viaAppBackend), e.g. https://bank-backend.example */
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

/** The connection for either SDK. Throws, naming the setting, when the config is unusable. */
export function appConnection(settings: ConnectionSettings, http: Fetch = fetch): VeyraConnection {
  const mode = setting(settings.mode);
  const session = () => setting(settings.bankSessionToken) || null;
  switch (mode) {
    case 'directWithClientSecret':
      // Deprecated: a secret inside an app can be extracted. Retired per provider.
      return {
        mode: 'directWithClientSecret',
        clientId: setting(settings.clientId),
        clientSecret: setting(settings.clientSecret),
      };
    case 'directWithAssertion':
      return {
        mode: 'directWithAssertion',
        clientId: setting(settings.clientId),
        assertionProvider: bankBackendAssertionProvider(bankBackend(settings), session, http),
      };
    case 'viaAppBackend':
      return bankBackendRelay(bankBackend(settings), session, http);
    default:
      throw new Error(
        `VEYRA_CONNECTION.mode is not set (got "${mode}"). Copy veyra.config.example.ts to ` +
          "veyra.config.ts and choose 'directWithAssertion', 'viaAppBackend' or 'directWithClientSecret'."
      );
  }
}

function bankBackend(settings: ConnectionSettings): string {
  const base = setting(settings.bankBackendBaseUrl).replace(/\/+$/, '');
  if (!base) throw new Error('VEYRA_CONNECTION.bankBackendBaseUrl must be set in veyra.config.ts for this mode');
  return base;
}

/**
 * `directWithAssertion`: fetch a short-lived assertion for the signed-in user from **your bank
 * backend's endpoint** (`POST {base}/sdk-assertion`). Your backend signs a JWT with `iss`, `sub`,
 * `aud`, `exp` ≤ 5 min, a unique `jti`, `acr`, and `cnf.jkt` equal to the `jkt` the SDK passes
 * here. Request `{"jkt": …}` with your app's session; response `{"assertion": "<compact JWT>"}`.
 * Resolves null when no user is signed in (no session, or 401) — the SDK then fails the call with
 * NOT_AUTHENTICATED and sends nothing; any other failure rejects, with the same effect.
 */
export function bankBackendAssertionProvider(
  baseUrl: string,
  session: () => string | null,
  http: Fetch = fetch
): AssertionProvider {
  return async (jkt) => {
    const token = session();
    if (!token) return null; // logged out
    const res = await http(`${baseUrl}/sdk-assertion`, {
      method: 'POST',
      // Your bank session, not a Veyra credential.
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jkt }),
    });
    return parseAssertion(res.status, await res.text());
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
 * `viaAppBackend`: send every SDK call through **your bank backend**. The SDK's envelope goes,
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
): ViaAppBackendConnection {
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
    mode: 'viaAppBackend',
    post: forward('post'),
    get: forward('get'),
    put: forward('put'),
    delete: forward('delete'),
    patch: forward('patch'),
  };
}
