# Veyra SDK for React Native — Developer Guide

The canonical guide for integrating Veyra contactless payments in a React Native app via
[`veyra-sdk-react-native`](https://www.npmjs.com/package/veyra-sdk-react-native). This
sample app is the reference implementation of everything below.

The React Native SDK wraps the same native SDKs the platform guides document — for
deep-dives into payment semantics, response codes and per-outcome guidance, the
[Android guide](https://github.com/Iventure-Tech/veyra-android-sample-app/blob/main/DEVELOPER-GUIDE.md)
and [iOS guide](https://github.com/Iventure-Tech/veyra-ios-sample-app/blob/main/DEVELOPER-GUIDE.md)
apply in full; this guide covers the React Native surface and what is different in a
React Native app.

---

## 1. Requirements

| | Android | iOS |
|---|---|---|
| OS floor | Android 9 (API 28) | iOS 15 |
| React Native | **0.80+** out of the box; 0.79 with a Kotlin override (see below) | same |
| Device | physical, NFC-capable | physical iPhone |
| Extra | — | Apple Developer **Team ID** (App Attest) |

Emulators/simulators cannot run NFC or device attestation.

> **Android Kotlin floor:** the Veyra SDK is compiled with Kotlin 2.2, which your app's
> Kotlin compiler must be able to read: React Native 0.80+ (Kotlin 2.1 by default) works
> unmodified; on 0.79 set `kotlinVersion = "2.1.21"` (and pin the
> `org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion` classpath) in
> `android/build.gradle`. Earlier React Native versions cannot read the SDK's metadata
> — their Gradle plugin is incompatible with Kotlin 2.1+.

## 2. Install

```sh
npm install veyra-sdk-react-native
```

**Android** resolves the native SDK from the authenticated Veyra Maven repository.
Declare the repository in your app's `android/build.gradle` (this sample's shows the
exact `allprojects` block — the app's own classpath pulls the `co.veyra:*` artifacts
transitively, so the repository must be visible to it), and put your repository
credentials in `~/.gradle/gradle.properties` (or CI env
`VEYRA_REPO_USERNAME` / `VEYRA_REPO_PASSWORD`):

```properties
veyraRepoUsername=…
veyraRepoPassword=…
```

**iOS** downloads the prebuilt framework at `pod install`, using `~/.netrc`:

```
machine repo.veyra.co
  login …
  password …
```

### Manifest / Info.plist

- **Android:** NFC/HCE permissions and the SDK's card-emulation service merge
  automatically from the SDK's own manifests. Add only what your app itself needs —
  this sample adds `CAMERA` (QR scanning) and location (payment device info). See
  `android/app/src/main/AndroidManifest.xml`.
  - The service's configuration comes from the SDK's own `res/xml/apdu_service.xml`. Its
    shipped default is `android:requireDeviceUnlock="false"` — the phone answers a terminal
    while locked. To change that (or the banner/description), ship a file of the **same
    name** in your app's `res/xml/`: Android's resource merge gives the app's copy priority.
    The service class itself is not overridden. Keep the AID set in your copy identical to
    the SDK's (PPSE `325041592E5359532E4444463031` and `A000000891010104`), and re-check it on
    every SDK upgrade — an override does not follow changes to the SDK's default. A
    `settingsActivity` there must be a class reference such as `.MainActivity`: Gradle
    placeholders like `${applicationId}` are not substituted inside `res/xml`.
- **iOS:** add `NFCReaderUsageDescription`, the ISO7816 select-identifier
  `A000000891010104` (see `ios/VeyraBank/Info.plist`), and enable the **Near Field
  Communication Tag Reading** capability on your target — it puts the
  `com.apple.developer.nfc.readersession.formats` entitlement (`TAG`) in your
  entitlements file, and **a reader session will not start without it**, whatever
  Info.plist says. Camera usage description for QR scanning.

### Expo

Expo Go cannot run this package (it carries a native module and an authenticated native
artifact). Use a development build — a custom dev client or `npx expo prebuild`. The
package ships no Expo config plugin, so the native edits above (repository block,
`~/.netrc`, Info.plist, capability, any `apdu_service.xml` override) must be re-applied
after every `prebuild` unless you wrap them in a local config plugin. For EAS cloud
builds, supply `VEYRA_REPO_USERNAME` / `VEYRA_REPO_PASSWORD` as secrets.

## 3. Run this sample app on your phone

Everything below assumes a **physical** device — NFC and device attestation don't work
on emulators or simulators.

**Once, for both platforms** (from the repository root):

```bash
npm install
cp veyra.config.example.ts veyra.config.ts
# edit veyra.config.ts — your payment app provider id, token requestor id (and your
# Apple Team ID for iOS), and VEYRA_PROVIDER: the values the provider needs (§4.2)
```

`veyra.config.ts` is gitignored — real credentials never get committed. It holds
everything **except** the customer and the provider: the app adds `customerId` when it
initialises (§4.1), and builds the one `provider` for both SDKs in `src/provider.ts` from the values in
`VEYRA_PROVIDER` (§4.2). If you have a `veyra.config.ts` from an earlier checkout, copy the current shape
from `veyra.config.example.ts`.

The sample "logs in" one of two demo customers, `test-user@iventure.tech` and `demo-customer-2`.
Its login session lives in memory only (the sample has no storage dependency), so every
launch starts signed in as `test-user@iventure.tech`; Home's customer bar switches between them
and signs out.

### Android

1. Add your artifact-repository credentials to `~/.gradle/gradle.properties` (Gradle
   resolves the native SDK from the authenticated Veyra Maven repository with them):

   ```properties
   veyraRepoUsername=your-repo-username
   veyraRepoPassword=your-repo-password
   ```

2. Point Gradle at your Android SDK if you have not before — create `android/local.properties`:

   ```properties
   sdk.dir=/Users/you/Library/Android/sdk
   ```

   (Android Studio usually creates this on first project open.)
3. On the phone: enable **Developer options** (Settings → About phone → tap *Build
   number* seven times), then turn on **USB debugging**. Plug the phone in over USB and
   accept the "Allow USB debugging?" prompt. `adb devices` should list it.
4. Run with **two terminals** — Metro (the JS dev server) in one, the build in the other:

   ```bash
   # terminal 1 — leave running
   npm start

   # terminal 2 — build + install on the phone
   npm run android
   ```

   JS-only edits hot-reload through Metro from then on; rebuild only when native
   dependencies change.

   > **If you swap the SDK package while Metro is running** — an `npm install` that
   > upgrades `veyra-sdk-react-native`, or a local link that copies a different copy of
   > it under `node_modules` — restart Metro afterwards with `npm start -- --reset-cache`
   > (and rebuild for the native side). A running Metro keeps serving the package tree it
   > started with, so the app would run the *old* JS bridge against the *new* native
   > module and any newly added SDK method is `undefined` at the call site — a runtime
   > "`… is not a function`" crash, not a build error.

### iOS

1. Add the same repository credentials to `~/.netrc` (the prebuilt framework downloads
   and checksum-verifies at `pod install`):

   ```
   machine repo.veyra.co
     login your-repo-username
     password your-repo-password
   ```

   ```bash
   chmod 600 ~/.netrc
   cd ios && pod install && cd ..
   ```

2. Open `ios/VeyraBank.xcworkspace` in Xcode. On the **VeyraBank** target → *Signing &
   Capabilities*: select your team, and add the **Near Field Communication Tag
   Reading** capability (required for tap acceptance).
3. Start Metro in one terminal (`npm start`, leave it running), then in another select
   your iPhone as the run destination in Xcode and press Run — or:

   ```bash
   npm run ios -- --device
   ```

   On the first install, trust the developer profile on the phone (Settings → General →
   VPN & Device Management).

**First sanity check:** the Home screen's *NFC mode* readout should say `NONE`, and flip
to `WALLET` / `SOFTPOS` only while the Pay / Get-paid screens are focused — that is the
session model (§5) working. Above it, the customer bar should read *Signed in as
test-user@iventure.tech*.

## 4. Initialise

> **Breaking change:** `softpos` now requires a `paymentAppProviderId` — the globally unique
> identifier issued to your organisation at onboarding, the same value the `wallet` block
> carries. The gateway links every merchant you register to it and resolves your acquirer id
> and MCC from it, so `acquirerId` is gone from the SoftPOS surface (config and
> `merchant.register` alike).

```ts
import Veyra from 'veyra-sdk-react-native';

await Veyra.initialize({
  customerId,                              // the customer your app has signed in
  provider,                                // required, one for both SDKs: §4.2
  softpos: { environment: 'TEST', paymentAppProviderId },
  wallet: {
    environment: 'TEST',
    paymentAppProviderId, tokenRequestorId,
    recommendationStandardVersion: '1.0',  // Android (fixed on iOS)
    appleTeamId: 'YOURTEAMID',             // iOS
  },
});
```

Call it at every app start with the customer your app has signed in (this sample does it
in `src/session.tsx`, before rendering navigation). It is idempotent for the same customer
and safe across native Activity recreation — the SDK re-attaches itself. Every call goes through to the native layer and re-applies the
configuration (there is no JS-side memo), so a call that fails is recovered by simply
calling it again; the SDK does not retry on its own. Only setup mistakes reject, with a typed
`VeyraError`; everything that happens while processing a request resolves with an outcome (§9).

### 4.1 Customers: signing in, signing out, switching

The SDK keeps everything — cards, the merchant, history, receipts — **per customer**, and it
never remembers who is signed in. Who is logged in is your app's to know: it is part of
your own login session, and you tell the SDK on every launch.

| Your app's moment | Call | What the SDK does |
|---|---|---|
| App starts, a customer is signed in | `Veyra.initialize({ customerId, softpos, wallet })` | opens that customer's data |
| App starts, nobody is signed in | nothing | stays signed out — every call rejects with `NOT_SIGNED_IN` |
| Customer logs in | `Veyra.initialize({ customerId, … })` | opens that customer's data |
| Same customer again (relaunch, Activity recreated) | `Veyra.initialize({ customerId, … })` | nothing is stopped — idempotent |
| A different customer logs in (switch) | `Veyra.initialize({ customerId: other, … })` | stops the previous customer's work, then opens the new customer's data |
| Customer logs out | `Veyra.signOut()` | stops everything for that customer; their data **stays on the device** (keys kept) for when they sign in again |

```ts
import Veyra from 'veyra-sdk-react-native';

// on launch, if your login session has a customer
await Veyra.initialize({ customerId: session.customerId, softpos, wallet });

// log out
await Veyra.signOut();

// switch — just initialise with the other customer
await Veyra.initialize({ customerId: otherCustomerId, softpos, wallet });
```

- **`customerId` is your identifier** for the logged-in customer — any stable string your
  app already has. It never leaves the device.
- **After `Veyra.signOut()`** every call rejects with `NOT_SIGNED_IN` until the next
  `Veyra.initialize`. Disable your payment entry points while signed out (this sample
  greys out Pay, Get paid and merchant settings on Home).
- **Event subscriptions survive** sign-in, switch and sign-out: the bridge re-registers its
  native observers on every `initialize`, so `wallet.on…` / `merchant.on…` listeners you
  added once keep firing — now for the newly signed-in customer.
- **Android — tap with the app not running.** If the app process has not initialised
  (killed, or the phone restarted and the app not yet opened), a terminal tap is answered
  "application not found" until your app initialises with the customer.

### 4.2 Connect to Veyra — choosing a provider

You pass **one** `provider` to `Veyra.initialize`, and it says how both SDKs reach the Veyra
backend. There is no default and the SDK never guesses one: which kind you implement is your
payment app provider's decision. The kind is fixed for the life of the app process — there is never
a fallback from one to the other.

| Provider | `providerType` | The SDK… | Choose it when |
|---|---|---|---|
| `VeyraAssertionProvider` | `'AUTHENTICATION'` | calls Veyra itself, with a short-lived **assertion your backend signs** for the signed-in user | your backend can sign a JWT for the user (recommended) |
| `VeyraProxyProvider` | `'PROXY'` | calls **nothing** itself — every backend call goes through your provider to **your backend** | you want all traffic through your own backend, or cannot run a signer |

**`providerType` says which kind it is.** A JavaScript object can't inherit a default, so you write
it out; the SDK checks it against the functions your object has.

- **An unusable provider rejects `Veyra.initialize` with `VALIDATION`, naming the problem**: no
  provider; an object with both `assertion` and the request functions; a `providerType` that
  contradicts the functions present (e.g. `'AUTHENTICATION'` with `post`/`get`/…); a blank
  `clientId`; a missing function (e.g. `provider.send is required (VeyraProxyProvider)`) — never
  at the first payment. Initialising again with the other kind rejects too.
- **A call is never sent without credentials.** When the SDK cannot obtain a token the call ends
  `NOT_SENT` with reason `NOT_AUTHENTICATED` and nothing is sent (§9.2, Table A).
- Every backend call the SDK makes carries an `X-Veyra-Provider-Type` header (your provider's `providerType`: `AUTHENTICATION` or `PROXY`) and an `X-Veyra-Sdk-Version` header.

**Implementing a provider, then initialising with it:**

```ts
import Veyra, { type VeyraAssertionProvider, type VeyraProxyProvider } from 'veyra-sdk-react-native';

// VeyraAssertionProvider (recommended): your client id, and one function the SDK calls when it needs a token.
const provider: VeyraAssertionProvider = {
  providerType: 'AUTHENTICATION',
  clientId: 'your-client-id',                                       // public, issued at onboarding
  assertion: (audience, jkt) => myBankApi.sdkAssertion(audience, jkt), // Promise<JWT | null>
};

// …or VeyraProxyProvider: one function, send, called for every backend call. The envelope it
// receives names the HTTP method.
const provider: VeyraProxyProvider = { providerType: 'PROXY', send: forward };

// Then, whichever kind:
await Veyra.initialize({
  customerId,
  provider,
  softpos: { environment: 'TEST', paymentAppProviderId },
  wallet: { environment: 'TEST', paymentAppProviderId, tokenRequestorId,
            recommendationStandardVersion: '1.0', appleTeamId: 'YOURTEAMID' },
});
```

`forward` sends the envelope to `POST {your API gateway}/issuertokengateway/v1/proxy` and resolves with
Veyra's body unchanged; on failure it rejects with `VeyraRelayError` (the failure contract is
below).

**Proxy flow.** For the proxy provider, **deploy the Veyra Issuer Token Gateway (ITG): it supports
proxying all SDK requests.** It obtains an access token from the Veyra token endpoint and calls the
Veyra API for you, so you write no proxy code of your own on the server:

```
Your app ── VeyraProxyProvider.send(envelope)
  │
  ├─▶ Your (issuer) API gateway / authorisation server
  │     POST /issuertokengateway/v1/proxy — checks your app's session,
  │     removes the /issuertokengateway/v1 context
  │
  ├─▶ Veyra Issuer Token Gateway (ITG)          POST /proxy
  │     ├─▶ Veyra token endpoint                 client-credentials grant (the ITG's own
  │     │                                        credentials) → access token, cached until expiry
  │     └─▶ Veyra API                            method + service path, query, headers, body,
  │                                              with Authorization
  │
  ◀── Veyra's status and body, unchanged (or 200 PROXY_FAILED from the ITG itself)
```

This sample has no mode setting either: `appProvider()` in `src/provider.ts` returns one
provider, and to switch you return a different one — exactly what your own app does. Its two
backend providers, from `bankBackendAssertionProvider` and `bankBackendRelay`, are short and meant
to be copied; each reads only its own values from `VEYRA_PROVIDER` in `veyra.config.ts` (the
assertion provider: `clientId`, `bankBackendBaseUrl`, `bankClientId` and `bankClientSecret`; the
proxy provider: `bankBackendBaseUrl`, `bankClientId` and `bankClientSecret`; both also log the user
in with `username`/`password`). `bankClientId`/`bankClientSecret` are **your bank's own** OAuth
client at its authorization server, not the Veyra client: the sample uses them only to log the user
in and for the token exchange, and never passes them to the SDK.
The sample ships returning the proxy provider (`bankBackendRelay`), so the app holds no Veyra
secret. The deprecated `clientSecretCredentials` — a `VeyraClientSecretProvider` **for testing
only** that needs just `clientId` and `clientSecret` — is still there for testing before your
backend has either endpoint.

> **Signing the user in to your bank is your app's responsibility, not the SDK's.** The SDK never
> authenticates with your bank or its backend. It doesn't collect credentials, it doesn't obtain,
> refresh or end a bank session, and it doesn't call your login or token endpoints. It only asks your
> provider for what it needs: an assertion (`VeyraAssertionProvider`), or to send a request
> (`VeyraProxyProvider`). Your provider gets those using the session your app already holds. How the
> user signs in (password, biometrics, single sign-on, multi-factor), and how that session is stored,
> refreshed and revoked, is your app's own design. The sample's password-grant login, with credentials
> read from local config, is a demo stand-in only — not a pattern to ship.

**Your bank's side — the two endpoints the sample calls.** `VeyraAssertionProvider` and
`VeyraProxyProvider` each need one endpoint on **your** side. Both carry your app's **own** session
(the sample logs in with `VEYRA_PROVIDER.username`/`password` — a password grant at
`{bankBackendBaseUrl}/oauth2/token` — and uses the returned access token; replace that with your own
login); neither is a Veyra credential. The assertion provider exchanges that session for the
assertion with an OAuth 2.0 token exchange (RFC 8693) at your authorization server:

```
POST {your authorization server}/oauth2/token               (VeyraAssertionProvider)
     Authorization: Basic base64(bankClientId:bankClientSecret)
     Content-Type: application/x-www-form-urlencoded
     grant_type=urn:ietf:params:oauth:grant-type:token-exchange
     &subject_token=<the user's session>
     &subject_token_type=urn:ietf:params:oauth:token-type:access_token
     &requested_token_type=urn:ietf:params:oauth:token-type:jwt
     &audience=<audience>
  →  200 {"access_token": "<compact JWT>", …}     401 when no user is signed in (resolve null)

POST {your API gateway}/issuertokengateway/v1/proxy (VeyraProxyProvider)
     body: the SDK's envelope, unchanged, for every method
  →  your gateway checks the app's session, removes the `/issuertokengateway/v1` context and
     forwards the envelope to the Veyra Issuer Token Gateway (ITG) as `POST /proxy`
  →  the ITG gets an access token from the Veyra token endpoint with its own OAuth
     client credentials (held server-side; an API key is not accepted), calls the
     Veyra API (`service` + `path` with `method`, `query`, `headers` and `body`),
     and answers with Veyra's status and body unchanged
```

**What the assertion must contain** — a compact JWT, with the signing key held in an HSM or KMS:

**Required by Veyra — the minimum.** How you produce the assertion is up to you: your own
endpoint, your authorization server's token exchange (RFC 8693), or any identity provider. Veyra
checks only the following. An assertion that is missing any of them, or fails a check, is refused,
and the SDK reports `NOT_AUTHENTICATED`.

| Part | What to put in it | Why Veyra needs it |
|---|---|---|
| Signature (`alg`) | `ES256`, `ES384`, `PS256` or `RS256` (the ones agreed for your issuer), signed with a private key held in an HSM or KMS. Never `none` or an HMAC (`HS…`) algorithm | Veyra verifies it with your **public** key (your JWKS URI, or keys you registered). That proves the assertion came from you, and Veyra can never create one itself |
| `kid` (header) | The id of the signing key in your JWKS. It can be left out only if you publish exactly one key | Picks the key to verify with, so you can rotate: publish the new key, then start signing with it |
| `iss` | Exactly the issuer identifier registered with Veyra, character for character | Tells Veyra whose keys and rules apply. An unknown or disabled issuer is refused |
| `sub` | A stable, pairwise identifier for the signed-in user: the same value every time for that user. Never an account number, customer id, phone number or email | Veyra derives its own user id from `iss` + `sub`, so the same person is recognised across sessions and devices without you sharing who they are |
| `aud` | The `audience` the SDK passed to `assertion()` (the Veyra API base URL: `https://api.uat.veyra.co` on `TEST`, `https://api.veyra.co` on `LIVE`), or the alias agreed at onboarding | Addresses the assertion to Veyra only, so no other service that trusts your key can accept it |
| `iat` | When you issued it, in seconds since the epoch | Must not be in the future (Veyra allows 60 seconds of clock difference). Together with `exp`, it bounds the assertion's life |
| `exp` | The expiry: at most your agreed maximum after `iat`, which is **5 minutes** unless agreed otherwise | Limits how long a leaked assertion could be used. An expired one is refused |
| `jti` | A new unique id for every assertion, e.g. a UUID | Veyra accepts each `iss` + `jti` only once, so a captured assertion can't be replayed |

**Optional:**

| Claim | What to put in it | Why |
|---|---|---|
| `cnf.jkt` *(recommended)* | Exactly the `jkt` the SDK passed to `assertion()` | Binds the assertion to this device's key. If it's present, Veyra refuses the assertion unless it matches the key the SDK proves it holds, so a leaked assertion is useless on any other device. Veyra can make it mandatory for your issuer if you agree to that |
| `acr` | The authentication level of the user's session, from the values agreed at onboarding | Needed only if Veyra sets a minimum level for your issuer, e.g. to require multi-factor sign-in. Below the minimum, the assertion is refused |
| `nbf` | A not-before time | Honoured if present |

**Only the required claims above are mandatory.** `cnf.jkt`, `acr` and `nbf` are optional: include
`acr` only if Veyra has agreed a minimum sign-in level for your issuer. Any other claim is ignored.

**Device binding between your app and your backend is optional.** You don't have to bind the
assertion to the device, either with `cnf.jkt` or by using DPoP on your own token
endpoint. Veyra accepts an unbound assertion that meets the minimum above. Either way, the SDK
always uses DPoP with Veyra: the access token it gets is bound to a key generated on this device
that cannot be exported. **What binding adds:** without it, an assertion that leaks in its few
minutes of life could be redeemed once by another device. With it, it can't be redeemed anywhere
else.

Issue it only for an authenticated session of the user it names, and rate-limit the endpoint. The
SDK calls `assertion()` only when it holds no valid access token, and never more than once at
a time per SDK. The access token it obtains is bound to a key generated on this device that cannot
be exported, so a token copied off the device is useless elsewhere. Resolving `null` or rejecting
fails the call with `NOT_AUTHENTICATED` and sends nothing.

`audience` is the base URL of the Veyra API the SDK will redeem the assertion at
(`https://api.uat.veyra.co` on `TEST`, `https://api.veyra.co` on `LIVE`). **Check it before you
sign:** copy it into `aud` only when it is a Veyra base URL you expect for that environment, and
refuse anything else, so an assertion your backend signs can never be redeemed anywhere but Veyra.

**`/issuertokengateway/v1/proxy` receives the envelope (version 1, public API).** Each `request` your
proxy provider receives is one JSON string that says everything about the call:

```json
{ "version": 1,
  "service": "SOFTPOS",
  "method": "POST",
  "path": "/payment",
  "query": { "merchant_id": "…" },
  "headers": { "Content-Type": "application/json",
               "X-Veyra-Sdk-Version": "3.0.0",
               "X-Veyra-Provider-Type": "PROXY" },
  "body": "<the request JSON, as a string>" }
```

- `service` is the Veyra API the call is for: `WALLET` or `SOFTPOS`. It names the API, not your
  SDK — a wallet call to the payment API is `SOFTPOS`. Your proxy backend routes on it.
- `method` is the HTTP method the ITG uses towards Veyra. Because the envelope names it, the
  provider has a single `send` and every call goes to one endpoint.
- `path` is relative to that service — never a full URL, and without any API prefix.
- `query` is omitted when there is none (values are decoded). `body` is absent on `GET` and `DELETE`.
- New fields may be added under the same `version`; a breaking change bumps `version`.
- When your proxy backend itself cannot complete a call it answers `200` with
  `{"response_status": "PROXY_FAILED", "response_status_reason": "…", "never_sent": true|false}`.
  Return that body unchanged like any other: the SDK recognises it.
- Your proxy backend forwards `query`, every header and `body` to Veyra unmodified; resolve with
  Veyra's response body exactly as received.

**The proxy provider's failure contract — say whether the request was sent.** Reject with a
`VeyraRelayError(kind, neverSent, httpStatus?)` (exported by `veyra-sdk-react-native`):

- `neverSent: true` **only** when the request provably never left the device. A payment then ends
  failed and may be retried; use kind `'NO_NETWORK'` for "offline" — the SDK then reports
  `NO_NETWORK_CONNECTION`.
- `neverSent: false` whenever it may have been delivered — a timeout, a dropped connection, a
  non-2xx answer, an answer you could not read. A payment then stays pending and the SDK reconciles
  it. **When in doubt, `false`**: it is the safe direction.
- `httpStatus` when your backend answered with a non-2xx status; the SDK handles that status exactly
  as on a direct connection.
- Any other rejection counts as `neverSent: false`, and so does a call that outlives the SDK's
  own timeout for that request.

The sample's proxy provider always reports `neverSent: false`: JavaScript's `fetch` rejects the same way
whether the request never left the phone or the connection dropped after it was written, so it can
never prove "never sent". If your networking layer can tell (for example a connectivity check that
ran before the request), set `neverSent: true` only in that proven case.

**Your proxy provider is called from background work too** — status polling for pending payments, key
refresh, credit confirmations — not only from calls your app makes. Keep it usable without a screen
up (the sample's is a plain module-level function, holding no component state). If the SDK
cannot reach your JavaScript (no running JS runtime) a background cycle simply skips and tries again
later; it never fails a payment because of that.

**What your backend can see.** Request and response bodies pass through your app and backend. Card
key material is encrypted end to end to the device and payment proofs are cryptographically
protected, so your backend can neither read nor forge those. It **can** read account and identity
fields and could alter plain answers such as a transaction status — which is why only the issuing
bank or payment app provider itself, the party already trusted with those fields, may operate a
proxy provider, and why it must forward bytes unmodified.

## 5. Sessions — how payment screens work in React Native

**This is the one genuinely React-Native-specific concept.** The SDK arms the device
(present as a card / read cards) only for the screen the user is actually on, and
disarms it the moment they leave. Native apps get that from screen lifecycle; a React
Native app's navigation is invisible to the native layer — so your payment screens
declare themselves with a session hook:

```tsx
import { useIsFocused } from '@react-navigation/native';
import { usePaySession, useGetPaidSession } from 'veyra-sdk-react-native';

function PayScreen() {
  usePaySession(useIsFocused());
  // …cards, tap-to-pay, QR rails
}

function GetPaidScreen() {
  useGetPaidSession(useIsFocused());
  // …tap acceptance, QR rails
}
```

Rules of the model:

- **Mount the hook on the payment screen only.** Everywhere else the device is inert —
  it does not present as a payment card and does not read cards.
- **While the session screen is focused the device stays ready** — a customer queueing
  at a terminal, or re-tapping after a decline, needs no re-arming.
- **Leaving the screen disarms**: navigation away, back gesture, app background, screen
  lock. Returning to the still-focused screen re-arms automatically.
- **Tap APIs require their session** (`SESSION_REQUIRED` otherwise): `merchant.tap.*`
  needs `useGetPaidSession`; `wallet.setActiveCard` (which arms Android tap-to-pay)
  needs `usePaySession`. QR-only flows work without a session — they never arm NFC.
- **A payment mid-flight is never interrupted** — if the user navigates away during
  online authorisation, the SDK completes the payment first, then disarms.
- The mode is observable (`Veyra.currentMode()` → `'NONE' | 'SOFTPOS' | 'WALLET'`) but
  never settable — there is no mode API, by design.
- Not on React Navigation? Pass any accurate "this screen is visible" boolean, or use
  the imperative `sessions.open/close` — but the hooks are the recommended surface
  because they cannot leak an open session.

## 6. Wallet (Pay) API

All methods return promises; all failures are typed `VeyraError`s.

### 6.1 Add a card

| Method | Notes |
|---|---|
| `wallet.getBanks(accountNumber?)` | issuer list for the picker |
| `wallet.verifyAccount(params)` | eligibility pre-check |
| `wallet.digitise(params)` | tokenise the account; `recommendation` is **your app's** risk decision — required, never defaulted |

`digitise` resolves with `responseCode` `'APPROVED'` (ready), `'APPROVE_REQUIRE_AUTH'`
(activation needed — `activationMethods` lists the OTP channels), or `'DECLINED'`. Any other
code — including none at all — means this SDK version cannot interpret the answer: the token is
**discarded** (nothing provisioned, no card added, even if the response carried full token data)
and the call fails with a message beginning `UNRECOGNISED_RESPONSE_CODE:`. Offer a retry, and
update the SDK if it persists.
iOS-only param: `bankName` (shown on the stored card). Android additionally requires
`consumerIdentifier`, `bvn`, `accountHolderAddress`, `mobileNumber`.

### 6.2 Activation

| Method | Notes |
|---|---|
| `wallet.requestActivationCode(ref, medium, contact?, reason?)` | iOS supports `MASKED_EMAIL` / `MASKED_MOBILE_PHONE` media |
| `wallet.activate(ref, code)` | submit the OTP |
| `wallet.checkTokenActive(ref)` | one-shot server check (boolean) |
| `wallet.tokenStatus(ref)` | one-shot server check, five-valued (`ACTIVE` / `PENDING_ACTIVATION` / `SUSPENDED` / `DEACTIVATED` / `EXPIRED`) — say *why* a card is unavailable |
| `wallet.observeActivation(ref)` + `wallet.onActivationEvent(cb)` | polls every 10s for ≤5min; events `activated` / `timeout` / `error` |
| `pauseActivationObserver(ref)` / `resumeActivationObserver(ref)` / `stopActivationObserver(ref)` | the timeout clock keeps running while paused |

On `status: 'FAILURE'` both activation responses carry a typed `failureCode` — branch on it,
never on `message`: `CODE_INVALID` (stay on entry; `attemptsRemaining` says how many are left),
`CODE_EXPIRED` (offer resend), `CODE_REQUEST_RATE_LIMITED` (disable "resend" with a cool-down —
do **not** end the flow), `MAX_ATTEMPTS_EXCEEDED` (cycle closed; honour `recommendDelete` —
`'MUST'`: delete the token and restart add-card, `'MAY'`: advisory), `ACTIVATION_LOCKED`
(terminal — hide retry and resend; direct the user to their bank), `NO_PENDING_ACTIVATION`
(request a code first). Codes newer than this SDK pass through verbatim — show `message` and log
the code.

An observer polls, so tie its life to the screen that shows the card: observe every card with
`requiresActivation`, pause on blur and resume on focus, and stop on unmount. Re-observing a token
replaces its observer rather than adding a second one — but it also restarts the 5-minute clock, so
track what you already observe instead of re-issuing on every render. See `PayScreen.tsx`.

### 6.3 Cards & states

`wallet.getCards()` → `Card[]`. Render states in this precedence order:

1. `requiresActivation` — offer the activation flow.
2. `requiresOnline` — **grey the card out and disable pay affordances**; the SDK
   restores it by itself once the device is online. Nothing to call.
3. `deviceNotBound` — the card was added on a different device (or on this phone before the app
   was reinstalled), so the backend will not issue it payment keys here; **tell the customer to
   remove the card and add it again on this phone** — going online or paying a smaller amount
   does not help. The SDK has stopped requesting keys for it, `requiresOnline` is always `false`
   while this is set, and it clears only when the card is removed.
4. `!isActive` — blocked server-side; `status` says why on both platforms (`SUSPENDED`:
   "contact your bank" · `PENDING_ACTIVATION`: "activate this card" · `EXPIRED`: "re-add the card").
5. Otherwise payable.

`wallet.getActiveCard()` → `Card | null` reads the currently selected card — the counterpart to
`setActiveCard`, and the way a screen answers "which card would pay right now?" without inferring it
from the list. `null` means no card is selected (never chosen, or the chosen one was removed), so
treat it as "prompt the customer to choose" rather than as an error.

`wallet.setActiveCard(card.id)` selects the card; on Android it also arms tap-to-pay
(pay session required). `wallet.deactivateToken(ref)` removes it, resolving the backend's answer
(`{ tokenUniqueReference, status, message }`) — the same name and the same shape as the Android
and iOS SDKs, which call the same endpoint.

### 6.4 Paying

| Rail | Methods | Platforms |
|---|---|---|
| Tap-to-pay | arm via `setActiveCard`; outcomes on `wallet.onTapEvent` (`transactionStarted` / `transactionCompleted` / `activationFailed`) | **Android only** |
| Scan-to-pay | `inspectScannedQr(payload)` → verified handle → `payScannedContext(handle)` | both |
| Show-QR-to-pay | `showQrToPay(amountMinorUnits)`; expiry on `onQrExpired`; `cancelQrExpiry()` on teardown | both |

**Device authentication (CDCVM) is the SDK's job — there is no method to call.**
`payScannedContext` and `showQrToPay` raise the OS authentication sheet themselves
(fingerprint/face on Android with PIN fallback in the same sheet; Face ID / Touch ID with
passcode fallback on iOS) before building the payment. The SDK writes the prompt from the
payment itself, so the gesture names the merchant and amount, and it asks **once per attempt** —
a retry, or regenerating an expired QR, asks again. It asks only *after* the card checks pass, so
a card that cannot pay is refused without spending the customer's gesture.

Three `NOT_SENT` reasons come back on those same calls: `AUTH_CANCELLED` (dismissed — offer it
again), `AUTH_FAILED` (attempted, rejected — offer a retry) and `AUTH_UNAVAILABLE` (no biometric
*and* no screen lock on this device — send them to system settings, a retry cannot help). Nothing
is sent in any of the three (§9.2, Table A).

The sheet's wording is the SDK's own: the React Native wallet config has no field to
change it.

A scanned QR that fails verification
returns `{ verified: false, reason }` (`MALFORMED` / `MISSING_SIGNATURE` /
`UNKNOWN_KEY` / `BAD_SIGNATURE` / `EXPIRED`) — never show a confirm screen for it. The
verified `handle` is single-use and never contains the payload.

**Read `payScannedContext`'s outcome from `responseStatus`, not from `approved`.** The push
is a synchronous call, but its *outcome* can still be unknown: the gateway answers
`'PENDING'` when a hop below it timed out (`68`), errored (`06`/`96`) or is still settling
(`09`). That is not a refusal — the SDK records the payment as unresolved and keeps polling
it until the gateway states a final outcome, which then shows on the history row. `approved`
is a convenience for the happy path only (`responseStatus === 'APPROVED'`); it is `false`
for a pending payment as well as a declined one, so a screen that branches on it tells the
payer they were refused when they were not. `'APPROVED'`, `'DECLINED'` and `'FAILED'` are
final; anything else — `'PENDING'`, or an absent status — is pending.

### 6.5 History & receipts

`getTransactions(ref, limit?)` (call `reconcilePendingTransactions()` first to settle
PENDING rows), `processReceipt(qrPayload, expectedHash?)` to verify-and-store a scanned
merchant receipt, `getReceipts(limit?)`, `getReceiptForTransaction(hash)`.
`entryMethod` is `'TAP' | 'QR_GENERATED' | 'QR_SCANNED'`.

`TransactionSummary` also carries `merchantOrderId` — the merchant's own order/basket id for
the sale, the id the merchant's systems know it by, so a customer can quote it at the
counter. A scanned-QR (`'QR_SCANNED'`) row carries it from payment time; tap and
generated-QR rows learn it from the status poll, so `null` on a still-open row means "not
learned yet", not "no order id". For display and reconciliation — receipts and status
refreshes key off `transactionHash` / `merchantTransactionReference`.

**How the SDK waits for a `PENDING` row** (wallet and merchant alike). You do not have to
poll, schedule anything, or keep a screen open — the native SDK under the bridge asks on its
own with **exponential backoff**: the first re-checks come within seconds (most payments
settle at once) and the interval doubles to a steady state of roughly **once an hour**. It
keeps that up for **30 days** from the transaction date, then stops asking.

**Stopping is not an outcome.** At 30 days the row keeps whatever status it has — still
`'PENDING'`, which is still true — and simply leaves the poll list. The SDK never writes
`'FAILED'`, `'DECLINED'` or any verdict of its own; only the backend decides what a payment
was. Treat a long-`'PENDING'` row as *unresolved*, not failed, however old it is.

**Let the user ask on demand — `refreshTransactionStatus`.** The SDK polls a pending
transaction for you with **exponential backoff**, and **stops after 30 days**. Polling never
invents an outcome — a row that ages out simply stops being asked about and stays
`'PENDING'`. Expose **`refreshTransactionStatus`** in your UI so the user can ask on demand,
which is the route for anything still pending after the window closes.

```ts
// wallet: keyed by transaction hash. Resolves the updated row, or null if unknown here.
const updated = await wallet.refreshTransactionStatus(summary.transactionHash);

// merchant: keyed by the merchant transaction reference.
const row = await merchant.refreshTransactionStatus(reference);
```

The per-transaction counterpart to `reconcilePendingTransactions()` (wallet) and
`getTransaction()` (merchant): it asks about that one row now and writes the answer into the
same local store the background sweep writes, so an on-demand check and a background check
can never disagree.

- **Show it only while the row is `'PENDING'`.** A settled row has nothing to ask, and
  offering the action implies the outcome might still change.
- **It works past the 30-day window**, and on a row the sweep never had on its list.
- **It is not a way to force an outcome.** A still-unsettled payment answers `'PENDING'`
  again — show a brief "still processing" note rather than retrying in a loop.
- **A lookup that fails changes nothing** — `NOT_SENT` / `'NO_NETWORK_CONNECTION'` when the
  device is offline. Show the message and leave the row pending.
- **No SDK-side throttle.** Disable the button while the call is in flight, as the samples do
  (`WalletTransactionsScreen.tsx`, `MerchantTransactionsScreen.tsx`).

### 6.6 Merchant credit confirmation (wallet side)

Did the money actually reach the merchant's bank? The wallet asks the same question the
merchant SDK asks about that sale, from the payer's side — **settlement confirmation only**,
it never changes or restates the payment outcome.

**The SDK does the polling; your screen renders the stored row.** Once a payment is
approved, the native SDK asks the gateway on an exponential backoff for up to **30 days**,
app-scoped: it keeps going across every screen and no screen starts or stops it. Unlike the
merchant side there is deliberately **no `onCreditConfirmation` event on the wallet** — the
stored row is the whole surface. Read it when a detail screen opens, and re-read
`getTransactions(ref)` every few seconds while it is open if you want the line to flip live
(see the sample's `WalletTransactionsScreen`).

`TransactionSummary` carries five fields for it. The first three are the **eligibility
contract**: they are how you decide whether to render a credit line at all, and whether you
may call `refreshCreditConfirmation` (below). They are not merely a cue to wait.

| Field | What it means for you |
|---|---|
| `isCreditConfirmationSupported: boolean \| null` | **The gate.** `true` ⇒ the merchant's bank is on the confirmation rail, the SDK is polling, and you should render the credit line **and may offer the manual check**. `false`/`null` ⇒ there is nothing to ask — render **no** credit UI for that transaction, and **do not call `refreshCreditConfirmation`**. |
| `creditConfirmationStatus: string \| null` | `null` = no answer yet (with the gate `true`, that is the "confirming…" state) · `'RECEIVED'` = terminal, the funds are confirmed in the merchant's account · `'UNABLE_TO_CONFIRM'` = the 30-day sweep stopped asking. |
| `creditTransactionId: string \| null` | The credit leg's id (NIP session id inter-bank, batch reference intra-bank) — **what you quote to a bank** when the merchant says the money never arrived. Display/support only; never pass it back to the SDK, and render it only where the gate above is `true` — a bare id with no confirmation line reads as a promise. |
| `creditedAt: string \| null` | When the beneficiary bank posted the credit. `'RECEIVED'` only. |
| `bankReference: string \| null` | The beneficiary bank's own reference for the credit. `'RECEIVED'` only. |

Two things to get right, because they are easy to get wrong in the user's favour and wrong
in fact:

- **`'UNABLE_TO_CONFIRM'` does not mean the merchant was not paid.** It means we stopped
  asking after 30 days. Word it as "could not confirm", never as "not received".
- **No credit line at all is a normal state**, not an error: the transaction is not on the
  rail (an older row, a bank that does not support confirmation, or a payment that was not
  approved). Absence means "we cannot ask".

**Platform note:** the wallet rail works the same on both platforms and the fields are
identical; only the cadence differs. On Android the sweep rides WorkManager, whose floor is
15 minutes, with a one-shot chain immediately after a payment resolves; on iOS it is an
app-scoped loop that runs while the app is alive (no OS background execution) and resumes
with the app. Neither loses an answer — the state lives in the SDK's store.

A failed poll — device offline, gateway unreachable, an unreadable answer — changes nothing:
the SDK backs off and asks again, leaving the row exactly as it was. "We could not reach the
server" is never recorded as "the payment failed".

#### `wallet.refreshCreditConfirmation` — let the customer ask on demand

The SDK polls for beneficiary credit confirmation with **exponential backoff** and **stops
after 30 days**, finalising the row as `'UNABLE_TO_CONFIRM'` — which means "we stopped
asking", never "the funds were not received". Expose **`refreshCreditConfirmation`** in your
UI so the user can ask on demand; it works after the window closes, and a later
`'RECEIVED'` replaces the give-up state.

**Check `isCreditConfirmationSupported` on the transaction first.** Not every merchant's
bank is on this rail. `true` means the SDK is polling and you may offer the manual check;
`false`/`null` means there is nothing to ask — do not call it, and show no credit UI for
that transaction. Offer the action only while

```ts
tx.authorizationStatus === 'APPROVED' &&
  tx.isCreditConfirmationSupported === true &&
  tx.creditConfirmationStatus !== 'RECEIVED'
```

```ts
// Keyed by the row's transaction hash, never by a credit id.
const updated = await wallet.refreshCreditConfirmation(tx.transactionHash);
```

- **A row outside that predicate is a no-op**, not a rejection: no request is made and the
  unchanged row resolves.
- **It works past the 30-day window**, including on a row already stamped
  `'UNABLE_TO_CONFIRM'` — that is the case it exists for. Nothing ever replaces `'RECEIVED'`.
- **Only a confirmation is written.** Anything else leaves the row exactly as it was.
- **Settlement only.** Nothing on this path can change `authorizationStatus`,
  `responseCode` or `responseStatusReason`.
- **Still no event** — the resolved row and the stored history are the wallet's whole credit
  surface, by design.
- **A failed call changes nothing** — `NOT_SENT` / `NO_NETWORK_CONNECTION` when the device is
  offline. Show the message and leave the credit line reading "not confirmed yet".

## 7. Merchant (Get paid) API

### 7.1 Registration & profile

`merchant.register({ merchantType: 'PERSONAL' | 'BUSINESS', … })` (BVN optional for
both types — send it when you have it;
CAC number for business; optional `walletAccountId`, stored verbatim by the gateway),
`getSettlementBanks()`, `isRegistered()`, `getStored()`, `refreshStatus()`,
`activate()` / `deactivate()`, `update(…)` (also accepts optional `walletAccountId` and
`bvn`). The merchant belongs to the signed-in customer (§4.1); a successful `register`
overwrites the stored merchant — there is no `clearStored()`. Gate acceptance on the stored merchant's status
being `ACTIVE`. There is no `acquirerId` field anywhere: the gateway resolves it from
your `paymentAppProviderId` and the SDK stores it from the responses.

### 7.2 Tap acceptance

```ts
const { sessionId } = await merchant.tap.start({ amountMinorUnits, merchantOrderId: 'ORDER-42' });
const sub = merchant.tap.onEvent((e) => { … });
```

Only `result` (and iOS `ended`) are terminal. `cardContactLost` / `unsupportedCard`
mean the reader **stays armed for a re-tap** — show a transient hint ("Hold steady" /
"Card not supported — try another card") and keep the waiting screen up, exactly like a
physical terminal. `merchant.tap.cancel(sessionId)` cancels an armed, untapped payment.
Progress events `cardContactLost` / `readingComplete` / `sendingOnline` /
`receivingOnline` fire on **both** platforms (they were Android-only in earlier releases);
`ended` is iOS-only, and reports a reader session that ended *without* a card. Nothing
talks to the card after `readingComplete` — that is the moment to tell the merchant the
tap is over, while the bank is still being contacted.

**Branch on `result.status`, not on `result.responseCode`.** `'APPROVED'`, `'DECLINED'` and
`'FAILED'` are final; `'PENDING'` means the outcome is not known yet — do **not** re-charge; the
SDK polls the sale and `merchant.onTransactionResolved` fires when it settles (§7.6). A tap
that gets no answer comes back `'PENDING'` with `68` (no reply), `06` (the hop called failed)
or `96` (a service threw); `91` (connection refused — nothing was sent) is `'FAILED'`. `'99'`
is retired. The full code/status table is §9.2, Table B.

What the `result` event carries beyond the typed `MerchantTapResult`:

- **`reason`** — the named cause (`'INSUFFICIENT_FUNDS'`, `'NO_RESPONSE_RECEIVED'`…), a plain
  string. Display and log it.
- **`sdkErrorCode`** — the native SDK's own name for a failure inside the SDK, for support logs
  only. When the SDK could not attempt the payment (validation, cancellation, merchant not
  ready, NFC mode refused), `status` is `'NOT_SENT'`, `responseCode` is `null`, and `reason`
  names the cause (§9.2, Table A; §7.6).

Both are on the event on **Android**; the `MerchantTapResult` TypeScript type does not yet
declare them, so read them as optional fields. On **iOS** the bridge currently passes `status`
and `message` only — `responseCode`, `reason` and `sdkErrorCode` read `null` there, so branch
on `status` and read the settled row (`merchant.getTransaction(reference)`) for the code.

**Show a terminal outcome on a screen, not in an alert.** `result` is where the payment
ends for the merchant standing at the counter: they need the amount, the response and the
reference to stay on screen — an alert that can be dismissed by a stray tap is not enough.
This sample sends every rail (tap, both QR rails, and the wallet's scan-to-pay) to one
`PaymentResult` screen, which also decides when a receipt may be offered:

| Outcome | Receipt? | Why |
|---|---|---|
| Approved (`status: 'APPROVED'`) | yes | recorded and final |
| Declined / failed (`'DECLINED'` / `'FAILED'`) | yes | the gateway recorded the attempt |
| Pending (`'PENDING'`) | **no** | not final — the status can still change |
| Never sent (`'NOT_SENT'`) | **no** | nothing was recorded to print |

See `src/paymentResult.ts` (the mapping, unit-tested) and
`src/screens/PaymentResultScreen.tsx` (the screen, which holds the result for `AUTO_RETURN_MS`
— 60s — with **Done** dismissing immediately, then returns Home by itself; see §7.5).

**You never handle NFC intents.** The SDK arms and disarms Android reader mode itself for
the duration of a get-paid session, so cards are read while your screen is open without any
NFC intent filter in the manifest and without forwarding intents from `onNewIntent` — there
is nothing to wire on the React Native side. Declaring a tag intent filter would only pull
taps toward your launcher activity and away from the session.

### 7.3 QR rails

- **Get-paid QR (merchant-presented):** `createPaymentContext(amountMinorUnits,
  currency | undefined, merchantOrderId)` → render `mpmPayload`; poll `contextStatus(txRef)`
  (`PENDING → IN_FLIGHT → APPROVED/DECLINED/EXPIRED`); `cancelQrExpiry()` on teardown;
  expiry event on `merchant.onQrExpired`.
- **Charge a customer QR (consumer-presented):** `inspectCustomerQr(payload)` →
  `{ handle, maskedCard, amountMinorUnits }` → confirm on screen →
  `chargeCustomerQr(handle, merchantOrderId)`. The outcome carries `responseCode` and
  `approved` (exactly `responseCode === '00'`) but **no status** — so `approved: false` is
  not a decline by itself: a `68`, `06` or `96` is an unresolved payment. Before telling the
  merchant anything but "approved", read the stated status with
  `merchant.refreshTransactionStatus(merchantTransactionReference)` (§7.4), and never
  re-charge a pending one.

> **The transaction reference is minted by the SDK, not by your app.** It comes back on the
> outcome as `merchantTransactionReference` (`{terminalId}-YYYYMMDDHHmmssSSS`) and is the key for
> receipts, `refreshTransactionStatus` and credit confirmation. `merchantOrderId` is the field for
> **your** order / basket / invoice id: echoed back, and **unique per merchant** across all its
> payments, whatever their outcome. A payment that reuses one — even one used by a declined or
> failed payment — is refused `94` / `FAILED` / `DUPLICATE_MERCHANT_ORDER_ID`, and
> `createPaymentContext` answers `FAILED` / `DUPLICATE_MERCHANT_ORDER_ID` without creating a QR. A
> retry needs a new order id; several QRs may share one until one of them is paid. **Every merchant-initiated rail requires it**: `tap.start`
> (`TapRequest.merchantOrderId`), `createPaymentContext(amountMinorUnits, currency | undefined, merchantOrderId)`
> (pass `undefined` to keep the default currency) and `chargeCustomerQr(handle, merchantOrderId)`.
> The types make it mandatory; a blank (or over-255-character) value ends `NOT_SENT` /
> `INVALID_REQUEST` before anything is sent, on Android and iOS alike. `TapRequest.merchantTransactionReference` is
> **gone** — it was an input the SDK ignored once it began minting the reference itself.

### 7.4 Transactions & receipts

`getTransactions(limit?)`, `getTransaction(reference)`,
`refreshTransactionStatus(reference)`, `refreshCreditConfirmation(reference)`,
`getReceipt(reference)` — the
receipt carries `qrCodeBase64` (Android, ready-made PNG) **or** `qrPayload` (iOS,
render it yourself); display whichever is non-null (see
`MerchantTransactionsScreen.tsx`).

`getTransaction` is a **local** read; `refreshTransactionStatus` is the on-demand check that
asks the gateway and updates the stored row — see §6.5 for the rules that govern it (pending
rows only, works past the 30-day window, `NOT_SENT` / `'NO_NETWORK_CONNECTION'` offline).

`refreshCreditConfirmation` is its settlement twin: "has my bank actually received the funds?",
asked on demand for one **approved** sale. Gate it on
`isCreditConfirmationSupported === true` and offer it only while the credit is not already
`'RECEIVED'` — see §7.5 for the full rules (works past the 30-day window, replaces the
`'UNABLE_TO_CONFIRM'` give-up, never touches the outcome triple). On an approved row the two
buttons sit side by side; on a pending one only `refreshTransactionStatus` applies.

A `MerchantTransaction` also carries `cardholderName` — the paying card's name as it
presented it (EMV tag `5F20`); on a Veyra token that is the card's display name, e.g.
`AFRIGO ****1234`, not a person's name. It is `null` on QR-MPM payments (the merchant
never reads the card) and on transactions recorded by older SDK versions.

And it carries `merchantOrderId` — your own order/basket id exactly as you supplied it on
the charge (`chargeCustomerQr`, `tap.start`, `createPaymentContext`), your reconciliation
key back to your POS/till; `null` on sales that carried none. Receipts and status refreshes
key off `reference`.

### 7.5 Beneficiary credit confirmation

Has the merchant's bank actually **received the funds** of an approved sale? Settlement
confirmation only — it never changes the sale's payment outcome.

- `MerchantTransaction` carries `creditTransactionId` (the credit's identifier, `null`
  unless the sale was approved and the merchant's bank supports confirmation),
  `isCreditConfirmationSupported` (`true` ⇒ the SDK is polling the confirmation rail for
  this sale; on a merchant-QR row it can be `null` for a few seconds after the settle
  while the SDK learns it from the transaction-status rail — the merchant-QR settle
  itself carries no credit fields) and
  `creditConfirmationStatus` — `"RECEIVED"` once the funds are confirmed,
  `"UNABLE_TO_CONFIRM"` only as the final give-up after 30 days, and `null` while
  unconfirmed. Render `null` as nothing (or "not confirmed yet"), never as "not
  received".
- An approved tap `MerchantTapResult` and an approved `CustomerQrChargeOutcome` carry
  `creditTransactionId` + `isCreditConfirmationSupported` directly — the result screen's
  cue to wait.
- `merchant.onCreditConfirmation(listener)` — fires with a `CreditConfirmationEvent`
  (`merchantTransactionReference`, `creditTransactionId`, `status`, `amountMinorUnits`,
  `bankReference`, `creditedAt`) when a sale's funds are confirmed, or once with
  `"UNABLE_TO_CONFIRM"` when the 30-day window closes. It covers sales on **every rail**
  (tap, customer-QR charge, merchant-presented QR) — the sweep works off the stored rows.
  Match by `merchantTransactionReference` — it can fire for a sale from an earlier
  session. The SDK owns the polling (exponential backoff); the app just reacts.

**Recommended pattern — the result screen renders the stored row** (see the sample's
`PaymentResultScreen`): when an approved outcome says the merchant's bank supports
confirmation, show "Confirming credit with merchant bank…" on the result screen, flip it
from `onCreditConfirmation` — "Funds received by merchant bank" on `RECEIVED`,
"Bank credit could not be confirmed" only on the final give-up — and also re-read
`merchant.getTransaction(ref)` every few seconds while visible, so the same flip works
from the stored `creditConfirmationStatus` (the iOS path, and the merchant-QR path where
the settle can't carry the supported flag and the SDK learns it moments later).

**The polling is SDK-owned and app-scoped, never screen-scoped**: leaving the result
screen changes nothing — the SDK keeps polling while the app runs, persists the answer
onto the stored row, and screens that re-read the store on focus (as the sample's
transactions screen does) show the updated state on return.

**Platform note:** every merchant rail supports credit confirmation, the SDK polls on
every platform, and **the event now fires on both** — the iOS bridge forwards the same
native channel Android does, with the same name and payload, so shared JS needs no
platform branch. (On iOS the sweep runs while the app is alive — no OS background
execution; it suspends and resumes with the app.) Keep the
stored-row read anyway: the event does not replay, so a screen opened after the answer
landed learns it from `merchant.getTransaction(ref)`, as the sample does.

#### `merchant.refreshCreditConfirmation` — let the merchant ask on demand

The SDK polls for beneficiary credit confirmation with **exponential backoff** and **stops
after 30 days**, finalising the row as `'UNABLE_TO_CONFIRM'` — which means "we stopped
asking", never "the funds were not received". Expose **`refreshCreditConfirmation`** in your
UI so the merchant can ask on demand; it works after the window closes, and a later
`'RECEIVED'` replaces the give-up state.

**Check `isCreditConfirmationSupported` on the transaction first.** Not every merchant's
bank is on this rail. `true` means the SDK is polling and you may offer the manual check;
`false`/`null` means there is nothing to ask — do not call it, and show no credit UI for
that transaction. Offer the action only while

```ts
tx.status === 'APPROVED' &&
  tx.isCreditConfirmationSupported === true &&
  tx.creditConfirmationStatus !== 'RECEIVED'
```

```ts
const updated = await merchant.refreshCreditConfirmation(reference); // MerchantTransaction | null
```

- **A row outside that predicate is a no-op**, not a rejection: no request is made and the
  unchanged row resolves. The gateway refuses the same cases, so the SDK does not spend a
  round trip being told.
- **It works past the 30-day window**, including on a row already stamped
  `'UNABLE_TO_CONFIRM'` — that is the case it exists for. Nothing ever replaces `'RECEIVED'`.
- **Only a confirmation is written.** An answer of `'UNABLE_TO_CONFIRM'`, or one this SDK
  version does not recognise, leaves the row exactly as it was — "not confirmed **yet**",
  never "not received".
- **Settlement only.** Nothing on this path can change `status`, `responseCode` or
  `responseStatusReason`.
- **It writes the store and fires `merchant.onCreditConfirmation`**, exactly as the
  background sweep does — both go through the same write — so your existing subscription
  needs no change.
- **A failed call changes nothing** — `NOT_SENT` / `NO_NETWORK_CONNECTION` when the device is
  offline. Show the message and leave the credit line reading "not confirmed yet".
- **No SDK-side throttle.** Disable your button while a call is in flight.

**Holding the result screen (your app's decision, never the SDK's).** A terminal outcome is
a destination, not a notification. `PaymentResultScreen` holds every terminal result —
merchant and wallet, approved, declined, pending and failed alike — for `AUTO_RETURN_MS`
(**60s**, exported from `src/paymentResult.ts` and unit-tested), with **Done** visible for the
whole hold and dismissing immediately; when the hold expires the screen pops back to the top
of the stack on its own. The single exception is an approved sale waiting on credit
confirmation: while the waiting line is up the hold is **cancelled outright** — the screen
must not vanish while the merchant's bank is still being asked — and a **fresh 60s** starts
the moment the confirmation is displayed. Non-terminal states are untouched: an unsupported
card or lost contact keeps the waiting screen up, armed for a re-tap, and holds/dismisses
nothing. How long a result stays up and what dismisses it are app concerns end to end — the
SDK has no concept of a screen and supplies no duration, and dismissing a screen never stops
its app-scoped credit polling.

### 7.6 Holding a `PENDING` payment, and being told when it settles

Because the SDK no longer invents terminal outcomes, a tap that gets no answer hands you
`result.status === 'PENDING'`. **That is not a failure and not a decline** — the payment may well have
completed, so the one thing you must not do is charge again.

What the app should do:

1. **Stay on the confirmation screen** and show "processing". Do not navigate away and do not print a
   receipt yet.
2. **Let the SDK resolve it.** It stores the transaction and polls with backoff; you do not have to.
3. **Finish when it settles** — either from `onTransactionResolved` (below) or by reading the row with
   `merchant.getTransaction(reference)` / `merchant.getTransactions()`.

A pending row always converges: it becomes `APPROVED`, `DECLINED` or `FAILED` when the backend settles
it, or it stays `PENDING`. It never turns into a terminal outcome the SDK made up, and there is no
attempt cap that gives up on it.

**`TRANSACTION_IN_PROCESS_ESCALATED`** is the one reason that changes what *you* do. It means automated
reconciliation has stopped and a human will settle the payment. Stop any tight loop of your own, tell
the merchant "we're looking into this", and re-check lazily — next app open, or a long backoff. It will
still resolve; it just will not resolve in seconds.

#### `merchant.onTransactionResolved` — the SDK pushes the answer

```ts
import { merchant, type TransactionResolvedEvent } from 'veyra-sdk-react-native';

const sub = merchant.onTransactionResolved((r: TransactionResolvedEvent) => {
  // r.merchantTransactionReference — which payment
  // r.status — 'APPROVED' / 'DECLINED' / 'FAILED' (never 'PENDING')
  // r.reason — e.g. 'INSUFFICIENT_FUNDS'
  // r.responseCode — the wire literal, for receipts and support
});
// …and on unmount:
sub.remove();
```

Five things worth knowing before you rely on it:

- **Subscribe once, at start-up** — not per payment. It fires for *any* transaction that resolves,
  including one started in an earlier app session and settled by a later poll. That is the case that
  matters most: a tap that resolves after your app was backgrounded or killed.
- **It fires identically on Android and iOS** — same event, same payload. (In earlier releases it was
  emitted natively on Android only and had no TypeScript binding at all, reachable solely through a raw
  `DeviceEventEmitter`; that is what the typed subscriber above replaces.)
- **It does not replay.** If your app was not running when the row settled, nothing is queued for you —
  read `merchant.getTransactions()` at start-up. The event is a convenience over the store, not a
  delivery guarantee, so keep the read path (the sample's `PaymentResultScreen` does both: it reads the
  row once on mount and subscribes for the live case).
- **The payment result still arrives exactly once**, possibly with `'PENDING'`. The resolution comes on
  this separate channel; the two are not alternatives.
- The event is emitted on the JS thread, like every other Veyra event. Underneath, the native
  registration is single-listener — **last registration wins** — but the bridge owns that one
  registration, so on the JS side you may add and remove as many `addListener` subscriptions as you
  like.

#### When the SDK could not start a payment at all

When nothing was ever attempted — request validation, cancellation, merchant not ready, a
mode/arming refusal, or the SDK failing before it sent anything — the result's `status` is
`'NOT_SENT'`, `responseCode` is **null**, and `reason` names the cause (§9.2, Table A). There is
deliberately no response code: a code asserts that a payment was attempted and something answered
or failed to, so a made-up one would invite you to treat a request that never left the device as a
payment (and put a made-up code on a receipt). Fix what the reason names and try again with the
same `merchantOrderId` — a `NOT_SENT` payment does not use it up.

## 8. Events

One `NativeEventEmitter` channel per family; subscribe via the typed helpers and
`remove()` the subscription on unmount:

| Helper | Events |
|---|---|
| `wallet.onActivationEvent` | `activated` / `timeout` / `error` |
| `wallet.onTapEvent` | `transactionStarted` / `transactionCompleted` / `activationFailed` — Android tap rail only |
| `wallet.onPaymentRefusal(tur, …)` | `requireOnline` / `amountExceedCardLimit` / `deviceNotBound`, **per card**, on every rail that platform has |
| `merchant.tap.onEvent` | `cardDetected` / `cardContactLost` / `unsupportedCard` / progress / `ended` / `result` |
| `wallet.onQrExpired` / `merchant.onQrExpired` | one `expired` per rendered QR |
| `merchant.onTransactionResolved` | one settlement per pending sale — `APPROVED` / `DECLINED` / `FAILED`, never `PENDING` (see §7.6) |
| `merchant.onCreditConfirmation` | one terminal credit confirmation per sale — `RECEIVED`, or the final 30-day `UNABLE_TO_CONFIRM` (see §7.5) |
| `wallet.onTokenStatusChanged` | the issuer changed a card's status — suspended, reactivated, expired, deactivated (see §8.1) |
| `wallet.onTransactionResolved` | one settlement per pending **wallet** payment — the payer-side twin of `merchant.onTransactionResolved`, keyed on `transactionHash` (see §8.1) |
| `wallet.onCardKeyStateChanged` | a card ran out of payment keys, or a refresh replenished them (see §8.1) |
| `merchant.onMerchantStatusChanged` | the merchant was deactivated, suspended or activated (see §8.1) |


##### `wallet.onPaymentRefusal` — a payment refused before anything was sent

A payment can be refused before any proof is built, for three reasons whose **advice differs**. Handlers are registered **per card**: a listener for one `tokenUniqueReference` never hears about another's, which is the same ownership model the Android and iOS SDKs use.

```ts
useEffect(() => {
  const sub = wallet.onPaymentRefusal(card.tokenUniqueReference, refusal => {
    if (refusal.type === 'requireOnline') {
      // Connecting genuinely fixes this one.
      show(`Connect to the internet to pay ${format(refusal.amountMinorUnits)}`);
    } else if (refusal.type === 'deviceNotBound') {
      // Neither connecting nor a smaller amount helps: this card was added on another device
      // (or before a reinstall). The only remedy is to remove it and add it again here.
      show('This card was added on another device — remove it and add it again on this phone');
    } else {
      // NEVER say "go online" here — a refreshed key carries the same cap, so they would
      // connect, retry and fail identically.
      show(refusal.cardLimitMinorUnits
        ? `This card can pay at most ${format(refusal.cardLimitMinorUnits)} at once`
        : 'That amount is too large for this card — try a smaller one, or another card');
    }
  });
  return () => sub.remove();
}, [card.tokenUniqueReference]);
```

- **Rails:** `TAP`, `CPM_QR` and `MPM_QR` on Android; the two QR rails on iOS, which has no tap-to-pay. Read `refusal.rail` if you need to know which.
- **These describe *this payment*, not the card.** `Card.requiresOnline` answers the different question "can this card pay anything offline at all?" and stays `false` for a card that can still make smaller payments — so don't grey a card out on the strength of one refusal.
- **`deviceNotBound` is the exception — it is a card state too.** The backend issues a card's payment keys only to the device the card was added on; a request from another device, or from this phone after the app was reinstalled, is refused. The SDK remembers the refusal for that card, stops requesting keys for it, and sets `Card.deviceNotBound` (§6.3). The shape is `{ type: 'deviceNotBound'; tokenId; tokenUniqueReference; amountMinorUnits; rail; message }`, with `message` prefixed `DEVICE_NOT_BOUND`. Fires on both platforms (`TAP` on Android only).
- **`tokenUniqueReference: null`** means the SDK could not attribute the refusal to a card. Such a refusal reaches **every** registered handler rather than none: the payer was refused either way.
- `remove()` is idempotent and releases the native registration once that card's last listener has gone.

> **Changed in 1.3.0.** These were `requireOnline` / `amountExceedCardLimit` phases of the SDK-wide `walletTap` event. Every listener heard every card's refusals and had to filter, and a second listener could not be added without the first losing its registration. `walletTap` was also the wrong home: refusals fire on the QR rails, neither of which is a tap. Move a `walletTap` handler's refusal branches to `wallet.onPaymentRefusal` for the card they concern.

### 8.1 The SDK tells you when stored truth changes

Four channels that exist because the SDK used to learn these things, write them to its own store,
and say nothing — so your app found out only if it happened to read again. All four fire on
**Android and iOS alike**, with the same event names and the same payload shapes.

The rules below are the same for all four, and are worth reading once:

- **Subscribe once, at start-up** — not per screen. The changes that matter most happen while no
  screen is watching (a card suspended, a merchant deactivated, a payment settling days later), so
  a per-screen subscription misses exactly the cases these exist for.
- **There is no replay.** If your app was not running when it happened, nothing is queued. Keep
  reading the store when a screen appears (`wallet.getCards()`, `wallet.getTransactions()`,
  `merchant.getStored()`); these events are a live update *on top of* that read, never a
  replacement for it.
- **Last registration wins** on the native side, and each helper returns a subscription — call
  `remove()` on unmount.
- **Only genuine changes fire.** A background poll re-applying the value it already had wakes
  nothing.

```ts
const subs = [
  wallet.onTokenStatusChanged((e) => {
    // Branch on e.canPay, NOT on e.status: canPay is the SDK's own reading, so a status added to
    // the backend after your build shipped is correctly "cannot pay" rather than an unhandled case.
    if (!e.canPay) markCardUnavailable(e.tokenUniqueReference, e.status);
  }),
  wallet.onTransactionResolved((e) => {
    // Match your row on e.transactionHash. This is the WALLET's channel — merchant.onTransactionResolved
    // is the merchant's side of a payment and keys on a reference a wallet never sees.
    finishPendingRow(e.transactionHash, e.status, e.reason);
  }),
  wallet.onCardKeyStateChanged((e) => {
    setNeedsOnline(e.tokenUniqueReference, e.requiresOnline);
    // A card that becomes not-bound arrives as { requiresOnline: false, deviceNotBound: true }.
    if (e.deviceNotBound) markCardNeedsReAdd(e.tokenUniqueReference);
  }),
  merchant.onMerchantStatusChanged((e) => {
    // Same rule as canPay: branch on canAcceptPayments, never on status.
    if (!e.canAcceptPayments) disableGetPaid();
  }),
];
// on unmount: subs.forEach((s) => s.remove());
```

**One limit to know about `onCardKeyStateChanged`**, because it changes how you word your UI: it
fires when a payment consumes a key and when a refresh delivers new ones — the moments the SDK is
actually executing. Payment keys *also* expire by clock, which happens with no SDK code running, so
**nothing fires for that**; such a card simply reads as `requiresOnline` on your next
`wallet.getCards()`. Do not present it as live coverage of every case. (`requiresOnline` here is
the same value `getCards()` reports — the SDK reads one function for both.) The event also carries
`deviceNotBound: boolean`, the same value as `Card.deviceNotBound`: a card the backend refused to
issue keys to on this device arrives as `{ requiresOnline: false, deviceNotBound: true }` — prompt
a remove-and-re-add, not a reconnect.

**Where `wallet.onTokenStatusChanged`'s answers come from:** the SDK polls each stored card's
server status itself on both platforms — Android from a background job (roughly every 15 minutes,
even with the app backgrounded), iOS at configure, on every return to the foreground, and every
15 minutes while the app runs (nothing runs while iOS keeps the app suspended; the next foreground
catches up). The same poll also self-heals cards the server marks as needing refresh — a card
nearing its expiry date is re-provisioned in place, with no app involvement and no event unless
the status genuinely changes. There is nothing to wire: no lifecycle observer, no manual sync call.

**And on `merchant.onMerchantStatusChanged`:** the SDK owns the polling and it is app-scoped on both
platforms. On iOS it pauses while the app is suspended and resumes on foreground; nothing is lost,
because the comparison is against the stored status, so a change that happened while you were away
still arrives on the first poll after you return.

## 9. Errors and outcomes

Every SDK call ends in one of two ways:

1. **It rejects with a `VeyraError`** — only when your app has not set the SDK up correctly.
   These are bugs in your integration, found during development. You fix the code; you never
   show them to a user. See §9.1.
2. **It resolves with an outcome** — for everything that happens while processing a request:
   approved, declined, failed, still pending, or never sent. The outcome is always the same three
   fields: `responseCode` (payments and add-card), `responseStatus` and `responseStatusReason`.
   See §9.2.

So a `try`/`catch` around an SDK call catches integration bugs, not payment results. A declined
payment, a lost connection or a dismissed authentication sheet all **resolve** — read the outcome.

### 9.1 Initialisation and configuration errors — thrown

**What they mean.** The SDK cannot run the call at all, because of how the app called it. Nothing
was sent. Retrying will never help until the code changes.

**How to use them.** Let them surface in development — log them, fail loudly, assert. Fix the
integration. Do not build user-facing screens for them, and do not offer the user a retry.

| `VeyraError.code` | When it happens | Fix |
|---|---|---|
| `NOT_CONFIGURED` | a call is made before `Veyra.initialize` | initialise the SDK first, at app start (§4) |
| `NOT_SIGNED_IN` | a call is made after `Veyra.signOut()`, with no customer | call `Veyra.initialize` with the customer's `customerId` before using the SDK (§4.1) |
| `VALIDATION` (`field`) | `Veyra.initialize` was given a configuration it can't use — a provider it can't use (`field` is `'provider'`), a provider of a different kind from an earlier `initialize` in this app process, or a missing `customerId` / environment / `appleTeamId` | pass a valid configuration; the message names the problem (§4.2) |
| `SESSION_REQUIRED` | a payment method was called without the payment-screen session open | mount `usePaySession` / `useGetPaidSession` on the payment screen (§5) |
| `UNSUPPORTED_ON_PLATFORM` | the method doesn't exist on this platform — e.g. wallet tap-to-pay on iOS | don't call it on this platform (§10) |

Two more codes guard `wallet.showQrToPay` the same way: `NO_ACTIVE_CARD` (no card is set active —
select a payable card first) and `CARD_CANNOT_SHOW_QR` (the active card was added before it could
show a payment QR — re-add it). Gate the button on the card instead of handling these at runtime.
`UNKNOWN` is a rejection the bridge could not classify: log it and report it.

**A cancel answer is not an error.** `TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT` and
`TOO_LATE_TO_CANCEL_TASK_ALREADY_PROCESSED` are the reply to a cancel request — not an error, and
not the outcome of the original call. That call still ends with its own outcome.

#### `VeyraError` — the fields

```ts
class VeyraError extends Error {
  code: VeyraErrorCode;          // the stable, typed code above — branch on this
  nativeErrorCode: string | null;// the platform's own error name, when there is one (Android)
  field: string | null;          // the offending parameter, for code === 'VALIDATION'
}
```

`code` is the contract. `nativeErrorCode` and `field` are **diagnostics**: log them, show them in a
support screen, but never branch on them — the same `code` can arrive with different native codes on
Android and iOS. On iOS `nativeErrorCode` is usually `null`.

### 9.2 Processing outcomes — returned as the response triple

**What they mean.** The SDK ran the call. The outcome tells you what happened and, through the
status, whether it is safe to retry.

**How to use them.** **Branch on `responseStatus` first, then on `responseStatusReason`.** Use
`responseCode` only for receipts, disputes and support. Never branch on the message text — it is
for display and logs. Treat a reason you don't recognise as a failure you can't classify (show the
message), never as a parse error: new reasons are added without notice, which is why every reason
is typed as a plain `string`.

| Field | What it is | How to use it |
|---|---|---|
| `responseCode` | Payments: the two-digit code (`'00'`, `'51'`, `'68'`…). Add-card: the issuer's decision. Absent on other calls | Receipts, disputes, support. **Never branch on it** |
| `responseStatus` | One of the five statuses below | **Branch on this first** |
| `responseStatusReason` | The named cause (`'INSUFFICIENT_FUNDS'`, `'NO_NETWORK_CONNECTION'`…) | Branch on it second; always keep a default |

#### The five statuses

| `responseStatus` | What it means | Did the request reach Veyra? | Merchant order ID used up? (payments) | What your app does |
|---|---|---|---|---|
| `'APPROVED'` | It was done | Yes | Yes | Complete the sale / show the card |
| `'DECLINED'` | It was done, and someone with authority refused (issuer, bank, risk rules) | Yes | Yes | Show the reason. Don't retry automatically; a new attempt needs a **new** order ID |
| `'FAILED'` | Veyra received it but could not perform it | Yes | Yes | Fix what the reason names; retry with a **new** order ID |
| `'PENDING'` | It may have been done; the outcome is not known yet | Maybe | Yes | **Never retry.** The SDK keeps checking and tells you when it's final; you can also look it up by merchant order ID |
| `'NOT_SENT'` | It never reached Veyra. Nothing was done | No | **No** | Fix what the reason names (connect, authenticate, …) and retry with the **same** order ID |

Four rules follow from this table:

- **`NOT_SENT` never has a `responseCode`.** A code only ever means something on the network
  answered, or failed to.
- **`PENDING` is never a failure.** Never show it as failed and never charge again. Show "We're
  checking this payment" and wait for the SDK's update (`merchant.onTransactionResolved` /
  `wallet.onTransactionResolved`, §7.6 and §8.1).
- **Add-card (digitisation) is different.** There is no reference and no lookup. A digitisation
  that gets no answer ends `FAILED` (never `PENDING`), because the card's keys can never be
  delivered later. Start a new digitisation.
- **A payment that reached Veyra uses its merchant order ID up**, whatever the outcome. A retry
  with the same ID is refused as `DUPLICATE_MERCHANT_ORDER_ID`, and that refusal includes the
  original payment's outcome. To find out what happened to a payment, look it up by its merchant
  order ID.

```ts
// Resolves for every processing result — a decline is not an exception.
const outcome = await wallet.payScannedContext(handle);
switch (outcome.responseStatus) {
  case 'APPROVED':
    showSuccess(outcome);
    break;
  case 'PENDING': // never "failed", never charge again
    showChecking(outcome);
    break;
  case 'NOT_SENT': // nothing was sent: fix the cause, retry
    if (outcome.responseStatusReason === 'AUTH_CANCELLED') return;
    showProblem(outcome.message);
    break;
  default: // DECLINED, FAILED, or a status added later
    showProblem(outcome.message);
}
```

#### Where each call carries the triple

The triple's three fields are named the same on most results; a few older result types keep their
own names for the same fields. A dash means the call has no response code by design.

| Call / event | Code | Status | Reason |
|---|---|---|---|
| `merchant.tap.onEvent` → `{ type: 'result', result }` (**contactless tap**) | `result.responseCode` | `result.status` | `result.reason` |
| `merchant.chargeCustomerQr(...)` → `CustomerQrChargeOutcome` (**customer-presented QR**) | `.responseCode` | read the stored row (`merchant.getTransaction` / `refreshTransactionStatus`) | as for the status |
| `merchant.contextStatus(txRef)` → `PaymentContextStatus` (**merchant-presented QR**) | `.responseCode` (`null` while unpaid) | `.state` — the QR's own lifecycle: `'PENDING'` / `'IN_FLIGHT'` / `'APPROVED'` / `'DECLINED'` / `'EXPIRED'` | — |
| `merchant.getTransactions()` / `getTransaction(ref)` / `refreshTransactionStatus(ref)` → `MerchantTransaction` | `.responseCode` | `.status` | `.responseStatusReason` |
| `merchant.onTransactionResolved` → `TransactionResolvedEvent` | `e.responseCode` | `e.status` (never `'PENDING'`) | `e.reason` |
| `wallet.payScannedContext(handle)` → `PaymentOutcome` (**scan-to-pay**) | `.responseCode` | `.responseStatus` | `.responseStatusReason` |
| `wallet.getTransactions(...)` / `refreshTransactionStatus(hash)` / `reconcilePendingTransactions()` → `TransactionSummary` | `.responseCode` | `.authorizationStatus` | `.responseStatusReason` |
| `wallet.onTransactionResolved` → `WalletTransactionResolvedEvent` | `e.responseCode` | `e.status` (never `'PENDING'`) | `e.reason` |
| `wallet.digitise(...)` / `wallet.verifyAccount(...)` → `DigitiseResult` / `VerifyAccountResponse` | — (`responseCode` here is the issuer's decision: `'APPROVED'` / `'APPROVE_REQUIRE_AUTH'` / `'DECLINED'`) | `.responseStatus` | `.responseStatusReason` |
| `wallet.requestActivationCode(...)` / `wallet.activate(...)` | — | `.status`: `'SUCCESS'` / `'FAILURE'` | `.failureCode` |

Some calls are not payment outcomes and have their own vocabularies:

- `wallet.showQrToPay(amountMinorUnits)` returns the QR to display. The merchant submits the
  payment, so its outcome arrives later on the wallet's history row.
- `wallet.onTapEvent`'s `transactionCompleted` status (`'APPROVED'` / `'DECLINED'` / `'ERROR'`,
  Android only) is the **offline leg** — what the card told the terminal — not the issuer's
  authorisation. That lands on the history row with the full triple.
- `wallet.inspectScannedQr(payload)` answers `Verified` / `Rejected` with `MALFORMED`,
  `MISSING_SIGNATURE`, `UNKNOWN_KEY`, `BAD_SIGNATURE` or `EXPIRED`. Every rejection ends the
  flow — no payment was attempted. `merchant.inspectCustomerQr(payload)` likewise only says
  whether the scan is a payment QR; stay armed for another scan.
- `merchant.tap.onEvent`'s `unsupportedCard` / `cardContactLost` are transient (the reader stays
  armed), and `{ type: 'ended', outcome }` (iOS) means the reader session closed **without** a
  card — nothing was attempted.
- Card lifecycle (`Card.status`, `onTokenStatusChanged` — branch on `canPay`), merchant status
  (`'ACTIVE'` / `'INACTIVE'` / `'SUSPENDED'` / `'DEACTIVATED'` — branch on `canAcceptPayments`)
  and credit confirmation (`'RECEIVED'` / `'UNABLE_TO_CONFIRM'`, a settlement fact that never
  contradicts the payment's status) are states, not outcomes.

#### Table A — Outcomes the SDK itself produces

| Status | Code | Reason | When | What your app does |
|---|---|---|---|---|
| `NOT_SENT` | — | `INVALID_REQUEST` | an argument is invalid (e.g. blank merchant order ID, amount ≤ 0) | fix the call |
| `NOT_SENT` | — | `NO_NETWORK_CONNECTION` | the phone has no internet connection | ask the user to connect, retry with the same order ID |
| `NOT_SENT` | — | `SDK_UNABLE_TO_CONNECT` | the phone is online but could not connect to Veyra | try again shortly with the same order ID |
| `NOT_SENT` | — | `NOT_AUTHENTICATED` | the SDK could not get credentials (your assertion/proxy provider returned nothing, or the token endpoint refused) | check your provider; retry |
| `NOT_SENT` | — | `CANCELLED` | your app cancelled the call before it was sent | back to the previous screen |
| `NOT_SENT` | — | `AUTH_CANCELLED` | the customer dismissed the device authentication sheet | stay on the confirm screen, let them try again |
| `NOT_SENT` | — | `AUTH_FAILED` | device authentication did not succeed | stay on the confirm screen |
| `NOT_SENT` | — | `AUTH_UNAVAILABLE` | the device has no passcode and no biometrics | send the customer to Settings |
| `NOT_SENT` | — | `ONLINE_REQUIRED` | the card has run out of payment keys | ask the user to go online; the SDK refreshes the card |
| `NOT_SENT` | — | `TOKEN_NOT_ACTIVE` | the card is not active (e.g. suspended by the issuer) | show the card's state |
| `NOT_SENT` | — | `AMOUNT_EXCEEDS_CARD_LIMIT` | the amount is larger than this card can pay in one go | offer a smaller amount or another card |
| `NOT_SENT` | — | `DEVICE_NOT_BOUND` | the card was added on another device | remove the card and add it again on this phone |
| `NOT_SENT` | — | `MERCHANT_NOT_ACTIVE` | the merchant account is not active | contact support |
| `NOT_SENT` | — | `MERCHANT_PROFILE_INCOMPLETE` | the merchant's account details are missing | finish merchant setup |
| `NOT_SENT` | — | `MISSING_MANDATORY_CONFIG` | terminal / merchant config is missing | register the merchant / pass the config |
| `NOT_SENT` | — | `MODE_REFUSED` | the other mode's payment is in progress | wait for it to finish |
| `NOT_SENT` | — | `UNRECOGNISED_RESPONSE_CODE` | add-card was answered with a code this SDK version doesn't know; nothing was stored | retry; update the SDK if it persists |
| `NOT_SENT` | — | `SDK_INTERNAL_ERROR` | the SDK failed before sending | report to support; retry is safe |
| `PENDING` | `68` | `NO_RESPONSE_RECEIVED` | the request was sent but no answer came back (timeout, connection lost) | wait; the SDK resolves it |
| `PENDING` | `06` | `UPSTREAM_ERROR` | Veyra answered with an error or something unreadable | wait; the SDK resolves it |
| `PENDING` | — | `SDK_INTERNAL_ERROR` | the SDK failed after sending | wait; the SDK still resolves the payment |
| `FAILED` | — | `NO_RESPONSE_RECEIVED` / `UPSTREAM_ERROR` | **add-card only**: no answer after sending | start a new digitisation |

**`NO_NETWORK_CONNECTION` vs `SDK_UNABLE_TO_CONNECT` vs `ONLINE_REQUIRED`.** All three end with
"get online", and they need different copy:

- **`NO_NETWORK_CONNECTION`** — the *phone* has no connection. Nothing recovers until the user
  reconnects.
- **`SDK_UNABLE_TO_CONNECT`** — the phone is online, but the connection to Veyra could not be
  opened. The user's connection is not the problem; try again shortly.
- **`ONLINE_REQUIRED`** — the *card* has run out of payment keys. The phone is usually online
  already; the SDK refreshes the card itself, typically within seconds. A card state, not a
  network state.

**`NOT_AUTHENTICATED` with a client secret.** When the token endpoint refuses the client, a wrong
`clientId` / `clientSecret` in `veyra.config.ts` is by far the most likely cause. With a
`VeyraAssertionProvider` it usually means nobody is signed in to your app — send the user to
sign-in, then retry. The SDK never falls back to another connection mode (§4.2).

**Card-read failures are not outcomes.** When a tapped card cannot be read, the reader stays
armed and you get the `unsupportedCard` / `cardContactLost` tap events — no `result` event fires.
Give the merchant one message — "Card not supported — try another card" — and keep the waiting
screen up. A support log may quote the Android native code behind it: `NO_NFC_TAG`,
`NFC_CONNECTION_FAILED`, `APPLICATION_SELECTION_FAILED`, `NO_COMBINATION_RESULT`,
`NO_AID_SELECTED`, `NO_GPO_RESULT`, `GPO_FAILED`, `READ_RECORDS_FAILED`,
`PROCESSING_RESTRICTIONS_FAILED`, `CID_VALIDATION_FAILED`, `NO_FINAL_CID`, `GENERATE_AC_FAILED`,
`NO_CRYPTOGRAM_RESULT`, `CDA_FAILED_TC`, `CDA_FAILED_AAC`, `NO_TTQ_IN_PDOL` (the card does not ask
for the terminal transaction qualifiers) or `TC_NOT_SUPPORTED` (the card approved offline; this
product authorises online only). Never end the sale on one.

**A connect timeout is `PENDING`, not `NOT_SENT`.** The request may have been delivered and only
the reply lost. Only a connection that provably never opened is `NOT_SENT`.

#### The triple is the same on every Veyra service

The triple is not payment-only. Every Veyra service the SDK talks to — the Veyra payment gateway,
the Veyra token service, and through them the switch and the issuer's gateway — answers with the
same fields: `responseStatus` (`APPROVED` / `DECLINED` / `FAILED` / `PENDING`) and
`responseStatusReason`, plus a human `message`. **Payments** also carry `responseCode`, an
ISO 8583-style code. **Add-card** carries its own decision in `responseCode`: `'APPROVED'`,
`'APPROVE_REQUIRE_AUTH'` or `'DECLINED'` (not an ISO number). Other non-payment calls carry no
`responseCode`. The SDK passes all of these to your app unchanged. Tables B–D list them by
service.

#### Table B — Payments (Veyra payment gateway; codes from the bank, the issuer's gateway and the switch)

The same vocabulary is used on every rail — contactless tap, both QR rails, the settlement leg and
every status lookup. One code always means one reason.

| Code | Status | Reason | Meaning | What your app does |
|---|---|---|---|---|
| `00` | `APPROVED` | `APPROVED` | approved | complete |
| `05` | `DECLINED` | `DO_NOT_HONOR` | the bank refused without a specific reason | show it; another payment method |
| `07` | `DECLINED` | `ACCOUNT_VALIDATION_FAILED` | the account could not be validated | show it |
| `14` | `DECLINED` | `INVALID_TOKEN` | the card token is not valid | the customer should re-add the card |
| `21` | `DECLINED` | `NAME_ENQUIRY_FAILED` | the beneficiary account lookup failed | check the merchant's account details |
| `51` | `DECLINED` | `INSUFFICIENT_FUNDS` | not enough funds | another payment method |
| `54` | `DECLINED` | `EXPIRED_CARD_OR_TOKEN` | the card or token has expired | re-add the card |
| `58` | `DECLINED` | `DOMAIN_RESTRICTION_FAILED` | the card can't be used this way (wrong channel / domain) | another payment method |
| `61` | `DECLINED` | `LIMIT_EXCEEDED` | an amount limit was exceeded | smaller amount |
| `63` | `DECLINED` | `SUSPECTED_FRAUD` | refused by risk checks | don't retry |
| `65` | `DECLINED` | `VELOCITY_LIMIT_EXCEEDED` | too many payments in a short time | try later |
| `09` | `PENDING` | `TRANSACTION_IN_PROCESS` | still being processed | wait |
| `09` | `PENDING` | `TRANSACTION_IN_PROCESS_ESCALATED` | a person is reconciling it | show "we're looking into this"; the SDK re-checks less often |
| `68` | `PENDING` | `NO_RESPONSE_RECEIVED` | a hop timed out | wait |
| `06` | `PENDING` | `UPSTREAM_ERROR` | a hop answered with an error | wait |
| `96` | `PENDING` | `SYSTEM_MALFUNCTION` | the Veyra payment gateway hit an internal error while processing | wait; the SDK resolves it |
| `12` | `FAILED` | `QR_EXPIRED` | QR payments: the payment code expired | ask for a fresh code |
| `13` | `FAILED` | `AMOUNT_MISMATCH` | QR payments: amount or currency doesn't match the code | ask for a fresh code |
| `25` | `FAILED` | `UNABLE_TO_LOCATE_RECORD` | a status lookup found no such payment | it never arrived; safe to pay again |
| `30` | `FAILED` | `INVALID_REQUEST` | the gateway refused the request before sending it on | fix the request; new order ID |
| `91` | `FAILED` | `ISSUER_SWITCH_NOT_AVAILABLE` | Veyra could not reach the bank | try again later with a new order ID |
| `94` | `FAILED` | `DUPLICATE_MERCHANT_ORDER_ID` | this merchant order ID is already used; the response includes the original payment | read the original's outcome; use a new order ID for a new payment |

**Payment status lookup** (`merchant.refreshTransactionStatus`, `wallet.refreshTransactionStatus`,
and the SDK's own background checks) returns the stored payment's triple from this table, or `25` /
`FAILED` / `UNABLE_TO_LOCATE_RECORD`. If the lookup itself fails, the SDK leaves the payment as it
was and tries again — a failed lookup is never the payment's outcome.

**An unknown code is not a decline.** Read the status. If that is unrecognised too, treat the
payment as unresolved and look it up, rather than reporting a refusal.

#### Table C — Veyra token service (wallet: add-card, activation, card lifecycle)

Wallet API only. No `responseCode` except on add-card.

| Call | Status | Code | Reason | Meaning / what your app does |
|---|---|---|---|---|
| Add card (`wallet.digitise`) | `APPROVED` | `APPROVED` | — | the card is added and active |
| Add card | `APPROVED` | `APPROVE_REQUIRE_AUTH` | — (or the identity mismatch, below) | added, but the customer must activate it — run activation with the returned `activationMethods` (§6.2) |
| Add card | `DECLINED` | `DECLINED` | the issuer's reason (below) | the issuer refused this account; show the reason |
| Add card | `FAILED` | — | `INTERNAL_ERROR` | the Veyra token service could not complete it; start a new add-card |
| Add card | `FAILED` | — | `NO_RESPONSE_RECEIVED` / `UPSTREAM_ERROR` | no answer (Table A); start a new add-card |
| Activation code request (`wallet.requestActivationCode`) | `FAILED` | — | `TOKEN_NOT_FOUND`, `ACTIVATION_LOCKED`, `CODE_REQUEST_RATE_LIMITED`, `ACTIVATION_FAILED` | can't send a code now; locked / rate-limited → wait or contact the issuer |
| Activation code verify (`wallet.activate`) | `FAILED` | — | `CODE_INVALID`, `CODE_EXPIRED`, `MAX_ATTEMPTS_EXCEEDED`, `NO_PENDING_ACTIVATION`, `TOKEN_NOT_ACTIVATABLE`, `ACTIVATION_LOCKED`, `TOKEN_NOT_FOUND`, `ACTIVATION_FAILED` | wrong / expired code → ask again (`attemptsRemaining` says how many are left); max attempts or locked → remove the card and add it again (`recommendDelete`) |
| Card status / remove (`wallet.tokenStatus`, `checkTokenActive`, `deactivateToken`) | `FAILED` | — | `TOKEN_NOT_FOUND`, `TOKEN_STATE_CONFLICT` | the card isn't known, or the change isn't allowed from its current state |
| Bank lookup (`wallet.getBanks(accountNumber)`, `wallet.verifyAccount`) | `FAILED` | — | `INVALID_ACCOUNT_NUMBER` | check the account number |

The two activation calls carry their reason in **`failureCode`**, beside `status: 'SUCCESS' |
'FAILURE'`, rather than in `responseStatusReason`. Branch on `failureCode` the same way.

The SDK refreshes a card's payment keys itself; that call's result is not returned to your app.
You see it as card state instead — `Card.requiresOnline`, `wallet.onCardKeyStateChanged` and
`wallet.onTokenStatusChanged` (§8.1). An expired card is never refreshed: the customer adds it
again.

#### Table D — Veyra payment gateway, non-payment calls (merchant: registration and QR codes)

Merchant API only. Status is `FAILED` for every row; no `responseCode`.

| Call | Reasons | What your app does |
|---|---|---|
| Merchant registration (`merchant.register`) | `MERCHANT_TYPE_REQUIRED`, `MERCHANT_NAME_REQUIRED`, `EMAIL_ADDRESS_REQUIRED`, `PHONE_NUMBER_REQUIRED`, `ACCOUNT_NUMBER_REQUIRED`, `ADDRESS_LINE_1_REQUIRED`, `CITY_REQUIRED`, `BANK_INSTITUTION_CODE_REQUIRED`, `PAYMENT_APP_PROVIDER_ID_REQUIRED`, `CAC_NUMBER_REQUIRED` | ask for the missing field |
| Merchant update / status / activate / deactivate (`merchant.update`, `refreshStatus`, `activate`, `deactivate`) | `MERCHANT_ID_REQUIRED`, `MERCHANT_NOT_FOUND`, `INVALID_REQUEST` (the change is not allowed from the current state) | fix the request / check the merchant's state |
| QR payment code creation (`merchant.createPaymentContext`) | `AMOUNT_REQUIRED`, `MERCHANT_NOT_FOUND`, `INVALID_REQUEST`, `DUPLICATE_MERCHANT_ORDER_ID` (includes the original payment) | fix the request; a new order ID for a duplicate |

#### Generic fallbacks (any Veyra service, any call)

`INVALID_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR` and `AUTHENTICATION_FAILURE`, with status
`FAILED`, are used when nothing more specific applies. Show the message.

#### Add a card — the issuer's reasons

`wallet.digitise` and `wallet.verifyAccount` carry the issuer's decision and the call's status
separately. Keep them apart:

| What you read | Values | What it tells you |
|---|---|---|
| `responseCode` | `'APPROVED'` / `'APPROVE_REQUIRE_AUTH'` / `'DECLINED'` (anything else ⇒ the token is **discarded**) | The **issuer's decision** about this account and device |
| `responseStatus` | one of the five statuses | What the **call** did. `DECLINED` = it ran and the answer is no; `FAILED` / `NOT_SENT` = nothing was decided about the account |
| `responseStatusReason` | the cause — `'ACCOUNT_NAME_MISMATCH'`, `'ACCOUNT_BLOCKED'`, `'INVALID_ACCOUNT_NUMBER'`, … | **Why** — the field to branch on |
| `message` | free text | The same cause, worded for a human. Display it; never match on it |

The issuer states a cause for every non-approval. The tables below are the causes it states today.
**Keep a default branch**: a cause added after your build reaches you unchanged.

**Identity did not match — these ask for step-up rather than refusing** (`APPROVE_REQUIRE_AUTH`,
so run the activation flow with the returned `activationMethods`):

| Cause | The `message` you receive |
|---|---|
| `ACCOUNT_NAME_MISMATCH` | "Account name does not match; step-up authentication required" — on the earlier availability check it is the plain "Account name does not match" |
| `BVN_MISMATCH` | "BVN does not match; step-up authentication required" |
| `ACCOUNT_NOT_LINKED_TO_BVN` | "Account is not linked to the supplied BVN; step-up authentication required" |
| `ACCOUNT_ADDRESS_MISMATCH` | "Account address does not match; step-up authentication required" |

A mismatch usually means the details your app sent do not match the bank's record. The account
holder name, address and BVN you pass are compared with the bank's records, so check what you
collected before telling the customer their bank has a problem.

**The account cannot be tokenised** (`DECLINED` — the flow ends):

| Cause | The `message` you receive |
|---|---|
| `ACCOUNT_TYPE_NOT_ALLOWED` | "Account type is not permitted for token digitisation" |
| `JOINT_ACCOUNT_NOT_ALLOWED` | "Joint accounts are not permitted for token digitisation" |
| `ACCOUNT_INACTIVE` | "Account is not active" |
| `ACCOUNT_BLOCKED` | "Account is blocked" |
| `ACCOUNT_CLOSED` | "Account is closed" |
| `ACCOUNT_DND` | "Account has a Do Not Digitise flag" |
| `ACCOUNT_DNC` | "Account has a Do Not Contact flag" |
| `UNKNOWN_ACCOUNT` | "Unable to retrieve account details" |

**This device, wallet or product is not permitted** (`DECLINED` — retrying the same way cannot help):

| Cause | The `message` you receive |
|---|---|
| `DEVICE_NOT_ALLOWED` | "Device type is not permitted" |
| `DEVICE_REGION_NOT_ALLOWED` | "Device region is not permitted" |
| `WALLET_NOT_ALLOWED` | "Wallet is not permitted" |
| `TOKEN_REQUESTOR_NOT_ALLOWED` | "Token requestor is not permitted" |
| `STORAGE_TECH_NOT_ALLOWED` | "Storage technology is not permitted" |
| `ACCOUNT_SOURCE_NOT_ALLOWED` | "Account number source is not permitted" |
| `PAYMENT_APPLICATION_NOT_ALLOWED` | "Payment application is not permitted" |
| `TOKEN_TYPE_NOT_ALLOWED` | "Token type is not permitted" |
| `CUSTOMER_ID_NOT_ALLOWED` | "Customer identifier is not permitted" |
| `MAX_ACTIVE_TOKENS_EXCEEDED` | "Maximum number of active tokens has been exceeded" — the customer must remove a card before adding another |
| `NO_VALID_ACTIVATION_METHOD` | "No valid activation method is available" — the issuer has no way to reach this customer for step-up |

**Risk refused it** (`DECLINED`):

| Cause | The `message` you receive |
|---|---|
| `RISK_SCORE_BELOW_THRESHOLD` | "Risk score exceeds the configured threshold" |
| `WALLET_PROVIDER_DEVICE_SCORE_TOO_LOW` | "Wallet provider device score is too low" |
| `WALLET_PROVIDER_ACCOUNT_SCORE_TOO_LOW` | "Wallet provider account score is too low" |
| `WALLET_PROVIDER_ACCOUNT_NOT_RECOGNISED` | "Wallet provider account could not be recognised" |

The last three are scored partly from what **your app** supplies — the device and account trust
scores, the recommendation and its reasons, and the wallet account identifier (pass the account's
registered email or phone, never an internal id: the issuer hashes it and compares it with its own
record, so a value the bank does not hold matches nothing and costs the digitisation its identity
signal).

Anything else — including a cause added after your build — arrives as "Account is not eligible for
tokenisation" / "Account is not available for tokenisation". Show the message; never assume a
specific cause from a `DECLINED` alone.

### 9.3 Where the codes come from

Payment outcomes travel unchanged from the bank, through the issuer's gateway, the switch and the
Veyra payment gateway, to the SDK:

```
bank → issuer's gateway → switch → Veyra payment gateway → SDK → your app
```

No hop re-interprets them, so the code your app sees is the code the bank gave. The SDK only
produces an outcome itself when it got no answer, or never sent the request (Table A).

## 10. Platform availability at a glance

| Capability | Android | iOS |
|---|---|---|
| Wallet tap-to-pay (HCE) | ✅ | ❌ (Apple policy — pay by QR) |
| …with the app process not initialised (killed / phone restarted) | answered "application not found" until the app initialises with the customer | — |
| Tap acceptance | ✅ | ✅ (NFC-capable iPhones) |
| Scan-to-pay / Show-QR / history / receipts | ✅ | ✅ |
| Merchant registration + QR rails | ✅ | ✅ |
| Receipt QR | PNG (`qrCodeBase64`) | payload (`qrPayload`) |
| `appleTeamId` | — | required |
| `merchantOrderId` (required) on `chargeCustomerQr` | ✅ | ✅ |
| `merchantOrderId` (required) on `tap.start` | ✅ | ✅ |
| `merchantOrderId` (required) on `createPaymentContext` | ✅ | ✅ |
| Pending-outcome polling (backoff, 30-day stop) | ✅ | ✅ |
| …but its lifetime | runs in the background via WorkManager | **app-scoped only** — no OS background execution |

**What "app-scoped" means on iOS.** The pending-outcome sweep starts when the SDK is
configured and keeps running across every in-app navigation, whatever screen is up. But iOS
suspends timers when the OS suspends the app, so the sweep pauses when the app is
backgrounded and resumes when it returns to the foreground; Android's WorkManager sweep is
not so bound. This costs *time*, never an answer — every result is written to the store, so
a row that resolves while the app is away is simply resolved the next time you read it, and
the 30-day window is measured from the transaction date rather than from time spent polling.

## 11. Troubleshooting

- **`SESSION_REQUIRED` on a payment call** — the screen calling tap APIs must mount its
  session hook and be focused. Check you pass `useIsFocused()` (not `true`).
- **Android build can't resolve `co.veyra:*`** — repository credentials missing; see §2.
- **iOS `pod install` fails downloading the framework** — `~/.netrc` missing or not
  `chmod 600`.
- **iOS build fails in the `fmt` pod with "call to consteval function … is not a constant
  expression"** — not a Veyra failure: React Native 0.80–0.82 vendor {fmt} 11.0.2, whose
  compile-time format-string checking the clang in Xcode 26 rejects (fixed upstream in fmt
  11.1, which React Native picks up in 0.83). Either build with an earlier Xcode, move to
  React Native 0.83+, or copy the `post_install` patch this sample carries in `ios/Podfile`.
- **Device reads as "card not supported" at a terminal while your app is closed** —
  expected: any NFC phone answers at protocol level; nothing is charged and no data is
  read. Only your armed pay screen presents an actual card.
- **Tap works on first launch, then stops after reload** — call `Veyra.initialize`
  (with the signed-in `customerId`) again on app start (this sample's `src/session.tsx`
  pattern); the SDK re-attaches to the recreated native screen.
- **Every call rejects with `NOT_SIGNED_IN`** — `Veyra.signOut()` was called, or your
  app never initialised this launch. Initialise with the signed-in customer (§4.1).
- **Android: terminal says "application not found" while the app is closed** — the app
  process has not initialised since it was killed or the phone restarted. Open the app;
  once it initialises with the customer, taps are answered again.
