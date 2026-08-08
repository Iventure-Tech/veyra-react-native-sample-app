import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  wallet,
  type ActivationMethodInfo,
  type Bank,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { SAMPLE_ACCOUNT } from '../../veyra.config';
import { theme } from '../theme';
import { Busy, Button, Field, FormScrollView, Section } from '../ui';

type Step = 'form' | 'banks' | 'digitising' | 'chooseMethod' | 'enterCode' | 'waiting';

/**
 * Add card: eligibility pre-check → digitise → request activation code → activate
 * (or observe). The bank picker fills the institution code from the issuer list.
 */
export function AddCardScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AddCard'>): React.JSX.Element {
  const [step, setStep] = useState<Step>('form');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankName, setBankName] = useState<string | null>(null);
  const [form, setForm] = useState({ ...SAMPLE_ACCOUNT, walletAccountId: 'wallet-user-1' });
  const [tokenRef, setTokenRef] = useState<string | null>(null);
  const [methods, setMethods] = useState<ActivationMethodInfo[]>([]);
  const [code, setCode] = useState('');
  const observedRef = useRef<string | null>(null);

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

  // The activation observer must not outlive this screen.
  useEffect(
    () => () => {
      if (observedRef.current) {
        wallet.stopActivationObserver(observedRef.current).catch(() => {});
      }
    },
    []
  );

  const pickBank = (bank: Bank) => {
    setForm({ ...form, institutionCode: bank.institutionCode });
    setBankName(bank.name);
    setStep('form');
  };

  const digitise = async () => {
    setStep('digitising');
    try {
      // Eligibility pre-check: a declined account never reaches digitise.
      const eligibility = await wallet.verifyAccount({
        accountNumber: form.accountNumber,
        institutionCode: form.institutionCode,
        walletAccountId: form.walletAccountId,
        accountHolderName: form.accountHolderName,
        accountNumberSource: 'MANUAL',
      });
      if (!eligibility.isApproved) {
        Alert.alert('Account not eligible', eligibility.message ?? eligibility.responseCode ?? 'Declined');
        setStep('form');
        return;
      }

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
        bankName: bankName ?? banks.find((b) => b.institutionCode === form.institutionCode)?.name,
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
      observedRef.current = tokenRef;
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
    <FormScrollView contentContainerStyle={styles.container}>
      {step === 'banks' && (
        <Section title="Choose your bank">
          {banks.length === 0 && <Busy label="Loading banks…" />}
          {banks.map((b) => (
            <Pressable key={b.institutionCode} style={styles.bankRow} onPress={() => pickBank(b)}>
              <Text style={styles.bankName}>{b.name}</Text>
              <Text style={styles.bankCode}>{b.institutionCode}</Text>
            </Pressable>
          ))}
          <Button title="Cancel" destructive onPress={() => setStep('form')} />
        </Section>
      )}

      {step === 'form' && (
        <Section title="Account details">
          <Field label="Account number" value={form.accountNumber} onChangeText={(v) => setForm({ ...form, accountNumber: v })} keyboardType="numeric" />
          <Button
            title={bankName ? `Bank: ${bankName} (${form.institutionCode})` : `Choose bank (${form.institutionCode || 'not set'})`}
            onPress={() => setStep('banks')}
          />
          <Field label="Account holder name" value={form.accountHolderName} onChangeText={(v) => setForm({ ...form, accountHolderName: v })} />
          <Field label="BVN" value={form.bvn} onChangeText={(v) => setForm({ ...form, bvn: v })} keyboardType="numeric" />
          <Field label="Mobile number" value={form.mobileNumber} onChangeText={(v) => setForm({ ...form, mobileNumber: v })} keyboardType="phone-pad" />
          <Field label="Email" value={form.emailAddress} onChangeText={(v) => setForm({ ...form, emailAddress: v })} keyboardType="email-address" />
          <Field label="Address" value={form.accountHolderAddress} onChangeText={(v) => setForm({ ...form, accountHolderAddress: v })} />
          <Button title="Add card" onPress={digitise} />
        </Section>
      )}

      {step === 'digitising' && <Busy label="Checking eligibility and adding your card…" />}

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
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  body: { color: theme.textPrimary },
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
