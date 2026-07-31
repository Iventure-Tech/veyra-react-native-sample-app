import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import {
  merchant,
  type MerchantReceipt,
  type MerchantTransaction,
} from 'veyra-sdk-react-native';
import { Busy, Button, formatAmount, Section } from '../ui';

export function MerchantTransactionsScreen(): React.JSX.Element {
  const [rows, setRows] = useState<MerchantTransaction[] | null>(null);
  const [receipt, setReceipt] = useState<MerchantReceipt | null>(null);

  useFocusEffect(
    useCallback(() => {
      merchant.getTransactions(50).then(setRows).catch(() => setRows([]));
    }, [])
  );

  const showReceipt = async (reference: string) => {
    const r = await merchant.getReceipt(reference).catch(() => null);
    if (r) setReceipt(r);
  };

  if (rows === null) return <Busy label="Loading transactions…" />;

  if (receipt) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Section title={`Receipt — ${receipt.totalAmountFormatted}`}>
          <Text>{receipt.merchantName}</Text>
          <Text style={styles.meta}>{receipt.merchantTransactionReference}</Text>
          <View style={styles.qr}>
            {/* Android supplies a rendered PNG; iOS supplies the payload to render. */}
            {receipt.qrCodeBase64 ? (
              <Image
                style={styles.qrImage}
                source={{ uri: `data:image/png;base64,${receipt.qrCodeBase64}` }}
              />
            ) : receipt.qrPayload ? (
              <QRCode value={receipt.qrPayload} size={240} />
            ) : null}
          </View>
          <Text style={styles.meta}>The customer scans this to store the receipt.</Text>
          <Button title="Back" onPress={() => setReceipt(null)} />
        </Section>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {rows.length === 0 && <Text style={styles.meta}>No transactions yet.</Text>}
      {rows.map((t) => (
        <View key={t.merchantTransactionReference} style={styles.row}>
          <View style={styles.rowTop}>
            <Text style={styles.ref}>{t.rail ?? 'TAP'} · {t.status}</Text>
            <Text style={styles.amount}>{formatAmount(t.amountMinorUnits)}</Text>
          </View>
          <Text style={styles.meta}>{t.transactionTime ?? ''}</Text>
          {t.status === 'APPROVED' && (
            <Button title="Receipt QR" onPress={() => showReceipt(t.merchantTransactionReference)} />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { backgroundColor: 'white', borderRadius: 10, padding: 12, marginVertical: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  ref: { fontWeight: '600' },
  amount: { fontWeight: '700' },
  meta: { color: '#666', fontSize: 12, marginTop: 4 },
  qr: { alignItems: 'center', marginVertical: 12 },
  qrImage: { width: 240, height: 240 },
});
