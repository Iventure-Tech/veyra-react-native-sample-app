/**
 * Jest has no native side. The Veyra SDK binds its native module and event emitter when it is
 * imported, so give it a stand-in: listener registration is a no-op and every other native call
 * resolves to null. Tests that exercise SDK behaviour mock the calls they need on top of this.
 */
const { NativeModules } = require('react-native');

NativeModules.VeyraSdkReactNative = new Proxy(
  { addListener: () => {}, removeListeners: () => {} },
  { get: (target, key) => (key in target ? target[key] : () => Promise.resolve(null)) }
);

// The camera ships a codegen-only native component spec that cannot render without the device.
jest.mock('react-native-camera-kit', () => ({
  Camera: () => null,
  CameraType: { Back: 'back', Front: 'front' },
}));
