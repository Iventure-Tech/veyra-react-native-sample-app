import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Veyra from 'veyra-sdk-react-native';
import { VEYRA_CONFIG, VEYRA_PROVIDER } from '../veyra.config';
import { appProvider } from './provider';

/**
 * The app's own login session. Who is logged in is the banking app's to remember, never the
 * SDK's: the SDK is told on every launch (`Veyra.initialize` with the customerId) and forgets
 * on `Veyra.signOut`. This demo "logs in" one of two demo customers.
 *
 * The session lives in memory only — this sample has no storage dependency — so every launch
 * starts signed in as the first demo customer. A real app restores its own login here and
 * initialises the SDK with that customer (or not at all while nobody is signed in).
 */
export const DEMO_CUSTOMERS = ['test-user@iventure.tech', 'demo-customer-2'] as const;

export interface DemoSession {
  /** The customer the app has logged in (the last one, while signed out). */
  customerId: string;
  signedIn: boolean;
}

interface SessionApi {
  session: DemoSession;
  /** True while an initialise / sign-out call is in flight. */
  busy: boolean;
  /** Log the current customer in again: the SDK opens their cards and merchant. */
  signIn(): Promise<void>;
  /**
   * Log in `customerId` — any id, not only the demo ones (the add-card form takes it as typed).
   * Does nothing when that customer is already signed in; otherwise the SDK switches.
   */
  signInAs(customerId: string): Promise<void>;
  /** Log in the other demo customer: the SDK stops the first customer's work and switches. */
  switchCustomer(): Promise<void>;
  /** Log out: the SDK stops everything for this customer; their data stays on the device. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionApi | null>(null);

async function initializeFor(customerId: string): Promise<void> {
  // How both SDKs reach Veyra — one provider, chosen in src/provider.ts (appProvider) from the
  // values in veyra.config.ts. A missing value it needs throws here, naming it, and the launch
  // shows it.
  return Veyra.initialize({
    customerId,
    provider: appProvider(VEYRA_PROVIDER),
    softpos: VEYRA_CONFIG.softpos,
    wallet: VEYRA_CONFIG.wallet,
  });
}

/**
 * Provides the session and, on launch, tells the SDK who is logged in. Renders `starting`
 * until that first initialise settles, and `failed` if it rejects.
 */
export function SessionProvider(props: {
  children: React.ReactNode;
  starting: React.ReactNode;
  failed: (message: string) => React.ReactNode;
}): React.JSX.Element {
  const [session, setSession] = useState<DemoSession>({
    customerId: DEMO_CUSTOMERS[0],
    signedIn: true,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Every launch tells the SDK who is logged in; a signed-out app tells it nothing.
  useEffect(() => {
    if (!session.signedIn) {
      setReady(true);
      return;
    }
    initializeFor(session.customerId)
      .then(() => setReady(true))
      .catch((e: Error) => setError(e.message));
    // Launch only — later changes go through signIn / switchCustomer / signOut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async (op: () => Promise<void>, next: DemoSession) => {
    setBusy(true);
    try {
      await op();
      setSession(next);
    } finally {
      setBusy(false);
    }
  }, []);

  const api: SessionApi = {
    session,
    busy,
    signIn: () =>
      run(() => initializeFor(session.customerId), { customerId: session.customerId, signedIn: true }),
    signInAs: (customerId: string) =>
      session.signedIn && session.customerId === customerId
        ? Promise.resolve()
        : run(() => initializeFor(customerId), { customerId, signedIn: true }),
    switchCustomer: () => {
      const i = DEMO_CUSTOMERS.indexOf(session.customerId as (typeof DEMO_CUSTOMERS)[number]);
      const next = DEMO_CUSTOMERS[(i + 1) % DEMO_CUSTOMERS.length];
      return run(() => initializeFor(next), { customerId: next, signedIn: true });
    },
    signOut: () => run(() => Veyra.signOut(), { customerId: session.customerId, signedIn: false }),
  };

  if (error) return <>{props.failed(error)}</>;
  if (!ready) return <>{props.starting}</>;
  return <SessionContext.Provider value={api}>{props.children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const api = useContext(SessionContext);
  if (api == null) throw new Error('useSession must be used inside SessionProvider');
  return api;
}
