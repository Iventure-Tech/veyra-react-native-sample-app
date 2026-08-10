import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  wallet,
  VeyraError,
  type TransactionReceipt,
  type TransactionSummary,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Scanner } from '../Scanner';
import { ReceiptDetail } from './WalletReceiptsScreen';
import { Busy, Button, formatAmount } from '../ui';

/**
 * The merchant-credited line. Only ever rendered with `isCreditConfirmationSupported === true`,
 * so a null status means "no answer yet" — the in-flight state — and never "not received". The
 * 30-day give-up says "could not confirm" for exactly the same reason.
 */
function creditText(status: string | null): string {
  if (status === 'RECEIVED') return "Merchant's bank has received the funds";
  if (status === 'UNABLE_TO_CONFIRM') return "Could not confirm the merchant's bank received the funds";
  return "Confirming the merchant's bank has received the funds…";
}

function creditColor(status: string | null): { color: string } {
  if (status === 'RECEIVED') return { color: '#4CAF50' };
  if (status === 'UNABLE_TO_CONFIRM') return { color: theme.textSecondary };
  return { color: '#FFA726' };
}

/** The bank's own description of the credit — present on RECEIVED only. */
function creditDetail(t: TransactionSummary): string | null {
  const parts = [
    t.creditedAt,
    t.bankReference ? `Bank reference: ${t.bankReference}` : null,
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(' · ') : null;
}

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

  // The merchant-credit answer can land while the detail view is open. This is a **store read**
  // on a timer, not a poll: the SDK owns the asking (app-scoped, exponential backoff, up to 30
  // days) and keeps going whether or not this screen exists — so clearing the interval when the
  // detail closes ends a UI refresh and never a wait. Stops once the answer is terminal.
  useEffect(() => {
    if (!detail || detail.isCreditConfirmationSupported !== true) return;
    if (detail.creditConfirmationStatus !== null) return;
    const hash = detail.transactionHash;
    if (!hash) return;
    const id = setInterval(() => {
      wallet
        .getTransactions(tokenUniqueReference)
        .then((fresh) => {
          const match = fresh.find((r) => r.transactionHash === hash);
          if (match) {
            setRows(fresh);
            setDetail(match);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [detail, tokenUniqueReference]);

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
    return <Scanner onCode={onScanReceipt} onCancel={() => setScanningFor(null)} />;
  }

  if (receipt) return <ReceiptDetail receipt={receipt} onBack={() => setReceipt(null)} />;

  if (detail) {
    const t = detail;
    const fields: Array<[string, string | null]> = [
      ['Merchant', t.merchantName],
      ['Location', t.merchantLocation],
      ['Amount', formatAmount(t.amountMinorUnits)],
      ['Status', t.authorizationStatus ?? 'PENDING'],
      // The outcome's stated cause + code, verbatim from the backend; unresolved/legacy rows
      // carry neither and the rows render empty rather than a guess.
      ['Reason', t.responseStatusReason],
      ['Response code', t.responseCode],
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
          {/*
            The merchant-credited indicator. `isCreditConfirmationSupported` is the whole gate:
            false/null means the rail does not exist for this payment, so nothing is rendered at
            all — absence means "we cannot ask", never "the merchant was not paid". A null status
            with the flag true is the in-flight state, which is why the give-up wording is "could
            not confirm" rather than anything stronger.
          */}
          {t.isCreditConfirmationSupported === true ? (
            <View style={styles.creditBlock}>
              <Text style={[styles.credit, creditColor(t.creditConfirmationStatus)]}>
                {creditText(t.creditConfirmationStatus)}
              </Text>
              {creditDetail(t) ? <Text style={styles.meta}>{creditDetail(t)}</Text> : null}
            </View>
          ) : null}
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
  creditBlock: { marginTop: 8 },
  credit: { fontSize: 13 },
});
