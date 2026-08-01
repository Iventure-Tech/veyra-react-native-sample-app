import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  wallet,
  type ActivationMethodInfo,
  type Bank,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { SAMPLE_ACCOUNT } from '../../veyra.config';
import { theme } from '../theme';
import { Busy, Button, Field, Section } from '../ui';

type Step = 'form' | 'digitising' | 'chooseMethod' | 'enterCode' | 'waiting';

/** Add card: digitise → request activation code → activate (or observe). */
export function AddCardScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AddCard'>): React.JSX.Element {
  const [step, setStep] = useState<Step>('form');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [form, setForm] = useState({ ...SAMPLE_ACCOUNT, walletAccountId: 'wallet-user-1' });
  const [tokenRef, setTokenRef] = useState<string | null>(null);
  const [methods, setMethods] = useState<ActivationMethodInfo[]>([]);
  const [code, setCode] = useState('');

  useEffect(() => {
    wallet.getBanks().then(setBanks).catch(() => {});
  }, []);

  useEffect(() => {
    const sub = wallet.onActivationEvent((e) => {
      if (e.tokenUniqueReference !== tokenRef) return;
      if (e.event === 'activated') {
        Alert.alert('Card activated', 'Your card is ready to pay.');
        navigation.goBack();
      }
      if (e.event === 'timeout') setStep('enterCode');
    });
    return () => sub.remove();
  }, [tokenRef, navigation]);

  const digitise = async () => {
    setStep('digitising');
    try {
      const bank = banks.find((b) => b.institutionCode === form.institutionCode);
      const result = await wallet.digitise({
        accountNumber: form.accountNumber,
        institutionCode: form.institutionCode,
        accountHolderName: form.accountHolderName,
        walletAccountId: form.walletAccountId,
        emailAddress: form.emailAddress,
        recommendation: 'APPROVE', // your app's own risk decision — never hardcode in production
        consumerIdentifier: form.walletAccountId,
        bvn: form.bvn,
        accountHolderAddress: form.accountHolderAddress,
        mobileNumber: form.mobileNumber,
        accountNumberSource: 'MANUAL',
        bankName: bank?.name,
      });
      if (!result.isApproved && !result.requiresActivation) {
        Alert.alert('Declined', result.message ?? result.responseCode ?? 'Declined');
        setStep('form');
        return;
      }
      setTokenRef(result.tokenUniqueReference);
      if (result.requiresActivation) {
        setMethods(result.activationMethods);
        setStep('chooseMethod');
      } else {
        Alert.alert('Card added', 'Your card is ready to pay.');
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Add card failed', (e as Error).message);
      setStep('form');
    }
  };

  const requestCode = async (method: ActivationMethodInfo) => {
    if (!tokenRef) return;
    try {
      await wallet.requestActivationCode(tokenRef, method.medium, method.contact);
      await wallet.observeActivation(tokenRef);
      setStep('enterCode');
    } catch (e) {
      Alert.alert('Could not send code', (e as Error).message);
    }
  };

  const activate = async () => {
    if (!tokenRef) return;
    setStep('waiting');
    try {
      const response = await wallet.activate(tokenRef, code);
      if (response.status === 'SUCCESS') {
        Alert.alert('Card activated', 'Your card is ready to pay.');
        navigation.goBack();
      } else {
        Alert.alert('Activation failed', response.message ?? '');
        setStep('enterCode');
      }
    } catch (e) {
      Alert.alert('Activation failed', (e as Error).message);
      setStep('enterCode');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {step === 'form' && (
        <Section title="Account details">
          <Field label="Account number" value={form.accountNumber} onChangeText={(v) => setForm({ ...form, accountNumber: v })} keyboardType="numeric" />
          <Field label="Institution code" value={form.institutionCode} onChangeText={(v) => setForm({ ...form, institutionCode: v })} keyboardType="numeric" />
          <Field label="Account holder name" value={form.accountHolderName} onChangeText={(v) => setForm({ ...form, accountHolderName: v })} />
          <Field label="BVN" value={form.bvn} onChangeText={(v) => setForm({ ...form, bvn: v })} keyboardType="numeric" />
          <Field label="Mobile number" value={form.mobileNumber} onChangeText={(v) => setForm({ ...form, mobileNumber: v })} keyboardType="phone-pad" />
          <Field label="Email" value={form.emailAddress} onChangeText={(v) => setForm({ ...form, emailAddress: v })} keyboardType="email-address" />
          <Field label="Address" value={form.accountHolderAddress} onChangeText={(v) => setForm({ ...form, accountHolderAddress: v })} />
          <Button title="Add card" onPress={digitise} />
        </Section>
      )}

      {step === 'digitising' && <Busy label="Adding your card…" />}

      {step === 'chooseMethod' && (
        <Section title="Verify it's you">
          <Text style={styles.body}>Where should we send your activation code?</Text>
          {methods.map((m) => (
            <Button key={m.medium} title={`${m.medium} ${m.contact ?? ''}`} onPress={() => requestCode(m)} />
          ))}
        </Section>
      )}

      {step === 'enterCode' && (
        <Section title="Enter the activation code">
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="numeric" />
          <Button title="Activate" onPress={activate} />
        </Section>
      )}

      {step === 'waiting' && <Busy label="Activating…" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  body: { color: theme.textPrimary },
});
