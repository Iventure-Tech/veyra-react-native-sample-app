/**
 * Which add-card failures leave a card on the server that this phone never received, and so are
 * switched off with wallet.deactivateDigitise(clientRequestId).
 */
import { describe, expect, it } from '@jest/globals';
import { shouldDeactivateLostDigitise } from '../src/lostDigitise';

const result = (responseStatus: string | null, responseStatusReason: string | null, clientRequestId: string | null = 'crid-1') =>
  ({ responseStatus, responseStatusReason, clientRequestId }) as Parameters<typeof shouldDeactivateLostDigitise>[0];

describe('shouldDeactivateLostDigitise', () => {
  it.each(['NO_RESPONSE_RECEIVED', 'UPSTREAM_ERROR'])('a sent digitise with no usable answer (%s) is cleaned up', (reason) => {
    expect(shouldDeactivateLostDigitise(result('FAILED', reason))).toBe(true);
  });

  it.each([
    ['NOT_SENT', 'NO_NETWORK_CONNECTION'],
    ['FAILED', 'DUPLICATE_CLIENT_REQUEST_ID'],
    ['DECLINED', 'ACCOUNT_BLOCKED'],
    ['APPROVED', null],
  ])('%s / %s has nothing to clean up', (status, reason) => {
    expect(shouldDeactivateLostDigitise(result(status, reason))).toBe(false);
  });

  it('no id means nothing to name', () => {
    expect(shouldDeactivateLostDigitise(result('FAILED', 'NO_RESPONSE_RECEIVED', null))).toBe(false);
    expect(shouldDeactivateLostDigitise(result('FAILED', 'NO_RESPONSE_RECEIVED', ''))).toBe(false);
  });
});
