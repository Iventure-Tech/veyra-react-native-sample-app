import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Veyra from 'veyra-sdk-react-native';
import { VEYRA_CONFIG } from './veyra.config';
import { HomeScreen } from './src/screens/HomeScreen';
import { GetPaidScreen } from './src/screens/GetPaidScreen';
import { RegisterMerchantScreen } from './src/screens/RegisterMerchantScreen';
import { MerchantTransactionsScreen } from './src/screens/MerchantTransactionsScreen';
import { PayScreen } from './src/screens/PayScreen';
import { AddCardScreen } from './src/screens/AddCardScreen';
import { ScanToPayScreen } from './src/screens/ScanToPayScreen';
import { ShowToPayScreen } from './src/screens/ShowToPayScreen';
import { WalletTransactionsScreen } from './src/screens/WalletTransactionsScreen';
import { theme } from './src/theme';

// Veyra Bank neo-bank theme (matches the native samples: black + crimson accent).
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.accentRed,
    background: theme.bankBg,
    card: theme.bankBg,
    text: theme.textPrimary,
    border: theme.bankHairline,
    notification: theme.accentRed,
  },
};

export type RootStackParamList = {
  Home: undefined;
  GetPaid: undefined;
  RegisterMerchant: undefined;
  MerchantTransactions: undefined;
  Pay: undefined;
  AddCard: undefined;
  ScanToPay: undefined;
  ShowToPay: { cardId: string };
  WalletTransactions: { tokenUniqueReference: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Veyra.initialize(VEYRA_CONFIG)
      .then(() => setReady(true))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>SDK initialisation failed</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorDetail}>Starting Veyra…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bankBg} />
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Veyra Bank' }} />
        <Stack.Screen name="GetPaid" component={GetPaidScreen} options={{ title: 'Get paid' }} />
        <Stack.Screen name="RegisterMerchant" component={RegisterMerchantScreen} options={{ title: 'Register merchant' }} />
        <Stack.Screen name="MerchantTransactions" component={MerchantTransactionsScreen} options={{ title: 'Merchant transactions' }} />
        <Stack.Screen name="Pay" component={PayScreen} options={{ title: 'Pay' }} />
        <Stack.Screen name="AddCard" component={AddCardScreen} options={{ title: 'Add card' }} />
        <Stack.Screen name="ScanToPay" component={ScanToPayScreen} options={{ title: 'Scan to pay' }} />
        <Stack.Screen name="ShowToPay" component={ShowToPayScreen} options={{ title: 'Show QR to pay' }} />
        <Stack.Screen name="WalletTransactions" component={WalletTransactionsScreen} options={{ title: 'Transactions' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.bankBg,
  },
  error: { fontWeight: 'bold', marginBottom: 8, color: theme.errorRed },
  errorDetail: { color: theme.textSecondary, textAlign: 'center' },
});
