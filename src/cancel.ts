/**
 * What a screen does with the SDK's answer to a cancel — one rule for every Cancel button in this
 * app (card tap, customer-QR charge, payment-QR create, scan-to-pay, add card).
 *
 * A call can be cancelled only while its request is still on the device. The cancel's answer is
 * not the call's outcome: the call still delivers its own result (a cancelled one ends `NOT_SENT` /
 * `CANCELLED`). So a screen never shows "Cancelled" off the answer alone.
 */
import type { CancelResult, ResponseStatus } from 'veyra-sdk-react-native';

export type CancelAction =
  /**
   * `CANCELLED`: nothing was sent. The call now delivers `NOT_SENT` / `CANCELLED`, and the outcome
   * handler leaves the screen (the same reference can be used again).
   */
  | 'AWAIT_CANCELLED_OUTCOME'
  /**
   * The request has already left the device (or the call has just finished): the call carries on
   * and its normal result arrives. Stay and keep waiting; when the request has left
   * ({@link cancelRefusedTooLate}) say "This can no longer be cancelled".
   */
  | 'KEEP_WAITING'
  /** Nothing is in progress under that reference: nothing to wait for, just leave. */
  | 'LEAVE';

export function cancelAction(result: CancelResult): CancelAction {
  switch (result) {
    case 'CANCELLED':
      return 'AWAIT_CANCELLED_OUTCOME';
    case 'TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT':
    case 'TOO_LATE_TO_CANCEL_TASK_ALREADY_PROCESSED':
      return 'KEEP_WAITING';
    case 'NO_PAYMENT_IN_PROGRESS_FOR_ORDER_ID':
    case 'NO_DIGITISATION_IN_PROGRESS_FOR_CLIENT_REQUEST_ID':
      return 'LEAVE';
    default:
      // An answer this app does not know yet: keep waiting — the call still delivers its outcome.
      return 'KEEP_WAITING';
  }
}

/** Only a refused cancel whose request has left tells the user; a just-finished call shows its result. */
export function cancelRefusedTooLate(result: CancelResult): boolean {
  return result === 'TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT';
}

export const CANNOT_CANCEL_MESSAGE = 'This can no longer be cancelled';

/** A call the app cancelled ends `NOT_SENT` / `CANCELLED`: not a result — leave, show nothing. */
export function isCancelledOutcome(
  outcome: { responseStatus?: ResponseStatus | null; responseStatusReason?: string | null } | null | undefined
): boolean {
  return outcome?.responseStatus === 'NOT_SENT' && outcome?.responseStatusReason === 'CANCELLED';
}

/**
 * A fresh reference (a random UUID) for one add-card attempt. Pass it as the digitise's
 * `clientRequestId` so the attempt can be cancelled with `wallet.cancelDigitise(clientRequestId)`;
 * without one the SDK generates its own and the attempt cannot be cancelled.
 */
export function newClientRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : 8 + (r % 4)).toString(16);
  });
}
