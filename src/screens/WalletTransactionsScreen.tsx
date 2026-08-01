import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, CameraType } from 'react-native-camera-kit';
import {
  wallet,
  VeyraError,
  type TransactionReceipt,
  type TransactionSummary,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { ReceiptDetail } from './WalletReceiptsScreen';
import { Busy, Button, formatAmount } from '../ui';

/**
 * Wallet history: rows open a transaction detail with its receipt — or a scanner to
 * capture the merchant's receipt QR **bound to this transaction** (the SDK rejects a
 * receipt whose hash doesn't match).
 */
export function WalletTransactionsScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'WalletTransactions'>): React.JSX.Element {
  const { tokenUniqueReference } = route.params;
  const [rows, setRows] = useState<TransactionSummary[] | null>(null);
  const [detail, setDetail] = useState<TransactionSummary | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [scanningFor, setScanningFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Refresh PENDING rows against the backend, then read the local history.
      wallet
        .reconcilePendingTransactions()
        .catch(() => {})
        .then(() => wallet.getTransactions(tokenUniqueReference))
        .then(setRows)
        .catch(() => setRows([]));
    }, [tokenUniqueReference])
  );

  const openReceipt = async (hash: string) => {
    const r = await wallet.getReceiptForTransaction(hash).catch(() => null);
    if (r) setReceipt(r);
    else {
      Alert.alert('No receipt stored', 'Scan the merchant receipt QR to keep one.');
    }
  };

  const onScanReceipt = async (payload: string) => {
    if (busy || !scanningFor) return;
    setBusy(true);
    try {
      // Bound verification: a receipt for any OTHER transaction is rejected.
      const r = await wallet.processReceipt(payload, scanningFor);
      setScanningFor(null);
      setReceipt(r);
    } catch (e) {
      setScanningFor(null);
      Alert.alert('Receipt rejected', (e as VeyraError).message);
    } finally {
      setBusy(false);
    }
  };

  if (scanningFor) {
    return (
      <View style={styles.scanner}>
        <Camera
          style={styles.scanner}
          cameraType={CameraType.Back}
          scanBarcode
          onReadCode={(event: { nativeEvent: { codeStringValue: string } }) =>
            onScanReceipt(event.nativeEvent.codeStringValue)
          }
        />
        <Button title="Cancel" onPress={() => setScanningFor(null)} />
      </View>
    );
  }

  if (receipt) return <ReceiptDetail receipt={receipt} onBack={() => setReceipt(null)} />;

  if (detail) {
    const t = detail;
    const fields: Array<[string, string | null]> = [
      ['Merchant', t.merchantName],
      ['Location', t.merchantLocation],
      ['Amount', formatAmount(t.amountMinorUnits)],
      ['Status', t.authorizationStatus ?? 'PENDING'],
      ['Entry', t.entryMethod],
      ['Time', t.localTransactionDateTime],
      ['Reference', t.merchantTransactionReference],
    ];
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.row}>
          {fields
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <View key={k} style={styles.rowTop}>
                <Text style={styles.meta}>{k}</Text>
                <Text style={styles.merchant}>{v}</Text>
              </View>
            ))}
          {t.transactionHash ? (
            <>
              <Button title="View receipt" onPress={() => openReceipt(t.transactionHash!)} />
              <Button
                title="Scan receipt for this transaction"
                onPress={() => setScanningFor(t.transactionHash!)}
              />
            </>
          ) : null}
          <Button title="Back" destructive onPress={() => setDetail(null)} />
        </View>
      </ScrollView>
    );
  }

  if (rows === null) return <Busy label="Loading transactions…" />;
  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.meta}>No transactions yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {rows.map((t, i) => (
        <View key={t.transactionHash ?? i} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.merchant}>{t.merchantName}</Text>
            <Text style={styles.amount}>{formatAmount(t.amountMinorUnits)}</Text>
          </View>
          <Text style={styles.meta}>
            {t.entryMethod ?? ''} · {t.authorizationStatus ?? 'PENDING'} ·{' '}
            {t.localTransactionDateTime ?? ''}
          </Text>
          <Button title="Details" onPress={() => setDetail(t)} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  scanner: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  merchant: { fontWeight: '600', color: theme.textPrimary, flexShrink: 1, textAlign: 'right' },
  amount: { fontWeight: '700', color: theme.textPrimary },
  meta: { color: theme.textSecondary, fontSize: 12, marginTop: 4 },
});
