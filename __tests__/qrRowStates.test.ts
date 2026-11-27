/**
 * What a displayed QR's stored row tells its screen to show, and the result screens a claimed or
 * settled merchant QR opens. The screens never ask the gateway: they read the row.
 */
import { describe, expect, it } from '@jest/globals';
import type { MerchantTransaction } from 'veyra-sdk-react-native';
import {
  CLAIM_RELEASED,
  CLAIMED_PENDING_MERCHANT_MESSAGE,
  claimedPendingToParams,
  qrSaleSettledToParams,
} from '../src/paymentResult';
import { QR_ROW_WATCH_MS, merchantQrState, shownQrState } from '../src/qrRowStates';

const merchantRow = (over: Partial<MerchantTransaction> = {}): MerchantTransaction =>
  ({
    merchantTransactionReference: 'TX-1',
    merchantOrderId: 'ORDER-1',
    amountMinorUnits: 150000,
    status: 'PENDING',
    responseCode: null,
    responseStatusReason: null,
    rail: 'QR_MPM',
    railLabel: 'QR',
    creditTransactionId: null,
    isCreditConfirmationSupported: null,
    creditConfirmationStatus: null,
    isQrClaimed: null,
    ...over,
  }) as MerchantTransaction;

describe('QR_ROW_WATCH_MS', () => {
  it('re-reads the stored row every second', () => {
    expect(QR_ROW_WATCH_MS).toBe(1000);
  });
});

describe('merchantQrState', () => {
  it('keeps an unclaimed QR on screen', () => {
    expect(merchantQrState({ status: 'PENDING', isQrClaimed: null })).toBe('WAITING');
  });

  it('takes a claimed QR down while its payment is pending', () => {
    expect(merchantQrState({ status: 'PENDING', isQrClaimed: true })).toBe('CLAIMED_PENDING');
  });

  it('reads a released QR as payable again', () => {
    expect(merchantQrState({ status: 'PENDING', isQrClaimed: false })).toBe('WAITING');
  });

  it('reads an accepted push as accepted, whether or not the claim was seen', () => {
    expect(merchantQrState({ status: 'ACCEPTED', isQrClaimed: true })).toBe('ACCEPTED');
    expect(merchantQrState({ status: 'ACCEPTED', isQrClaimed: null })).toBe('ACCEPTED');
  });

  it('lets a final status win over the claim', () => {
    for (const status of ['APPROVED', 'DECLINED', 'FAILED', 'RETRY']) {
      expect(merchantQrState({ status, isQrClaimed: true })).toBe('FINAL');
      expect(merchantQrState({ status, isQrClaimed: null })).toBe('FINAL');
    }
  });

  it('keeps waiting on a status this build does not know', () => {
    expect(merchantQrState({ status: 'SOMETHING_NEW', isQrClaimed: null })).toBe('WAITING');
    expect(merchantQrState({ status: 'SOMETHING_NEW', isQrClaimed: true })).toBe('CLAIMED_PENDING');
  });

  it('reads no row as an expired, unpaid QR', () => {
    expect(merchantQrState(null)).toBe('GONE');
  });
});

describe('shownQrState', () => {
  it('keeps a QR nobody has charged on screen', () => {
    expect(shownQrState({ authorizationStatus: 'PENDING', isCharged: null })).toBe('WAITING');
    expect(shownQrState({ authorizationStatus: null, isCharged: null })).toBe('WAITING');
  });

  it('takes a charged QR down while its payment is pending', () => {
    expect(shownQrState({ authorizationStatus: 'PENDING', isCharged: true })).toBe('CHARGED_PENDING');
  });

  it('reads an accepted payment as accepted, whether or not the charge was seen', () => {
    expect(shownQrState({ authorizationStatus: 'ACCEPTED', isCharged: true })).toBe('ACCEPTED');
    expect(shownQrState({ authorizationStatus: 'ACCEPTED', isCharged: null })).toBe('ACCEPTED');
  });

  it('lets a final status win over the charge', () => {
    for (const authorizationStatus of ['APPROVED', 'DECLINED', 'FAILED']) {
      expect(shownQrState({ authorizationStatus, isCharged: true })).toBe('FINAL');
      expect(shownQrState({ authorizationStatus, isCharged: null })).toBe('FINAL');
    }
  });

  it('does not treat RETRY as final for a shown QR', () => {
    // "No record yet" reads RETRY while the QR is waiting to be scanned.
    expect(shownQrState({ authorizationStatus: 'RETRY', isCharged: null })).toBe('WAITING');
  });
});

describe('claimedPendingToParams', () => {
  const params = claimedPendingToParams('TX-1', 150000);

  it('is pending, waited on in place, and marked as a claimed QR', () => {
    expect(params.outcome).toBe('pending');
    expect(params.title).toBe('Payment Pending');
    expect(params.message).toBe(CLAIMED_PENDING_MERCHANT_MESSAGE);
    expect(params.resolvesFor).toBe('TX-1');
    expect(params.claimedQr).toBe(true);
    expect(params.amountMinorUnits).toBe(150000);
    expect(params.details).toContain('Reference: TX-1');
  });

  it('offers no receipt and no credit confirmation before the payment is approved', () => {
    expect(params.receiptFor).toBeUndefined();
    expect(params.creditConfirmation).toBeUndefined();
  });
});

describe('CLAIM_RELEASED', () => {
  it('is a final not-sent outcome: nothing was charged', () => {
    expect(CLAIM_RELEASED.final).toBe(true);
    expect(CLAIM_RELEASED.outcome).toBe('not_sent');
    expect(CLAIM_RELEASED.message).toContain('nothing was charged');
  });
});

describe('qrSaleSettledToParams', () => {
  it('shows an approved sale with its receipt and a credit-confirmation watch', () => {
    const params = qrSaleSettledToParams(
      merchantRow({ status: 'APPROVED', responseCode: '00', isQrClaimed: true }),
      150000
    );
    expect(params.outcome).toBe('approved');
    expect(params.title).toBe('Payment Successful');
    expect(params.message).toBe('Customer paid by QR');
    expect(params.receiptFor).toBe('TX-1');
    expect(params.details).toEqual(['Ref: TX-1', 'Response: 00']);
    // Not learned yet: the result screen watches the stored row for the flag.
    expect(params.creditConfirmation).toEqual({
      reference: 'TX-1',
      creditTransactionId: null,
      supported: null,
    });
  });

  it('carries the credit fields the row already has', () => {
    const params = qrSaleSettledToParams(
      merchantRow({
        status: 'APPROVED',
        responseCode: '00',
        creditTransactionId: 'CREDIT-9',
        isCreditConfirmationSupported: true,
      }),
      100
    );
    expect(params.creditConfirmation).toEqual({
      reference: 'TX-1',
      creditTransactionId: 'CREDIT-9',
      supported: true,
    });
  });

  it('shows a declined or failed sale without a receipt or credit confirmation', () => {
    for (const status of ['DECLINED', 'FAILED']) {
      const params = qrSaleSettledToParams(merchantRow({ status, responseCode: '51' }), 100);
      expect(params.outcome).toBe('declined');
      expect(params.title).toBe('Declined');
      expect(params.receiptFor).toBeUndefined();
      expect(params.creditConfirmation).toBeUndefined();
    }
  });

  it('shows a dash when the row has no response code', () => {
    expect(qrSaleSettledToParams(merchantRow({ status: 'APPROVED' }), 100).details).toContain(
      'Response: -'
    );
  });
});
