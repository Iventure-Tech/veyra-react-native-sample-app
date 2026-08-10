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
 * Is this row still awaiting an outcome? A status this build does not recognise is open too — the
 * SDK carries unknown values raw, and an unresolved row must not read as settled just because we
 * cannot name its status. `null`/absent means the backend stated nothing, which is also open.
 */
function isOpen(t: TransactionSummary | null | undefined): boolean {
  const stated = (t?.authorizationStatus ?? '').trim().toUpperCase();
  return !['APPROVED', 'DECLINED', 'FAILED'].includes(stated);
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
  const checkStatus = async (transactionHash: string) => {
    setCheckingStatus(true);
    setStatusNote(null);
    try {
      const fresh = await wallet.refreshTransactionStatus(transactionHash);
      if (fresh) {
        setDetail(fresh);
        setRows(
          (prev) =>
            prev?.map((r) => (r.transactionHash === transactionHash ? fresh : r)) ?? prev
        );
      }
      if (isOpen(fresh)) {
        setStatusNote('Still processing — the wallet will keep checking.');
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
  const checkMerchantCredit = async (transactionHash: string) => {
    setCheckingCredit(true);
    setCreditNote(null);
    try {
      const fresh = await wallet.refreshCreditConfirmation(transactionHash);
      if (fresh) {
        setDetail(fresh);
        setRows(
          (prev) =>
            prev?.map((r) => (r.transactionHash === transactionHash ? fresh : r)) ?? prev
        );
      }
      if (fresh?.creditConfirmationStatus !== 'RECEIVED') {
        setCreditNote('Still not confirmed — the wallet will keep checking.');
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
              {/*
                "Check merchant credit" — the manual ask beside the SDK's own 30-day credit sweep.
                Shown on exactly the predicate the SDK enforces internally: approved, the
                merchant's bank on the confirmation rail, and not already RECEIVED — which
                deliberately includes a row the sweep gave up on and stamped UNABLE_TO_CONFIRM.
                That give-up means "we stopped asking", never "the merchant was not paid", so it is
                the row this button matters most for; a later RECEIVED replaces it.
              */}
              {t.authorizationStatus === 'APPROVED' &&
              t.creditConfirmationStatus !== 'RECEIVED' &&
              t.transactionHash ? (
                <>
                  <Button
                    title={
                      checkingCredit
                        ? "Checking whether the merchant's bank received the funds…"
                        : 'Check merchant credit'
                    }
                    // The SDK has no throttle by design — the screen disables its own button.
                    disabled={checkingCredit}
                    onPress={() => checkMerchantCredit(t.transactionHash!)}
                  />
                  {creditNote ? <Text style={styles.meta}>{creditNote}</Text> : null}
                </>
              ) : null}
            </View>
          ) : null}
          {/*
            "Check status" — the manual ask beside the SDK's own background poll. Shown ONLY while
            the row is still open; it disappears the moment the payment resolves, because a settled
            row has nothing left to ask and offering the action would imply its outcome might still
            change. It is the only route to an answer once the SDK's 30-day poll gives up.
          */}
          {isOpen(t) && t.transactionHash ? (
            <>
              <Button
                title={checkingStatus ? 'Checking the payment status…' : 'Check status'}
                // The SDK has no throttle by design — the screen disables its own button.
                disabled={checkingStatus}
                onPress={() => checkStatus(t.transactionHash!)}
              />
              {statusNote ? <Text style={styles.meta}>{statusNote}</Text> : null}
            </>
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
