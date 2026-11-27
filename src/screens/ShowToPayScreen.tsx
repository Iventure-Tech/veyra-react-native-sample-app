import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { wallet, usePaySession, type PaymentQr, type VeyraError } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import {
  ACCEPTED_WALLET_MESSAGE,
  CHARGED_PENDING_WALLET_MESSAGE,
  DEVICE_NOT_BOUND_MESSAGE,
  DEVICE_NOT_BOUND_TITLE,
} from '../paymentResult';
import { QR_ROW_WATCH_MS, shownQrState } from '../qrRowStates';
import { theme } from '../theme';
import { QrTile, Busy, Button, formatAmount, Field, Section } from '../ui';

/**
 * Show a payment QR for the active card (consumer-presented / CPM). While the code is up, the
 * screen watches the payment's stored row, so the payer sees it charged, then Paid/Declined,
 * without leaving. The SDK does the asking; this screen sends nothing. An expired code blanks
 * (never scannable) with a renewal action.
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

  // Leaving the screen stops the QR's expiry timer and drops its onExpired callback.
  useEffect(
    () => () => {
      stopTimers();
      wallet.cancelQrExpiry().catch(() => {});
    },
    []
  );

  const startWatching = (rendered: PaymentQr) => {
    stopTimers();
    // Countdown to expiry.
    tickRef.current = setInterval(() => {
      const left = Math.max(0, Math.round((rendered.expiresAtEpochMillis - Date.now()) / 1000));
      setSecondsLeft(left);
    }, 1000);
    // Watch THIS payment's stored row while the code is up. The SDK checks the payment with the
    // gateway by itself, as often as the gateway asks it to, and keeps the row up to date; this
    // timer reads the phone's own store and sends nothing. The hash is unique per render, so only
    // the row for this QR can move the display.
    const hash = rendered.transactionHash;
    const token = rendered.tokenUniqueReference;
    if (!hash || !token) return;
    // The code is used once a merchant has charged it: take it down while the wait goes on.
    const takeQrDown = (message: string) => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      wallet.cancelQrExpiry().catch(() => {});
      setOutcome(message);
    };
    settleRef.current = setInterval(async () => {
      // A local read. The newest rows are enough: this payment was recorded moments ago.
      const rows = await wallet.getTransactions(token, 20).catch(() => null);
      const mine = rows?.find((r) => r.transactionHash?.toLowerCase() === hash.toLowerCase());
      if (!mine) return;
      switch (shownQrState(mine)) {
        case 'WAITING':
          // Not charged yet: the QR stays up to be scanned.
          return;
        case 'CHARGED_PENDING':
          // The merchant's charge has reached the gateway and has no outcome yet.
          takeQrDown(CHARGED_PENDING_WALLET_MESSAGE);
          return;
        case 'ACCEPTED':
          // Debited, credit queued. Not final: keep watching until the final status.
          takeQrDown(ACCEPTED_WALLET_MESSAGE);
          return;
        case 'FINAL':
          stopTimers();
          wallet.cancelQrExpiry().catch(() => {});
          setOutcome(
            mine.authorizationStatus === 'APPROVED'
              ? `Paid — ${mine.merchantName}`
              : `Declined — ${mine.merchantName}`
          );
      }
    }, QR_ROW_WATCH_MS);
  };

  const show = async () => {
    setExpired(false);
    setOutcome(null);
    try {
      // No authentication call: showQrToPay raises the device authentication sheet itself,
      // once per render — so a regenerate after expiry asks again on its own. onExpired fires once,
      // for this QR only; a new render replaces it.
      const rendered = await wallet.showQrToPay(Math.round(Number(amount) * 100), () => {
        // The row watch keeps running: a merchant who charged the code just before it expired
        // still shows as a pending payment when the row says so.
        setExpired(true);
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
      });
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
