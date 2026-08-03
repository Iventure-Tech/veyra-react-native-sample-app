import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import type { RootStackParamList } from '../../App';
import {
  merchant,
  type MerchantReceipt,
  type MerchantTransaction,
} from 'veyra-sdk-react-native';
import { theme } from '../theme';
import { QrTile, Busy, Button, formatAmount, Section } from '../ui';

export function MerchantTransactionsScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'MerchantTransactions'>): React.JSX.Element {
  const [rows, setRows] = useState<MerchantTransaction[] | null>(null);
  const [detail, setDetail] = useState<MerchantTransaction | null>(null);
  const [receipt, setReceipt] = useState<MerchantReceipt | null>(null);

  const openReceiptFor = route.params?.openReceiptFor;

  useFocusEffect(
    useCallback(() => {
      merchant.getTransactions(50).then(setRows).catch(() => setRows([]));
      if (openReceiptFor) showReceipt(openReceiptFor);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openReceiptFor])
  );

  const showReceipt = async (reference: string) => {
    const r = await merchant.getReceipt(reference).catch(() => null);
    if (r) setReceipt(r);
  };

  if (detail) {
    const fields: Array<[string, string | null]> = [
      ['Reference', detail.merchantTransactionReference],
      // Which rail took the payment (Tap / QR / Scan) — the SDK derives the wording, so this
      // reads the same as on Android and iOS. A QR payment must never show as a tap.
      ['Paid via', detail.railLabel],
      ['Amount', formatAmount(detail.amountMinorUnits)],
      ['Status', detail.status],
      ['Response code', detail.responseCode],
      ['Time', detail.transactionTime],
      ['Transaction id', detail.transactionId],
      ['Card', detail.maskedTokenLast4],
      // EMV tag 5F20 as the card presented it — a Veyra token shows its display name,
      // e.g. "AFRIGO ****1234". Null on QR-MPM, where the merchant never reads the card.
      ['Cardholder', detail.cardholderName],
    ];
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.row}>
          {fields
            .filter(([, v]) => !!v)
            .map(([k, v]) => (
              <View key={k} style={styles.rowTop}>
                <Text style={styles.meta}>{k}</Text>
                <Text style={styles.ref}>{v}</Text>
              </View>
            ))}
          {detail.status === 'APPROVED' && (
            <Button title="Receipt QR" onPress={() => { showReceipt(detail.merchantTransactionReference); setDetail(null); }} />
          )}
          <Button title="Back" destructive onPress={() => setDetail(null)} />
        </View>
      </ScrollView>
    );
  }

  if (rows === null) return <Busy label="Loading transactions…" />;

  if (receipt) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Section title={`Receipt — ${receipt.totalAmountFormatted}`}>
          <Text style={styles.ref}>{receipt.merchantName}</Text>
          <Text style={styles.meta}>{receipt.merchantTransactionReference}</Text>
          {/* The paying card as it presented itself (EMV 5F20) — merchant's copy only. */}
          {!!receipt.cardholderName && (
            <Text style={styles.meta}>{receipt.cardholderName}</Text>
          )}
          <View style={styles.qr}>
            {/* Android supplies a rendered PNG; iOS supplies the payload to render. */}
            {receipt.qrCodeBase64 ? (
              <Image
                style={styles.qrImage}
                source={{ uri: `data:image/png;base64,${receipt.qrCodeBase64}` }}
              />
            ) : receipt.qrPayload ? (
              <QrTile>
                <QRCode value={receipt.qrPayload} size={240} />
              </QrTile>
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
            <Text style={styles.ref}>{t.railLabel} · {t.status}</Text>
            <Text style={styles.amount}>{formatAmount(t.amountMinorUnits)}</Text>
          </View>
          <Text style={styles.meta}>{t.transactionTime ?? ''}</Text>
          <Button title="Details" onPress={() => setDetail(t)} />
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
  row: {
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  ref: { fontWeight: '600', color: theme.textPrimary },
  amount: { fontWeight: '700', color: theme.textPrimary },
  meta: { color: theme.textSecondary, fontSize: 12, marginTop: 4 },
  qr: { alignItems: 'center', marginVertical: 12 },
  qrImage: { width: 240, height: 240 },
});
