import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle } from 'react-native-svg';
import { softpos } from 'veyra-sdk-react-native';
import type { RootStackParamList } from '../../App';
import {
  AUTO_RETURN_MS,
  resolutionOf,
  type PaymentResolution,
  type PaymentResultOutcome,
} from '../paymentResult';
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
  // The customer was debited and the credit to the merchant's bank is queued. Not final.
  accepted: { color: theme.warningOrange, glyph: '⏱', word: 'Accepted' },
  // Never reached the gateway: nothing was charged, and a retry reuses the same order id.
  not_sent: { color: theme.warningOrange, glyph: '↻', word: 'Not sent' },
};

/**
 * The single result screen every rail ends on — the RN twin of the native samples'
 * result page. A terminal outcome is a destination, not a notification: it stays up with
 * the amount and reference, offers the receipt, and returns Home by itself after
 * {@link AUTO_RETURN_MS} (Done returns immediately). That hold is the default for EVERY
 * terminal outcome — approved, declined, failed.
 *
 * The single exception: while the sale is waiting on the merchant bank's credit confirmation
 * the hold is cancelled outright — the screen must not disappear mid-wait — and a fresh hold
 * starts the moment the confirmation is displayed. Dismissing is an app concern only: the
 * SDK's credit poll is app-scoped and keeps running whatever this screen does.
 *
 * An `ACCEPTED` sale holds the same way: the customer was debited and the credit is queued, so
 * the merchant is told to wait for the approval before releasing goods and the screen stays up
 * until the final status arrives. It then shows that status in place, with the receipt and the
 * credit confirmation an approval brings, and starts a fresh hold.
 *
 * Auto-return is armed once and disarmed the moment the screen loses focus, so a merchant
 * who steps into the receipt does not get pulled Home when they come back — the same
 * reason the native page cancels its timer whenever it navigates.
 */
export function PaymentResultScreen({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PaymentResult'>): React.JSX.Element {
  const {
    outcome,
    title,
    message,
    amountMinorUnits,
    details,
    receiptFor,
    resolvesFor,
    creditConfirmation: creditConfirmationParam,
  } = route.params;

  // A PENDING or ACCEPTED sale is not an answer yet: the SDK keeps polling it and pushes each
  // change on `observeTransactionResolved`: once with ACCEPTED (not final, keep waiting) and
  // again with the final status. The event is a notification, never the source of truth. It
  // does not replay, so the stored row is read once on mount for the answer that landed before
  // this screen opened. Both halves stay; neither is redundant.
  const [resolved, setResolved] = useState<PaymentResolution | null>(null);
  useEffect(() => {
    if (!resolvesFor) return;
    let cancelled = false;
    // A status with nothing new to show (still PENDING, or unknown) leaves the screen as it is.
    const show = (status: string | null | undefined, reason: string | null | undefined) => {
      const next = resolutionOf(status, reason);
      if (next) setResolved(next);
    };
    softpos
      .getTransaction(resolvesFor)
      .then((row) => {
        if (!cancelled) show(row?.status, row?.responseStatusReason);
      })
      .catch(() => {});
    const sub = softpos.observeTransactionResolved((e) => {
      if (e.merchantTransactionReference === resolvesFor) show(e.status, e.reason);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [resolvesFor]);

  // What the screen shows now: the outcome it opened with, or where the waited-on sale has got to.
  const shownOutcome = resolved?.outcome ?? outcome;
  const look = LOOK[shownOutcome];
  // Accepted is not final: hold the screen, and offer no receipt and no credit confirmation.
  const awaitingApproval = shownOutcome === 'accepted';
  // A waited-on sale that ended approved or refused is recorded, so its receipt can be shown.
  const shownReceiptFor =
    receiptFor ??
    (resolved?.final && resolved.outcome !== 'not_sent' ? resolvesFor : undefined);
  // An approval that arrived here may wait on credit confirmation too. Nothing on the event says
  // whether the merchant's bank supports it, so watch the SDK's stored row (`supported: null`).
  const resolvedApproved = resolved?.outcome === 'approved';
  const creditConfirmation = useMemo(
    () =>
      creditConfirmationParam ??
      (resolvedApproved && resolvesFor
        ? { reference: resolvesFor, creditTransactionId: null, supported: null }
        : undefined),
    [creditConfirmationParam, resolvedApproved, resolvesFor]
  );

  // Beneficiary credit confirmation: an approved sale whose merchant bank supports it shows a
  // waiting line here and flips it when the SDK's background poll confirms the funds landed
  // ('received'), or on the final 30-day give-up ('unable') — never on a mid-window miss.
  const [creditState, setCreditState] = useState<'waiting' | 'received' | 'unable' | null>(
    creditConfirmation?.supported === true ? 'waiting' : null
  );

  // The SDK owns the polling; the screen just reacts. Match the event to this sale by
  // reference (or credit id) — the SDK-wide event can fire for a sale from an earlier session.
  useEffect(() => {
    if (!creditConfirmation) return;
    const sub = softpos.observeCreditConfirmation((e) => {
      const matches =
        e.merchantTransactionReference === creditConfirmation.reference ||
        (!!creditConfirmation.creditTransactionId &&
          e.creditTransactionId === creditConfirmation.creditTransactionId);
      if (!matches) return;
      setCreditState(e.status === 'RECEIVED' ? 'received' : 'unable');
    });
    return () => sub.remove();
  }, [creditConfirmation]);

  // Polling is SDK-owned and app-scoped — never screen-scoped: the SDK's background sweep
  // keeps asking the merchant's bank whatever screen is up, and persists each answer to its
  // store. This screen only renders that store: re-read the sale's row every few seconds while
  // visible, so a confirmation stamped while the merchant was elsewhere shows on return, and a
  // merchant-QR sale (whose settle can't carry the supported flag — the SDK learns it from the
  // transaction-status rail moments later) starts waiting once the flag turns up true.
  useEffect(() => {
    if (!creditConfirmation) return;
    const timer = setInterval(async () => {
      const row = await softpos.getTransaction(creditConfirmation.reference).catch(() => null);
      if (!row) return;
      if (row.creditConfirmationStatus) {
        setCreditState(row.creditConfirmationStatus === 'RECEIVED' ? 'received' : 'unable');
        clearInterval(timer);
      } else if (row.isCreditConfirmationSupported === true) {
        setCreditState((current) => current ?? 'waiting');
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [creditConfirmation]);

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

  // The hold. Re-runs whenever the credit-confirmation state changes, which is what turns the
  // timer off while the sale is waiting and starts a FRESH one once the answer is displayed.
  const armed = useRef(true);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) {
      armed.current = false; // leaving for any reason (receipt, Done) disarms for good
      return;
    }
    if (!armed.current) return;
    // Waiting on the merchant bank: hold indefinitely — Done is the only way out until the
    // confirmation lands, at which point this effect re-runs and re-arms the full window.
    if (creditState === 'waiting') return;
    // Accepted, waiting for the approval: hold the same way. The final status re-runs this
    // effect and starts the full window.
    if (awaitingApproval) return;
    const timer = setTimeout(goHome, AUTO_RETURN_MS);
    return () => clearTimeout(timer);
  }, [awaitingApproval, creditState, focused, goHome]);

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
        <Text style={styles.title}>{resolved?.title ?? title}</Text>
        <Text style={styles.message}>{resolved?.message ?? message}</Text>
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

        {creditState && (
          <Text
            style={[
              styles.creditLine,
              {
                color:
                  creditState === 'waiting'
                    ? theme.warningOrange
                    : creditState === 'received'
                      ? theme.successGreen
                      : theme.errorRed,
              },
            ]}
          >
            {creditState === 'waiting'
              ? 'Confirming credit with merchant bank…'
              : creditState === 'received'
                ? 'Funds received by merchant bank'
                : 'Bank credit could not be confirmed'}
          </Text>
        )}

        {!!shownReceiptFor && !awaitingApproval && (
          <Button
            title="View Receipt"
            onPress={() =>
              navigation.navigate('MerchantTransactions', { openReceiptFor: shownReceiptFor })
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
  creditLine: { fontSize: 14, marginTop: 16, textAlign: 'center' },
  detailLine: { color: theme.textSecondary, fontSize: 13, marginTop: 2, textAlign: 'center' },
});
