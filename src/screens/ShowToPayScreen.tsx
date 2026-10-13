import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { wallet, usePaySession, type PaymentQr, type VeyraError } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { DEVICE_NOT_BOUND_MESSAGE, DEVICE_NOT_BOUND_TITLE } from '../paymentResult';
import { theme } from '../theme';
import { QrTile, Busy, Button, formatAmount, Field, Section } from '../ui';

/**
 * Show a payment QR for the active card (consumer-presented / CPM). While the code is
 * up, the screen polls for the settled outcome so the payer sees Paid/Declined without
 * leaving; an expired code blanks (never scannable) with a renewal action.
 */
export function ShowToPayScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ShowToPay'>): React.JSX.Element {
  usePaySession(useIsFocused());
  const [amount, setAmount] = useState('1000');
  const [qr, setQr] = useState<PaymentQr | null>(null);
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const settleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimers = () => {
    if (settleRef.current) clearInterval(settleRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    settleRef.current = null;
    tickRef.current = null;
  };

  useEffect(() => {
    const sub = wallet.observeQrExpired(() => {
      setExpired(true);
      stopTimers();
    });
    return () => {
      sub.remove();
      stopTimers();
      wallet.cancelQrExpiry().catch(() => {});
    };
  }, []);

  const startWatching = (rendered: PaymentQr) => {
    stopTimers();
    // Countdown to expiry.
    tickRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((rendered.expiresAtEpochMillis - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 1000);
    // Settle poll: check THIS payment by its hash only — one request per check.
    // reconcilePendingTransactions() asks about every pending payment on the device, so calling
    // it on a 3s loop sends a burst of requests each time and gets the wallet throttled (429).
    const hash = rendered.transactionHash;
    if (!hash) return;
    settleRef.current = setInterval(async () => {
      // A check that could not be made carries a failureReason; this loop just asks again.
      const lookup = await wallet.refreshTransactionStatus(hash).catch(() => null);
      const mine = lookup?.value;
      // The row stays PENDING until the merchant charges — only a final status settles.
      const status = mine?.authorizationStatus;
      if (mine && (status === 'APPROVED' || status === 'DECLINED' || status === 'FAILED')) {
        stopTimers();
        setOutcome(
          status === 'APPROVED'
            ? `Paid — ${mine.merchantName}`
            : `Declined — ${mine.merchantName}`
        );
      }
    }, 3000);
  };

  const show = async () => {
    setExpired(false);
    setOutcome(null);
    try {
      // No authentication call: showQrToPay raises the device authentication sheet itself,
      // once per render — so a regenerate after expiry asks again on its own.
      const rendered = await wallet.showQrToPay(Math.round(Number(amount) * 100));
      if (rendered.responseStatus !== 'APPROVED' || !rendered.payload) {
        // No QR was made (NOT_SENT: nothing left the phone). The customer dismissing the sheet is
        // not worth a dialog — they just chose not to pay. Everything else is worth showing.
        const reason = rendered.responseStatusReason;
        if (reason === 'AUTH_CANCELLED') return;
        if (reason === 'DEVICE_NOT_BOUND') {
          Alert.alert(DEVICE_NOT_BOUND_TITLE, DEVICE_NOT_BOUND_MESSAGE);
          return;
        }
        Alert.alert('Cannot show QR', `${rendered.message ?? 'No QR was made'} (${reason ?? rendered.responseStatus})`);
        return;
      }
      setQr(rendered);
      startWatching(rendered);
    } catch (e) {
      // Only a setup mistake rejects.
      Alert.alert('Cannot show QR', (e as VeyraError).message);
    }
  };

  if (!qr) {
    return (
      <View style={styles.container}>
        <Section title="Amount to pay">
          <Field label="Amount (NGN)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Button title="Show payment QR" onPress={show} />
        </Section>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Section title={`Show this to the merchant — ${formatAmount(qr.amountMinorUnits)}`}>
        {outcome ? (
          <Text style={styles.outcome}>{outcome}</Text>
        ) : expired ? (
          <View style={styles.qrArea}>
            {/* Same-size blank: an expired code must never remain scannable. */}
            <View style={styles.expiredTile}>
              <Text style={styles.expiredText}>Code expired</Text>
            </View>
            <Button title="Show a new code" onPress={show} />
          </View>
        ) : (
          <View style={styles.qrArea}>
            <QrTile>
              <QRCode value={qr.payload ?? ''} size={260} />
            </QrTile>
            <Busy
              label={`Waiting for the merchant to scan…${secondsLeft !== null ? ` (${secondsLeft}s)` : ''}`}
            />
          </View>
        )}
        <Button title="Done" onPress={() => navigation.goBack()} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  qrArea: { alignItems: 'center', marginVertical: 12 },
  outcome: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 24,
  },
  expiredTile: {
    width: 292,
    height: 292,
    borderRadius: 12,
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  expiredText: { color: theme.textSecondary },
});
