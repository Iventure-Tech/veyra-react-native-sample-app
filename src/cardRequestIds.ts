/**
 * The `clientRequestId` of the add-card (digitise) that created each card, by the card's token
 * unique reference. A card does not carry it, so the app keeps it: "Remove card" names the add-card
 * attempt with `wallet.deactivateDigitise(clientRequestId)`, and the SDK removes the card from this
 * phone when the server says `APPROVED`.
 *
 * A card with no recorded id (added before the app kept them) is removed with
 * `wallet.deactivateToken(tokenUniqueReference)` instead.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DigitiseResult } from 'veyra-sdk-react-native';

const STORAGE_KEY = 'VeyraBankCardRequestIds';

/**
 * The card a digitise added and the id it was sent with, or null when it added no card. `APPROVED`
 * covers both response codes: a card that still needs activating is on the phone too.
 */
export function cardRequestId(
  result: Pick<DigitiseResult, 'responseStatus' | 'tokenUniqueReference' | 'clientRequestId'>
): [tokenUniqueReference: string, clientRequestId: string] | null {
  if (result.responseStatus !== 'APPROVED' || !result.tokenUniqueReference || !result.clientRequestId) return null;
  return [result.tokenUniqueReference, result.clientRequestId];
}

async function readAll(): Promise<Record<string, string>> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored ? (JSON.parse(stored) as Record<string, string>) : {};
}

/** Remembers the attempt's id when the digitise added a card. */
export async function recordCardRequestId(
  result: Pick<DigitiseResult, 'responseStatus' | 'tokenUniqueReference' | 'clientRequestId'>
): Promise<void> {
  const entry = cardRequestId(result);
  if (!entry) return;
  const all = await readAll();
  all[entry[0]] = entry[1];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** The id of the add-card that created the card, or null when none was recorded. */
export async function getCardRequestId(tokenUniqueReference: string): Promise<string | null> {
  return (await readAll())[tokenUniqueReference] ?? null;
}

/** Forgets the card's id once the card is removed. */
export async function forgetCardRequestId(tokenUniqueReference: string): Promise<void> {
  const all = await readAll();
  delete all[tokenUniqueReference];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
