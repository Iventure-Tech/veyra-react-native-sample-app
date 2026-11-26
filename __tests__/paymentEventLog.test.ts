/**
 * The app-scope payment event log: it subscribes to the three SDK payment events, logs one line
 * per event, and its teardown removes exactly the subscriptions it made.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

type Listener = (e: unknown) => void;

const mockListeners: Record<string, Listener | undefined> = {};
const mockRemoved: string[] = [];

function mockSubscribe(name: string) {
  return (listener: Listener) => {
    mockListeners[name] = listener;
    return { remove: () => mockRemoved.push(name) };
  };
}

jest.mock('veyra-sdk-react-native', () => ({
  softpos: { observeTransactionResolved: mockSubscribe('softpos.transactionResolved') },
  wallet: {
    observeTransactionResolved: mockSubscribe('wallet.transactionResolved'),
    observeCreditConfirmation: mockSubscribe('wallet.creditConfirmation'),
  },
}));

import { observePaymentEvents } from '../src/paymentEventLog';

const ALL = ['softpos.transactionResolved', 'wallet.creditConfirmation', 'wallet.transactionResolved'];

function fire(name: string, event: unknown): void {
  const listener = mockListeners[name];
  if (!listener) throw new Error(`no listener for ${name}`);
  listener(event);
}

describe('observePaymentEvents', () => {
  let lines: string[];
  let restore: () => void;

  beforeEach(() => {
    mockRemoved.length = 0;
    lines = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    restore = () => spy.mockRestore();
  });

  afterEach(() => restore());

  it('subscribes to all three events', () => {
    observePaymentEvents();
    expect(Object.keys(mockListeners).sort()).toEqual(ALL);
  });

  it('logs one tagged line per event, with its identifier and status', () => {
    observePaymentEvents();
    fire('softpos.transactionResolved', {
      merchantTransactionReference: 'ref-1',
      responseCode: '00',
      status: 'APPROVED',
      reason: null,
    });
    fire('wallet.transactionResolved', {
      transactionHash: 'hash-1',
      tokenUniqueReference: 'tur-1',
      status: 'ACCEPTED',
      responseCode: null,
      reason: null,
      amountMinorUnits: 1500,
      merchantName: 'A Merchant',
    });
    fire('wallet.creditConfirmation', {
      transactionHash: 'hash-1',
      tokenUniqueReference: 'tur-1',
      creditTransactionId: 'credit-1',
      status: 'RECEIVED',
      amountMinorUnits: 1500,
      bankReference: 'bank-1',
      creditedAt: '2026-01-01T00:00:00Z',
    });

    expect(lines).toHaveLength(3);
    lines.forEach((line) => expect(line.startsWith('VeyraEvents ')).toBe(true));
    expect(lines[0]).toContain('softpos transactionResolved reference=ref-1 status=APPROVED');
    expect(lines[1]).toContain('wallet transactionResolved transactionHash=hash-1');
    expect(lines[1]).toContain('status=ACCEPTED');
    expect(lines[1]).toContain('amountMinorUnits=1500');
    expect(lines[2]).toContain('wallet creditConfirmation transactionHash=hash-1');
    expect(lines[2]).toContain('status=RECEIVED');
  });

  it('never logs the merchant name', () => {
    observePaymentEvents();
    fire('wallet.transactionResolved', {
      transactionHash: 'hash-2',
      tokenUniqueReference: null,
      status: 'APPROVED',
      responseCode: '00',
      reason: null,
      amountMinorUnits: 100,
      merchantName: 'Jane Doe',
    });
    expect(lines[0]).not.toContain('Jane Doe');
  });

  it('teardown removes only its own three subscriptions', () => {
    const stop = observePaymentEvents();
    expect(mockRemoved).toEqual([]);
    stop();
    expect([...mockRemoved].sort()).toEqual(ALL);
  });
});
