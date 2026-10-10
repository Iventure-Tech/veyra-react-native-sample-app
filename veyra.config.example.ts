/**
 * Veyra onboarding values — copy to `veyra.config.ts` and fill in the values from your
 * onboarding pack. `veyra.config.ts` is gitignored; never commit it: a client secret in a tracked
 * file must be treated as compromised.
 */
import type { VeyraSoftposConfig, VeyraWalletConfig } from 'veyra-sdk-react-native';
import type { ProviderSettings } from './src/provider';

// Everything except the customer and the provider: the app adds `customerId` (whoever it has
// signed in) and the one `provider` for both SDKs (built in src/provider.ts from VEYRA_PROVIDER below) when it
// calls Veyra.initialize — see src/session.tsx and src/provider.ts.
export const VEYRA_CONFIG: {
  softpos: VeyraSoftposConfig;
  wallet: VeyraWalletConfig;
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
 * The values for the provider both SDKs use. There is no mode to set: the SDK works out how to
 * reach Veyra from the provider the app passes. Which one the sample builds is chosen in code, in
 * appProvider() in src/provider.ts. It ships with the deprecated client-secret provider so the
 * sample runs with just the client id and secret from your onboarding pack — FOR TESTING ONLY.
 * Each provider reads only its own values:
 *  - assertion provider      clientId + bankBackendBaseUrl + bankClientId/bankClientSecret
 *                            (RFC 8693 token exchange at {bankBackendBaseUrl}/oauth2/token)
 *  - proxy provider          bankBackendBaseUrl (your API gateway serves POST /issuertokengateway/v1/proxy)
 *  - client-secret provider  DEPRECATED — clientId + clientSecret held in the app
 */
export const VEYRA_PROVIDER: ProviderSettings = {
  // OAuth client issued by Veyra. clientId: the assertion and client-secret providers.
  // clientSecret: the client-secret provider only.
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  // Your bank backend (the assertion and proxy providers), e.g. 'https://bank-backend.example'.
  bankBackendBaseUrl: '',
  // Your bank's own OAuth client at its authorization server — NOT the Veyra client above, and
  // never passed to the SDK. The assertion provider authenticates the token exchange with it
  // (HTTP Basic).
  bankClientId: 'your-bank-client-id',
  bankClientSecret: 'your-bank-client-secret',
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
