import React, { useCallback, useEffect, useRef, useState } from 'react';
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
 *
 * `setActiveCard` is what arms a card for this app run: it is how the SDK learns which card
 * a tap should use and where the tap callbacks are delivered. Storage remembering the card
 * from a previous run is not the same thing, so the screen re-arms the remembered card on
 * every focus rather than only when the user picks a different one.
 *
 * The screen also watches every card still awaiting activation, so one activated out of band
 * (call centre, issuer app) turns tappable here without the user reloading. Those observers
 * poll, so they follow the screen: paused when it blurs, resumed on focus, stopped when it
 * unmounts.
 */
export function PayScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Pay'>): React.JSX.Element {
  const focused = useIsFocused();
  usePaySession(focused);

  const [cards, setCards] = useState<Card[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [tapStatus, setTapStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    wallet.getCards().then(setCards).catch(() => setCards([]));
    wallet.getActiveCard().then((c) => setActiveId(c?.id ?? null)).catch(() => {});
  }, []);

  useFocusEffect(reload);

  // Re-arm the remembered card whenever this screen becomes the payment screen. Runs after
  // usePaySession above, so the pay session setActiveCard requires is already open.
  useEffect(() => {
    if (!focused || !activeId || activeId === armedId) return;
    wallet
      .setActiveCard(activeId)
      .then(() => setArmedId(activeId))
      .catch(() => {});
  }, [focused, activeId, armedId]);

  // A blurred screen is disarmed by the SDK — arm again on the next focus.
  useEffect(() => {
    if (!focused) setArmedId(null);
  }, [focused]);

  // ── Activation observers ────────────────────────────────────────────────────
  // One per card still awaiting activation. Held in a ref (not state) because the
  // pause/resume/stop effects must act on the current set without re-running when it changes.
  const observed = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!cards) return;
    const pending = new Set(
      cards.filter((c) => c.requiresActivation).map((c) => c.tokenUniqueReference ?? c.id)
    );
    for (const ref of observed.current) {
      if (!pending.has(ref)) {
        observed.current.delete(ref);
        wallet.stopActivationObserver(ref).catch(() => {});
      }
    }
    for (const ref of pending) {
      if (observed.current.has(ref)) continue;
      observed.current.add(ref);
      wallet.observeActivation(ref).catch(() => observed.current.delete(ref));
    }
  }, [cards]);

  useEffect(() => {
    const sub = wallet.onActivationEvent((e) => {
      if (!observed.current.has(e.tokenUniqueReference)) return;
      if (e.event === 'activated') {
        observed.current.delete(e.tokenUniqueReference);
        reload(); // the card is tappable now — refresh so it stops rendering as pending
      }
      if (e.event === 'timeout' || e.event === 'error') {
        observed.current.delete(e.tokenUniqueReference);
      }
    });
    return () => sub.remove();
  }, [reload]);

  // Polling follows the screen. The SDK keeps the 5-minute timeout clock running while
  // paused, so a card activated during the pause is still picked up on the next resume.
  useEffect(() => {
    observed.current.forEach((ref) => {
      const call = focused ? wallet.resumeActivationObserver(ref) : wallet.pauseActivationObserver(ref);
      call.catch(() => {});
    });
  }, [focused]);

  useEffect(
    () => () => {
      observed.current.forEach((ref) => {
        wallet.stopActivationObserver(ref).catch(() => {});
      });
      observed.current.clear();
    },
    []
  );

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

  const removeCard = (card: Card) => {
    Alert.alert('Remove this card?', 'The token is deactivated on the backend and removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await wallet.deactivateCard(card.tokenUniqueReference ?? card.id);
            reload();
          } catch (e) {
            Alert.alert('Could not remove card', (e as Error).message);
          }
        },
      },
    ]);
  };

  const selectCard = async (card: Card) => {
    try {
      // Android: arms tap-to-pay for this card (needs the pay session — mounted above).
      await wallet.setActiveCard(card.id);
      setActiveId(card.id);
      setArmedId(card.id);
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
            <Button title="Remove card" destructive onPress={() => removeCard(card)} />
          </View>
        );
      })}

      {tapStatus && <Busy label={tapStatus} />}

      <Section title="Actions">
        <Button title="Add card" onPress={() => navigation.navigate('AddCard')} />
        <Button title="Scan to pay" onPress={() => navigation.navigate('ScanToPay')} />
        <Button title="Receipts" onPress={() => navigation.navigate('WalletReceipts')} />
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
