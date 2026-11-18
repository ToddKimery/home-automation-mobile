import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const sampleRuns = [
  { id: 42, date: 'Saturday, 2:14 PM', duration: '52 min', peak: '54.2 °C' },
  { id: 41, date: 'Thursday, 6:38 PM', duration: '46 min', peak: '51.8 °C' },
  { id: 40, date: 'Tuesday, 7:06 PM', duration: '49 min', peak: '53.1 °C' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>Dryer monitor</Text>
          <Text style={styles.muted}>Demo data</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Dryer status</Text>
            <Text style={styles.status}>Idle</Text>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.label}>Temperature</Text>
                <Text style={styles.value}>23.4 °C</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.label}>Humidity</Text>
                <Text style={styles.value}>45%</Text>
              </View>
            </View>
          </View>

          <Text accessibilityRole="header" style={styles.heading}>Recent runs</Text>
          <View style={styles.history}>
            {sampleRuns.map((run) => (
              <View key={run.id} style={styles.row}>
                <Text style={styles.value}>{run.date}</Text>
                <Text style={styles.muted}>{run.duration} · Peak {run.peak}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111918' },
  content: { padding: 24, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  title: { color: '#f4faf6', fontSize: 34, fontWeight: '700' },
  heading: { color: '#f4faf6', fontSize: 23, fontWeight: '700', marginTop: 10 },
  muted: { color: '#b0c4bd', fontSize: 15 },
  card: { backgroundColor: '#1c2a26', borderRadius: 18, padding: 20, gap: 8, marginTop: 12 },
  label: { color: '#bdd1c9', fontSize: 15 },
  status: { color: '#a8edc5', fontSize: 28, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 14 },
  metric: { minWidth: 105, gap: 4 },
  value: { color: '#f4faf6', fontSize: 18, fontWeight: '600' },
  history: { gap: 8 },
  row: { backgroundColor: '#1c2a26', borderRadius: 12, padding: 16, gap: 4 },
});
