import { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function Result() {
  const { success, action, name, message } = useLocalSearchParams<{
    success: string; action: string; name: string; message: string;
  }>();
  const router = useRouter();
  const isSuccess = success === 'true';

  // Auto-return to home after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/');
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        {/* Icon */}
        <View style={[styles.iconWrap, isSuccess ? styles.iconSuccess : styles.iconFail]}>
          <Text style={styles.icon}>{isSuccess ? (action === 'check_in' ? '✅' : '👋') : '❌'}</Text>
        </View>

        {/* Status */}
        <Text style={[styles.status, isSuccess ? styles.statusSuccess : styles.statusFail]}>
          {isSuccess ? (action === 'check_in' ? 'Checked In!' : 'Checked Out!') : 'Failed'}
        </Text>

        <Text style={styles.name}>{name}</Text>
        <Text style={styles.message}>{message}</Text>

        <Text style={styles.time}>
          🕐 {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </Text>

        <Text style={styles.returning}>Returning to home in 4 seconds…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f111a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  iconWrap: {
    width: 120, height: 120, borderRadius: 60,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  iconSuccess: { backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 2, borderColor: 'rgba(16,185,129,0.4)' },
  iconFail:    { backgroundColor: 'rgba(239,68,68,0.15)',  borderWidth: 2, borderColor: 'rgba(239,68,68,0.4)' },
  icon: { fontSize: 52 },

  status: { fontSize: 32, fontWeight: '800', marginBottom: 12 },
  statusSuccess: { color: '#10b981' },
  statusFail:    { color: '#ef4444' },

  name: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 12 },
  message: { color: '#94a3b8', fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 22 },

  time: { color: '#6366f1', fontSize: 16, fontWeight: '600', marginBottom: 40 },

  returning: { color: '#475569', fontSize: 14 },
});
