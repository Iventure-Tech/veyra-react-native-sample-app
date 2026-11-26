import { softpos, wallet } from 'veyra-sdk-react-native';

/** Every line starts with this tag, so `adb logcat | grep VeyraEvents` (or the Metro log) finds them. */
export const PAYMENT_EVENT_TAG = 'VeyraEvents';

/**
 * App-scope payment events: the SDKs report a payment that left PENDING (and, once before that, one
 * that became ACCEPTED) and a credit confirmation, possibly long after the screen that started the
 * payment is gone, or for a payment from an earlier session. Subscribed once, where the app tells
 * the SDK who is logged in, so the listeners outlive every screen.
 *
 * Each event is logged as one line. The lines carry identifiers, status and amount only, never an
 * account number or a person's name.
 *
 * On React Native each subscription is its own listener: these sit beside the ones a screen adds
 * (the payment result screen subscribes to `softpos.observeTransactionResolved` and
 * `softpos.observeCreditConfirmation` for its own sale), and a sign-out or customer switch keeps
 * them. Returns the teardown, which removes only these three subscriptions.
 */
export function observePaymentEvents(): () => void {
  const subs = [
    // SoftPOS: a sale left PENDING (APPROVED / DECLINED / FAILED), or became ACCEPTED (not final).
    softpos.observeTransactionResolved((e) => {
      console.log(
        `${PAYMENT_EVENT_TAG} softpos transactionResolved reference=${e.merchantTransactionReference} ` +
          `status=${e.status} responseCode=${e.responseCode} reason=${e.reason}`
      );
    }),
    // Wallet: a payment left PENDING, or became ACCEPTED (not final). Wallet tap-to-pay is Android only.
    wallet.observeTransactionResolved((e) => {
      console.log(
        `${PAYMENT_EVENT_TAG} wallet transactionResolved transactionHash=${e.transactionHash} ` +
          `tokenUniqueReference=${e.tokenUniqueReference} status=${e.status} ` +
          `responseCode=${e.responseCode} reason=${e.reason} amountMinorUnits=${e.amountMinorUnits}`
      );
    }),
    // Wallet: the merchant's bank received the funds (RECEIVED), or 30 days passed (UNABLE_TO_CONFIRM).
    wallet.observeCreditConfirmation((e) => {
      console.log(
        `${PAYMENT_EVENT_TAG} wallet creditConfirmation transactionHash=${e.transactionHash} ` +
          `tokenUniqueReference=${e.tokenUniqueReference} creditTransactionId=${e.creditTransactionId} ` +
          `status=${e.status} amountMinorUnits=${e.amountMinorUnits} bankReference=${e.bankReference} ` +
          `creditedAt=${e.creditedAt}`
      );
    }),
  ];
  return () => subs.forEach((s) => s.remove());
}
