/**
 * Veyra onboarding values — copy to `veyra.config.ts` and fill in the values from your
 * onboarding pack. `veyra.config.ts` is gitignored; never commit it: a client secret in a tracked
 * file must be treated as compromised.
 */
import type { VeyraSoftposConfig, VeyraWalletConfig } from 'veyra-sdk-react-native';
import type { ConnectionSettings } from './src/connection';

// Everything except the customer and the connection: the app adds `customerId` (whoever it has
// signed in) and each SDK's `connection` (built from VEYRA_CONNECTION below) when it calls
// Veyra.initialize — see src/session.tsx and src/connection.ts.
export const VEYRA_CONFIG: {
  softpos: Omit<VeyraSoftposConfig, 'connection'>;
  wallet: Omit<VeyraWalletConfig, 'connection'>;
} = {
  softpos: {
    environment: 'TEST',
    // The payment app provider id from your onboarding pack — the same identifier the wallet
    // block carries. The gateway resolves your acquirer id and MCC from it.
    paymentAppProviderId: 'your-payment-app-provider-id',
  },
  wallet: {
    environment: 'TEST',
    paymentAppProviderId: 'your-payment-app-provider-id',
    tokenRequestorId: 'your-token-requestor-id',
    recommendationStandardVersion: '1.0',
    // iOS only: your Apple Developer Team ID (App Attest binds to it).
    appleTeamId: 'YOURTEAMID',
  },
};

/**
 * How both SDKs connect to Veyra. `mode` is REQUIRED, with no default — the app refuses to start
 * until it is set. One of:
 *  - 'directWithAssertion'    the SDK calls Veyra with an assertion your bank backend signs
 *                             (needs clientId + bankBackendBaseUrl; your backend serves
 *                             POST /sdk-assertion)
 *  - 'viaAppBackend'          the SDK calls nothing itself; every call goes through your bank
 *                             backend (needs bankBackendBaseUrl; your backend serves
 *                             POST /veyra-relay/{method})
 *  - 'directWithClientSecret' DEPRECATED — the SDK calls Veyra with a client secret held in the
 *                             app (needs clientId + clientSecret); retired per provider
 */
export const VEYRA_CONNECTION: ConnectionSettings = {
  mode: '',
  // OAuth client issued by Veyra. clientId: directWithAssertion and directWithClientSecret.
  // clientSecret: directWithClientSecret only.
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  // Your bank backend (directWithAssertion and viaAppBackend), e.g. 'https://bank-backend.example'.
  bankBackendBaseUrl: '',
  // PLACEHOLDER for your bank app's own logged-in session, sent to your bank backend as
  // "Authorization: Bearer <token>"; empty means nobody is signed in. A real app uses its own
  // login session here. This is not a Veyra credential.
  bankSessionToken: 'sample-bank-session',
};

/** Test prefill for the add-card and register-merchant forms (from your onboarding pack). */
export const SAMPLE_ACCOUNT = {
  accountNumber: '0123456789',
  institutionCode: '000013',
  accountHolderName: 'Test Person',
  bvn: '22222222222',
  mobileNumber: '+2348000000000',
  // Also sent as the wallet account id. The SDK hashes it and the issuer compares that hash
  // against the email/phone registered on the account, so use the account's registered email.
  emailAddress: 'test@example.com',
  accountHolderAddress: '1 Test Street, Lagos',
  addressLine1: '20 Campbell Street',
  city: 'Lagos',
  state: 'Lagos',
  cacNumber: 'RC-0000000',
};
