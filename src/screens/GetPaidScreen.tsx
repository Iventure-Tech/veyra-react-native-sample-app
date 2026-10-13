import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import {
  softpos,
  useGetPaidSession,
  VeyraError,
  type CancelResult,
  type TapEvent,
  type PaymentContextQr,
  type ResponseStatus,
  type ScannedCustomerQr,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { CANNOT_CANCEL_MESSAGE, cancelAction, cancelRefusedTooLate, isCancelledOutcome } from '../cancel';
import {
  contextSettlementToParams,
  cpmChargeToParams,
  DUPLICATE_MERCHANT_ORDER_ID,
  duplicateOrderMessage,
  keepsOrderId,
  notSentToParams,
  tapResultToParams,
} from '../paymentResult';
import { Scanner } from '../Scanner';
import { theme } from '../theme';
import { QrTile, Busy, Button, Field, formatAmount, FormScrollView, Section } from '../ui';

type Rail = 'idle' | 'tap' | 'mpmCreating' | 'mpm' | 'cpmScan' | 'cpmConfirm' | 'cpmCharging';

/**
 * A stand-in for the till's own order/basket/invoice id, which a real integration would take
 * from its POS rather than generate here.
 *
 * Required. The retry rule (`keepsOrderId`): an order can have several attempts. After
 * `NOT_SENT`, `RETRY`, `DECLINED` or `FAILED` no money moved, so the retry reuses the order id;
 * after `APPROVED` or `PENDING` the gateway refuses another payment for it
 * (`DUPLICATE_MERCHANT_ORDER_ID`), so the next sale gets a new one. The reference itself is the
 * SDK's to mint and arrives on the outcome.
 */
const nextSampleOrderId = (): string => `ORDER-${Date.now()}`;

/**
 * The merchant screen. `useGetPaidSession` is the load-bearing line: while this screen
 * is focused the reader can arm; leaving it disarms the device — that is the whole
 * single-Activity mode contract from the app's point of view.
 */
export function GetPaidScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'GetPaid'>): React.JSX.Element {
  useGetPaidSession(useIsFocused());

  const [registered, setRegistered] = useState<boolean | null>(null);
  // Backend status gate: payments are refused unless the merchant may take them. The SDK says so
  // (`isMerchantActive`, the same reading its own payment gate makes); the status is for the label.
  const [merchantStatus, setMerchantStatus] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [amount, setAmount] = useState('1000');
  const [rail, setRail] = useState<Rail>('idle');
  const [hint, setHint] = useState<string | null>(null);
  // Set once a cancel was answered TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT: the payment has left the
  // device, so Cancel is gone and the screen just waits for the result.
  const [cancelRefused, setCancelRefused] = useState(false);
  const [mpmQr, setMpmQr] = useState<PaymentContextQr | null>(null);
  const [mpmState, setMpmState] = useState<string | null>(null);
  const [mpmExpired, setMpmExpired] = useState(false);
  const [cpm, setCpm] = useState<ScannedCustomerQr | null>(null);
  const [lastApprovedRef, setLastApprovedRef] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The amount the live rail was started with. The result must show what was charged,
  // not whatever is in the amount field by the time the outcome lands.
  const chargedRef = useRef(0);
  // The order id kept for a retry after an attempt that moved no money; null means the next sale gets a new one.
  const retryOrderIdRef = useRef<string | null>(null);
  const currentOrderIdRef = useRef<string | null>(null);
  // The order id of the payment running right now (tap armed, QR being created, charge in flight);
  // null once its outcome has arrived. Cancel and leaving the screen name the payment by it.
  const inFlightOrderIdRef = useRef<string | null>(null);

  /** The order id for this attempt: the one kept from an attempt that moved no money, otherwise a new one. */
  const orderIdForAttempt = (): string => {
    const id = retryOrderIdRef.current ?? nextSampleOrderId();
    retryOrderIdRef.current = null;
    currentOrderIdRef.current = id;
    return id;
  };

  /** After an outcome: keep the order id unless the order is paid or may be (APPROVED / PENDING). */
  const attemptEnded = (status: ResponseStatus | null | undefined) => {
    retryOrderIdRef.current = keepsOrderId(status) ? currentOrderIdRef.current : null;
  };

  useFocusEffect(
    useCallback(() => {
      softpos.isRegistered().then(setRegistered).catch(() => setRegistered(false));
      const readStatus = () =>
        Promise.all([softpos.isMerchantActive(), softpos.getStored()]).then(([isActive, m]) => {
          setActive(isActive);
          setMerchantStatus(m?.merchantStatus ?? null);
          return isActive;
        });
      readStatus()
        .then((isActive) => {
          // Still waiting to be activated: ask the backend now rather than waiting for the SDK's
          // periodic poll, so the screen unlocks as soon as the merchant goes active.
          if (!isActive) return softpos.refreshStatus().then(readStatus);
          return undefined;
        })
        .catch(() => {});
      // Leaving the screen with a payment still on the device cancels it, by its order id. One
      // already sent answers TOO_LATE_TO_CANCEL_REQUEST_ALREADY_SENT and runs to its normal result,
      // which lands in Transactions.
      return () => {
        const orderId = inFlightOrderIdRef.current;
        if (orderId) softpos.cancelPayment(orderId).catch(() => {});
      };
    }, [])
  );

  // Tap events: transient hints keep the waiting screen up; only `result` is terminal.
  useEffect(() => {
    const sub = softpos.tap.onEvent((e: TapEvent) => {
      switch (e.type) {
        case 'cardDetected':
          setHint('Card detected — hold steady…');
          break;
        case 'cardContactLost':
          setHint('Hold the card steady against the phone');
          break;
        case 'unsupportedCard':
          setHint('Card not supported — try another card');
          break;
        case 'sendingRequestOnline':
          setHint('Contacting your bank…');
          break;
        case 'ended':
          setRail('idle');
          setHint(null);
          setCancelRefused(false);
          inFlightOrderIdRef.current = null;
          break;
        case 'result':
          setRail('idle');
          setHint(null);
          setCancelRefused(false);
          inFlightOrderIdRef.current = null;
          attemptEnded(e.result.responseStatus);
          // Your own cancel is not a result: nothing was sent, so just go back to amount entry. The
          // order id stays usable (NOT_SENT), so the next attempt reuses it.
          if (isCancelledOutcome(e.result)) {
            break;
          }
          if (e.result.responseStatus === 'APPROVED' && e.result.merchantTransactionReference) {
            setLastApprovedRef(e.result.merchantTransactionReference);
          }
          navigation.navigate(
            'PaymentResult',
            tapResultToParams(e.result, chargedRef.current)
          );
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, [navigation]);

  // Beneficiary credit confirmation renders on the payment result screen (a waiting line that
  // flips when the funds land) — the `softpos.observeCreditConfirmation` subscription lives there,
  // matched to the sale by reference. Settlement news only, never a change to the payment
  // outcome; an answer arriving after the result screen is gone still lands in Transactions.

  // An expired get-paid QR must stop being shown — it is no longer chargeable.
  useEffect(() => {
    const sub = softpos.observeQrExpired(() => {
      setMpmExpired(true);
      setMpmState('EXPIRED');
      if (pollRef.current) clearInterval(pollRef.current);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const minorUnits = Math.round(Number(amount) * 100);

  const requireActive = (): boolean => {
    if (active) return true;
    Alert.alert(
      'Merchant not active',
      `This merchant is ${merchantStatus} — payments are refused. Activate it from Merchant settings.`
    );
    return false;
  };

  const startTap = async () => {
    if (!requireActive()) return;
    try {
      // Your own order id — required and echoed back; a retry after an attempt that moved no money
      // reuses it. It is also how this payment is cancelled: softpos.cancelPayment(orderId).
      const orderId = orderIdForAttempt();
      inFlightOrderIdRef.current = orderId;
      setCancelRefused(false);
      await softpos.tap.start({ amountMinorUnits: minorUnits, merchantOrderId: orderId });
      chargedRef.current = minorUnits;
      setRail('tap');
      setHint('Ask the customer to tap their phone or card');
    } catch (e) {
      // Only a setup mistake rejects; a refusal (blank order id, the other mode busy) arrives as
      // a NOT_SENT `result` event.
      inFlightOrderIdRef.current = null;
      Alert.alert('Cannot start', (e as VeyraError).message);
    }
  };

  /**
   * Cancel names the payment by the order id it was started with — the same call for the tap, the
   * MPM QR create and the customer-QR charge. A payment can be cancelled only while it is still on
   * the device (waiting for a tap, reading the card, the moment between the read and the send,
   * authentication); once sent it runs to its normal result.
   */
  const cancelPayment = async () => {
    const orderId = inFlightOrderIdRef.current;
    if (!orderId) {
      setRail('idle');
      setHint(null);
      return;
    }
    let answer: CancelResult;
    try {
      answer = await softpos.cancelPayment(orderId);
    } catch (e) {
      // Only a setup mistake rejects.
      Alert.alert('Cannot cancel', (e as VeyraError).message);
      return;
    }
    if (cancelRefusedTooLate(answer)) {
      // Already with the bank: say so and keep waiting for the result this payment still delivers.
      setCancelRefused(true);
    }
    if (cancelAction(answer) === 'LEAVE') {
      // Nothing in progress under that order id: just go back.
      inFlightOrderIdRef.current = null;
      setRail('idle');
      setHint(null);
    }
    // CANCELLED: the payment's own NOT_SENT / CANCELLED outcome takes the screen back.
  };

  const showMpmQr = async () => {
    if (!requireActive()) return;
    const orderId = orderIdForAttempt();
    inFlightOrderIdRef.current = orderId;
    setCancelRefused(false);
    setRail('mpmCreating');
    try {
      const qr = await softpos.createPaymentContext(minorUnits, undefined, orderId);
      inFlightOrderIdRef.current = null;
      setCancelRefused(false);
      attemptEnded(qr.responseStatus);
      // Cancelled before it was sent: no QR, nothing recorded — back to amount entry.
      if (isCancelledOutcome(qr)) {
        setRail('idle');
        return;
      }
      // Creating the QR ends with an outcome: render it only when it was made.
      if (qr.responseStatus !== 'APPROVED' || !qr.txRef || !qr.mpmPayload) {
        if (qr.responseStatus === 'NOT_SENT') {
          navigation.navigate('PaymentResult', notSentToParams(qr.message, qr.responseStatusReason, minorUnits));
        } else if (qr.responseStatusReason === DUPLICATE_MERCHANT_ORDER_ID) {
          Alert.alert('Order already used', duplicateOrderMessage(qr.originalPayment));
        } else {
          // FAILED (the gateway refused it) or PENDING (sent, no usable answer): no QR — start again.
          Alert.alert(
            'Cannot create QR',
            `${qr.message ?? 'No payment code was created'} (${qr.responseStatusReason ?? qr.responseStatus})`
          );
        }
        setRail('idle');
        return;
      }
      const txRef = qr.txRef;
      chargedRef.current = minorUnits;
      setMpmQr(qr);
      setMpmState('PENDING');
      setMpmExpired(false);
      setRail('mpm');
      pollRef.current = setInterval(async () => {
        // A poll that could not be made carries a failureReason and no value: just ask again.
        const status = (await softpos.contextStatus(txRef).catch(() => null))?.value;
        if (!status) return;
        setMpmState(status.state);
        // An expired code is not an outcome: blank the QR and stay here with the
        // renewal action, like the native QR page. Only a settled push is a result.
        if (status.state === 'EXPIRED') {
          setMpmExpired(true);
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        if (status.isSettled) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (status.isApproved) setLastApprovedRef(txRef);
          setRail('idle');
          setMpmQr(null);
          // The code is spent — stop the SDK expiry timer so it cannot fire behind the result.
          softpos.cancelQrExpiry().catch(() => {});
          navigation.navigate(
            'PaymentResult',
            contextSettlementToParams(status, chargedRef.current)
          );
        }
      }, 2000);
    } catch (e) {
      // Only a setup mistake rejects.
      inFlightOrderIdRef.current = null;
      setRail('idle');
      Alert.alert('Cannot create QR', (e as VeyraError).message);
    }
  };

  const closeMpm = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await softpos.cancelQrExpiry().catch(() => {});
    setMpmQr(null);
    setMpmExpired(false);
    setRail('idle');
  };

  const onCpmScan = async (payload: string) => {
    try {
      const inspection = await softpos.inspectCustomerQr(payload);
      if (inspection.responseStatus !== 'APPROVED' || !inspection.qr) {
        // Not a payment QR (NOT_SENT / INVALID_REQUEST): hint and stay armed — the scanner keeps
        // running so the merchant can just aim at the right code (mirror of the native samples).
        Alert.alert('Not a payment QR', inspection.message ?? 'Scan the customer’s payment QR');
        return;
      }
      setCpm(inspection.qr);
      setRail('cpmConfirm');
    } catch (e) {
      Alert.alert('Cannot read QR', (e as VeyraError).message);
    }
  };

  const chargeCpm = async () => {
    if (!cpm) return;
    if (!requireActive()) return;
    const charged = cpm.amountMinorUnits; // the amount rides in the customer's QR
    // Stay on a visible processing state for the whole round trip — dropping back to
    // the idle screen here reads as the payment having vanished.
    const orderId = orderIdForAttempt();
    inFlightOrderIdRef.current = orderId;
    setCancelRefused(false);
    setRail('cpmCharging');
    try {
      // The second argument is *your* order/basket/invoice id — required; reused to retry an
      // attempt that moved no money (see keepsOrderId). The transaction reference
      // is minted by the SDK and comes back on the outcome; never invent one.
      const outcome = await softpos.chargeCustomerQr(cpm.handle, orderId);
      attemptEnded(outcome.responseStatus);
      // Cancelled before it was sent: nothing was charged — back to amount entry, no result page.
      if (isCancelledOutcome(outcome)) return;
      if (outcome.responseStatus === 'APPROVED' && outcome.merchantTransactionReference) {
        setLastApprovedRef(outcome.merchantTransactionReference);
      }
      navigation.navigate('PaymentResult', cpmChargeToParams(outcome, charged));
    } catch (e) {
      // Only a setup mistake rejects.
      Alert.alert('Cannot charge', (e as VeyraError).message);
    } finally {
      inFlightOrderIdRef.current = null;
      setCancelRefused(false);
      setCpm(null);
      setRail('idle');
    }
  };

  if (registered === null) return <Busy label="Checking registration…" />;
  if (!registered) {
    return (
      <View style={styles.container}>
        <Section title="No merchant yet">
          <Text style={styles.body}>Register a merchant to start accepting payments.</Text>
          <Button title="Register" onPress={() => navigation.navigate('RegisterMerchant')} />
        </Section>
      </View>
    );
  }

  if (rail === 'cpmScan') {
    return <Scanner onCode={onCpmScan} onCancel={() => setRail('idle')} />;
  }

  return (
    <FormScrollView contentContainerStyle={styles.container}>
      {!active && (
        <View style={styles.inactiveBanner}>
          <Text style={styles.inactiveText}>
            Merchant {merchantStatus} — payments are refused until it is active.
          </Text>
          <Button title="Merchant settings" onPress={() => navigation.navigate('MerchantSettings')} />
        </View>
      )}

      <Section title="Amount">
        <Field label="Amount (NGN)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      </Section>

      {rail === 'idle' && lastApprovedRef && (
        <Section title="Payment approved">
          <Button
            title="Show receipt QR"
            onPress={() => navigation.navigate('MerchantTransactions', { openReceiptFor: lastApprovedRef })}
          />
        </Section>
      )}

      {rail === 'idle' && (
        <Section title="Accept a payment">
          <Button title="Tap to pay (contactless)" onPress={startTap} />
          <Button title="Show payment QR" onPress={showMpmQr} />
          <Button title="Scan customer's payment QR" onPress={() => setRail('cpmScan')} />
        </Section>
      )}

      {rail === 'tap' && (
        <Section title={`Waiting for tap — ${formatAmount(minorUnits)}`}>
          <Busy label={hint ?? 'Ready for tap'} />
          {cancelRefused ? (
            <Text style={styles.body}>{CANNOT_CANCEL_MESSAGE} — waiting for the result.</Text>
          ) : (
            <Button title="Cancel" destructive onPress={cancelPayment} />
          )}
        </Section>
      )}

      {rail === 'mpmCreating' && (
        <Section title={`Creating payment QR — ${formatAmount(minorUnits)}`}>
          <Busy label="Creating the code…" />
          {cancelRefused ? (
            <Text style={styles.body}>{CANNOT_CANCEL_MESSAGE} — waiting for the result.</Text>
          ) : (
            <Button title="Cancel" destructive onPress={cancelPayment} />
          )}
        </Section>
      )}

      {rail === 'mpm' && mpmQr && (
        <Section title={`Payment QR — ${formatAmount(minorUnits)} (${mpmState})`}>
          <View style={styles.qr}>
            {mpmExpired ? (
              // Same-size placeholder: an expired QR must never remain scannable.
              <View style={styles.expiredTile}>
                <Text style={styles.expiredText}>Code expired</Text>
              </View>
            ) : (
              <QrTile>
                <QRCode value={mpmQr.mpmPayload ?? ''} size={240} />
              </QrTile>
            )}
          </View>
          {mpmExpired && <Button title="Show a new code" onPress={showMpmQr} />}
          <Button title="Done" onPress={closeMpm} />
        </Section>
      )}

      {rail === 'cpmConfirm' && cpm && (
        <Section title="Confirm charge">
          <Text style={styles.body}>
            {cpm.maskedCard} — {formatAmount(cpm.amountMinorUnits)}
          </Text>
          <Button title="Charge" onPress={chargeCpm} />
          <Button title="Cancel" destructive onPress={() => { setCpm(null); setRail('idle'); }} />
        </Section>
      )}

      {rail === 'cpmCharging' && cpm && (
        <Section title={`Charging — ${formatAmount(cpm.amountMinorUnits)}`}>
          <Busy label="Processing payment…" />
          <Text style={styles.body}>Contacting the bank — keep this screen open.</Text>
          {cancelRefused ? (
            <Text style={styles.body}>{CANNOT_CANCEL_MESSAGE} — waiting for the result.</Text>
          ) : (
            <Button title="Cancel" destructive onPress={cancelPayment} />
          )}
        </Section>
      )}
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  scanner: { flex: 1 },
  qr: { alignItems: 'center', marginVertical: 12 },
  body: { color: theme.textPrimary },
  inactiveBanner: {
    backgroundColor: theme.accentRedDark,
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  inactiveText: { color: theme.textPrimary, marginBottom: 6 },
  expiredTile: {
    width: 272,
    height: 272,
    borderRadius: 12,
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  expiredText: { color: theme.textSecondary },
});
