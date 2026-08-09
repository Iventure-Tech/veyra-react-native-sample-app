import type {
  CustomerQrChargeOutcome,
  MerchantTapResult,
  PaymentContextStatus,
  PaymentOutcome,
} from 'veyra-sdk-react-native';

/**
 * Every terminal payment outcome — tap, merchant QR, customer QR, wallet scan-to-pay —
 * lands on one result screen, the way the native samples put every rail on their single
 * result page. The mapping lives here rather than in the screens so each rail's outcome is
 * turned into the same shape in one place (and can be unit-tested without a renderer).
 */
export type PaymentResultOutcome = 'approved' | 'declined' | 'pending';

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

/** Drops nulls/empties so the screen never renders a dangling label. */
function lines(...candidates: Array<string | null | undefined>): string[] {
  return candidates.filter((l): l is string => !!l);
}

/**
 * A contactless tap. Mirrors the native `handlePaymentResponse` split: `00` approved,
 * `99` pending (no receipt — the status can still change), everything else declined.
 * `status` is preferred when present; `responseCode` is the fallback, since one is
 * normalised from the other across platforms.
 */
export function tapResultToParams(
  result: MerchantTapResult,
  amountMinorUnits: number
): PaymentResultParams {
  const code = result.responseCode;
  const approved = result.status === 'APPROVED' || code === '00';
  const pending = !approved && (result.status === 'PENDING' || code === '99');
  const reference = result.merchantTransactionReference ?? undefined;

  if (approved) {
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
  }

  if (pending) {
    return {
      outcome: 'pending',
      title: 'Payment Pending',
      message: result.message ?? PENDING_MESSAGE,
      amountMinorUnits,
      details: lines(PENDING_MESSAGE, reference && `Reference: ${reference}`),
      // No receipt: the transaction is not final, so there is nothing to print yet.
    };
  }

  return {
    outcome: 'declined',
    title: 'Payment Failed',
    message: result.message ?? 'Transaction failed',
    amountMinorUnits,
    details: lines(code && `Response: ${code}`, reference && `Reference: ${reference}`),
    receiptFor: reference,
  };
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

/**
 * A scanned customer QR that reached the gateway. Approved *and* declined are both
 * recorded, so both offer the receipt; only a transport failure has none
 * ({@link cpmChargeFailureToParams}).
 */
export function cpmChargeToParams(
  outcome: CustomerQrChargeOutcome,
  amountMinorUnits: number
): PaymentResultParams {
  const reference = outcome.merchantTransactionReference ?? undefined;
  return {
    outcome: outcome.approved ? 'approved' : 'declined',
    title: outcome.approved ? 'Payment Successful' : 'Declined',
    message: `Customer QR payment · ${outcome.responseCode ?? '-'}`,
    amountMinorUnits,
    details: lines(
      outcome.transactionId && `Transaction: ${outcome.transactionId}`,
      reference && `Reference: ${reference}`
    ),
    receiptFor: reference,
    creditConfirmation:
      outcome.approved && outcome.isCreditConfirmationSupported === true && reference
        ? {
            reference,
            creditTransactionId: outcome.creditTransactionId,
            supported: true,
          }
        : undefined,
  };
}

/** The charge never reached a decision (network/transport) — nothing recorded, no receipt. */
export function cpmChargeFailureToParams(
  message: string,
  amountMinorUnits: number
): PaymentResultParams {
  return {
    outcome: 'declined',
    title: 'Declined',
    message: message || 'Payment failed',
    amountMinorUnits,
  };
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
  return {
    outcome: outcome.approved ? 'approved' : 'declined',
    title: outcome.approved ? 'Payment Successful' : 'Declined',
    message: outcome.message ?? (outcome.approved ? 'Paid' : 'Not paid'),
    amountMinorUnits,
    details: lines(
      outcome.merchantName,
      outcome.merchantLocation,
      `Response: ${outcome.responseCode ?? '-'}`
    ),
  };
}

/** The payer's payment failed before an outcome existed (declined by the SDK, network…). */
export function walletPaymentFailureToParams(
  message: string,
  amountMinorUnits: number
): PaymentResultParams {
  return {
    outcome: 'declined',
    title: 'Declined',
    message: message || 'Payment failed',
    amountMinorUnits,
  };
}
