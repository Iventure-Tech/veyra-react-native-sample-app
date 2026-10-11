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
  DEVICE_NOT_BOUND_MESSAGE,
  DEVICE_NOT_BOUND_TITLE,
  contextSettlementToParams,
  cpmChargeToParams,
  duplicateOrderMessage,
  tapResultToParams,
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
  responseStatus: null,
  responseStatusReason: null,
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
  originalPayment: null,
  ...over,
});

describe('tapResultToParams', () => {
  it('approves on 00 and offers the receipt for the recorded reference', () => {
    const params = tapResultToParams(
      tap({
        responseCode: '00',
        responseStatus: 'APPROVED',
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
        responseStatus: 'APPROVED',
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
        responseStatus: 'DECLINED',
        merchantTransactionReference: 'REF-1',
        isCreditConfirmationSupported: true,
      }),
      100
    );
    expect(params.creditConfirmation).toBeUndefined();
  });

  it('shows PENDING as pending and offers NO receipt — the status can still change', () => {
    const params = tapResultToParams(
      tap({ responseCode: '68', responseStatus: 'PENDING', merchantTransactionReference: 'REF-2' }),
      100
    );

    expect(params.outcome).toBe('pending');
    expect(params.title).toBe('Payment Pending');
    expect(params.receiptFor).toBeUndefined();
  });

  it('branches on the stated status, never on the code', () => {
    // A 00 that is not stated APPROVED is not an approval; a 96 stated DECLINED is a decline.
    expect(tapResultToParams(tap({ responseCode: '00', responseStatus: 'PENDING' }), 1).outcome).toBe('pending');
    const declined = tapResultToParams(
      tap({ responseCode: '96', responseStatus: 'DECLINED', merchantTransactionReference: 'REF-3' }),
      100
    );
    expect(declined.outcome).toBe('declined');
    expect(declined.title).toBe('Payment Declined');
    expect(declined.receiptFor).toBe('REF-3');
    expect(declined.details).toContain('Response: 96');
  });

  it('shows a NOT_SENT tap with its reason, no receipt and nothing to wait for', () => {
    const params = tapResultToParams(
      tap({ responseStatus: 'NOT_SENT', responseStatusReason: 'NO_NETWORK_CONNECTION', message: 'No connection' }),
      100
    );
    expect(params.outcome).toBe('not_sent');
    expect(params.title).toBe('Payment Not Sent');
    expect(params.message).toBe('No connection (NO_NETWORK_CONNECTION)');
    expect(params.receiptFor).toBeUndefined();
    expect(params.resolvesFor).toBeUndefined();
  });

  it('a duplicate order says paid or still confirming — never retry', () => {
    const paid = tapResultToParams(
      tap({ responseCode: '94', responseStatus: 'FAILED', responseStatusReason: 'DUPLICATE_MERCHANT_ORDER_ID' }),
      100
    );
    expect(paid.title).toBe('Order Already Used');
    expect(paid.message).toBe('This order is already paid - do not take another payment');
    const pending = tapResultToParams(
      tap({
        responseCode: '94',
        responseStatus: 'FAILED',
        responseStatusReason: 'DUPLICATE_MERCHANT_ORDER_ID',
        originalPayment: {
          responseCode: '09', responseStatus: 'PENDING', responseStatusReason: 'TRANSACTION_IN_PROCESS',
          amountMinorUnits: 100, merchantTransactionReference: 'REF-ORIG', transactionId: 'TX-ORIG',
        },
      }),
      100
    );
    expect(pending.message).toBe(
      'A payment for this order is still being confirmed - do not take another payment'
    );
  });

  it('treats an absent or unknown status as pending, never as a failure', () => {
    expect(tapResultToParams(tap(), 500).outcome).toBe('pending');
    expect(tapResultToParams(tap({ responseStatus: 'SETTLING' }), 500).outcome).toBe('pending');
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
    responseStatus: 'APPROVED',
    responseStatusReason: null,
    message: null,
    responseCode: '00',
    transactionId: 'TXN-9',
    merchantTransactionReference: 'REF-9',
    // The outcome echoes back your own order id (null when none was supplied).
    merchantOrderId: null,
    creditTransactionId: null,
    isCreditConfirmationSupported: null,
    originalPayment: null,
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
    const params = cpmChargeToParams(
      charge({ approved: false, responseStatus: 'DECLINED', responseCode: '05' }),
      750
    );
    expect(params.outcome).toBe('declined');
    expect(params.receiptFor).toBe('REF-9');
    expect(params.message).toBe('Customer QR payment · 05');
  });

  it('drops the receipt when the gateway returned no reference', () => {
    expect(
      cpmChargeToParams(charge({ merchantTransactionReference: null }), 750).receiptFor
    ).toBeUndefined();
  });

  it('offers no receipt for a NOT_SENT charge — nothing was recorded', () => {
    const params = cpmChargeToParams(
      charge({
        approved: false,
        responseStatus: 'NOT_SENT',
        responseStatusReason: 'NO_NETWORK_CONNECTION',
        responseCode: null,
        merchantTransactionReference: null,
        message: 'No connection',
      }),
      750
    );
    expect(params.outcome).toBe('not_sent');
    expect(params.receiptFor).toBeUndefined();
    expect(params.message).toBe('No connection (NO_NETWORK_CONNECTION)');
  });

  it('a PENDING charge waits for the answer and offers no receipt yet', () => {
    const params = cpmChargeToParams(
      charge({ approved: false, responseStatus: 'PENDING', responseCode: '68' }),
      750
    );
    expect(params.outcome).toBe('pending');
    expect(params.receiptFor).toBeUndefined();
    expect(params.resolvesFor).toBe('REF-9');
  });

  it('a duplicate order says it is already paid', () => {
    const params = cpmChargeToParams(
      charge({
        approved: false,
        responseStatus: 'FAILED',
        responseStatusReason: 'DUPLICATE_MERCHANT_ORDER_ID',
        responseCode: '94',
      }),
      750
    );
    expect(params.message).toBe(duplicateOrderMessage(null));
    expect(params.receiptFor).toBeUndefined();
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
  });

  it('tells the payer to add the card again when it is not bound to this phone', () => {
    const params = walletPaymentToParams(
      outcome({ approved: false, responseCode: null, responseStatus: 'NOT_SENT', responseStatusReason: 'DEVICE_NOT_BOUND' }),
      300
    );
    expect(params.outcome).toBe('not_sent');
    expect(params.title).toBe(DEVICE_NOT_BOUND_TITLE);
    expect(params.message).toBe(DEVICE_NOT_BOUND_MESSAGE);
  });

  it('shows any other NOT_SENT with its reason', () => {
    const params = walletPaymentToParams(
      outcome({ approved: false, responseCode: null, responseStatus: 'NOT_SENT', responseStatusReason: 'AUTH_FAILED', message: 'boom' }),
      300
    );
    expect(params.outcome).toBe('not_sent');
    expect(params.message).toBe('boom (AUTH_FAILED)');
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

describe('RETRY', () => {
  it('a RETRY tap reads as not sent, with its code, no receipt and nothing to wait for', () => {
    const params = tapResultToParams(
      tap({ responseCode: '91', responseStatus: 'RETRY', responseStatusReason: 'ISSUER_SWITCH_NOT_AVAILABLE', merchantTransactionReference: 'REF-R' }),
      100
    );
    expect(params.outcome).toBe('not_sent');
    expect(params.message).toBe('Payment not sent to the bank - retry with the same order ID (ISSUER_SWITCH_NOT_AVAILABLE)');
    expect(params.details).toContain('Response: 91');
    expect(params.receiptFor).toBeUndefined();
    expect(params.resolvesFor).toBeUndefined();
  });

  it('a RETRY scan-to-pay is not pending', () => {
    const params = walletPaymentToParams(
      { approved: false, responseCode: '30', responseStatus: 'RETRY', responseStatusReason: 'INVALID_REQUEST', message: null, merchantName: null, merchantLocation: null },
      300
    );
    expect(params.outcome).toBe('not_sent');
  });
});

