/**
 * Whether an add-card whose answer never arrived should be cleaned up with
 * `wallet.deactivateDigitise(clientRequestId)` before the user tries again.
 *
 * Only a digitise that was **sent** and got no usable answer qualifies: `FAILED` with
 * `NO_RESPONSE_RECEIVED` or `UPSTREAM_ERROR`. The token provider may have created a card this phone
 * never received. Anything else either created nothing (`NOT_SENT`, a stated refusal) or delivered
 * its card (`APPROVED`), so there is nothing to clean up.
 */
import type { DigitiseResult } from 'veyra-sdk-react-native';

export function shouldDeactivateLostDigitise(
  result: Pick<DigitiseResult, 'responseStatus' | 'responseStatusReason' | 'clientRequestId'>
): boolean {
  return (
    result.responseStatus === 'FAILED' &&
    (result.responseStatusReason === 'NO_RESPONSE_RECEIVED' || result.responseStatusReason === 'UPSTREAM_ERROR') &&
    !!result.clientRequestId
  );
}
