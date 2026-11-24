import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Icon from './components/Icon';
import Lights from './components/Lights';
import CloudHistory, { cloudConfigured } from './components/CloudHistory';
import RunDetails, { decodeRunSeries, fahrenheit } from './components/RunDetails';

type SensorStatus = {
  running: boolean;
  t: number | null;
  h: number | null;
  runMin: number;
  lastOkAgoS?: number;
};

type Run = { id: number; start: number; n: number; step: number; peak: number };
type Snapshot = { status: SensorStatus; runs: Run[]; receivedAt: number };

const sensorAddressKey = 'dryer.sensorAddress';

function parseSensorAddress(address: string): string | undefined {
  const input = address.trim();
  if (!input) return undefined;

  try {
    const url = new URL(input.includes('://') ? input : `http://${input}`);
    if (['http:', 'https:'].includes(url.protocol) && url.hostname &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) {
      return url.origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

const defaultSensorAddress = parseSensorAddress(process.env.EXPO_PUBLIC_DRYER_SENSOR_URL ?? '') ??
  'http://dryer-monitor.local';

async function readJson(origin: string, path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(origin + path, { signal });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStatus(value: unknown): value is SensorStatus {
  return isRecord(value) && typeof value.running === 'boolean' &&
    (value.t === null || isNumber(value.t)) && (value.h === null || isNumber(value.h)) &&
    isNumber(value.runMin) && (value.lastOkAgoS === undefined || isNumber(value.lastOkAgoS));
}

function isRun(value: unknown): value is Run {
  return isRecord(value) && isNumber(value.id) && isNumber(value.start) &&
    isNumber(value.n) && isNumber(value.step) && isNumber(value.peak);
}

export default function App() {
  const [mode, setMode] = useState<'local' | 'cloud' | 'lights'>(cloudConfigured ? 'cloud' : 'local');
  const [address, setAddress] = useState(defaultSensorAddress);
  const [origin, setOrigin] = useState('');
  const [selectedRun, setSelectedRun] = useState<Run>();
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  useEffect(() => {
    let active = true;
    async function restoreSensorAddress() {
      let storedAddress: string | null = null;
      try {
        storedAddress = await SecureStore.getItemAsync(sensorAddressKey);
      } catch {
        if (active) setAddressError('Could not restore the saved sensor address.');
      }
      if (!active) return;
      const restored = parseSensorAddress(storedAddress ?? '') ?? defaultSensorAddress;
      setAddress(restored);
      setOrigin(restored);
    }
    void restoreSensorAddress();
    return () => { active = false; };
  }, []);

  async function connect() {
    const nextOrigin = parseSensorAddress(address);
    if (!nextOrigin) {
      setAddressError('Enter the sensor hostname or IP address, including its port if needed.');
      return;
    }

    setAddressError('');
    setAddress(nextOrigin);
    if (origin !== nextOrigin) setSnapshot(undefined);
    setOrigin(nextOrigin);
    setAttempt((previous) => previous + 1);
    try {
      await SecureStore.setItemAsync(sensorAddressKey, nextOrigin);
    } catch {
      setAddressError('Connected address could not be saved on this phone.');
    }
  }

  useEffect(() => {
    if (!origin || mode !== 'local') return;
    let active = true;
    let nextPoll: ReturnType<typeof setTimeout> | undefined;
    let currentRequest: AbortController | undefined;

    async function refresh() {
      const request = new AbortController();
      currentRequest = request;
      const timeout = setTimeout(() => request.abort(), 8000);
      setLoading(true);
      setError('');
      try {
        const [status, runs] = await Promise.all([
          readJson(origin, '/status', request.signal),
          readJson(origin, '/runs', request.signal),
        ]);
        if (!isStatus(status) || !Array.isArray(runs) || !runs.every(isRun)) {
          throw new Error('The dryer returned unexpected data.');
        }
        if (active) setSnapshot({ status, runs, receivedAt: Date.now() });
      } catch (cause) {
        if (active) {
          const detail = cause instanceof Error ? cause.message : 'Connection failed.';
          setError(request.signal.aborted ? 'The dryer did not respond in time.' : detail);
        }
      } finally {
        clearTimeout(timeout);
        request.abort();
        if (active) {
          setLoading(false);
          nextPoll = setTimeout(refresh, 15000);
        }
      }
    }

    void refresh();
    return () => {
      active = false;
      clearTimeout(nextPoll);
      currentRequest?.abort();
    };
  }, [origin, attempt, mode]);

  const selectedId = selectedRun?.id;
  const loadRun = useCallback(async (signal: AbortSignal) =>
    decodeRunSeries(await readJson(origin, `/run?id=${selectedId}`, signal)), [origin, selectedId]);

  const status = snapshot?.status;
  const age = status?.lastOkAgoS;
  const stale = age !== undefined && (age < 0 || age > 45);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Icon name="brand" size={52} />
            <Text accessibilityRole="header" style={styles.title}>Dryer monitor</Text>
          </View>
          <View style={styles.modeSwitch}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'local' }}
              style={[styles.button, styles.modeButton, mode !== 'local' && styles.inactiveMode]} onPress={() => setMode('local')}>
              <Icon name="local" color="#111918" />
              <Text style={styles.buttonText}>Local</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'cloud' }}
              style={[styles.button, styles.modeButton, mode !== 'cloud' && styles.inactiveMode]} onPress={() => setMode('cloud')}>
              <Icon name="cloud" color="#111918" />
              <Text style={styles.buttonText}>Cloud</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: mode === 'lights' }}
              style={[styles.button, styles.modeButton, mode !== 'lights' && styles.inactiveMode]} onPress={() => setMode('lights')}>
              <Text style={styles.buttonText}>Lights</Text>
            </Pressable>
          </View>
          {mode === 'cloud' && <CloudHistory />}
          {mode === 'lights' && <Lights />}
          {mode === 'local' && (
            <>
              <Text style={styles.muted}>Use Tailscale when you’re away from home.</Text>
              <Text style={styles.label}>Sensor address</Text>
              <View style={styles.controls}>
                <TextInput
                  accessibilityLabel="Sensor address"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={Boolean(origin)}
                  value={address}
                  onChangeText={setAddress}
                  onSubmitEditing={() => void connect()}
                />
                <Pressable accessibilityRole="button" style={styles.button} disabled={!origin} onPress={() => void connect()}>
                  <Text style={styles.buttonText}>Connect</Text>
                </Pressable>
              </View>
              {!!addressError && <Text accessibilityLiveRegion="polite" style={styles.error}>{addressError}</Text>}
              {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error} Check Tailscale or your home Wi-Fi, and verify the sensor address.</Text>}
              {loading && !snapshot && <Text style={styles.muted}>Connecting…</Text>}
              {snapshot && status && (
                <>
                  <View style={styles.card}>
                    <Text style={styles.label}>Dryer status</Text>
                    <Text style={styles.status}>{status.running ? 'Running' : 'Idle'}</Text>
                    {status.running && <Text style={styles.muted}>{status.runMin.toFixed(1)} min into cycle</Text>}
                    <View style={styles.metrics}>
                      <View>
                        <View style={styles.iconRow}>
                          <Icon name="temperature" size={18} color="#ffc487" />
                          <Text style={styles.label}>Temperature</Text>
                        </View>
                        <Text style={styles.value}>{status.t == null ? 'Unavailable' : `${fahrenheit(status.t).toFixed(1)} °F`}</Text>
                      </View>
                      <View>
                        <View style={styles.iconRow}>
                          <Icon name="humidity" size={18} color="#92d7f4" />
                          <Text style={styles.label}>Humidity</Text>
                        </View>
                        <Text style={styles.value}>{status.h == null ? 'Unavailable' : `${status.h.toFixed(1)}%`}</Text>
                      </View>
                    </View>
                    <Text style={styles.muted}>
                      {stale ? 'Sensor readings are stale or unavailable. ' : ''}
                      Updated {new Date(snapshot.receivedAt).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text accessibilityRole="header" style={styles.heading}>Recent runs</Text>
                  {!snapshot.runs.length && <Text style={styles.muted}>No completed runs on the sensor.</Text>}
                  {snapshot.runs.map((run) => (
                    <Pressable key={run.id} accessibilityRole="button" accessibilityHint="Open run graphs" style={styles.row} onPress={() => setSelectedRun(run)}>
                      <Text style={styles.value}>{run.start > 0 ? new Date(run.start * 1000).toLocaleString() : `Run ${run.id}`}</Text>
                      <Text style={styles.muted}>{((run.n * run.step) / 60).toFixed(1)} min · Peak {fahrenheit(run.peak / 10).toFixed(1)} °F</Text>
                      <View style={styles.iconRow}>
                        <Icon name="graph" size={17} color="#a8edc5" />
                        <Text style={styles.muted}>View graphs</Text>
                      </View>
                    </Pressable>
                  ))}
            </>
          )}
            </>
          )}
        </ScrollView>
        {mode === 'local' && selectedRun && (
          <RunDetails
            title={selectedRun.start > 0 ? new Date(selectedRun.start * 1000).toLocaleString() : `Run ${selectedRun.id}`}
            startedAt={selectedRun.start > 0 ? selectedRun.start * 1000 : undefined}
            onClose={() => setSelectedRun(undefined)}
            load={loadRun}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111918' },
  content: { padding: 24, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: '#f4faf6', fontSize: 34, fontWeight: '700', flexShrink: 1 },
  heading: { color: '#f4faf6', fontSize: 23, fontWeight: '700', marginTop: 10 },
  muted: { color: '#b0c4bd', fontSize: 15 },
  label: { color: '#bdd1c9', fontSize: 15 },
  controls: { gap: 8 },
  modeSwitch: { flexDirection: 'row', gap: 8 },
  modeButton: { flex: 1, flexDirection: 'row', gap: 8 },
  inactiveMode: { backgroundColor: '#bdd1c9' },
  input: { color: '#f4faf6', backgroundColor: '#1c2a26', borderRadius: 12, padding: 14, fontSize: 16 },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: '#a8edc5', alignItems: 'center', justifyContent: 'center', padding: 8 },
  buttonText: { color: '#111918', fontSize: 16, fontWeight: '700' },
  error: { color: '#ffb7af', fontSize: 15 },
  card: { backgroundColor: '#1c2a26', borderRadius: 18, padding: 20, gap: 8, marginTop: 12 },
  status: { color: '#a8edc5', fontSize: 28, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginVertical: 8 },
  value: { color: '#f4faf6', fontSize: 18, fontWeight: '600' },
  row: { backgroundColor: '#1c2a26', borderRadius: 12, padding: 16, gap: 4 },
});
