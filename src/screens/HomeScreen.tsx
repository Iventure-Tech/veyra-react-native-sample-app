import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Veyra, { merchant, type VeyraMode } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { useSession } from '../session';
import { theme } from '../theme';
import { Button, Section } from '../ui';

/**
 * Home mounts NO session — so by the SDK's inertness guarantee the device is not armed
 * here: not presenting as a card, not reading cards. The mode readout demonstrates it.
 *
 * The customer bar shows who the app has signed in to the SDK, and switches or signs out.
 * While signed out, Pay / Get paid / merchant settings are disabled — every SDK call would
 * reject with NOT_SIGNED_IN until the app initialises with a customer again.
 */
export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>): React.JSX.Element {
  const { session, busy, signIn, switchCustomer, signOut } = useSession();
  const { signedIn, customerId } = session;
  const [mode, setMode] = useState<VeyraMode>('NONE');
  const [registered, setRegistered] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!signedIn) {
        setRegistered(null);
        setMode('NONE'); // signed out: the SDK has stopped everything
        return;
      }
      // Re-read on every customer change: each customer has their own merchant.
      merchant.isRegistered().then(setRegistered).catch(() => setRegistered(false));
      const poll = setInterval(() => {
        Veyra.currentMode().then(setMode).catch(() => {});
      }, 500);
      return () => clearInterval(poll);
    }, [signedIn, customerId])
  );

  const act = (label: string, op: () => Promise<void>) => () =>
    op().catch((e: Error) => Alert.alert(`${label} failed`, e.message));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title={signedIn ? `Signed in as ${customerId}` : 'Signed out'}>
        {signedIn ? (
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button title="Switch" disabled={busy} onPress={act('Switch', switchCustomer)} />
            </View>
            <View style={styles.cell}>
              <Button title="Sign out" destructive disabled={busy} onPress={act('Sign out', signOut)} />
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>Sign in to use the wallet and get paid</Text>
            <Button title="Sign in" disabled={busy} onPress={act('Sign in', signIn)} />
          </>
        )}
      </Section>
      <Section title="Get paid (merchant)">
        <Button
          title={registered === false ? 'Set up your merchant' : 'Accept payments'}
          disabled={!signedIn}
          onPress={() => navigation.navigate(registered === false ? 'RegisterMerchant' : 'GetPaid')}
        />
        <Button
          title="Merchant transactions"
          disabled={!signedIn}
          onPress={() => navigation.navigate('MerchantTransactions')}
        />
        <Button
          title="Merchant settings"
          disabled={!signedIn}
          onPress={() => navigation.navigate('MerchantSettings')}
        />
      </Section>
      <Section title="Pay (wallet)">
        <Button title="My cards & pay" disabled={!signedIn} onPress={() => navigation.navigate('Pay')} />
      </Section>
      <Text style={styles.mode}>NFC mode: {mode} (read-only — follows your screens)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1 },
  hint: { color: theme.textSecondary, marginBottom: 4 },
  mode: { textAlign: 'center', color: theme.textSecondary, marginTop: 16 },
});
