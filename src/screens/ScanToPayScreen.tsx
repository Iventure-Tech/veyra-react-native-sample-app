import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, CameraType } from 'react-native-camera-kit';
import {
  wallet,
  usePaySession,
  VeyraError,
  type ScanInspection,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { Button, formatAmount, Section } from '../ui';

/** Scan a merchant's payment QR: inspect → authenticate (fresh, single-use) → pay. */
export function ScanToPayScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ScanToPay'>): React.JSX.Element {
  usePaySession(useIsFocused());
  const [inspection, setInspection] = useState<Extract<ScanInspection, { verified: true }> | null>(null);
  const [busy, setBusy] = useState(false);

  const onScan = async (payload: string) => {
    if (inspection || busy) return;
    const result = await wallet.inspectScannedQr(payload).catch(() => null);
    if (!result) return;
    if (!result.verified) {
      Alert.alert('QR rejected', `${result.reason}${result.detail ? ` — ${result.detail}` : ''}`);
      return;
    }
    setInspection(result);
  };

  const pay = async () => {
    if (!inspection) return;
    setBusy(true);
    try {
      // Fresh device authentication is required per payment.
      await wallet.authenticateForPayment('Confirm payment');
      const outcome = await wallet.payScannedContext(inspection.handle);
      Alert.alert(outcome.approved ? 'Paid' : 'Declined', outcome.message ?? outcome.responseCode ?? '');
      navigation.goBack();
    } catch (e) {
      const err = e as VeyraError;
      if (err.code === 'AUTH_CANCELLED') {
        setBusy(false);
        return; // user backed out of biometrics — stay on the confirm screen
      }
      Alert.alert('Payment failed', err.message);
      navigation.goBack();
    }
  };

  if (inspection) {
    return (
      <View style={styles.container}>
        <Section title="Confirm payment">
          <Text style={styles.merchant}>{inspection.merchantName}</Text>
          {inspection.merchantCity ? <Text>{inspection.merchantCity}</Text> : null}
          <Text style={styles.amount}>{formatAmount(inspection.amountMinorUnits)}</Text>
          <Button title={busy ? 'Paying…' : 'Pay'} onPress={pay} disabled={busy} />
          <Button title="Cancel" destructive onPress={() => navigation.goBack()} disabled={busy} />
        </Section>
      </View>
    );
  }

  return (
    <Camera
      style={styles.camera}
      cameraType={CameraType.Back}
      scanBarcode
      onReadCode={(event: { nativeEvent: { codeStringValue: string } }) =>
        onScan(event.nativeEvent.codeStringValue)
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  camera: { flex: 1 },
  merchant: { fontSize: 18, fontWeight: '700' },
  amount: { fontSize: 28, fontWeight: '700', marginVertical: 12 },
});
