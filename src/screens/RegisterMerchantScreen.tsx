import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable } from 'react-native';
import { merchant, type Bank, type MerchantType } from 'veyra-sdk-react-native';
import { theme } from '../theme';
import type { RootStackParamList } from '../../App';
import { SAMPLE_ACCOUNT } from '../../veyra.config';
import { Button, Field, Section } from '../ui';

export function RegisterMerchantScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'RegisterMerchant'>): React.JSX.Element {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [pickingBank, setPickingBank] = useState(false);
  const [bankName, setBankName] = useState<string | null>(null);
  const [merchantType, setMerchantType] = useState<MerchantType>('PERSONAL');
  // Prefilled from the onboarding-pack sample data (merchant name = account holder,
  // matching the native samples) — edit veyra.config.ts to change the prefill.
  const [form, setForm] = useState({
    merchantName: SAMPLE_ACCOUNT.accountHolderName,
    emailAddress: SAMPLE_ACCOUNT.emailAddress,
    phoneNumber: SAMPLE_ACCOUNT.mobileNumber,
    addressLine1: SAMPLE_ACCOUNT.addressLine1,
    city: SAMPLE_ACCOUNT.city,
    state: SAMPLE_ACCOUNT.state,
    countryCode: '0566',
    accountNumber: SAMPLE_ACCOUNT.accountNumber,
    institutionCode: SAMPLE_ACCOUNT.institutionCode,
    acquirerId: SAMPLE_ACCOUNT.acquirerId,
    bvn: SAMPLE_ACCOUNT.bvn,
    cacNumber: SAMPLE_ACCOUNT.cacNumber,
  });

  useEffect(() => {
    merchant.getSettlementBanks().then(setBanks).catch(() => {});
  }, []);

  const set = (key: keyof typeof form) => (v: string) => setForm({ ...form, [key]: v });

  const register = async () => {
    try {
      const result = await merchant.register({
        merchantType,
        merchantName: form.merchantName,
        emailAddress: form.emailAddress,
        phoneNumber: form.phoneNumber,
        addressLine1: form.addressLine1,
        city: form.city,
        state: form.state,
        countryCode: form.countryCode,
        accountNumber: form.accountNumber,
        institutionCode: form.institutionCode,
        acquirerId: form.acquirerId,
        bvn: merchantType === 'PERSONAL' ? form.bvn : undefined,
        cacNumber: merchantType === 'BUSINESS' ? form.cacNumber : undefined,
      });
      if (result.success) {
        Alert.alert('Registered', `Merchant ${result.merchantId} (${result.merchantStatus ?? 'PENDING'})`);
        navigation.goBack();
      } else {
        Alert.alert('Registration failed', result.message ?? '');
      }
    } catch (e) {
      Alert.alert('Registration failed', (e as Error).message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Merchant type">
        <Button
          title={merchantType === 'PERSONAL' ? 'Personal ✓' : 'Personal'}
          onPress={() => setMerchantType('PERSONAL')}
        />
        <Button
          title={merchantType === 'BUSINESS' ? 'Business ✓' : 'Business'}
          onPress={() => setMerchantType('BUSINESS')}
        />
      </Section>
      <Section title="Details">
        <Field label="Merchant name" value={form.merchantName} onChangeText={set('merchantName')} />
        <Field label="Email" value={form.emailAddress} onChangeText={set('emailAddress')} keyboardType="email-address" />
        <Field label="Phone" value={form.phoneNumber} onChangeText={set('phoneNumber')} keyboardType="phone-pad" />
        <Field label="Address" value={form.addressLine1} onChangeText={set('addressLine1')} />
        <Field label="City" value={form.city} onChangeText={set('city')} />
        <Field label="State" value={form.state} onChangeText={set('state')} />
        {merchantType === 'PERSONAL' ? (
          <Field label="BVN" value={form.bvn} onChangeText={set('bvn')} keyboardType="numeric" />
        ) : (
          <Field label="CAC number" value={form.cacNumber} onChangeText={set('cacNumber')} />
        )}
      </Section>
      <Section title="Settlement account">
        <Field label="Account number" value={form.accountNumber} onChangeText={set('accountNumber')} keyboardType="numeric" />
        <Button
          title={bankName ? `Bank: ${bankName} (${form.institutionCode})` : `Choose bank (${form.institutionCode || 'not set'})`}
          onPress={() => setPickingBank(true)}
        />
        {pickingBank &&
          banks.map((b) => (
            <Pressable
              key={b.institutionCode}
              style={styles.bankRow}
              onPress={() => {
                setForm({ ...form, institutionCode: b.institutionCode });
                setBankName(b.name);
                setPickingBank(false);
              }}>
              <Text style={styles.bankName}>{b.name}</Text>
              <Text style={styles.bankCode}>{b.institutionCode}</Text>
            </Pressable>
          ))}
        <Field label="Acquirer id" value={form.acquirerId} onChangeText={set('acquirerId')} />
        <Button title="Register" onPress={register} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.bankHairline,
  },
  bankName: { color: theme.textPrimary, flexShrink: 1 },
  bankCode: { color: theme.textSecondary },
});
