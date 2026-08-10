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
- **iOS:** add `NFCReaderUsageDescription`, the ISO7816 select-identifier
  `A000000891010104` (see `ios/VeyraBank/Info.plist`), and enable the **Near Field
  Communication Tag Reading** capability on your target. Camera usage description for
  QR scanning.

## 3. Run this sample app on your phone

Everything below assumes a **physical** device — NFC and device attestation don't work
on emulators or simulators.

**Once, for both platforms** (from the repository root):

```bash
npm install
cp veyra.config.example.ts veyra.config.ts
# edit veyra.config.ts — your OAuth client id/secret, payment app provider id,
# token requestor id (and your Apple Team ID for iOS)
```

`veyra.config.ts` is gitignored — real credentials never get committed.

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
session model (§5) working.

## 4. Initialise

```ts
import Veyra from 'veyra-sdk-react-native';

await Veyra.initialize({
  softpos: { environment: 'TEST', clientId, clientSecret },
  wallet: {
    environment: 'TEST',
    clientId, clientSecret,
    paymentAppProviderId, tokenRequestorId,
    allowedCountryCodes: ['0566'],
    recommendationStandardVersion: '1.0',  // Android (fixed on iOS)
    appleTeamId: 'YOURTEAMID',             // iOS
  },
});
```

Call it once at app start (this sample does it in `App.tsx` before rendering
navigation). It is idempotent and safe across native Activity recreation — the SDK
re-attaches itself. All SDK failures reject with a typed `VeyraError` (§9).

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
| `pause/resume/stopActivationObserver(ref)` | the timeout clock keeps running while paused |

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
3. `!isActive` — blocked server-side; `status` says why on both platforms (`SUSPENDED`:
   "contact your bank" · `PENDING_ACTIVATION`: "activate this card" · `EXPIRED`: "re-add the card").
4. Otherwise payable.

`wallet.setActiveCard(card.id)` selects the card; on Android it also arms tap-to-pay
(pay session required). `wallet.deactivateCard(ref)` removes it.

### 6.4 Paying

| Rail | Methods | Platforms |
|---|---|---|
| Tap-to-pay | arm via `setActiveCard`; outcomes on `wallet.onTapEvent` (`transactionStarted` / `transactionCompleted` / `activationFailed`) | **Android only** |
| Scan-to-pay | `inspectScannedQr(payload)` → verified handle → `authenticateForPayment(…)` → `payScannedContext(handle)` | both |
| Show-QR-to-pay | `authenticateForPayment(…)` → `showQrToPay(amountMinorUnits)`; expiry on `onQrExpired`; `cancelQrExpiry()` on teardown | both |

Authentication is **fresh and single-use** per payment or QR render — call
`authenticateForPayment` immediately before. A scanned QR that fails verification
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
payer they were refused when they were not. Anything not `'APPROVED'` / `'DECLINED'` /
`'FAILED'` — including an absent status — is pending.

### 6.5 History & receipts

`getTransactions(ref, limit?)` (call `reconcilePendingTransactions()` first to settle
PENDING rows), `processReceipt(qrPayload, expectedHash?)` to verify-and-store a scanned
merchant receipt, `getReceipts(limit?)`, `getReceiptForTransaction(hash)`.
`entryMethod` is `'TAP' | 'QR_GENERATED' | 'QR_SCANNED'`.

## 7. Merchant (Get paid) API

### 7.1 Registration & profile

`merchant.register({ merchantType: 'PERSONAL' | 'BUSINESS', … })` (BVN for personal,
CAC number for business), `getSettlementBanks()`, `isRegistered()`, `getStored()`,
`refreshStatus()`, `activate()` / `deactivate()`, `update(…)`, `clearStored()` (local
only). Gate acceptance on the stored merchant's status being `ACTIVE`.

### 7.2 Tap acceptance

```ts
const { sessionId } = await merchant.tap.start({ amountMinorUnits });
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

`result.responseCode`: `'00'` approved · `'05'` declined · `'06'` failed before the
issuer (incl. cancellation) · `'99'` pending — do **not** re-charge · `'91'` issuer
unavailable · `'96'` ambiguous — check history before retrying.

**Show a terminal outcome on a screen, not in an alert.** `result` is where the payment
ends for the merchant standing at the counter: they need the amount, the response and the
reference to stay on screen — an alert that can be dismissed by a stray tap is not enough.
This sample sends every rail (tap, both QR rails, and the wallet's scan-to-pay) to one
`PaymentResult` screen, which also decides when a receipt may be offered:

| Outcome | Receipt? | Why |
|---|---|---|
| Approved (`'00'`) | yes | recorded and final |
| Declined (`'05'`/`'06'`/other) | yes | the gateway recorded the attempt |
| Pending (`'99'`) | **no** | not final — the status can still change |
| Never reached the gateway | **no** | nothing was recorded to print |

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
  currency?)` → render `mpmPayload`; poll `contextStatus(txRef)`
  (`PENDING → IN_FLIGHT → APPROVED/DECLINED/EXPIRED`); `cancelQrExpiry()` on teardown;
  expiry event on `merchant.onQrExpired`.
- **Charge a customer QR (consumer-presented):** `inspectCustomerQr(payload)` →
  `{ handle, maskedCard, amountMinorUnits }` → confirm on screen →
  `chargeCustomerQr(handle, reference?)`.

### 7.4 Transactions & receipts

`getTransactions(limit?)`, `getTransaction(reference)`, `getReceipt(reference)` — the
receipt carries `qrCodeBase64` (Android, ready-made PNG) **or** `qrPayload` (iOS,
render it yourself); display whichever is non-null (see
`MerchantTransactionsScreen.tsx`).

A `MerchantTransaction` also carries `cardholderName` — the paying card's name as it
presented it (EMV tag `5F20`); on a Veyra token that is the card's display name, e.g.
`AFRIGO ****1234`, not a person's name. It is `null` on QR-MPM payments (the merchant
never reads the card) and on transactions recorded by older SDK versions.

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
execution; it suspends and resumes with the app; iOS also has no tap rail.) Keep the
stored-row read anyway: the event does not replay, so a screen opened after the answer
landed learns it from `merchant.getTransaction(ref)`, as the sample does.

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

## 8. Events

One `NativeEventEmitter` channel per family; subscribe via the typed helpers and
`remove()` the subscription on unmount:

| Helper | Events |
|---|---|
| `wallet.onActivationEvent` | `activated` / `timeout` / `error` |
| `wallet.onTapEvent` | `transactionStarted` / `transactionCompleted` / `activationFailed` (Android tap rail), plus the `requireOnline` / `amountExceedCardLimit` refusals, which also fire from the QR rails on iOS |
| `merchant.tap.onEvent` | `cardDetected` / `cardContactLost` / `unsupportedCard` / progress / `ended` / `result` |
| `wallet.onQrExpired` / `merchant.onQrExpired` | one `expired` per rendered QR |
| `merchant.onTransactionResolved` | one settlement per pending sale — `APPROVED` / `DECLINED` / `FAILED`, never `PENDING` (see §10) |
| `merchant.onCreditConfirmation` | one terminal credit confirmation per sale — `RECEIVED`, or the final 30-day `UNABLE_TO_CONFIRM` (see §7.5) |

## 9. Errors

Every rejection is a `VeyraError` with a stable `code` — never string-match messages:

> **Read `response_status`, not the code (STORY-98 / ISSUE-140).** Every payment outcome now carries a
> triple: `response_code` (what the wire said), `response_status` (**what to do**) and
> `response_status_reason` (why). Branch on `response_status` only — `APPROVED`, `DECLINED`, `FAILED`
> or `PENDING`. Only the first three are final; `PENDING` always means "ask again". The SDK no longer
> derives a status from the code, and neither should your app: a code you do not recognise is not a
> decline. `"99"` is retired — an unheard outcome is now `68` (no reply), `06` (the hop we called
> failed) or `96` (the SDK/service itself threw), all `PENDING`, while `91` (never connected) and
> `25` (no such transaction) are `FAILED`, meaning nothing happened and a retry is safe.


| Code | Meaning / action |
|---|---|
| `NOT_CONFIGURED` | call `Veyra.initialize` first |
| `SESSION_REQUIRED` | mount `usePaySession` / `useGetPaidSession` on the payment screen |
| `MODE_REFUSED` | the other experience's payment is mid-flight; retry after it completes |
| `ONLINE_REQUIRED` | card needs the device online; grey it out, SDK self-heals |
| `TOKEN_NOT_ACTIVE` | card blocked server-side |
| `CDCVM_REQUIRED` | call `authenticateForPayment` first |
| `AUTH_CANCELLED` / `AUTH_FAILED` | user backed out / failed device auth |
| `NO_ACTIVE_CARD` / `CARD_CANNOT_SHOW_QR` | select a payable card / re-add a pre-QR card |
| `UNSUPPORTED_ON_PLATFORM` | e.g. wallet tap-to-pay on iOS |
| `VALIDATION` (`field`) | fix the named parameter |
| `MISSING_MANDATORY_CONFIG` / `REQUEST_FAILED` / `UNKNOWN` | configuration / backend / other |

## 10. Platform availability at a glance

| Capability | Android | iOS |
|---|---|---|
| Wallet tap-to-pay (HCE) | ✅ | ❌ (Apple policy — pay by QR) |
| Tap acceptance | ✅ | ✅ (NFC-capable iPhones) |
| Scan-to-pay / Show-QR / history / receipts | ✅ | ✅ |
| Merchant registration + QR rails | ✅ | ✅ |
| Receipt QR | PNG (`qrCodeBase64`) | payload (`qrPayload`) |
| `appleTeamId` | — | required |

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
  again on app start (this sample's `App.tsx` pattern); the SDK re-attaches to the
  recreated native screen.

### Holding a `PENDING` payment, and being told when it settles

Because the SDK no longer invents terminal outcomes, a tap that gets no answer hands you
`responseStatus == PENDING`. **That is not a failure and not a decline** — the payment may well have
completed, so the one thing you must not do is charge again.

What the app should do:

1. **Stay on the confirmation screen** and show "processing". Do not navigate away and do not print a
   receipt yet.
2. **Let the SDK resolve it.** It stores the transaction and polls with backoff; you do not have to.
3. **Finish when it settles** — either from `onTransactionResolved` (below) or by reading the row with
   `getTransaction(reference)` / `getLastTransactions()`.

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

`sdkErrorCode` is set when nothing was ever attempted — request validation, cancellation, merchant not
ready, a mode/arming refusal — or when the SDK itself failed. The bridge opts into the typed shape for
you, so in that case `responseCode` is **null** and there is **no** status, deliberately: a response code asserts that a payment was
attempted and something answered or failed to, so a fabricated one would invite you to retry something
that never left the device (and put a made-up code on a receipt). Fix the input and re-initiate.

