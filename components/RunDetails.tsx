import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from './Icon';

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
  startedAt?: number;
  onClose: () => void;
  load: (signal: AbortSignal) => Promise<RunSeries>;
};

export default function RunDetails({ title, startedAt, onClose, load }: DetailsProps) {
  const [data, setData] = useState<RunSeries>();
  const [error, setError] = useState('');
  const [sampleIndex, setSampleIndex] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      request.abort();
      if (active) setError('The run did not load in time.');
    }, 12000);
    void load(request.signal).then(
      (series) => {
        if (active && !request.signal.aborted) {
          setData(series);
          setSampleIndex(0);
        }
      },
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
        <ScrollView
          contentContainerStyle={styles.content}
          scrollEnabled={!scrubbing}
          stickyHeaderIndices={data ? [1] : undefined}
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
              <Icon name="back" color="#a8edc5" />
              <Text style={styles.heading}>Back to runs</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            {!error && !data && <ActivityIndicator accessibilityLabel="Loading run" color="#a8edc5" />}
          </View>
          {data && (
            <View style={styles.traceHeader}>
              <Text style={styles.secondary}>Tap or drag either graph to inspect a reading.</Text>
              <View style={styles.readings}>
                <View>
                  <Text style={styles.secondary}>Elapsed</Text>
                  <Text style={styles.reading}>{formatElapsed(sampleIndex * data.seconds)}</Text>
                </View>
                <View>
                  <Text style={styles.secondary}>Temperature</Text>
                  <Text style={styles.reading}>{data.temperatureF[sampleIndex].toFixed(1)} °F</Text>
                </View>
                <View>
                  <Text style={styles.secondary}>Humidity</Text>
                  <Text style={styles.reading}>{data.humidity[sampleIndex].toFixed(1)}%</Text>
                </View>
              </View>
              {startedAt != null && Number.isFinite(startedAt) && (
                <Text style={styles.secondary}>
                  Recorded at {new Date(startedAt + sampleIndex * data.seconds * 1000).toLocaleTimeString()}
                </Text>
              )}
            </View>
          )}
          {data && (
            <Chart icon="temperature" title="Temperature" unit="°F" color="#ffc487" values={data.temperatureF}
              seconds={data.seconds} selected={sampleIndex} onSelect={setSampleIndex} onScrub={setScrubbing} />
          )}
          {data && (
            <Chart icon="humidity" title="Relative humidity" unit="%" color="#92d7f4" values={data.humidity}
              seconds={data.seconds} selected={sampleIndex} onSelect={setSampleIndex} onScrub={setScrubbing} />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const chartHeight = 126;
const inset = 4;

function formatElapsed(seconds: number) {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = String(wholeSeconds % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function nearestSample(x: number, width: number, count: number) {
  if (width <= inset * 2 || count <= 1) return 0;
  const index = Math.round((x - inset) / (width - inset * 2) * (count - 1));
  return Math.max(0, Math.min(index, count - 1));
}

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

function Chart({ title, values, seconds, unit, color, icon, selected, onSelect, onScrub }: {
  icon: 'temperature' | 'humidity'; title: string; values: number[]; seconds: number; unit: string; color: string;
  selected: number; onSelect: (index: number) => void; onScrub: (active: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const { min, max, low, high, lines } = useMemo(() => {
    const indices = plotIndices(values);
    const plotted = indices.map(index => values[index]);
    const min = Math.min(...plotted);
    const max = Math.max(...plotted);
    const low = min === max ? min - 1 : min;
    const high = min === max ? max + 1 : max;
    const points = indices.map(index => ({
      x: inset + (width - inset * 2) * index / Math.max(1, values.length - 1),
      y: inset + (chartHeight - inset * 2) * (high - values[index]) / (high - low),
    }));
    const lines = width > inset * 2 && points.map((point, index) => {
      const next = points[index + 1];
      if (!next) return null;
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
    });
    return { min, max, low, high, lines };
  }, [color, values, width]);

  const cursorX = inset + (width - inset * 2) * selected / Math.max(1, values.length - 1);
  const cursorY = inset + (chartHeight - inset * 2) * (high - values[selected]) / (high - low);

  function selectAt(event: GestureResponderEvent) {
    onSelect(nearestSample(event.nativeEvent.locationX, width, values.length));
  }

  return (
    <View style={styles.card}>
      <View style={styles.iconRow}>
        <Icon name={icon} color={color} />
        <Text style={styles.heading}>{title} ({unit})</Text>
      </View>
      <Text style={styles.secondary}>Low {min.toFixed(1)}{unit} · High {max.toFixed(1)}{unit}</Text>
      <View
        style={styles.plot}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${title} graph`}
        accessibilityValue={{ text: `${formatElapsed(selected * seconds)} elapsed, ${values[selected].toFixed(1)} ${unit}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          const delta = nativeEvent.actionName === 'increment' ? 1 : -1;
          onSelect(Math.max(0, Math.min(values.length - 1, selected + delta)));
        }}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          onScrub(true);
          selectAt(event);
        }}
        onResponderMove={selectAt}
        onResponderRelease={() => onScrub(false)}
        onResponderTerminate={() => onScrub(false)}
        onResponderTerminationRequest={() => false}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {[inset, chartHeight / 2, chartHeight - inset].map(top => (
            <View key={top} style={[styles.grid, { top }]} />
          ))}
          {lines}
          {width > inset * 2 && (
            <>
              <View style={[styles.cursor, { left: cursorX - 0.5 }]} />
              <View style={[styles.marker, { left: cursorX - 5, top: cursorY - 5, backgroundColor: color }]} />
            </>
          )}
        </View>
      </View>
      <View style={styles.axis}>
        <Text style={styles.secondary}>0:00</Text>
        <Text style={styles.secondary}>{formatElapsed((values.length - 1) * seconds)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111918' },
  content: { padding: 24, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { gap: 8 },
  traceHeader: { backgroundColor: '#263831', borderRadius: 14, padding: 12, gap: 8 },
  readings: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  reading: { color: '#f4faf6', fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#d2e9df' },
  marker: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: '#111918' },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  close: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', padding: 10, minHeight: 48 },
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
