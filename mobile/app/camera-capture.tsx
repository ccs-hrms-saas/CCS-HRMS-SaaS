import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function CameraCapture() {
  const { user_id, name, pin } = useLocalSearchParams<{ user_id: string; name: string; pin: string }>();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const hasSubmitted = useRef(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
      return;
    }
    // 3-second countdown then auto capture
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timer);
          captureAndSubmit();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [permission?.granted]);

  const captureAndSubmit = async () => {
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    setProcessing(true);

    try {
      let photo_base64: string | null = null;

      // Take photo
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
        photo_base64 = photo?.base64 ? `data:image/jpeg;base64,${photo.base64}` : null;
      }

      // Call attendance API
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${apiUrl}/api/mark-attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, pin, photo_base64 }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.replace({
          pathname: '/result',
          params: {
            success: 'true',
            action: data.action,
            name: name!,
            message: data.message,
          },
        });
      } else {
        router.replace({
          pathname: '/result',
          params: {
            success: 'false',
            name: name!,
            message: data.error ?? 'Something went wrong.',
          },
        });
      }
    } catch (err: any) {
      Alert.alert('Network Error', 'Could not connect to server. Make sure the web app is running and both devices are on the same WiFi.');
      router.back();
    }
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.permText}>📷 Camera permission is required for attendance photos.</Text>
        <Text style={[styles.permText, { color: '#6366f1', marginTop: 12 }]}>Please allow camera access in your device settings.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front">
        {/* Overlay */}
        <View style={styles.overlay}>
          <Text style={styles.nameLabel}>{name}</Text>
          {processing ? (
            <Text style={styles.countdownText}>Processing…</Text>
          ) : (
            <>
              <Text style={styles.countdownText}>{countdown}</Text>
              <Text style={styles.countdownSub}>Look at the camera</Text>
            </>
          )}

          {/* Face guide circle */}
          <View style={styles.faceGuide} />
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  permText: { color: '#94a3b8', textAlign: 'center', fontSize: 16, lineHeight: 24 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
    textShadowColor: '#000',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },

  faceGuide: {
    position: 'absolute',
    width: 220,
    height: 280,
    borderRadius: 120,
    borderWidth: 3,
    borderColor: 'rgba(99,102,241,0.7)',
    borderStyle: 'dashed',
  },

  countdownText: {
    color: '#6366f1',
    fontSize: 72,
    fontWeight: '900',
    textShadowColor: '#000',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 2 },
  },
  countdownSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginTop: 8,
  },
});
