import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Veyra, { merchant, type VeyraMode } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Button, Section } from '../ui';

/**
 * Home mounts NO session — so by the SDK's inertness guarantee the device is not armed
 * here: not presenting as a card, not reading cards. The mode readout demonstrates it.
 */
export function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Home'>): React.JSX.Element {
  const [mode, setMode] = useState<VeyraMode>('NONE');
  const [registered, setRegistered] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      merchant.isRegistered().then(setRegistered).catch(() => setRegistered(false));
      const poll = setInterval(() => {
        Veyra.currentMode().then(setMode).catch(() => {});
      }, 500);
      return () => clearInterval(poll);
    }, [])
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Get paid (merchant)">
        <Button
          title={registered === false ? 'Set up your merchant' : 'Accept payments'}
          onPress={() => navigation.navigate(registered === false ? 'RegisterMerchant' : 'GetPaid')}
        />
        <Button title="Merchant transactions" onPress={() => navigation.navigate('MerchantTransactions')} />
        <Button title="Merchant settings" onPress={() => navigation.navigate('MerchantSettings')} />
      </Section>
      <Section title="Pay (wallet)">
        <Button title="My cards & pay" onPress={() => navigation.navigate('Pay')} />
      </Section>
      <Text style={styles.mode}>NFC mode: {mode} (read-only — follows your screens)</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  mode: { textAlign: 'center', color: theme.textSecondary, marginTop: 16 },
});
