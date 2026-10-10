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
export interface ProviderSettings {
  /** OAuth client id issued by Veyra (the assertion and client-secret providers). */
  clientId: string;
  /** The client-secret provider only — deprecated. */
  clientSecret: string;
  /**
   * Your bank's authorization server (the assertion provider's token exchange) or bank backend
   * (the proxy provider), e.g. https://bank-backend.example
   */
  bankBackendBaseUrl: string;
  /**
   * Your bank's own OAuth client at its authorization server — NOT the Veyra client above, and
   * never passed to the SDK. The assertion provider authenticates the token exchange with it.
   */
  bankClientId: string;
  /** The secret of {@link bankClientId}. A secret in an app can be extracted. */
  bankClientSecret: string;
  /**
   * The demo user's bank login. The app logs in with them (password grant at
   * `{bankBackendBaseUrl}/oauth2/token`) to get the bank session both bank providers use. Empty
   * means nobody is signed in. A real app takes them from its login screen and never stores the
   * password. Not Veyra credentials.
   */
  username: string;
  password: string;
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
export function appProvider(settings: ProviderSettings): VeyraProvider {
  return clientSecretProvider(settings);
  // return assertionProvider(settings);
  // return proxyProvider(settings);
}

/**
 * Your Veyra client id (the only value the SDK receives), and your bank's own client at the
 * authorization server that exchanges the session for the assertion.
 */
export function assertionProvider(settings: ProviderSettings, http: Fetch = fetch): VeyraAssertionProvider {
  return bankBackendAssertionProvider(
    setting(settings.clientId),
    required(settings.bankClientId, 'bankClientId'),
    required(settings.bankClientSecret, 'bankClientSecret'),
    bankBackend(settings),
    sessionFor(settings, http),
    http
  );
}

/** Only the bank backend that relays the SDK's calls — no client id, no secret. */
export function proxyProvider(settings: ProviderSettings, http: Fetch = fetch): VeyraProxyProvider {
  return bankBackendRelay(bankBackend(settings), sessionFor(settings, http), http);
}

/** Deprecated, testing only: just the client id and secret. */
export function clientSecretProvider(settings: ProviderSettings): VeyraClientSecretProvider {
  return clientSecretCredentials(setting(settings.clientId), setting(settings.clientSecret));
}

/** One bank session per settings object, so a re-initialise keeps the signed-in user's token. */
const sessions = new WeakMap<ProviderSettings, BankSession>();

function sessionFor(settings: ProviderSettings, http: Fetch): () => Promise<string | null> {
  let session = sessions.get(settings);
  if (!session) {
    session = bankSession(
      bankBackend(settings),
      required(settings.bankClientId, 'bankClientId'),
      required(settings.bankClientSecret, 'bankClientSecret'),
      setting(settings.username),
      settings.password ?? '',
      http
    );
    sessions.set(settings, session);
  }
  return session.token;
}

/** The signed-in user's bank session; see {@link bankSession}. */
export interface BankSession {
  /** The current session token, logging in when there is none (or it is about to expire). */
  token: () => Promise<string | null>;
  /** Forget the session (sign-out): the next call logs in again. */
  clear: () => void;
}

/** When the server does not say, assume a short life; renew a little early. */
const DEFAULT_LIFETIME_SECONDS = 300;
const EXPIRY_MARGIN_SECONDS = 30;

/**
 * The signed-in user's **bank session**: an access token from your bank's authorization server,
 * obtained by logging the user in with their username and password (OAuth 2.0 password grant).
 * Both bank providers use it — the assertion provider as the token exchange's `subject_token`,
 * the proxy provider as `Authorization: Bearer` on every relayed call.
 *
 * Request: `POST {baseUrl}/oauth2/token`, your bank's client as HTTP Basic
 * `bankClientId:bankClientSecret`, form `grant_type=password&username=…&password=…`. Response:
 * `{"access_token": "…", "expires_in": 3600, …}`. Cached until shortly before it expires;
 * concurrent callers share one login. A refused login (400/401) or missing credentials resolve
 * null (nobody signed in); any other failure rejects.
 */
export function bankSession(
  baseUrl: string,
  bankClientId: string,
  bankClientSecret: string,
  username: string,
  password: string,
  http: Fetch = fetch,
  now: () => number = Date.now
): BankSession {
  let cached: { token: string; expiresAt: number } | null = null;
  let inFlight: Promise<string | null> | null = null;

  const login = async (): Promise<string | null> => {
    if (!username || !password) return null;
    const res = await http(`${baseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${bankClientId}:${bankClientSecret}`)}`,
      },
      body: formEncode({ grant_type: 'password', username, password }),
    });
    if (res.status === 400 || res.status === 401) return null; // credentials refused: signed out
    if (res.status < 200 || res.status > 299) throw new Error(`bank login answered HTTP ${res.status}`);
    const json = JSON.parse(await res.text()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof json.access_token !== 'string' || !json.access_token) {
      throw new Error('bank login answered without an access_token');
    }
    const lifetime = typeof json.expires_in === 'number' ? json.expires_in : DEFAULT_LIFETIME_SECONDS;
    cached = { token: json.access_token, expiresAt: now() + Math.max(0, lifetime - EXPIRY_MARGIN_SECONDS) * 1000 };
    return json.access_token;
  };

  return {
    token: () => {
      if (cached && now() < cached.expiresAt) return Promise.resolve(cached.token);
      cached = null;
      if (!inFlight) {
        inFlight = login().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
    clear: () => {
      cached = null;
    },
  };
}

/**
 * The deprecated client-secret provider — **for testing only**, e.g. against UAT before your bank
 * backend can sign assertions. A secret inside an app can be extracted: ship
 * {@link bankBackendAssertionProvider} or {@link bankBackendRelay} instead.
 */
export function clientSecretCredentials(clientId: string, clientSecret: string): VeyraClientSecretProvider {
  return { providerType: 'AUTHENTICATION', clientId, clientSecret };
}

function bankBackend(settings: ProviderSettings): string {
  return required(settings.bankBackendBaseUrl, 'bankBackendBaseUrl').replace(/\/+$/, '');
}

function required(value: string | undefined, name: string): string {
  const v = setting(value);
  if (!v) throw new Error(`VEYRA_PROVIDER.${name} must be set in veyra.config.ts for this provider`);
  return v;
}

export const GRANT_TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const TOKEN_TYPE_ACCESS_TOKEN = 'urn:ietf:params:oauth:token-type:access_token';
export const TOKEN_TYPE_JWT = 'urn:ietf:params:oauth:token-type:jwt';

/**
 * The assertion provider: exchange the signed-in user's bank session for a short-lived assertion
 * with a **token exchange at your authorization server** (RFC 8693, `POST {base}/oauth2/token`).
 * The assertion carries at least `iss`, `sub`, `aud` equal to the `audience` the SDK passes here,
 * `iat`, `exp` ≤ 5 min and a unique `jti`; `cnf.jkt` and `acr` are optional.
 *
 * Request (form-encoded, your bank's client authenticated with HTTP Basic
 * `bankClientId:bankClientSecret`): `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`,
 * `subject_token=<bank session>`, `subject_token_type=…:token-type:access_token`,
 * `requested_token_type=…:token-type:jwt`, `audience=<Veyra API base URL>`. Response:
 * `{"access_token": "<compact JWT>", …}`.
 * Resolves null when no user is signed in (no session, or 401) — the SDK then fails the call with
 * NOT_AUTHENTICATED and sends nothing; any other failure rejects, with the same effect.
 */
export function bankBackendAssertionProvider(
  clientId: string,
  bankClientId: string,
  bankClientSecret: string,
  baseUrl: string,
  session: () => Promise<string | null>,
  http: Fetch = fetch
): VeyraAssertionProvider {
  return {
    providerType: 'AUTHENTICATION',
    clientId, // the OAuth client id Veyra issued to this app (public, not a secret) — the SDK's only credential
    assertion: async (audience) => {
      const subjectToken = await session();
      if (!subjectToken) return null; // logged out
      const res = await http(`${baseUrl}/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Your bank's client at its authorization server — never given to the SDK.
          Authorization: `Basic ${btoa(`${bankClientId}:${bankClientSecret}`)}`,
        },
        body: formEncode({
          grant_type: GRANT_TOKEN_EXCHANGE,
          subject_token: subjectToken,
          subject_token_type: TOKEN_TYPE_ACCESS_TOKEN,
          requested_token_type: TOKEN_TYPE_JWT,
          audience,
        }),
      });
      return parseAssertion(res.status, await res.text());
    },
  };
}

/** `application/x-www-form-urlencoded`, without relying on React Native's partial URLSearchParams. */
function formEncode(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** The exchanged token from the server's answer: null on 401 (no session), throws otherwise. */
export function parseAssertion(status: number, body: string): string | null {
  if (status === 401) return null;
  if (status < 200 || status > 299) throw new Error(`token exchange answered HTTP ${status}: ${body}`);
  let accessToken: unknown;
  try {
    accessToken = JSON.parse(body)?.access_token;
  } catch {
    accessToken = undefined;
  }
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new Error('token exchange answered without an access_token');
  }
  return accessToken;
}

/**
 * The proxy provider: send every SDK call through **your bank**. The SDK's envelope — `{version,
 * service, method, path, query, headers, body}` — goes, unchanged, as the body of `POST
 * {base}/issuertokengateway/v1/proxy`: the envelope already names the method and the Veyra
 * service, so there is one entry point. Your API gateway checks the app's
 * session, removes the `/issuertokengateway/v1` context and forwards it to your ITG's `/proxy`,
 * which calls Veyra and answers with Veyra's response body — returned here unchanged.
 *
 * This is called from the SDK's background work too (status polling, key refresh, credit
 * confirmations), so it must not depend on a screen being up.
 */
export function bankBackendRelay(
  baseUrl: string,
  session: () => Promise<string | null>,
  http: Fetch = fetch
): VeyraProxyProvider {
  const forward = async (envelope: string): Promise<string> => {
    // No bank session — signed out, or the login itself failed — means the call never left.
    let token: string | null;
    try {
      token = await session();
    } catch (e) {
      throw new VeyraRelayError('OTHER', true, null, `Bank login failed: ${(e as Error)?.message}`);
    }
    if (!token) throw new VeyraRelayError('OTHER', true, null, 'Not signed in to the bank');
    let res: Response;
    try {
      res = await http(`${baseUrl}/issuertokengateway/v1/proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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
    // A non-2xx came back from Veyra (or your gateway), so the request was delivered and may have
    // been processed. Your proxy's own failures arrive as a 200 body the SDK recognises — returned
    // unchanged like any other.
    if (res.status < 200 || res.status > 299) throw new VeyraRelayError('OTHER', false, res.status);
    return body; // Veyra's body, unmodified
  };
  return {
    providerType: 'PROXY',
    send: forward,
  };
}
