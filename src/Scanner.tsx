import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Camera, CameraType } from 'react-native-camera-kit';
import { theme } from './theme';
import { Button, Busy } from './ui';

/**
 * QR scanner with the Android runtime-permission dance built in (the raw camera view
 * renders blank without it; iOS prompts by itself via NSCameraUsageDescription).
 */
export function Scanner(props: {
  onCode: (payload: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [granted, setGranted] = useState<boolean | null>(
    Platform.OS === 'android' ? null : true
  );

  const request = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera access',
        message: 'The camera is used to scan payment and receipt QR codes.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      }
    );
    setGranted(result === PermissionsAndroid.RESULTS.GRANTED);
  }, []);

  useEffect(() => {
    request();
  }, [request]);

  if (granted === null) {
    return (
      <View style={styles.center}>
        <Busy label="Requesting camera access…" />
        <Button title="Cancel" onPress={props.onCancel} />
      </View>
    );
  }

  if (!granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>
          Camera access is needed to scan QR codes. Allow it, or enable it in the
          system settings if you previously denied it.
        </Text>
        <Button title="Allow camera" onPress={request} />
        <Button title="Open settings" onPress={() => Linking.openSettings()} />
        <Button title="Cancel" destructive onPress={props.onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Camera
        style={styles.fill}
        cameraType={CameraType.Back}
        scanBarcode
        onReadCode={(event: { nativeEvent: { codeStringValue: string } }) =>
          props.onCode(event.nativeEvent.codeStringValue)
        }
      />
      <Button title="Cancel" onPress={props.onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  body: { color: theme.textPrimary, marginBottom: 12, textAlign: 'center' },
});
