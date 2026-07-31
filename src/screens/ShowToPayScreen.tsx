import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { wallet, usePaySession, type PaymentQr } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { Busy, Button, formatAmount, Field, Section } from '../ui';

/** Show a payment QR for the active card (consumer-presented / CPM). */
export function ShowToPayScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ShowToPay'>): React.JSX.Element {
  usePaySession(useIsFocused());
  const [amount, setAmount] = useState('1000');
  const [qr, setQr] = useState<PaymentQr | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const sub = wallet.onQrExpired(() => setExpired(true));
    return () => {
      sub.remove();
      wallet.cancelQrExpiry().catch(() => {});
    };
  }, []);

  const show = async () => {
    setExpired(false);
    try {
      // Fresh device authentication per QR render, like a tap.
      await wallet.authenticateForPayment('Show payment code');
      setQr(await wallet.showQrToPay(Math.round(Number(amount) * 100)));
    } catch (e) {
      Alert.alert('Cannot show QR', (e as Error).message);
    }
  };

  const done = async () => {
    // The row reconciles against the gateway once the merchant has charged it.
    await wallet.reconcilePendingTransactions().catch(() => {});
    navigation.goBack();
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
        {expired ? (
          <>
            <Text style={styles.expired}>This code has expired.</Text>
            <Button title="Show a new code" onPress={show} />
          </>
        ) : (
          <View style={styles.qr}>
            <QRCode value={qr.payload} size={260} />
            <Busy label="Waiting for the merchant to scan…" />
          </View>
        )}
        <Button title="Done" onPress={done} />
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  qr: { alignItems: 'center', marginVertical: 12 },
  expired: { color: '#b3261e', marginVertical: 12, textAlign: 'center' },
});
