/**
 * Veyra onboarding credentials — copy to `veyra.config.ts` and fill in the values from
 * your onboarding pack. `veyra.config.ts` is gitignored; never commit real credentials.
 */
import type { VeyraConfig } from 'veyra-sdk-react-native';

export const VEYRA_CONFIG: VeyraConfig = {
  softpos: {
    environment: 'TEST',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
  },
  wallet: {
    environment: 'TEST',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    paymentAppProviderId: 'your-payment-app-provider-id',
    tokenRequestorId: 'your-token-requestor-id',
    allowedCountryCodes: ['0566'],
    recommendationStandardVersion: '1.0',
    // iOS only: your Apple Developer Team ID (App Attest binds to it).
    appleTeamId: 'YOURTEAMID',
  },
};

/** Test prefill for the add-card and register-merchant forms (from your onboarding pack). */
export const SAMPLE_ACCOUNT = {
  accountNumber: '0123456789',
  institutionCode: '000013',
  accountHolderName: 'Test Person',
  bvn: '22222222222',
  mobileNumber: '+2348000000000',
  emailAddress: 'test@example.com',
  accountHolderAddress: '1 Test Street, Lagos',
  // Merchant registration prefill (merchant name = account holder, like the native samples).
  acquirerId: 'ACQ001',
  addressLine1: '20 Campbell Street',
  city: 'Lagos',
  state: 'Lagos',
  cacNumber: 'RC-0000000',
};
