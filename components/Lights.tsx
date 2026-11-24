import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const storageKey = 'homeMonitor.wledAddress';
const defaultAddress = process.env.EXPO_PUBLIC_WLED_URL?.trim() ?? '';

function normalizeAddress(address: string): string | undefined {
  const text = address.trim();
  if (!text) return undefined;
  try {
    const url = new URL(text.includes('://') ? text : `http://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.search || url.hash) return undefined;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

type LightStatus = {
  name: string;
  on: boolean;
  brightness: number;
  color?: string;
  effect?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function decodeStatus(info: unknown, state: unknown, effects: unknown): LightStatus {
  const { name } = record(info);
  const { on, bri, seg, mainseg } = record(state);
  if (typeof on !== 'boolean' || typeof bri !== 'number' || !Number.isFinite(bri) || bri < 0 || bri > 255) {
    throw new Error('The address did not return WLED status.');
  }

  const segments = Array.isArray(seg) ? seg.map(record) : [];
  const { col, fx } = segments.find((segment) => segment.id === mainseg) ?? segments[0] ?? {};
  const rgb = Array.isArray(col) && Array.isArray(col[0]) ? col[0].slice(0, 3) : [];
  const color = rgb.length === 3 && rgb.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    ? '#' + rgb.map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()
    : undefined;
  const effectName = Array.isArray(effects) && typeof fx === 'number' ? effects[fx] : undefined;
  return {
    name: typeof name === 'string' && name ? name : 'WLED',
    on,
    brightness: Math.round(bri / 255 * 100),
    color,
    effect: typeof effectName === 'string' && effectName ? effectName :
      typeof fx === 'number' ? `Effect ${fx}` : undefined,
  };
}

async function readJson(base: string, path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(base + path, { method: 'GET', signal });
  if (!response.ok) throw new Error(`WLED ${path} returned HTTP ${response.status}.`);
  return response.json();
}

export default function Lights() {
  const [address, setAddress] = useState(defaultAddress);
  const [connection, setConnection] = useState<{ address: string }>();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<LightStatus>();
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function restore() {
      let saved: string | null = null;
      try {
        saved = await SecureStore.getItemAsync(storageKey);
      } catch {
        if (active) setSaveError('Could not restore the saved light address.');
      }
      if (!active) return;
      const base = normalizeAddress(saved ?? '') ?? normalizeAddress(defaultAddress);
      if (base) {
        setAddress(base);
        setConnection({ address: base });
      }
      setReady(true);
    }
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!connection) return;
    const { address: base } = connection;
    const request = new AbortController();
    let active = true;
    const timeout = setTimeout(() => request.abort(), 8000);
    setBusy(true);
    setStatus(undefined);
    setError('');

    async function load() {
      try {
        const [info, state, effects] = await Promise.all([
          readJson(base, '/json/info', request.signal),
          readJson(base, '/json/state', request.signal),
          readJson(base, '/json/eff', request.signal).catch(() => undefined),
        ]);
        if (active) setStatus(decodeStatus(info, state, effects));
      } catch (cause) {
        if (active) setError(request.signal.aborted ? 'The light did not respond in time.' :
          cause instanceof Error ? cause.message : 'Could not reach the light.');
      } finally {
        clearTimeout(timeout);
        request.abort();
        if (active) setBusy(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timeout);
      request.abort();
    };
  }, [connection]);

  async function connect() {
    const base = normalizeAddress(address);
    if (!base) {
      setError('Enter a WLED or proxy address.');
      return;
    }
    setAddress(base);
    setConnection({ address: base });
    setSaveError('');
    try {
      await SecureStore.setItemAsync(storageKey, base);
    } catch {
      setSaveError('Could not save the light address on this phone.');
    }
  }

  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.title}>Lights</Text>
      <Text style={styles.muted}>Enter the WLED address or a Tailscale proxy address.</Text>
      <TextInput accessibilityLabel="WLED address" autoCapitalize="none" autoCorrect={false}
        keyboardType="url" placeholder="WLED address" placeholderTextColor="#b0c4bd"
        editable={ready} value={address} onChangeText={setAddress} style={styles.input}
        onSubmitEditing={() => void connect()} />
      <Pressable accessibilityRole="button" disabled={!ready || busy} style={styles.button} onPress={() => void connect()}>
        <Text style={styles.text}>{busy ? 'Reading light status…' : 'Refresh status'}</Text>
      </Pressable>
      {!!saveError && <Text style={styles.error}>{saveError}</Text>}
      {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {status && (
        <View style={styles.card}>
          <Text style={styles.title}>{status.name}</Text>
          <Text style={styles.text}>{status.on ? 'On' : 'Off'}</Text>
          <Text style={styles.muted}>Brightness {status.brightness}%</Text>
          {status.color && (
            <View style={styles.colorRow}>
              <View style={[styles.swatch, { backgroundColor: status.color }]} />
              <Text style={styles.muted}>Color {status.color}</Text>
            </View>
          )}
          {status.effect && <Text style={styles.muted}>{status.effect}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  title: { color: '#f4faf6', fontSize: 23, fontWeight: '700' },
  text: { color: '#f4faf6', fontSize: 16, fontWeight: '600' },
  muted: { color: '#b0c4bd', fontSize: 15 },
  error: { color: '#ffb7af', fontSize: 15 },
  input: { color: '#f4faf6', backgroundColor: '#1c2a26', borderRadius: 12, padding: 14, fontSize: 16 },
  card: { backgroundColor: '#1c2a26', borderRadius: 12, padding: 16, gap: 6 },
  button: { backgroundColor: '#2c4239', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 18, height: 18, borderRadius: 5, borderColor: '#7d948a', borderWidth: 1 },
});
