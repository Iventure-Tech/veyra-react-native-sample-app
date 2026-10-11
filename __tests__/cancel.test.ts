/**
 * What a screen does with the answer to a cancel. The cancel is answered at once; the cancelled call
 * still delivers its own outcome, so only TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT is said to the
 * user, and only the NO_… answers leave by themselves.
 */
import { describe, expect, it } from '@jest/globals';
import type { CancelResult } from 'veyra-sdk-react-native';
import { cancelAction, cancelRefusedTooLate, isCancelledOutcome, newClientRequestId } from '../src/cancel';

describe('cancelAction', () => {
  it('CANCELLED waits for the call’s own NOT_SENT / CANCELLED outcome to leave', () => {
    expect(cancelAction('CANCELLED')).toBe('AWAIT_CANCELLED_OUTCOME');
  });

  it.each<CancelResult>([
    'TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT',
    'TOO_LATE_TO_CANCEL_TASK_ALREADY_PROCESSED',
  ])('%s keeps waiting for the normal result — it never leaves', (answer) => {
    expect(cancelAction(answer)).toBe('KEEP_WAITING');
  });

  it.each<CancelResult>([
    'NO_PAYMENT_IN_PROGRESS_FOR_ORDER_ID',
    'NO_DIGITISATION_IN_PROGRESS_FOR_CLIENT_REQUEST_ID',
  ])('%s just leaves', (answer) => {
    expect(cancelAction(answer)).toBe('LEAVE');
  });

  it('an answer this app does not know keeps waiting — the call still delivers its outcome', () => {
    expect(cancelAction('SOMETHING_NEW' as CancelResult)).toBe('KEEP_WAITING');
  });
});

describe('cancelRefusedTooLate', () => {
  it('is true only when the request has already left the device', () => {
    expect(cancelRefusedTooLate('TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT')).toBe(true);
    (
      [
        'CANCELLED',
        'TOO_LATE_TO_CANCEL_TASK_ALREADY_PROCESSED',
        'NO_PAYMENT_IN_PROGRESS_FOR_ORDER_ID',
        'NO_DIGITISATION_IN_PROGRESS_FOR_CLIENT_REQUEST_ID',
      ] as CancelResult[]
    ).forEach((answer) => expect(cancelRefusedTooLate(answer)).toBe(false));
  });
});

describe('isCancelledOutcome', () => {
  it('is NOT_SENT with reason CANCELLED', () => {
    expect(isCancelledOutcome({ responseStatus: 'NOT_SENT', responseStatusReason: 'CANCELLED' })).toBe(true);
  });

  it('is not any other NOT_SENT — those are results to show', () => {
    expect(isCancelledOutcome({ responseStatus: 'NOT_SENT', responseStatusReason: 'AUTH_CANCELLED' })).toBe(false);
    expect(isCancelledOutcome({ responseStatus: 'NOT_SENT', responseStatusReason: 'NO_NETWORK_CONNECTION' })).toBe(false);
  });

  it('is never a sent outcome, even one whose reason reads CANCELLED', () => {
    expect(isCancelledOutcome({ responseStatus: 'FAILED', responseStatusReason: 'CANCELLED' })).toBe(false);
    expect(isCancelledOutcome({ responseStatus: 'PENDING', responseStatusReason: 'CANCELLED' })).toBe(false);
  });

  it('is false for a missing outcome or missing fields', () => {
    expect(isCancelledOutcome(null)).toBe(false);
    expect(isCancelledOutcome(undefined)).toBe(false);
    expect(isCancelledOutcome({ responseStatus: null, responseStatusReason: null })).toBe(false);
  });
});

describe('newClientRequestId', () => {
  it('is a v4 UUID and differs between attempts', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newClientRequestId()));
    expect(ids.size).toBe(50);
    ids.forEach((id) =>
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    );
  });
});
