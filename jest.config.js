module.exports = {
  preset: 'react-native',
  // The Veyra wrapper ships TypeScript sources: transform it like the react-native packages.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|veyra-sdk-react-native)/)',
  ],
};
