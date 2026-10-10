# Veyra Bank — React Native sample app

A complete working integration of the **Veyra SDK for React Native**
([`veyra-sdk-react-native`](https://www.npmjs.com/package/veyra-sdk-react-native)), built
against the published package exactly the way a third-party app consumes it. One app
demonstrates both sides of a contactless payment:

- **Get paid (SoftPOS merchant):** registration & profile, NFC tap acceptance, get-paid
  QR (merchant-presented), charging a customer's payment QR (consumer-presented),
  transaction history and receipt QRs.
- **Pay (wallet customer):** add card (account tokenisation), token activation, Android
  NFC tap-to-pay, scan-to-pay, show-QR-to-pay, card states, transaction history.

> Tap-to-**pay** (card emulation) is not available on iOS — Apple restricts card
> emulation — so the iOS wallet pays by QR. Tap **acceptance** works on NFC-capable
> iPhones.

> **Never integrate the native Veyra AARs or XCFramework directly in a React Native
> app.** The native SDK arms and disarms the device's NFC payment modes by following
> native screen lifecycle, which a React Native app's JavaScript navigation does not
> exercise — the device could stay armed as a payment card after the user leaves your
> payment screen. The React Native SDK's **session hooks** (`usePaySession` /
> `useGetPaidSession`, used on this app's payment screens) bridge screen focus into the
> SDK's mode management; that is the supported integration.

The full **[Developer Guide](DEVELOPER-GUIDE.md)** — platform requirements, install
steps, the session/mode model, the complete public API reference and the response-code
catalogue — lives in this repository.

## Prerequisites

- Node 18+, a React Native environment (Android Studio / Xcode), and a **physical**
  NFC-capable device per platform — NFC and device attestation don't work on emulators.
- **Veyra onboarding credentials**: artifact-repository username/password, payment app
  provider id, token requestor id, whatever your
  [provider](#choose-a-provider) needs — plus your Apple Developer Team ID
  for iOS. The app talks to the Veyra TEST environment.
- The test account details from your onboarding pack.

## Run it (10 minutes)

1. Clone this repository and install:

   ```bash
   npm install
   ```

2. Copy the credential template and fill in your onboarding values:

   ```bash
   cp veyra.config.example.ts veyra.config.ts
   # edit veyra.config.ts
   ```

   The sample ships using the deprecated `VeyraClientSecretProvider`, **for testing only**, so it
   runs with just your `clientId` and `clientSecret`. To try the providers a real app ships, change
   the one line in `appProvider()` in `src/provider.ts` (see [Choose a provider](#choose-a-provider)).

3. **Android** — add your artifact-repository credentials to
   `~/.gradle/gradle.properties`:

   ```properties
   veyraRepoUsername=your-repo-username
   veyraRepoPassword=your-repo-password
   ```

   ```bash
   npm start
   npm run android
   ```

4. **iOS** — add the same credentials to `~/.netrc` (the framework downloads at
   `pod install`):

   ```
   machine repo.veyra.co
     login your-repo-username
     password your-repo-password
   ```

   ```bash
   chmod 600 ~/.netrc
   cd ios && pod install && cd ..
   npm run ios
   ```

   In Xcode, set your team on the VeyraBank target and enable the **Near Field
   Communication Tag Reading** capability (tap acceptance).

## Choose a provider

Both SDKs share one **provider** — how they reach Veyra. There is no mode to set: the SDK works
out the method from the kind of provider it is given. The sample picks one in code — `appProvider()`
in `src/provider.ts` returns it — and switching is returning a different one:

| `appProvider()` returns | Provider | What it needs (`VEYRA_PROVIDER`) | Your bank backend serves |
|---|---|---|---|
| `assertionProvider(…)` (recommended) | `VeyraAssertionProvider` | `clientId` (the only value the SDK receives), plus `bankBackendBaseUrl`, `bankClientId`, `bankClientSecret` for your bank's own client | `POST /oauth2/token` — an RFC 8693 token exchange of the user's session for the assertion → `{"access_token": "<JWT>"}` (401 when nobody is signed in) |
| `proxyProvider(…)` | `VeyraProxyProvider` | `bankBackendBaseUrl` | `POST /issuertokengateway/v1/proxy` for every method — your API gateway removes the `/issuertokengateway/v1` context and forwards the SDK's envelope to your issuer token gateway's `/proxy`, which calls Veyra and answers with Veyra's body |
| `clientSecretProvider(…)` (**deprecated**, what the sample ships with) | `VeyraClientSecretProvider` | `clientId`, `clientSecret` | nothing — the secret sits in the app, which is why this provider is being retired |

`bankSessionToken` is a **placeholder** for your app's own login session, sent to your bank
backend as a bearer token. The two providers that call your backend are in `src/provider.ts` —
short, and meant to be copied. The proxy provider is called from the SDK's background work too, not only
from screens. The full contract — the assertion's claims, the request envelope, and how a proxy
provider reports a failure — is in [§4.2 of the Developer Guide](DEVELOPER-GUIDE.md#42-connect-to-veyra--choosing-a-provider).

## Where things are

| Path | What it shows |
|---|---|
| `App.tsx` | Navigation; wraps the app in the session provider |
| `src/session.tsx` | The app's own login session — initialises the SDK with the signed-in customer on every launch; switch and sign out |
| `src/provider.ts` | How the SDKs reach Veyra: the one provider the app passes (`appProvider()`), and the two providers (`VeyraAssertionProvider`, `VeyraProxyProvider`) that call your bank backend |
| `src/screens/HomeScreen.tsx` | Customer bar (signed in as / Switch / Sign out / Sign in); payment entry points disabled while signed out |
| `src/screens/GetPaidScreen.tsx` | The merchant flow — `useGetPaidSession` + all three acceptance rails |
| `src/screens/PayScreen.tsx` | The wallet flow — `usePaySession`, card states, tap arming |
| `src/screens/AddCardScreen.tsx` | Digitisation + activation |
| `src/screens/ScanToPayScreen.tsx` / `ShowToPayScreen.tsx` | The wallet QR rails |
| `src/screens/PaymentResultScreen.tsx` + `src/paymentResult.ts` | Where every rail's terminal outcome lands, and when a receipt may be offered |
| `DEVELOPER-GUIDE.md` | The full React Native developer guide |

Building **native**? See
[veyra-android-sample-app](https://github.com/Iventure-Tech/veyra-android-sample-app) and
[veyra-ios-sample-app](https://github.com/Iventure-Tech/veyra-ios-sample-app).
