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
- **Veyra onboarding credentials**: artifact-repository username/password, OAuth client
  id/secret, payment app provider id, token requestor id — plus your Apple Developer
  Team ID for iOS. The app talks to the Veyra TEST environment.
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

3. **Android** — add your artifact-repository credentials to
   `~/.gradle/gradle.properties`:

   ```properties
   veyraRepoUsername=your-repo-username
   veyraRepoPassword=your-repo-password
   ```

   ```bash
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

## Where things are

| Path | What it shows |
|---|---|
| `App.tsx` | SDK configuration & initialisation, navigation |
| `src/screens/GetPaidScreen.tsx` | The merchant flow — `useGetPaidSession` + all three acceptance rails |
| `src/screens/PayScreen.tsx` | The wallet flow — `usePaySession`, card states, tap arming |
| `src/screens/AddCardScreen.tsx` | Digitisation + activation |
| `src/screens/ScanToPayScreen.tsx` / `ShowToPayScreen.tsx` | The wallet QR rails |
| `src/screens/PaymentResultScreen.tsx` + `src/paymentResult.ts` | Where every rail's terminal outcome lands, and when a receipt may be offered |
| `DEVELOPER-GUIDE.md` | The full React Native developer guide |

Building **native**? See
[veyra-android-sample-app](https://github.com/Iventure-Tech/veyra-android-sample-app) and
[veyra-ios-sample-app](https://github.com/Iventure-Tech/veyra-ios-sample-app).
