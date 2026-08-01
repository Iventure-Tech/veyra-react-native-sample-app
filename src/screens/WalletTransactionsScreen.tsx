import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { wallet, type TransactionSummary } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Busy, formatAmount } from '../ui';

export function WalletTransactionsScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'WalletTransactions'>): React.JSX.Element {
  const { tokenUniqueReference } = route.params;
  const [rows, setRows] = useState<TransactionSummary[] | null>(null);

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
          {t.merchantLocation ? <Text style={styles.meta}>{t.merchantLocation}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  merchant: { fontWeight: '600', color: theme.textPrimary },
  amount: { fontWeight: '700', color: theme.textPrimary },
  meta: { color: theme.textSecondary, fontSize: 12, marginTop: 4 },
});
