import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  wallet,
  usePaySession,
  type Card,
  type WalletTapEvent,
} from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import { theme } from '../theme';
import { Busy, Button, formatAmount, Section } from '../ui';

/**
 * The wallet screen. `usePaySession` keeps tap-to-pay armed only while this screen is
 * focused; selecting a card (Android) arms it for tapping. Cards with
 * `requiresOnline` are greyed out — the SDK restores them by itself.
 */
export function PayScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Pay'>): React.JSX.Element {
  const focused = useIsFocused();
  usePaySession(focused);

  const [cards, setCards] = useState<Card[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tapStatus, setTapStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    wallet.getCards().then(setCards).catch(() => setCards([]));
    wallet.getActiveCard().then((c) => setActiveId(c?.id ?? null)).catch(() => {});
  }, []);

  useFocusEffect(reload);

  useEffect(() => {
    const sub = wallet.onTapEvent((e: WalletTapEvent) => {
      if (e.type === 'transactionStarted') setTapStatus('Paying…');
      if (e.type === 'transactionCompleted') {
        setTapStatus(null);
        Alert.alert(e.status, `${e.message ?? ''} ${e.amountMinorUnits ? formatAmount(e.amountMinorUnits) : ''}`.trim());
      }
      if (e.type === 'activationFailed') {
        setTapStatus(null);
        Alert.alert('Card unavailable', e.message);
      }
    });
    return () => sub.remove();
  }, []);

  const selectCard = async (card: Card) => {
    try {
      // Android: arms tap-to-pay for this card (needs the pay session — mounted above).
      await wallet.setActiveCard(card.id);
      setActiveId(card.id);
    } catch (e) {
      Alert.alert('Cannot select card', (e as Error).message);
    }
  };

  if (cards === null) return <Busy label="Loading cards…" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {cards.length === 0 && (
        <Section title="No cards yet">
          <Text style={styles.body}>Add your bank account as a contactless card.</Text>
        </Section>
      )}
      {cards.map((card) => {
        const active = card.id === activeId;
        const blocked = card.requiresOnline || !card.isActive || card.requiresActivation;
        return (
          <View key={card.id} style={[styles.card, blocked && styles.cardBlocked, active && styles.cardActive]}>
            <Text style={styles.cardPan}>{card.maskedPan}</Text>
            <Text style={styles.cardMeta}>
              {card.cardHolderName ?? ''} {card.expiry ? `· ${card.expiry}` : ''}
            </Text>
            {card.requiresActivation && <Text style={styles.cardNote}>Needs activation</Text>}
            {card.requiresOnline && <Text style={styles.cardNote}>Go online to pay</Text>}
            {!card.isActive && !card.requiresActivation && <Text style={styles.cardNote}>{card.status ?? 'Inactive'}</Text>}
            {!blocked && !active && <Button title="Use for tap" onPress={() => selectCard(card)} />}
            {active && <Text style={styles.cardNote}>Ready to tap ✓</Text>}
            <Button
              title="Transactions"
              onPress={() =>
                navigation.navigate('WalletTransactions', {
                  tokenUniqueReference: card.tokenUniqueReference ?? card.id,
                })
              }
            />
            {!blocked && (
              <Button title="Show QR to pay" onPress={() => navigation.navigate('ShowToPay', { cardId: card.id })} />
            )}
          </View>
        );
      })}

      {tapStatus && <Busy label={tapStatus} />}

      <Section title="Actions">
        <Button title="Add card" onPress={() => navigation.navigate('AddCard')} />
        <Button title="Scan to pay" onPress={() => navigation.navigate('ScanToPay')} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  card: {
    backgroundColor: theme.bankCardRed,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  cardActive: { borderWidth: 2, borderColor: theme.successGreen },
  cardBlocked: { opacity: 0.5 },
  cardPan: { color: theme.textPrimary, fontSize: 18, letterSpacing: 2 },
  cardMeta: { color: theme.textSecondary, marginTop: 4, marginBottom: 8 },
  cardNote: { color: theme.warningOrange, marginBottom: 6 },
  body: { color: theme.textSecondary },
});
