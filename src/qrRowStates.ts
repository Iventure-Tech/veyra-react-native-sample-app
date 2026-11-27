import type { MerchantTransaction, TransactionSummary } from 'veyra-sdk-react-native';

/**
 * What the stored row behind a displayed QR tells its screen to show. The QR screens never ask
 * the gateway themselves: the SDK does, as often as the gateway tells it to, and writes each
 * answer onto the row. The screens re-read the row from the phone's own store and render one of
 * these states.
 */

/**
 * How often a QR screen re-reads its stored row. A read of the phone's own store: nothing is
 * sent. How often the gateway is asked is the SDK's business, not a screen's.
 */
export const QR_ROW_WATCH_MS = 1000;

/**
 * The merchant's QR (customer scans it), read from `softpos.getTransaction(txRef)`.
 * - `WAITING`: nobody has claimed the QR. Keep it on screen.
 * - `CLAIMED_PENDING`: a wallet has claimed the QR and its payment has no outcome yet. Take the
 *   QR down and wait.
 * - `ACCEPTED`: the customer was debited and the credit is queued. Not final: take the QR down
 *   and wait.
 * - `FINAL`: the payment ended (approved, declined, failed). Show the result.
 * - `GONE`: the row is gone. The QR expired unpaid, so no payment was recorded.
 */
export type MerchantQrState = 'WAITING' | 'CLAIMED_PENDING' | 'ACCEPTED' | 'FINAL' | 'GONE';

/**
 * The customer's QR (merchant scans it), read from `wallet.getTransactions(...)` by its hash.
 * - `WAITING`: no merchant has charged the QR yet. Keep it on screen.
 * - `CHARGED_PENDING`: a merchant charged the QR and the payment has no outcome yet. Take the
 *   QR down and wait.
 * - `ACCEPTED`: debited, credit queued. Not final: take the QR down and wait.
 * - `FINAL`: the payment ended. Show the result.
 */
export type ShownQrState = 'WAITING' | 'CHARGED_PENDING' | 'ACCEPTED' | 'FINAL';

const MERCHANT_FINAL = ['APPROVED', 'DECLINED', 'FAILED', 'RETRY'];
const WALLET_FINAL = ['APPROVED', 'DECLINED', 'FAILED'];

const stated = (status: string | null | undefined): string => (status ?? '').trim().toUpperCase();

/** @param row the stored row, or `null` when the SDK holds none for the QR's reference */
export function merchantQrState(
  row: Pick<MerchantTransaction, 'status' | 'isQrClaimed'> | null
): MerchantQrState {
  if (!row) return 'GONE';
  const status = stated(row.status);
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (MERCHANT_FINAL.includes(status)) return 'FINAL';
  // The status is still open: the flag is what tells a claimed QR from an unscanned one.
  return row.isQrClaimed === true ? 'CLAIMED_PENDING' : 'WAITING';
}

export function shownQrState(
  row: Pick<TransactionSummary, 'authorizationStatus' | 'isCharged'>
): ShownQrState {
  const status = stated(row.authorizationStatus);
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (WALLET_FINAL.includes(status)) return 'FINAL';
  // The status is still open: the flag is what tells a charged QR from an unscanned one.
  return row.isCharged === true ? 'CHARGED_PENDING' : 'WAITING';
}
