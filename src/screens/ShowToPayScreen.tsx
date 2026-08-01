import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { wallet, usePaySession, type PaymentQr } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
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
    const sub = wallet.onQrExpired(() => {
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
    // Settle poll: reconcile pending rows, then look up this payment by its hash.
    settleRef.current = setInterval(async () => {
      await wallet.reconcilePendingTransactions().catch(() => {});
      const rows = await wallet
        .getTransactions(rendered.tokenUniqueReference)
        .catch(() => []);
      const mine = rows.find((t) => t.transactionHash === rendered.transactionHash);
      if (mine?.authorizationStatus === 'APPROVED' || mine?.authorizationStatus === 'DECLINED') {
        stopTimers();
        setOutcome(
          mine.authorizationStatus === 'APPROVED'
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
      // Fresh device authentication per QR render, like a tap.
      await wallet.authenticateForPayment('Show payment code');
      const rendered = await wallet.showQrToPay(Math.round(Number(amount) * 100));
      setQr(rendered);
      startWatching(rendered);
    } catch (e) {
      Alert.alert('Cannot show QR', (e as Error).message);
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
              <QRCode value={qr.payload} size={260} />
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
