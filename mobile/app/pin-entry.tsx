import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

export default function PinEntry() {
  const { user_id, name } = useLocalSearchParams<{ user_id: string; name: string }>();
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pressKey = (key: string) => {
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (key === '') {
      return; // empty slot
    } else if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      if (newPin.length === 4) {
        // Auto-submit when 4 digits entered
        setTimeout(() => submitPin(newPin), 200);
      }
    }
  };

  const submitPin = async (enteredPin: string) => {
    setSubmitting(true);
    try {
      // Navigate to camera screen which will handle the rest
      router.replace({
        pathname: '/camera-capture',
        params: { user_id: user_id!, name: name!, pin: enteredPin },
      });
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
      setPin('');
    }
    setSubmitting(false);
  };

  const dots = Array.from({ length: 4 }, (_, i) => ({ filled: i < pin.length }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>‹ Back</Text>
      </TouchableOpacity>

      {/* Avatar */}
      <View style={styles.center}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name?.charAt(0)?.toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.subtitle}>Enter your 4-digit attendance PIN</Text>
        <Text style={styles.hint}>Open your Employee Portal to see your PIN</Text>

        {/* PIN Dots */}
        <View style={styles.dotsRow}>
          {dots.map((d, i) => (
            <View key={i} style={[styles.dot, d.filled && styles.dotFilled]} />
          ))}
        </View>

        {submitting && <Text style={styles.submitting}>Verifying…</Text>}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map((key, idx) => (
          <TouchableOpacity
            key={idx}
            style={[styles.key, key === '' && styles.keyEmpty, key === '⌫' && styles.keyDelete]}
            onPress={() => pressKey(key)}
            activeOpacity={0.6}
            disabled={submitting || key === ''}
          >
            <Text style={[styles.keyText, key === '⌫' && styles.keyDeleteText]}>{key}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f111a' },

  backBtn: { padding: 20 },
  backText: { color: '#6366f1', fontSize: 18 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#4f46e5',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },

  name: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 16, marginBottom: 4 },
  hint: { color: '#475569', fontSize: 13, marginBottom: 40, textAlign: 'center' },

  dotsRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#334155',
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: '#6366f1', borderColor: '#6366f1' },

  submitting: { color: '#6366f1', marginTop: 12, fontSize: 15 },

  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 40,
    paddingBottom: 40,
    gap: 16,
    justifyContent: 'center',
  },
  key: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  keyEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyDelete: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' },
  keyText: { color: '#fff', fontSize: 26, fontWeight: '500' },
  keyDeleteText: { color: '#ef4444', fontSize: 22 },
});
