import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { merchant, type StoredMerchant } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Busy, Button, Field, Section } from '../ui';

/**
 * Merchant settings: profile view + edit (updateMerchant), backend status controls
 * (refresh / activate / deactivate) and clearing the stored merchant — the RN
 * counterpart of the native samples' settings surface.
 */
export function MerchantSettingsScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'MerchantSettings'>): React.JSX.Element {
  const [stored, setStored] = useState<StoredMerchant | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    merchantName: '',
    emailAddress: '',
    phoneNumber: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    countryCode: '',
    accountNumber: '',
    institutionCode: '',
  });

  const reload = useCallback(() => {
    merchant.getStored().then(setStored).catch(() => setStored(null));
  }, []);

  useFocusEffect(reload);

  const startEdit = (m: StoredMerchant) => {
    setForm({
      merchantName: m.merchantName,
      emailAddress: m.emailAddress,
      phoneNumber: m.phoneNumber,
      addressLine1: m.addressLine1,
      addressLine2: m.addressLine2,
      city: m.city,
      state: m.state,
      countryCode: m.countryCode,
      accountNumber: m.accountNumber,
      institutionCode: m.institutionCode,
    });
    setEditing(true);
  };

  const run = async (label: string, op: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await op();
      reload();
      if (done) Alert.alert(done);
    } catch (e) {
      Alert.alert(`${label} failed`, (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const set = (key: keyof typeof form) => (v: string) => setForm({ ...form, [key]: v });

  if (stored === undefined) return <Busy label="Loading merchant…" />;
  if (stored === null) {
    return (
      <View style={styles.container}>
        <Section title="No merchant registered">
          <Button title="Register" onPress={() => navigation.replace('RegisterMerchant')} />
        </Section>
      </View>
    );
  }

  if (editing) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="Edit profile">
          <Field label="Merchant name" value={form.merchantName} onChangeText={set('merchantName')} />
          <Field label="Email" value={form.emailAddress} onChangeText={set('emailAddress')} keyboardType="email-address" />
          <Field label="Phone" value={form.phoneNumber} onChangeText={set('phoneNumber')} keyboardType="phone-pad" />
          <Field label="Address" value={form.addressLine1} onChangeText={set('addressLine1')} />
          <Field label="Address line 2" value={form.addressLine2} onChangeText={set('addressLine2')} />
          <Field label="City" value={form.city} onChangeText={set('city')} />
          <Field label="State" value={form.state} onChangeText={set('state')} />
          <Field label="Settlement account" value={form.accountNumber} onChangeText={set('accountNumber')} keyboardType="numeric" />
          <Field label="Institution code" value={form.institutionCode} onChangeText={set('institutionCode')} keyboardType="numeric" />
          <Button
            title={busy ? 'Saving…' : 'Save changes'}
            disabled={!!busy}
            onPress={() => run('Update', () => merchant.update(form), 'Profile updated').then(() => setEditing(false))}
          />
          <Button title="Cancel" destructive disabled={!!busy} onPress={() => setEditing(false)} />
        </Section>
      </ScrollView>
    );
  }

  const rows: Array<[string, string | null]> = [
    ['Merchant id', stored.merchantId],
    ['Terminal id', stored.terminalId],
    ['Name', stored.merchantName],
    ['Type', stored.merchantType],
    ['Status', stored.merchantStatus ?? 'unknown'],
    ['Email', stored.emailAddress],
    ['Phone', stored.phoneNumber],
    ['Address', `${stored.addressLine1} ${stored.city}`],
    ['Settlement', `${stored.accountNumber} / ${stored.institutionCode}`],
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Merchant profile">
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.k}>{k}</Text>
            <Text style={styles.v}>{v}</Text>
          </View>
        ))}
        <Button title="Edit profile" disabled={!!busy} onPress={() => startEdit(stored)} />
      </Section>
      <Section title="Backend status">
        {busy ? <Busy label={busy} /> : null}
        <Button title="Refresh status" disabled={!!busy} onPress={() => run('Refresh', () => merchant.refreshStatus())} />
        <Button title="Activate" disabled={!!busy} onPress={() => run('Activate', () => merchant.activate())} />
        <Button title="Deactivate" destructive disabled={!!busy} onPress={() => run('Deactivate', () => merchant.deactivate())} />
      </Section>
      <Section title="This device">
        <Button
          title="Clear stored merchant"
          destructive
          disabled={!!busy}
          onPress={() =>
            Alert.alert('Clear stored merchant?', 'Local only — the backend registration is unaffected.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => run('Clear', () => merchant.clearStored()) },
            ])
          }
        />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  k: { color: theme.textSecondary },
  v: { color: theme.textPrimary, flexShrink: 1, textAlign: 'right' },
});
