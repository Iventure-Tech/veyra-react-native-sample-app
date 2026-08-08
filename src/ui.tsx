import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from './theme';

/** Where the focused field comes to rest, measured from the form's top edge. */
const FOCUSED_FIELD_REST_OFFSET = 72;

const FormScrollContext = createContext<(() => void) | null>(null);

/**
 * ScrollView for screens with text inputs. The window does not shrink for the
 * keyboard on Android 15+ (edge-to-edge), so a plain ScrollView leaves the
 * focused field and any bottom buttons hidden behind the IME — and its default
 * tap handling eats the first press on a button while the keyboard is up.
 * This one pads itself by the keyboard height (so everything stays reachable),
 * scrolls the focused field above the keyboard as you type, and delivers taps
 * on buttons without a dismiss-first press.
 */
export function FormScrollView(props: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const scrollRef = useRef<ScrollView>(null);
  const contentAnchorRef = useRef<View>(null);
  const scrollOffsetY = useRef(0);
  const keyboardUp = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Hoist the focused field to a fixed rest position near the top of the form. Android's
  // coordinate APIs disagree about the keyboard's edge (measureInWindow is window-relative,
  // the keyboard event's screenY is screen-relative, and its height omits the nav-bar
  // inset — all three bit on device), so no keyboard geometry is used at all: the field
  // and the ScrollView are measured in the same space, and a spot near the form's top is
  // above any keyboard by construction.
  const scrollFocusedFieldIntoView = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    const anchor = contentAnchorRef.current;
    if (input == null || anchor == null || !keyboardUp.current) {
      return;
    }
    anchor.measureInWindow((_ax: number, anchorY: number) => {
      input.measureInWindow((_x: number, y: number) => {
        // y − anchorY is the field's distance from the content top, i.e. the absolute
        // scroll offset that puts it at the very top; back off to the rest position.
        const target = y - anchorY - FOCUSED_FIELD_REST_OFFSET;
        // Only scroll downwards — a field already at or above the rest position is visible.
        if (target > scrollOffsetY.current + 1) {
          scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: true });
        }
      });
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardUp.current = true;
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardUp.current = false;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Scroll only once the keyboard padding is actually laid out — scrollTo clamps to the
  // content height, so scrolling straight from keyboardDidShow undershoots by however
  // much of the new padding hasn't rendered yet. onContentSizeChange fires after the
  // padded layout lands.
  const onContentSizeChange = useCallback(() => {
    if (keyboardUp.current) {
      scrollFocusedFieldIntoView();
    }
  }, [scrollFocusedFieldIntoView]);

  return (
    <FormScrollContext.Provider value={scrollFocusedFieldIntoView}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={onContentSizeChange}
        onScroll={(e) => {
          scrollOffsetY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          props.contentContainerStyle,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight },
        ]}>
        {/* Zero-height marker for the content's top edge — the measuring anchor above. */}
        <View ref={contentAnchorRef} collapsable={false} />
        {props.children}
      </ScrollView>
    </FormScrollContext.Provider>
  );
}

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
  const scrollIntoView = useContext(FormScrollContext);
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
        onFocus={scrollIntoView ?? undefined}
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
