import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import {
  merchant,
  useGetPaidSession,
  VeyraError,
  type MerchantTapEvent,
  type PaymentContextQr,
  type ScannedCustomerQr,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { Scanner } from '../Scanner';
import { theme } from '../theme';
import { QrTile, Busy, Button, Field, formatAmount, Section } from '../ui';

type Rail = 'idle' | 'tap' | 'mpm' | 'cpmScan' | 'cpmConfirm';

/**
 * The merchant screen. `useGetPaidSession` is the load-bearing line: while this screen
 * is focused the reader can arm; leaving it disarms the device — that is the whole
 * single-Activity mode contract from the app's point of view.
 */
export function GetPaidScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'GetPaid'>): React.JSX.Element {
  useGetPaidSession(useIsFocused());

  const [registered, setRegistered] = useState<boolean | null>(null);
  // Backend status gate: payments are refused unless the merchant is ACTIVE (a
  // merchant with no status yet counts active, matching the native samples).
  const [merchantStatus, setMerchantStatus] = useState<string | null>(null);
  const [amount, setAmount] = useState('1000');
  const [rail, setRail] = useState<Rail>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const [tapSessionId, setTapSessionId] = useState<string | null>(null);
  const [mpmQr, setMpmQr] = useState<PaymentContextQr | null>(null);
  const [mpmState, setMpmState] = useState<string | null>(null);
  const [mpmExpired, setMpmExpired] = useState(false);
  const [cpm, setCpm] = useState<ScannedCustomerQr | null>(null);
  const [lastApprovedRef, setLastApprovedRef] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const active = merchantStatus === null || merchantStatus === 'ACTIVE';

  useFocusEffect(
    useCallback(() => {
      merchant.isRegistered().then(setRegistered).catch(() => setRegistered(false));
      merchant
        .getStored()
        .then((m) => setMerchantStatus(m?.merchantStatus ?? null))
        .catch(() => {});
    }, [])
  );

  // Tap events: transient hints keep the waiting screen up; only `result` is terminal.
  useEffect(() => {
    const sub = merchant.tap.onEvent((e: MerchantTapEvent) => {
      switch (e.type) {
        case 'cardDetected':
          setHint('Card detected — hold steady…');
          break;
        case 'cardContactLost':
          setHint('Hold the card steady against the phone');
          break;
        case 'unsupportedCard':
          setHint('Card not supported — try another card');
          break;
        case 'sendingOnline':
          setHint('Contacting your bank…');
          break;
        case 'ended':
          setRail('idle');
          setHint(null);
          break;
        case 'result':
          setRail('idle');
          setTapSessionId(null);
          setHint(null);
          if (e.result.status === 'APPROVED' && e.result.merchantTransactionReference) {
            setLastApprovedRef(e.result.merchantTransactionReference);
          }
          Alert.alert(
            e.result.status ?? 'Result',
            `${e.result.responseCode ?? ''} ${e.result.message ?? ''}`.trim()
          );
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, []);

  // An expired get-paid QR must stop being shown — it is no longer chargeable.
  useEffect(() => {
    const sub = merchant.onQrExpired(() => {
      setMpmExpired(true);
      setMpmState('EXPIRED');
      if (pollRef.current) clearInterval(pollRef.current);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const minorUnits = Math.round(Number(amount) * 100);

  const requireActive = (): boolean => {
    if (active) return true;
    Alert.alert(
      'Merchant not active',
      `This merchant is ${merchantStatus} — payments are refused. Activate it from Merchant settings.`
    );
    return false;
  };

  const startTap = async () => {
    if (!requireActive()) return;
    try {
      const { sessionId } = await merchant.tap.start({ amountMinorUnits: minorUnits });
      setTapSessionId(sessionId);
      setRail('tap');
      setHint('Ask the customer to tap their phone or card');
    } catch (e) {
      Alert.alert('Cannot start', (e as VeyraError).message);
    }
  };

  const cancelTap = async () => {
    if (tapSessionId) await merchant.tap.cancel(tapSessionId).catch(() => {});
    setRail('idle');
    setHint(null);
  };

  const showMpmQr = async () => {
    if (!requireActive()) return;
    try {
      const qr = await merchant.createPaymentContext(minorUnits);
      setMpmQr(qr);
      setMpmState('PENDING');
      setMpmExpired(false);
      setRail('mpm');
      pollRef.current = setInterval(async () => {
        const status = await merchant.contextStatus(qr.txRef).catch(() => null);
        if (!status) return;
        setMpmState(status.state);
        if (status.state === 'EXPIRED') setMpmExpired(true);
        if (status.isSettled || status.state === 'EXPIRED') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (status.isApproved) setLastApprovedRef(qr.txRef);
          Alert.alert(status.state, status.responseCode ?? '');
        }
      }, 2000);
    } catch (e) {
      Alert.alert('Cannot create QR', (e as VeyraError).message);
    }
  };

  const closeMpm = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    await merchant.cancelQrExpiry().catch(() => {});
    setMpmQr(null);
    setMpmExpired(false);
    setRail('idle');
  };

  const onCpmScan = async (payload: string) => {
    try {
      const scanned = await merchant.inspectCustomerQr(payload);
      setCpm(scanned);
      setRail('cpmConfirm');
    } catch (e) {
      // Not a payment QR: hint and stay armed — the scanner keeps running so the
      // merchant can just aim at the right code (mirror of the native samples).
      Alert.alert('Not a payment QR', (e as VeyraError).message);
    }
  };

  const chargeCpm = async () => {
    if (!cpm) return;
    if (!requireActive()) return;
    setRail('idle');
    try {
      const outcome = await merchant.chargeCustomerQr(cpm.handle);
      if (outcome.approved && outcome.merchantTransactionReference) {
        setLastApprovedRef(outcome.merchantTransactionReference);
      }
      Alert.alert(outcome.approved ? 'Approved' : 'Declined', outcome.responseCode ?? '');
    } catch (e) {
      Alert.alert('Charge failed', (e as VeyraError).message);
    } finally {
      setCpm(null);
    }
  };

  if (registered === null) return <Busy label="Checking registration…" />;
  if (!registered) {
    return (
      <View style={styles.container}>
        <Section title="No merchant yet">
          <Text style={styles.body}>Register a merchant to start accepting payments.</Text>
          <Button title="Register" onPress={() => navigation.navigate('RegisterMerchant')} />
        </Section>
      </View>
    );
  }

  if (rail === 'cpmScan') {
    return <Scanner onCode={onCpmScan} onCancel={() => setRail('idle')} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!active && (
        <View style={styles.inactiveBanner}>
          <Text style={styles.inactiveText}>
            Merchant {merchantStatus} — payments are refused until it is active.
          </Text>
          <Button title="Merchant settings" onPress={() => navigation.navigate('MerchantSettings')} />
        </View>
      )}

      <Section title="Amount">
        <Field label="Amount (NGN)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      </Section>

      {rail === 'idle' && lastApprovedRef && (
        <Section title="Payment approved">
          <Button
            title="Show receipt QR"
            onPress={() => navigation.navigate('MerchantTransactions', { openReceiptFor: lastApprovedRef })}
          />
        </Section>
      )}

      {rail === 'idle' && (
        <Section title="Accept a payment">
          <Button title="Tap to pay (contactless)" onPress={startTap} />
          <Button title="Show payment QR" onPress={showMpmQr} />
          <Button title="Scan customer's payment QR" onPress={() => setRail('cpmScan')} />
        </Section>
      )}

      {rail === 'tap' && (
        <Section title={`Waiting for tap — ${formatAmount(minorUnits)}`}>
          <Busy label={hint ?? 'Ready for tap'} />
          <Button title="Cancel" destructive onPress={cancelTap} />
        </Section>
      )}

      {rail === 'mpm' && mpmQr && (
        <Section title={`Payment QR — ${formatAmount(minorUnits)} (${mpmState})`}>
          <View style={styles.qr}>
            {mpmExpired ? (
              // Same-size placeholder: an expired QR must never remain scannable.
              <View style={styles.expiredTile}>
                <Text style={styles.expiredText}>Code expired</Text>
              </View>
            ) : (
              <QrTile>
                <QRCode value={mpmQr.mpmPayload} size={240} />
              </QrTile>
            )}
          </View>
          {mpmExpired && <Button title="Show a new code" onPress={showMpmQr} />}
          <Button title="Done" onPress={closeMpm} />
        </Section>
      )}

      {rail === 'cpmConfirm' && cpm && (
        <Section title="Confirm charge">
          <Text style={styles.body}>
            {cpm.maskedCard} — {formatAmount(cpm.amountMinorUnits)}
          </Text>
          <Button title="Charge" onPress={chargeCpm} />
          <Button title="Cancel" destructive onPress={() => { setCpm(null); setRail('idle'); }} />
        </Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  scanner: { flex: 1 },
  qr: { alignItems: 'center', marginVertical: 12 },
  body: { color: theme.textPrimary },
  inactiveBanner: {
    backgroundColor: theme.accentRedDark,
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  inactiveText: { color: theme.textPrimary, marginBottom: 6 },
  expiredTile: {
    width: 272,
    height: 272,
    borderRadius: 12,
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  expiredText: { color: theme.textSecondary },
});
