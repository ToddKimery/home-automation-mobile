import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function fahrenheit(celsius: number) {
  return celsius * 9 / 5 + 32;
}

export type RunSeries = {
  seconds: number;
  temperatureF: number[];
  humidity: number[];
};

export function decodeRunSeries(json: unknown, units: 'sensor' | 'display' = 'sensor'): RunSeries {
  if (!json || typeof json !== 'object') throw new Error('No samples were saved for this run.');
  const { step, t, h } = json as { step?: unknown; t?: unknown; h?: unknown };
  const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
  if (!numeric(step) || step <= 0 || !Array.isArray(t) || !Array.isArray(h) ||
    !t.length || t.length !== h.length || !t.every(numeric) || !h.every(numeric)) {
    throw new Error('Temperature and humidity samples are unavailable for this run.');
  }
  if (units === 'display') return { seconds: step, temperatureF: t, humidity: h };
  return { seconds: step, temperatureF: t.map((sample) => fahrenheit(sample / 10)), humidity: h.map((sample) => sample / 10) };
}

type DetailsProps = {
  title: string;
  onClose: () => void;
  load: (signal: AbortSignal) => Promise<RunSeries>;
};

export default function RunDetails({ title, onClose, load }: DetailsProps) {
  const [data, setData] = useState<RunSeries>();
  const [error, setError] = useState('');

  useEffect(() => {
    const request = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      request.abort();
      if (active) setError('The run did not load in time.');
    }, 12000);
    void load(request.signal).then(
      (series) => { if (active && !request.signal.aborted) setData(series); },
      (cause) => {
        if (active && !request.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load this run.');
        }
      },
    ).finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      request.abort();
    };
  }, [load]);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <Text style={styles.heading}>Back to runs</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          {!error && !data && <ActivityIndicator accessibilityLabel="Loading run" color="#a8edc5" />}
          {data && (
            <>
              <Chart title="Temperature (°F)" unit="°F" color="#ffc487" values={data.temperatureF} seconds={data.seconds} />
              <Chart title="Relative humidity (%)" unit="%" color="#92d7f4" values={data.humidity} seconds={data.seconds} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const chartHeight = 126;

function plotIndices(values: number[]) {
  const indices = [0];
  const width = Math.max(1, Math.ceil((values.length - 2) / 50));
  for (let start = 1; start < values.length - 1; start += width) {
    let min = start;
    let max = start;
    for (let index = start + 1; index < Math.min(start + width, values.length - 1); index++) {
      if (values[index] < values[min]) min = index;
      if (values[index] > values[max]) max = index;
    }
    indices.push(Math.min(min, max));
    if (min !== max) indices.push(Math.max(min, max));
  }
  if (values.length > 1) indices.push(values.length - 1);
  return indices;
}

function Chart({ title, values, seconds, unit, color }: {
  title: string; values: number[]; seconds: number; unit: string; color: string;
}) {
  const [width, setWidth] = useState(0);
  const indices = plotIndices(values);
  const plotted = indices.map(index => values[index]);
  const min = Math.min(...plotted);
  const max = Math.max(...plotted);
  const low = min === max ? min - 1 : min;
  const high = min === max ? max + 1 : max;
  const points = indices.map(index => ({
    x: 3 + (width - 6) * index / Math.max(1, values.length - 1),
    y: 3 + (chartHeight - 6) * (high - values[index]) / (high - low),
  }));
  const minutes = (values.length - 1) * seconds / 60;

  return (
    <View style={styles.card} accessible accessibilityLabel={`${title} over ${minutes.toFixed(1)} minutes. Low ${min.toFixed(1)}, high ${max.toFixed(1)}.`}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.secondary}>Low {min.toFixed(1)}{unit} · High {max.toFixed(1)}{unit}</Text>
      <View style={styles.plot} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
        {[3, chartHeight / 2, chartHeight - 3].map(top => (
          <View key={top} style={[styles.grid, { top }]} />
        ))}
        {width > 6 && points.map((point, index) => {
          const next = points[index + 1];
          if (!next) {
            return <View key={index} style={[styles.line, { left: point.x - 2, top: point.y - 2, width: 4, height: 4, backgroundColor: color }]} />;
          }
          const dx = next.x - point.x;
          const dy = next.y - point.y;
          const length = Math.hypot(dx, dy);
          return <View key={index} style={[styles.line, {
            backgroundColor: color,
            width: length + 1,
            left: (point.x + next.x - length) / 2,
            top: (point.y + next.y) / 2 - 1,
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          }]} />;
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.secondary}>0 min</Text>
        <Text style={styles.secondary}>{minutes.toFixed(1)} min</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111918' },
  content: { padding: 24, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  close: { alignSelf: 'flex-start', padding: 10, minHeight: 48 },
  title: { color: '#f4faf6', fontSize: 25, fontWeight: '700' },
  heading: { color: '#f4faf6', fontSize: 17, fontWeight: '600' },
  secondary: { color: '#b0c4bd', fontSize: 14 },
  error: { color: '#ffb7af', fontSize: 15 },
  card: { backgroundColor: '#1c2a26', padding: 16, borderRadius: 16, gap: 8 },
  plot: { height: chartHeight, position: 'relative' },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#3d514a' },
  line: { position: 'absolute', height: 2, borderRadius: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
