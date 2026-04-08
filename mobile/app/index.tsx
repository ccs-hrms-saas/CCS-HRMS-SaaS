import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';

interface Employee {
  id: string;
  full_name: string;
  role: string;
}

export default function EmployeeSelect() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filtered, setFiltered]   = useState<Employee[]>([]);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)          // show ALL active users regardless of role
      .order('full_name');
    setEmployees(data ?? []);
    setFiltered(data ?? []);
    setLoading(false);
    setRefreshing(false);
  };

  // Reload on focus + auto-refresh every 30 seconds
  useFocusEffect(
    useCallback(() => {
      load(); // immediate load on focus
      const interval = setInterval(() => load(), 30000); // refresh every 30s
      return () => clearInterval(interval); // cleanup on blur
    }, [])
  );


  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(employees.filter(e => e.full_name.toLowerCase().includes(q)));
  }, [search, employees]);

  const selectEmployee = (emp: Employee) => {
    router.push({ pathname: '/pin-entry', params: { user_id: emp.id, name: emp.full_name } });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoIcon} />
        <View>
          <Text style={styles.headerTitle}>CCS-HRMS Kiosk</Text>
          <Text style={styles.headerSub}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
        </View>
      </View>

      <Text style={styles.instruction}>Select your name to mark attendance</Text>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search employee..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <ActivityIndicator color="#6366f1" size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#6366f1" />}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.employeeCard} onPress={() => selectEmployee(item)} activeOpacity={0.7}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.full_name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.employeeName}>{item.full_name}</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No employees found. Add employees via the Admin Portal first.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f111a' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6366f1',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#64748b', fontSize: 13 },

  instruction: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 20,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14 },

  list: { paddingHorizontal: 20, paddingBottom: 40 },

  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  employeeName: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '500' },
  chevron: { color: '#6366f1', fontSize: 24, fontWeight: '300' },

  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
    lineHeight: 24,
    paddingHorizontal: 40,
  },
});
