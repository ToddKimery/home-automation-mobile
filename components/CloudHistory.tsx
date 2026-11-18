import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const client = url?.startsWith('https://') && key?.startsWith('sb_publishable_')
  ? createClient(url, key, { auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true } })
  : undefined;

export const cloudConfigured = Boolean(client);

type CloudRun = {
  run_id: number | string;
  started_at: string | null;
  peak_c: number | null;
};

export default function CloudHistory() {
  if (!client) {
    return <Text style={styles.secondary}>Set the Supabase project URL and publishable key in your local .env file, then rebuild the app.</Text>;
  }
  return <SignedInHistory supabase={client} />;
}

function SignedInHistory({ supabase }: { supabase: SupabaseClient }) {
  const [userId, setUserId] = useState<string>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [history, setHistory] = useState<{ userId: string; runs: CloudRun[] }>();
  const runs = history?.userId === userId ? history?.runs : undefined;
  const [queryError, setQueryError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id);
    });
    function updateRefresh(state: string) {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    }
    updateRefresh(AppState.currentState ?? "active");
    const appState = AppState.addEventListener('change', updateRefresh);
    return () => {
      subscription.unsubscribe();
      appState.remove();
      void supabase.auth.stopAutoRefresh();
    };
  }, [supabase]);

  useEffect(() => {
    setHistory(undefined);
    setQueryError('');
    if (!userId) return;
    const accountId = userId;
    const request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 12000);

    async function loadRuns() {
      try {
        const { data, error } = await supabase
          .from('runs')
          .select('run_id,started_at,peak_c')
          .order('started_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(30)
          .abortSignal(request.signal)
          .returns<CloudRun[]>();
        if (request.signal.aborted) return;
        if (error) setQueryError(error.message);
        else setHistory({ userId: accountId, runs: data ?? [] });
      } catch {
        if (!request.signal.aborted) setQueryError('Could not load runs. Check your internet connection.');
      } finally {
        clearTimeout(timeout);
      }
    }

    const showTimeout = () => setQueryError('Supabase did not respond in time.');
    request.signal.addEventListener('abort', showTimeout, { once: true });
    void loadRuns();
    return () => {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', showTimeout);
      request.abort();
    };
  }, [supabase, userId, refresh]);

  async function signIn() {
    if (authBusy || !email.trim() || !password) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setAuthError(error.message);
    } catch {
      setAuthError('Could not sign in. Check your internet connection.');
    } finally {
      setPassword('');
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) setAuthError(error.message);
    } catch {
      setAuthError('Could not sign out. Try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <View style={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>Cloud run history</Text>
      <Text style={styles.secondary}>Completed cycles from Supabase. Live readings are available in Local mode.</Text>
      {!!authError && <Text accessibilityLiveRegion="polite" style={styles.error}>{authError}</Text>}
      {!userId ? (
        <>
          <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" autoCorrect={false}
            keyboardType="email-address" placeholder="Email" placeholderTextColor="#b0c4bd" style={styles.input}
            value={email} onChangeText={setEmail} />
          <TextInput accessibilityLabel="Password" autoComplete="current-password" secureTextEntry
            placeholder="Password" placeholderTextColor="#b0c4bd" style={styles.input}
            value={password} onChangeText={setPassword} onSubmitEditing={() => void signIn()} />
          <Pressable accessibilityRole="button" style={styles.button} disabled={authBusy}
            onPress={() => void signIn()}>
            <Text style={styles.primary}>{authBusy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRefresh((value) => value + 1)}>
              <Text style={styles.primary}>Refresh</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.button} disabled={authBusy} onPress={() => void signOut()}>
              <Text style={styles.primary}>Sign out</Text>
            </Pressable>
          </View>
          {!!queryError && <Text accessibilityLiveRegion="polite" style={styles.error}>{queryError}</Text>}
          {!queryError && !runs && <Text style={styles.secondary}>Loading runs…</Text>}
          {runs?.length === 0 && <Text style={styles.secondary}>No completed runs are available to this account.</Text>}
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
