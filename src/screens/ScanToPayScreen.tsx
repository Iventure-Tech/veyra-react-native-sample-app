import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  wallet,
  usePaySession,
  VeyraError,
  type CancelResult,
  type ScanInspection,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { CANNOT_CANCEL_MESSAGE, cancelAction, cancelRefusedTooLate, isCancelledOutcome } from '../cancel';
import { walletPaymentToParams } from '../paymentResult';
import { Scanner } from '../Scanner';
import { theme } from '../theme';
import { Button, formatAmount, Section } from '../ui';

/** Scan a merchant's payment QR: inspect → authenticate (fresh, single-use) → pay. */
export function ScanToPayScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ScanToPay'>): React.JSX.Element {
  usePaySession(useIsFocused());
  const [inspection, setInspection] = useState<Extract<ScanInspection, { verified: true }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelRefused, setCancelRefused] = useState(false);

  const onScan = async (payload: string) => {
    if (inspection || busy) return;
    const result = await wallet.inspectScannedQr(payload).catch(() => null);
    if (!result) return;
    if (!result.verified) {
      Alert.alert('QR rejected', `${result.reason}${result.detail ? ` — ${result.detail}` : ''}`);
      return;
    }
    setInspection(result);
  };

  const pay = async () => {
    if (!inspection) return;
    setBusy(true);
    setCancelRefused(false);
    try {
      // No authentication call: payScannedContext raises the device authentication sheet
      // itself, naming this merchant and amount. One gesture per attempt — a retry asks again.
      const outcome = await wallet.payScannedContext(inspection.handle);
      // Cancelled before it was sent: nothing was paid — back to the previous screen.
      if (isCancelledOutcome(outcome)) {
        navigation.goBack();
        return;
      }
      if (outcome.responseStatus === 'NOT_SENT') {
        // Never reached Veyra: nothing was paid, and the scanned QR can still be paid.
        if (outcome.responseStatusReason === 'AUTH_CANCELLED') {
          setBusy(false);
          return; // the payer backed out of the authentication sheet — stay on the confirm screen
        }
        if (outcome.responseStatusReason === 'AUTH_UNAVAILABLE') {
          // No biometric and no screen lock on this device: a retry cannot help, so say what will.
          setBusy(false);
          Alert.alert('Set up a screen lock', outcome.message ?? 'This phone has no screen lock.');
          return;
        }
      }
      // Replace, not push: the confirm screen is spent, so backing out of the result
      // must not land on a scanned context that can no longer be paid.
      navigation.replace(
        'PaymentResult',
        walletPaymentToParams(outcome, inspection.amountMinorUnits)
      );
    } catch (e) {
      // Only a setup mistake rejects.
      setBusy(false);
      Alert.alert('Cannot pay', (e as VeyraError).message);
    }
  };

  /**
   * Cancel names the payment by the merchant order id signed into the scanned QR. It can be
   * cancelled only while still on the device (key top-up, the authentication sheet, before the
   * request is sent); once sent it runs to its normal result.
   */
  const cancelPay = async () => {
    const orderId = inspection?.merchantOrderId;
    if (!orderId) return;
    let answer: CancelResult;
    try {
      answer = await wallet.cancelPayment(orderId);
    } catch (e) {
      // Only a setup mistake rejects.
      Alert.alert('Cannot cancel', (e as VeyraError).message);
      return;
    }
    if (cancelRefusedTooLate(answer)) {
      // Already sent: say so and keep waiting for the result this payment still delivers.
      setCancelRefused(true);
    }
    if (cancelAction(answer) === 'LEAVE') navigation.goBack(); // nothing in progress under that order id
    // CANCELLED: the payment's own NOT_SENT / CANCELLED outcome takes the screen back.
  };

  if (inspection) {
    return (
      <View style={styles.container}>
        <Section title="Confirm payment">
          <Text style={styles.merchant}>{inspection.merchantName}</Text>
          {inspection.merchantCity ? <Text style={styles.city}>{inspection.merchantCity}</Text> : null}
          <Text style={styles.amount}>{formatAmount(inspection.amountMinorUnits)}</Text>
          <Button title={busy ? 'Paying…' : 'Pay'} onPress={pay} disabled={busy} />
          {!busy && <Button title="Cancel" destructive onPress={() => navigation.goBack()} />}
          {/* While paying, Cancel names the payment by the QR's order id — so it is disabled for a
              QR that carries none (nothing could name it). */}
          {busy && !cancelRefused && (
            <Button title="Cancel" destructive onPress={cancelPay} disabled={!inspection.merchantOrderId} />
          )}
          {busy && cancelRefused && (
            <Text style={styles.city}>{CANNOT_CANCEL_MESSAGE} — waiting for the result.</Text>
          )}
        </Section>
      </View>
    );
  }

  return <Scanner onCode={onScan} onCancel={() => navigation.goBack()} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  camera: { flex: 1 },
  merchant: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  city: { color: theme.textSecondary },
  amount: { fontSize: 28, fontWeight: '700', marginVertical: 12, color: theme.textPrimary },
});
