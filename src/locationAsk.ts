import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { check, PERMISSIONS, request, requestMultiple, RESULTS } from 'react-native-permissions';

/**
 * Asks for location once, before the first payment or card added, with a short explanation first.
 *
 * The Veyra SDK never asks for a permission itself: it sends the phone's location with each payment,
 * card added and key refresh when the app already holds it, and reports it as unavailable otherwise.
 * That evidence helps the payment's fraud checks, which isn't obvious to a user, so the app explains
 * before the system prompt (Google Play asks for this). Asked once: whatever the answer, the flow
 * carries on, and a "no" is never asked again here; the user can still allow it in Settings.
 * The same behaviour as the native samples.
 */
const ASKED_KEY = 'veyra_bank_location_asked';

export const LOCATION_ASK_TITLE = 'Help protect your payments';
export const LOCATION_ASK_MESSAGE =
  "Veyra Bank sends your phone's location with each payment and card you add. " +
  'It helps check that each payment is really yours. You can change this at any time in Settings.';

const PRIMARY =
  Platform.OS === 'ios' ? PERMISSIONS.IOS.LOCATION_WHEN_IN_USE : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION;

async function askSystem(): Promise<void> {
  if (Platform.OS === 'ios') {
    await request(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
  } else {
    // Both together, so Android 12+ offers the user "approximate" as well as "precise".
    await requestMultiple([PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION, PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION]);
  }
}

/** Runs `then` at once if location was already decided or asked for; otherwise explains and asks first. */
export async function beforePayment(then: () => void): Promise<void> {
  let askable = false;
  try {
    // DENIED here means "not decided yet, can still be asked"; BLOCKED is a decided "no".
    askable = (await check(PRIMARY)) === RESULTS.DENIED && (await AsyncStorage.getItem(ASKED_KEY)) !== 'true';
  } catch {
    askable = false; // can't tell: never hold up a payment for it
  }
  if (!askable) {
    then();
    return;
  }
  const markAsked = () => AsyncStorage.setItem(ASKED_KEY, 'true').catch(() => {});
  Alert.alert(
    LOCATION_ASK_TITLE,
    LOCATION_ASK_MESSAGE,
    [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: () => {
          markAsked();
          then();
        },
      },
      {
        text: 'Continue',
        onPress: () => {
          markAsked();
          // Allowed or not, the payment goes ahead: without location the SDK reports it unavailable.
          askSystem().catch(() => {}).finally(then);
        },
      },
    ],
    { cancelable: false }
  );
}
