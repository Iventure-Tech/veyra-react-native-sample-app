import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { theme } from './theme';

export function Button(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.button,
        props.destructive && styles.buttonDestructive,
        (props.disabled || pressed) && styles.buttonDim,
      ]}>
      <Text style={styles.buttonText}>{props.title}</Text>
    </Pressable>
  );
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'default'}
        autoCapitalize="none"
        placeholderTextColor={theme.textSecondary}
      />
    </View>
  );
}

export function Section(props: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{props.title}</Text>
      {props.children}
    </View>
  );
}

export function Busy(props: { label: string }): React.JSX.Element {
  return (
    <View style={styles.busy}>
      <ActivityIndicator color={theme.accentRed} />
      <Text style={styles.busyLabel}>{props.label}</Text>
    </View>
  );
}

/** White tile behind QR codes — they must stay scannable on the black theme. */
export function QrTile(props: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.qrTile}>{props.children}</View>;
}

export function formatAmount(minorUnits: number): string {
  return `₦${(minorUnits / 100).toFixed(2)}`;
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.accentRed,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginVertical: 6,
  },
  buttonDestructive: { backgroundColor: theme.accentRedDark },
  buttonDim: { opacity: 0.5 },
  buttonText: { color: theme.textPrimary, fontWeight: '600' },
  field: { marginVertical: 6 },
  fieldLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 2 },
  fieldInput: {
    borderWidth: 1,
    borderColor: theme.bankHairline,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.textPrimary,
    backgroundColor: theme.bankCardDark,
  },
  section: {
    backgroundColor: theme.bankSurface,
    borderColor: theme.bankHairline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginVertical: 8,
  },
  sectionTitle: { fontWeight: '700', marginBottom: 8, color: theme.textPrimary },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  busyLabel: { color: theme.textSecondary },
  qrTile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignSelf: 'center',
  },
});
