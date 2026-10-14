/**
 * Remove card names the add-card attempt that created the card, so the app records that attempt's
 * clientRequestId whenever a digitise adds a card.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cardRequestId, forgetCardRequestId, getCardRequestId, recordCardRequestId } from '../src/cardRequestIds';

type Result = Parameters<typeof cardRequestId>[0];
const result = (responseStatus: string | null, tokenUniqueReference: string | null, clientRequestId: string | null = 'crid-1') =>
  ({ responseStatus, tokenUniqueReference, clientRequestId }) as Result;

describe('cardRequestId', () => {
  it('an added card is recorded with its add-card id', () => {
    expect(cardRequestId(result('APPROVED', 'TUR-1'))).toEqual(['TUR-1', 'crid-1']);
  });

  it.each([
    ['DECLINED', null],
    ['FAILED', null],
    ['NOT_SENT', null],
    ['APPROVED', null],
  ])('nothing is recorded when no card was added (%s)', (status, tur) => {
    expect(cardRequestId(result(status, tur))).toBeNull();
  });

  it('nothing is recorded without an id', () => {
    expect(cardRequestId(result('APPROVED', 'TUR-1', null))).toBeNull();
    expect(cardRequestId(result('APPROVED', 'TUR-1', ''))).toBeNull();
  });
});

describe('stored ids', () => {
  beforeEach(() => AsyncStorage.clear());

  it('a recorded card is found by its token reference, and forgotten on removal', async () => {
    await recordCardRequestId(result('APPROVED', 'TUR-1', 'crid-1'));
    await recordCardRequestId(result('APPROVED', 'TUR-2', 'crid-2'));
    expect(await getCardRequestId('TUR-1')).toBe('crid-1');
    await forgetCardRequestId('TUR-1');
    expect(await getCardRequestId('TUR-1')).toBeNull();
    expect(await getCardRequestId('TUR-2')).toBe('crid-2');
  });

  it('a card with no recorded id has none', async () => {
    expect(await getCardRequestId('TUR-unknown')).toBeNull();
  });
});
