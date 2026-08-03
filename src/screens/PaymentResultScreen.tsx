import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import type { RootStackParamList } from '../../App';
import { AUTO_RETURN_MS, type PaymentResultOutcome } from '../paymentResult';
import { theme } from '../theme';
import { Button, formatAmount } from '../ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 120;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LOOK: Record<PaymentResultOutcome, { color: string; glyph: string; word: string }> = {
  approved: { color: theme.successGreen, glyph: '✓', word: 'Approved' },
  declined: { color: theme.errorRed, glyph: '✕', word: 'Declined' },
  pending: { color: theme.warningOrange, glyph: '⏱', word: 'Pending' },
};

/**
 * The single result screen every rail ends on — the RN twin of the native samples'
 * result page. A terminal outcome is a destination, not a notification: it stays up with
 * the amount and reference, offers the receipt, and returns Home by itself after
 * {@link AUTO_RETURN_MS} (Done returns immediately).
 *
 * Auto-return is armed once and disarmed the moment the screen loses focus, so a merchant
 * who steps into the receipt does not get pulled Home when they come back — the same
 * reason the native page cancels its timer whenever it navigates.
 */
export function PaymentResultScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PaymentResult'>): React.JSX.Element {
  const { outcome, title, message, amountMinorUnits, details, receiptFor } = route.params;
  const look = LOOK[outcome];

  const goHome = useCallback(() => navigation.popToTop(), [navigation]);

  // Ring sweep + settle, matching the native 800ms draw-around-the-icon animation.
  const sweep = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(sweep, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: false, // SVG props are not native-driven
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, sweep]);

  const armed = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (!armed.current) return;
      const timer = setTimeout(goHome, AUTO_RETURN_MS);
      return () => {
        clearTimeout(timer);
        armed.current = false; // leaving for any reason (receipt, Done) disarms for good
      };
    }, [goHome])
  );

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Animated.View style={[styles.ring, { transform: [{ scale }] }]}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={look.color}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={sweep.interpolate({
                inputRange: [0, 1],
                outputRange: [RING_CIRCUMFERENCE, 0],
              })}
              // Start the sweep at 12 o'clock like the native circle.
              rotation={-90}
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>
          <View style={styles.glyphHolder} pointerEvents="none">
            <Text style={[styles.glyph, { color: look.color }]}>{look.glyph}</Text>
          </View>
        </Animated.View>

        <Text style={[styles.status, { color: look.color }]}>{look.word}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
          {formatAmount(amountMinorUnits)}
        </Text>

        {!!details?.length && (
          <View style={styles.details}>
            {details.map((line) => (
              <Text key={line} style={styles.detailLine}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {!!receiptFor && (
          <Button
            title="View Receipt"
            onPress={() =>
              navigation.navigate('MerchantTransactions', { openReceiptFor: receiptFor })
            }
          />
        )}
      </View>

      <Button title="Done" onPress={goHome} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  top: { alignItems: 'center', marginTop: 48 },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  glyphHolder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 52, fontWeight: '700' },
  status: { fontSize: 32, fontWeight: '700', marginTop: 24 },
  title: { color: theme.textPrimary, fontSize: 18, marginTop: 8, textAlign: 'center' },
  message: { color: theme.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center' },
  amount: { color: theme.textPrimary, fontSize: 40, fontWeight: '700', marginTop: 24 },
  details: { marginTop: 24, alignItems: 'center' },
  detailLine: { color: theme.textSecondary, fontSize: 13, marginTop: 2, textAlign: 'center' },
});
