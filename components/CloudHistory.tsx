import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const project = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const codeKey = 'dryer.phonePairingCode';

export const cloudConfigured = Boolean(project?.startsWith('https://') && key?.startsWith('sb_publishable_'));

type CloudRun = {
  run_id: number | string;
  started_at: string | null;
  peak_c: number | null;
};

function isRun(value: unknown): value is CloudRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<CloudRun>;
  return (typeof run.run_id === 'number' || typeof run.run_id === 'string') &&
    (run.started_at === null || typeof run.started_at === 'string') &&
    (run.peak_c === null || typeof run.peak_c === 'number');
}

async function readRuns(code: string): Promise<CloudRun[]> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(`${project}/rest/v1/rpc/read_dryer_phone_runs`, {
      method: 'POST',
      headers: { apikey: key!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
      signal: abort.signal,
    });
    if (response.status === 403) throw new Error('This pairing code is invalid or has been revoked.');
    if (response.status === 404) throw new Error('Phone pairing has not been set up in Supabase yet.');
    if (!response.ok) throw new Error(`Cloud history is unavailable (HTTP ${response.status}).`);
    const runs: unknown = await response.json();
    if (!Array.isArray(runs) || !runs.every(isRun)) throw new Error('Supabase returned unexpected run data.');
    return runs;
  } finally {
    clearTimeout(timeout);
  }
}

export default function CloudHistory() {
  const [savedCode, setSavedCode] = useState<string | null>();
  const [input, setInput] = useState('');
  const [runs, setRuns] = useState<CloudRun[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cloudConfigured) return;
    let active = true;
    async function loadSavedCode() {
      try {
        const code = await SecureStore.getItemAsync(codeKey);
        if (!active) return;
        setSavedCode(code);
        if (code) {
          setBusy(true);
          const history = await readRuns(code);
          if (active) setRuns(history);
        }
      } catch (cause) {
        if (active) {
          setSavedCode((previous) => previous ?? null);
          setError(cause instanceof Error ? cause.message : 'Could not load cloud history.');
        }
      } finally {
        if (active) setBusy(false);
      }
    }
    void loadSavedCode();
    return () => { active = false; };
  }, []);

  async function load(code: string, pair: boolean) {
    if (busy) return;
    if (!/^[0-9a-f]{64}$/.test(code)) {
      setError('Paste the complete pairing code from Supabase.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const history = await readRuns(code);
      if (pair) {
        await SecureStore.setItemAsync(codeKey, code);
        setSavedCode(code);
        setInput('');
      }
      setRuns(history);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load cloud history.');
    } finally {
      setBusy(false);
    }
  }

  async function forgetPhone() {
    if (busy) return;
    try {
      await SecureStore.deleteItemAsync(codeKey);
      setSavedCode(null);
      setRuns(undefined);
      setError('');
    } catch {
      setError('Could not remove the pairing code.');
    }
  }

  if (!cloudConfigured) {
    return <Text style={styles.secondary}>Configure the Supabase URL and publishable key, then rebuild the app.</Text>;
  }

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Cloud run history</Text>
      {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {savedCode === undefined && <Text style={styles.secondary}>Checking phone pairing…</Text>}
      {savedCode === null && (
        <>
          <Text style={styles.secondary}>Pair this phone once to view completed runs away from home.</Text>
          <TextInput accessibilityLabel="Phone pairing code" autoCapitalize="none" autoCorrect={false}
            secureTextEntry placeholder="Phone pairing code" placeholderTextColor="#b0c4bd"
            style={styles.input} value={input} onChangeText={setInput}
            onSubmitEditing={() => void load(input.trim().toLowerCase(), true)} />
          <Pressable accessibilityRole="button" style={styles.button} disabled={busy}
            onPress={() => void load(input.trim().toLowerCase(), true)}>
            <Text style={styles.primary}>{busy ? 'Pairing…' : 'Pair phone'}</Text>
          </Pressable>
        </>
      )}
      {!!savedCode && (
        <>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.button} disabled={busy}
              onPress={() => void load(savedCode, false)}>
              <Text style={styles.primary}>Refresh</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.button} disabled={busy}
              onPress={() => void forgetPhone()}>
              <Text style={styles.primary}>Forget pairing</Text>
            </Pressable>
          </View>
          {busy && <Text style={styles.secondary}>Loading runs…</Text>}
          {!busy && !error && runs?.length === 0 && <Text style={styles.secondary}>No completed runs yet.</Text>}
          {runs?.map((run) => (
            <View key={String(run.run_id)} style={styles.card}>
              <Text style={styles.primary}>
                {run.started_at ? new Date(run.started_at).toLocaleString() : `Run ${run.run_id}`}
              </Text>
              <Text style={styles.secondary}>
                {run.peak_c == null ? 'Peak unavailable' : `Peak ${run.peak_c} °C`}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 10 },
  title: { color: '#f4faf6', fontSize: 23, fontWeight: '700' },
  primary: { color: '#f4faf6', fontSize: 16, fontWeight: '600' },
  secondary: { color: '#b0c4bd', fontSize: 15 },
  error: { color: '#ffb7af', fontSize: 15 },
  input: { color: '#f4faf6', backgroundColor: '#1c2a26', borderRadius: 12, padding: 14, fontSize: 16 },
  card: { backgroundColor: '#1c2a26', borderRadius: 12, padding: 16, gap: 4 },
  button: { backgroundColor: '#2c4239', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  actions: { flexDirection: 'row', gap: 8 },
});
