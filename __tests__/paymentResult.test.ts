/**
 * The rail → result-screen mapping. These are the decisions that make a result screen
 * honest — approved vs pending vs declined, and above all *when a receipt is offered*
 * (never for an outcome that is not final, never when nothing was recorded).
 */
import { describe, expect, it } from '@jest/globals';
import type {
  CustomerQrChargeOutcome,
  MerchantTapResult,
  PaymentContextStatus,
  PaymentOutcome,
} from 'veyra-sdk-react-native';
import {
  AUTO_RETURN_MS,
  contextSettlementToParams,
  cpmChargeFailureToParams,
  cpmChargeToParams,
  tapResultToParams,
  walletPaymentFailureToParams,
  walletPaymentToParams,
} from '../src/paymentResult';

describe('AUTO_RETURN_MS', () => {
  // The hold is a product decision, not a tuning knob: every terminal result — merchant and
  // wallet, approved and declined — stays up for a full minute with Done available throughout.
  it('holds a terminal result for 60 seconds', () => {
    expect(AUTO_RETURN_MS).toBe(60000);
  });
});

const tap = (over: Partial<MerchantTapResult> = {}): MerchantTapResult => ({
  responseCode: null,
  status: null,
  message: null,
  amountDisplay: null,
  cardScheme: null,
  maskedTokenLast4: null,
  merchantTransactionReference: null,
  transactionId: null,
  merchantStatus: null,
  creditTransactionId: null,
  isCreditConfirmationSupported: null,
  ...over,
});

describe('tapResultToParams', () => {
  it('approves on 00 and offers the receipt for the recorded reference', () => {
    const params = tapResultToParams(
      tap({
        responseCode: '00',
        status: 'APPROVED',
        message: 'Approved',
        cardScheme: 'AFRIGO',
        merchantTransactionReference: 'REF-1',
      }),
      250_00
    );

    expect(params.outcome).toBe('approved');
    expect(params.title).toBe('Payment Successful');
    expect(params.amountMinorUnits).toBe(250_00);
    expect(params.receiptFor).toBe('REF-1');
    expect(params.details).toEqual(['Card: AFRIGO', 'Reference: REF-1']);
    // No supported flag ⇒ nothing to wait for on the result screen.
    expect(params.creditConfirmation).toBeUndefined();
  });

  it('waits on credit confirmation when the approval says the bank supports it', () => {
    const params = tapResultToParams(
      tap({
        responseCode: '00',
        status: 'APPROVED',
        merchantTransactionReference: 'REF-1',
        creditTransactionId: 'CREDIT-1',
        isCreditConfirmationSupported: true,
      }),
      250_00
    );
    expect(params.creditConfirmation).toEqual({
      reference: 'REF-1',
      creditTransactionId: 'CREDIT-1',
      supported: true,
    });
  });

  it('never waits on a non-approved outcome, whatever the flags claim', () => {
    const params = tapResultToParams(
      tap({
        responseCode: '05',
        status: 'DECLINED',
        merchantTransactionReference: 'REF-1',
        isCreditConfirmationSupported: true,
      }),
      100
    );
    expect(params.creditConfirmation).toBeUndefined();
  });

  it('treats 99 as pending and offers NO receipt — the status can still change', () => {
    const params = tapResultToParams(
      tap({ responseCode: '99', status: 'PENDING', merchantTransactionReference: 'REF-2' }),
      100
    );

    expect(params.outcome).toBe('pending');
    expect(params.title).toBe('Payment Pending');
    expect(params.receiptFor).toBeUndefined();
  });

  it('declines everything that is not approved or pending, receipt included', () => {
    for (const code of ['05', '06', '91', '96']) {
      const params = tapResultToParams(
        tap({ responseCode: code, status: 'DECLINED', merchantTransactionReference: 'REF-3' }),
        100
      );
      expect(params.outcome).toBe('declined');
      expect(params.title).toBe('Payment Failed');
      expect(params.receiptFor).toBe('REF-3');
      expect(params.details).toContain(`Response: ${code}`);
    }
  });

  it('falls back to the response code when status is absent, and vice versa', () => {
    expect(tapResultToParams(tap({ responseCode: '00' }), 1).outcome).toBe('approved');
    expect(tapResultToParams(tap({ status: 'APPROVED' }), 1).outcome).toBe('approved');
    expect(tapResultToParams(tap({ status: 'PENDING' }), 1).outcome).toBe('pending');
  });

  it('renders a result with nothing but an amount when every field is null', () => {
    const params = tapResultToParams(tap(), 500);

    expect(params.outcome).toBe('declined');
    expect(params.message).toBe('Transaction failed');
    expect(params.details).toEqual([]); // no dangling "Response: null" line
    expect(params.receiptFor).toBeUndefined();
  });
});

describe('contextSettlementToParams', () => {
  const settled = (over: Partial<PaymentContextStatus> = {}): PaymentContextStatus => ({
    txRef: 'TX-1',
    state: 'APPROVED',
    responseCode: '00',
    transactionHash: null,
    isSettled: true,
    isApproved: true,
    ...over,
  });

  it('approves a settled push and offers its receipt', () => {
    const params = contextSettlementToParams(settled(), 1_000_00);
    expect(params.outcome).toBe('approved');
    expect(params.receiptFor).toBe('TX-1');
    expect(params.details).toEqual(['Ref: TX-1', 'Response: 00']);
    // The contexts rail carries no credit fields: supported is unknown (null), so the
    // result screen watches the stored row rather than waiting outright.
    expect(params.creditConfirmation).toEqual({
      reference: 'TX-1',
      creditTransactionId: null,
      supported: null,
    });
  });

  it('declines without a receipt when the push settled unapproved', () => {
    const params = contextSettlementToParams(
      settled({ state: 'DECLINED', isApproved: false, responseCode: '05' }),
      100
    );
    expect(params.outcome).toBe('declined');
    expect(params.receiptFor).toBeUndefined();
    expect(params.creditConfirmation).toBeUndefined();
  });

  it('shows a dash rather than "null" when the gateway sent no response code', () => {
    expect(contextSettlementToParams(settled({ responseCode: null }), 100).details).toContain(
      'Response: -'
    );
  });
});

describe('cpmChargeToParams', () => {
  const charge = (over: Partial<CustomerQrChargeOutcome> = {}): CustomerQrChargeOutcome => ({
    approved: true,
    responseCode: '00',
    transactionId: 'TXN-9',
    merchantTransactionReference: 'REF-9',
    creditTransactionId: null,
    isCreditConfirmationSupported: null,
    ...over,
  });

  it('waits on credit confirmation when the approved charge says the bank supports it', () => {
    const params = cpmChargeToParams(
      charge({ creditTransactionId: 'CREDIT-9', isCreditConfirmationSupported: true }),
      750
    );
    expect(params.creditConfirmation).toEqual({
      reference: 'REF-9',
      creditTransactionId: 'CREDIT-9',
      supported: true,
    });
  });

  it('offers the receipt for a delivered decline too — it was recorded', () => {
    const params = cpmChargeToParams(charge({ approved: false, responseCode: '05' }), 750);
    expect(params.outcome).toBe('declined');
    expect(params.receiptFor).toBe('REF-9');
    expect(params.message).toBe('Customer QR payment · 05');
  });

  it('drops the receipt when the gateway returned no reference', () => {
    expect(
      cpmChargeToParams(charge({ merchantTransactionReference: null }), 750).receiptFor
    ).toBeUndefined();
  });

  it('offers no receipt for a transport failure — nothing was recorded', () => {
    const params = cpmChargeFailureToParams('Network unreachable', 750);
    expect(params.outcome).toBe('declined');
    expect(params.receiptFor).toBeUndefined();
    expect(params.message).toBe('Network unreachable');
  });

  it('still says something when the failure carries an empty message', () => {
    expect(cpmChargeFailureToParams('', 750).message).toBe('Payment failed');
  });
});

describe('walletPaymentToParams', () => {
  const outcome = (over: Partial<PaymentOutcome> = {}): PaymentOutcome => ({
    approved: true,
    responseCode: '00',
    responseStatus: 'APPROVED',
    responseStatusReason: 'APPROVED',
    message: 'Paid',
    merchantName: 'Veyra Coffee',
    merchantLocation: 'Lagos, LA',
    ...over,
  });

  it('never offers a receipt — a wallet cannot fetch the merchant copy', () => {
    expect(walletPaymentToParams(outcome(), 300).receiptFor).toBeUndefined();
    expect(walletPaymentFailureToParams('boom', 300).receiptFor).toBeUndefined();
  });

  it("shows the gateway's merchant name and location", () => {
    expect(walletPaymentToParams(outcome(), 300).details).toEqual([
      'Veyra Coffee',
      'Lagos, LA',
      'Response: 00',
    ]);
  });

  it('omits merchant lines the gateway did not supply (iOS)', () => {
    const params = walletPaymentToParams(
      outcome({ merchantName: null, merchantLocation: null }),
      300
    );
    expect(params.details).toEqual(['Response: 00']);
  });

  it('declines with the SDK message', () => {
    const params = walletPaymentToParams(
      outcome({
        approved: false,
        responseStatus: 'DECLINED',
        message: 'Insufficient funds',
        responseCode: '51',
      }),
      300
    );
    expect(params.outcome).toBe('declined');
    expect(params.title).toBe('Declined');
    expect(params.message).toBe('Insufficient funds');
  });

  // A push is a synchronous call whose OUTCOME can still be unknown: the gateway answers
  // PENDING when a hop below it timed out (68), errored (06/96) or is still settling (09).
  // Reading `approved` alone showed all four as a decline, which is what the payer was told
  // while the SDK went on polling the payment to a different answer.
  it.each([
    ['68', 'NO_RESPONSE_RECEIVED'],
    ['06', 'UPSTREAM_ERROR'],
    ['96', 'SYSTEM_MALFUNCTION'],
    ['09', 'TRANSACTION_IN_PROCESS'],
  ])('shows a %s/PENDING push as pending, not declined', (code, reason) => {
    const params = walletPaymentToParams(
      outcome({
        approved: false,
        responseCode: code,
        responseStatus: 'PENDING',
        responseStatusReason: reason,
        message: null,
      }),
      300
    );
    expect(params.outcome).toBe('pending');
    expect(params.title).toBe('Payment Pending');
    expect(params.details).toContain(
      'Status unknown. The issuer may have approved. Check transactions for updates.'
    );
  });

  it('treats an absent or unrecognised status as pending, never as a refusal', () => {
    const noStatus = walletPaymentToParams(
      outcome({ approved: false, responseStatus: null, message: null }),
      300
    );
    expect(noStatus.outcome).toBe('pending');

    const unknown = walletPaymentToParams(
      outcome({ approved: false, responseStatus: 'SETTLING', message: null }),
      300
    );
    expect(unknown.outcome).toBe('pending');
  });
});
