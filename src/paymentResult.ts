import type {
  CustomerQrChargeOutcome,
  MerchantTapResult,
  OriginalPayment,
  PaymentContextStatus,
  PaymentOutcome,
} from 'veyra-sdk-react-native';

/**
 * Every terminal payment outcome — tap, merchant QR, customer QR, wallet scan-to-pay —
 * lands on one result screen, the way the native samples put every rail on their single
 * result page. The mapping lives here rather than in the screens so each rail's outcome is
 * turned into the same shape in one place (and can be unit-tested without a renderer).
 */
export type PaymentResultOutcome = 'approved' | 'declined' | 'pending' | 'not_sent';

export interface PaymentResultParams {
  outcome: PaymentResultOutcome;
  /** Headline under the icon, e.g. "Payment Successful". */
  title: string;
  /** One-line explanation — the SDK's message, or what the rail did. */
  message: string;
  amountMinorUnits: number;
  /** Extra lines shown small under the amount (reference, scheme, response code…). */
  details?: string[];
  /**
   * Merchant transaction reference whose receipt can be shown. Absent when nothing was
   * recorded (a transport failure) or when the outcome is not final yet — there is no
   * receipt to fetch in either case.
   */
  receiptFor?: string;
  /**
   * Merchant transaction reference of a sale that is **not final yet**. The result screen
   * subscribes to `merchant.onTransactionResolved` for it (and reads the stored row on mount,
   * for the answer that landed before the screen opened) and shows the settled outcome in
   * place, so the merchant is not left staring at "Pending" until they navigate away.
   */
  resolvesFor?: string;
  /**
   * Present when an approved sale may be waiting on beneficiary credit confirmation — the
   * result screen then shows "Confirming credit with merchant bank…" and flips it when the
   * SDK's `merchant.onCreditConfirmation` event (fired from its background poll) reports the
   * funds landed. `supported: true` means the outcome itself carried the flag (tap, customer
   * QR) — wait immediately. `supported: null` means the rail's settle cannot carry it (a
   * merchant-presented QR: the contexts endpoint has no credit fields, the SDK learns them
   * from the transaction-status rail moments later) — the screen watches the SDK's stored row
   * and starts waiting once the flag turns up true.
   */
  creditConfirmation?: {
    reference: string;
    creditTransactionId: string | null;
    supported: boolean | null;
  };
}

/**
 * How long a terminal result is HELD before the screen returns Home by itself — approved,
 * declined and failed alike. Done returns immediately, at any point during the hold. 60s, the
 * same as the native samples: long enough to read the outcome out to the customer.
 *
 * The one exception lives in the result screen, not here: a sale waiting on the merchant bank's
 * credit confirmation cancels the hold entirely (the screen must not vanish mid-wait) and starts
 * a fresh one once the confirmation is on screen.
 */
export const AUTO_RETURN_MS = 60000;

const PENDING_MESSAGE =
  'Status unknown. The issuer may have approved. Check transactions for updates.';

const NOT_SENT_DETAIL = 'Nothing was charged. Fix the reason and try again with the same order.';

/** The refusal reason for an order id already on another payment. */
export const DUPLICATE_MERCHANT_ORDER_ID = 'DUPLICATE_MERCHANT_ORDER_ID';

/**
 * What to tell the merchant when the order id is already on another payment, from that
 * payment's status (`originalPayment`). Never "try again": the order is paid, or a payment for
 * it is still being confirmed.
 */
export function duplicateOrderMessage(original: OriginalPayment | null | undefined): string {
  return original?.responseStatus === 'PENDING'
    ? 'A payment for this order is still being confirmed - do not take another payment'
    : 'This order is already paid - do not take another payment';
}

/** The reason in brackets after a message, when there is one. */
function withReason(message: string, reason: string | null | undefined): string {
  return reason ? `${message} (${reason})` : message;
}

/** Drops nulls/empties so the screen never renders a dangling label. */
function lines(...candidates: Array<string | null | undefined>): string[] {
  return candidates.filter((l): l is string => !!l);
}

/**
 * A contactless tap. Branch on the status the SDK states, never on the response code:
 * `APPROVED`, `DECLINED`, `FAILED`, `PENDING` (may have been charged — the SDK resolves it)
 * and `NOT_SENT` (never reached the gateway — retry with the same order id).
 */
export function tapResultToParams(
  result: MerchantTapResult,
  amountMinorUnits: number
): PaymentResultParams {
  const code = result.responseCode;
  const reason = result.responseStatusReason;
  const reference = result.merchantTransactionReference ?? undefined;

  switch (result.responseStatus) {
    case 'APPROVED':
      return {
        outcome: 'approved',
        title: 'Payment Successful',
        message: result.message ?? 'Transaction approved',
        amountMinorUnits,
        details: lines(
          result.cardScheme && `Card: ${result.cardScheme}`,
          result.maskedTokenLast4 && `Card number: ${result.maskedTokenLast4}`,
          reference && `Reference: ${reference}`
        ),
        receiptFor: reference,
        // The approval said the merchant's bank supports credit confirmation — the result
        // screen waits and flips from the onCreditConfirmation event.
        creditConfirmation:
          result.isCreditConfirmationSupported === true && reference
            ? {
                reference,
                creditTransactionId: result.creditTransactionId,
                supported: true,
              }
            : undefined,
      };
    case 'NOT_SENT':
      // Never reached the gateway: nothing was charged or recorded, so no receipt.
      return {
        outcome: 'not_sent',
        title: 'Payment Not Sent',
        message: withReason(result.message ?? 'The payment was not sent', reason),
        amountMinorUnits,
        details: [NOT_SENT_DETAIL],
      };
    case 'DECLINED':
      return {
        outcome: 'declined',
        title: 'Payment Declined',
        message: withReason(result.message ?? 'Transaction declined', reason),
        amountMinorUnits,
        details: lines(code && `Response: ${code}`, reference && `Reference: ${reference}`),
        receiptFor: reference,
      };
    case 'FAILED':
      if (reason === DUPLICATE_MERCHANT_ORDER_ID) {
        return {
          outcome: 'declined',
          title: 'Order Already Used',
          message: duplicateOrderMessage(result.originalPayment),
          amountMinorUnits,
          details: lines(code && `Response: ${code}`),
        };
      }
      return {
        outcome: 'declined',
        title: 'Payment Failed',
        message: withReason(result.message ?? 'Transaction not completed', reason),
        amountMinorUnits,
        details: lines(code && `Response: ${code}`, reference && `Reference: ${reference}`),
        receiptFor: reference,
      };
    default:
      // PENDING, or a status newer than this app: unresolved, never a failure. No receipt —
      // the SDK keeps polling and pushes the settlement; the screen watches this reference.
      return {
        outcome: 'pending',
        title: 'Payment Pending',
        message: result.message ?? PENDING_MESSAGE,
        amountMinorUnits,
        details: lines(PENDING_MESSAGE, reference && `Reference: ${reference}`),
        resolvesFor: reference,
      };
  }
}

/**
 * A merchant-presented QR the customer pushed to. Only called once the context has
 * settled — an expired code is not a result, it stays on the QR screen with a renewal
 * action, exactly as the native samples leave it.
 */
export function contextSettlementToParams(
  status: PaymentContextStatus,
  amountMinorUnits: number
): PaymentResultParams {
  return {
    outcome: status.isApproved ? 'approved' : 'declined',
    title: status.isApproved ? 'Payment Successful' : 'Declined',
    message: 'Customer paid by QR',
    amountMinorUnits,
    details: lines(`Ref: ${status.txRef}`, `Response: ${status.responseCode ?? '-'}`),
    receiptFor: status.isApproved ? status.txRef : undefined,
    // The context settle carries no credit fields — `supported: null` makes the result
    // screen watch the SDK's stored row (which learns them from the transaction-status
    // rail moments after the settle) and wait once the flag turns up true.
    creditConfirmation: status.isApproved
      ? { reference: status.txRef, creditTransactionId: null, supported: null }
      : undefined,
  };
}

/** Where a merchant QR or customer QR ended without a payment, as a result screen. */
export function notSentToParams(
  message: string | null,
  reason: string | null,
  amountMinorUnits: number
): PaymentResultParams {
  return {
    outcome: 'not_sent',
    title: 'Payment Not Sent',
    message: withReason(message ?? 'The payment was not sent', reason),
    amountMinorUnits,
    details: [NOT_SENT_DETAIL],
  };
}

/**
 * A customer QR charge, by its stated status. Approved, declined and failed reached the
 * gateway and are recorded, so they offer the receipt; `PENDING` is still being resolved and
 * `NOT_SENT` never left the phone, so neither has one yet.
 */
export function cpmChargeToParams(
  outcome: CustomerQrChargeOutcome,
  amountMinorUnits: number
): PaymentResultParams {
  const reference = outcome.merchantTransactionReference ?? undefined;
  const reason = outcome.responseStatusReason;
  const details = lines(
    outcome.transactionId && `Transaction: ${outcome.transactionId}`,
    reference && `Reference: ${reference}`
  );
  switch (outcome.responseStatus) {
    case 'APPROVED':
      return {
        outcome: 'approved',
        title: 'Payment Successful',
        message: `Customer QR payment · ${outcome.responseCode ?? '-'}`,
        amountMinorUnits,
        details,
        receiptFor: reference,
        creditConfirmation:
          outcome.isCreditConfirmationSupported === true && reference
            ? {
                reference,
                creditTransactionId: outcome.creditTransactionId,
                supported: true,
              }
            : undefined,
      };
    case 'NOT_SENT':
      return notSentToParams(outcome.message, reason, amountMinorUnits);
    case 'DECLINED':
    case 'FAILED':
      if (reason === DUPLICATE_MERCHANT_ORDER_ID) {
        return {
          outcome: 'declined',
          title: 'Order Already Used',
          message: duplicateOrderMessage(outcome.originalPayment),
          amountMinorUnits,
        };
      }
      // A customer QR that reached the gateway is spent: a new attempt is a new scan.
      return {
        outcome: 'declined',
        title: outcome.responseStatus === 'DECLINED' ? 'Declined' : 'Payment Failed',
        message: withReason(`Customer QR payment · ${outcome.responseCode ?? '-'}`, reason),
        amountMinorUnits,
        details,
        receiptFor: reference,
      };
    default:
      return {
        outcome: 'pending',
        title: 'Payment Pending',
        message: PENDING_MESSAGE,
        amountMinorUnits,
        details,
        resolvesFor: reference,
      };
  }
}

/**
 * The payer side of scan-to-pay. No `receiptFor`: that button fetches the *merchant's*
 * receipt, which a wallet cannot request — the payer's copy lives under Receipts.
 * The gateway's merchant name/location outrank the ones printed in the scanned QR, so
 * they are what the result shows.
 */
export function walletPaymentToParams(
  outcome: PaymentOutcome,
  amountMinorUnits: number
): PaymentResultParams {
  // The push answers with a status, and PENDING is a real answer — the payer must not be told
  // they were refused when the SDK has stored the payment as unresolved and is still polling
  // for it. Anything not stated final is pending, exactly as the SDK records it.
  const stated = outcome.responseStatus?.trim().toUpperCase();
  if (stated === 'NOT_SENT') {
    // Never reached Veyra: nothing was paid. A card this phone cannot pay with gets the
    // add-it-again advice; anything else says why and lets the payer try again.
    if (outcome.responseStatusReason === 'DEVICE_NOT_BOUND') {
      return {
        outcome: 'not_sent',
        title: DEVICE_NOT_BOUND_TITLE,
        message: DEVICE_NOT_BOUND_MESSAGE,
        amountMinorUnits,
      };
    }
    return {
      outcome: 'not_sent',
      title: 'Payment Not Sent',
      message: withReason(outcome.message ?? 'The payment was not sent', outcome.responseStatusReason),
      amountMinorUnits,
      details: ['Nothing was paid. Fix the reason and try again.'],
    };
  }
  const state: PaymentResultOutcome =
    stated === 'APPROVED'
      ? 'approved'
      : stated === 'DECLINED' || stated === 'FAILED'
        ? 'declined'
        : 'pending';
  const title =
    state === 'approved' ? 'Payment Successful' : state === 'pending' ? 'Payment Pending' : 'Declined';
  return {
    outcome: state,
    title,
    message:
      outcome.message ??
      (state === 'approved' ? 'Paid' : state === 'pending' ? PENDING_MESSAGE : 'Not paid'),
    amountMinorUnits,
    details: lines(
      outcome.merchantName,
      outcome.merchantLocation,
      `Response: ${outcome.responseCode ?? '-'}`,
      state === 'pending' ? PENDING_MESSAGE : undefined
    ),
  };
}

/**
 * What the payer is told when the backend will not give a card payment keys on this phone (it
 * was added on another device, or before the app was reinstalled). One wording on every rail:
 * neither going online nor a smaller amount helps, so the advice is to add the card again.
 */
export const DEVICE_NOT_BOUND_TITLE = "This card can't pay on this phone";
export const DEVICE_NOT_BOUND_MESSAGE =
  'It was added on another device or before the app was reinstalled. Remove it and add it again on this phone.';
