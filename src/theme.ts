/**
 * Veyra Bank neo-bank palette — the same theme as the native sample apps: pure black
 * to match the SoftPOS (white-on-black) and Wallet (black + deep-red cards) flows,
 * one crimson accent unifying all surfaces. Names mirror the Android colors.xml.
 */
export const theme = {
  bankBg: '#000000',
  bankSurface: '#121212',
  bankCardDark: '#0A0A0A',
  bankCardRed: '#680016',
  bankHairline: '#262626',
  textPrimary: '#FFFFFF',
  textSecondary: '#9AA0A6',
  accentRed: '#C1272D',
  accentRedDark: '#7A0F1E',
  successGreen: '#4CAF50',
  errorRed: '#F44336',
  warningOrange: '#FF9800',
} as const;
