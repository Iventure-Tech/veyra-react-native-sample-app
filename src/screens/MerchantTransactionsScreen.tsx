import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import type { RootStackParamList } from '../../App';
import {
  merchant,
  VeyraError,
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
  // In-flight state for the manual "check status" ask, and its transient note.
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  // In-flight state for the manual "check merchant credit" ask, and its transient note.
  const [checkingCredit, setCheckingCredit] = useState(false);
  const [creditNote, setCreditNote] = useState<string | null>(null);

  /**
   * Ask now. A resolving answer replaces the row here and in the list, so the button disappears;
   * anything else is "still processing", which is an answer rather than a failure. A failure says
   * why — offline above all — and never changes the row.
   */
  const checkStatus = async (reference: string) => {
    setCheckingStatus(true);
    setStatusNote(null);
    try {
      const fresh = await merchant.refreshTransactionStatus(reference);
      if (fresh) {
        setDetail(fresh);
        setRows(
          (prev) =>
            prev?.map((r) =>
              r.merchantTransactionReference === reference ? fresh : r
            ) ?? prev
        );
      }
      if (!fresh || fresh.status === 'PENDING') {
        setStatusNote('Still processing — the SDK will keep checking.');
      }
    } catch (e) {
      const err = e as VeyraError;
      setStatusNote(
        err.code === 'NO_NETWORK_CONNECTION'
          ? 'No internet connection — connect and try again.'
          : `Could not check right now: ${err.message}`
      );
    } finally {
      setCheckingStatus(false);
    }
  };

  /**
   * Ask the merchant's bank now. A confirming answer replaces the row here and in the list, so the
   * button disappears; anything else is "not confirmed **yet**" and leaves the row alone. A failure
   * says why — offline above all — and never changes the row.
   */
  const checkMerchantCredit = async (reference: string) => {
    setCheckingCredit(true);
    setCreditNote(null);
    try {
      const fresh = await merchant.refreshCreditConfirmation(reference);
      if (fresh) {
        setDetail(fresh);
        setRows(
          (prev) =>
            prev?.map((r) =>
              r.merchantTransactionReference === reference ? fresh : r
            ) ?? prev
        );
      }
      if (fresh?.creditConfirmationStatus !== 'RECEIVED') {
        setCreditNote('Still not confirmed — the SDK will keep checking.');
      }
    } catch (e) {
      const err = e as VeyraError;
      setCreditNote(
        err.code === 'NO_NETWORK_CONNECTION'
          ? 'No internet connection — connect and try again.'
          : `Could not check right now: ${err.message}`
      );
    } finally {
      setCheckingCredit(false);
    }
  };

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
      // Your own order id, echoed back by the gateway. Null on sales that carried none (and on
      // every sale predating it) — the renderer drops null rows, so nothing empty is drawn.
      ['Your order ID', detail.merchantOrderId],
      // Which rail took the payment (Tap / QR / Scan) — the SDK derives the wording, so this
      // reads the same as on Android and iOS. A QR payment must never show as a tap.
      ['Paid via', detail.railLabel],
      ['Amount', formatAmount(detail.amountMinorUnits)],
      ['Status', detail.status],
      ['Response code', detail.responseCode],
      // The outcome's stated cause, verbatim from the backend (e.g. INSUFFICIENT_FUNDS).
      ['Reason', detail.responseStatusReason],
      ['Time', detail.transactionTime],
      ['Transaction id', detail.transactionId],
      ['Card', detail.maskedTokenLast4],
      // The card's display name — a Veyra token shows e.g. "AFRIGO ****1234". Off EMV 5F20 on
      // a tap, off the scanned QR on CPM, and from the gateway on QR-MPM (STORY-93).
      ['Cardholder', detail.cardholderName],
      // Whether the merchant's bank confirmed receiving the funds. Null while unconfirmed
      // (the row is simply omitted) — never shown as "not received".
      ['Merchant credit', detail.creditConfirmationStatus],
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
          {/*
            "Check status" — the manual ask beside the SDK's own background poll. Shown ONLY while
            the row is PENDING; it disappears the moment the payment resolves, because a settled row
            has nothing left to ask and offering the action would imply its outcome might still
            change. It is the only route to an answer once the SDK's 30-day poll gives up.
          */}
          {detail.status === 'PENDING' && (
            <>
              <Button
                title={checkingStatus ? 'Checking the payment status…' : 'Check status'}
                // The SDK has no throttle by design — the screen disables its own button.
                disabled={checkingStatus}
                onPress={() => checkStatus(detail.merchantTransactionReference)}
              />
              {statusNote ? <Text style={styles.meta}>{statusNote}</Text> : null}
            </>
          )}
          {/*
            "Check merchant credit" — the manual ask beside the SDK's own 30-day credit sweep.
            Shown on exactly the predicate the SDK enforces internally: approved, the merchant's
            bank on the confirmation rail, and not already RECEIVED — which deliberately includes a
            row the sweep gave up on and stamped UNABLE_TO_CONFIRM. That give-up means "we stopped
            asking", never "the funds were not received", so it is the row this button matters most
            for; a later RECEIVED replaces it. On an approved row this is the button that applies;
            on a pending one, "Check status" above is.
          */}
          {detail.status === 'APPROVED' &&
            detail.isCreditConfirmationSupported === true &&
            detail.creditConfirmationStatus !== 'RECEIVED' && (
              <>
                <Button
                  title={
                    checkingCredit
                      ? "Checking whether the merchant's bank received the funds…"
                      : 'Check merchant credit'
                  }
                  // The SDK has no throttle by design — the screen disables its own button.
                  disabled={checkingCredit}
                  onPress={() => checkMerchantCredit(detail.merchantTransactionReference)}
                />
                {creditNote ? <Text style={styles.meta}>{creditNote}</Text> : null}
              </>
            )}
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
