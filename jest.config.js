module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The Veyra wrapper ships TypeScript sources, and react-navigation ships image assets: transform
  // both like the react-native packages (an untransformed .png is parsed as JavaScript).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native[^/]*|@react-native(-community)?|@react-navigation|veyra-sdk-react-native)/)',
  ],
};
