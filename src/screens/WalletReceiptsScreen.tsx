import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { wallet, VeyraError, type TransactionReceipt } from 'veyra-sdk-react-native';
import { theme } from '../theme';
import { Busy, Button, Section } from '../ui';

/**
 * Wallet receipts: scan a merchant's receipt QR (verified + stored by the SDK) and
 * browse the stored receipts.
 */
export function WalletReceiptsScreen(): React.JSX.Element {
  const [receipts, setReceipts] = useState<TransactionReceipt[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detail, setDetail] = useState<TransactionReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      wallet.getReceipts().then(setReceipts).catch(() => setReceipts([]));
    }, [])
  );

  const onScan = async (payload: string) => {
    if (busy) return;
    setBusy(true);
    try {
      // Verifies the receipt's signature and stores it (cross-checked against the
      // matching wallet transaction when one exists).
      const receipt = await wallet.processReceipt(payload);
      setScanning(false);
      setDetail(receipt);
      setReceipts(await wallet.getReceipts().catch(() => receipts ?? []));
    } catch (e) {
      setScanning(false);
      Alert.alert('Receipt rejected', (e as VeyraError).message);
    } finally {
      setBusy(false);
    }
  };

  if (scanning) {
    return (
      <View style={styles.scanner}>
        <Camera
          style={styles.scanner}
          cameraType={CameraType.Back}
          scanBarcode
          onReadCode={(event: { nativeEvent: { codeStringValue: string } }) =>
            onScan(event.nativeEvent.codeStringValue)
          }
        />
        <Button title="Cancel" onPress={() => setScanning(false)} />
      </View>
    );
  }

  if (detail) return <ReceiptDetail receipt={detail} onBack={() => setDetail(null)} />;
  if (receipts === null) return <Busy label="Loading receipts…" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Merchant receipts">
        <Text style={styles.body}>
          Scan the receipt QR on the merchant's device to verify and keep it.
        </Text>
        <Button title="Scan a receipt" onPress={() => setScanning(true)} />
      </Section>
      {receipts.length === 0 && <Text style={styles.body}>No receipts stored yet.</Text>}
      {receipts.map((r, i) => (
        <View key={r.transactionHash ?? i} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.name}>{r.merchantName}</Text>
            <Text style={styles.amount}>{r.totalAmountFormatted}</Text>
          </View>
          <Text style={styles.meta}>
            {r.transactionStatus} · {r.transactionTime}
          </Text>
          <Button title="View" onPress={() => setDetail(r)} />
        </View>
      ))}
    </ScrollView>
  );
}

export function ReceiptDetail(props: {
  receipt: TransactionReceipt;
  onBack: () => void;
}): React.JSX.Element {
  const r = props.receipt;
  const rows: Array<[string, string | null]> = [
    ['Merchant', r.merchantName],
    ['Address', r.merchantAddress],
    ['Amount', r.totalAmountFormatted],
    ['Type', r.transactionType],
    ['Status', r.transactionStatus],
    ['Time', r.transactionTime],
    ['Card', r.maskedToken],
    ['Reference', r.merchantTransactionReference],
  ];
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Receipt">
        {rows
          .filter(([, v]) => !!v)
          .map(([k, v]) => (
            <View key={k} style={styles.rowTop}>
              <Text style={styles.meta}>{k}</Text>
              <Text style={styles.name}>{v}</Text>
            </View>
          ))}
        <Button title="Back" onPress={props.onBack} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  scanner: { flex: 1 },
  body: { color: theme.textSecondary, marginBottom: 8 },
  row: {
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  name: { fontWeight: '600', color: theme.textPrimary, flexShrink: 1, textAlign: 'right' },
  amount: { fontWeight: '700', color: theme.textPrimary },
  meta: { color: theme.textSecondary, fontSize: 12, marginTop: 2 },
});
