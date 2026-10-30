import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { colors, fonts, spacing } from '@/constants/theme';

export type TrendPoint = {
  label: string;
  systolic?: number | null;
  diastolic?: number | null;
};

const GUTTER_LEFT = 30;
const GUTTER_BOTTOM = 20;

function niceBounds(values: number[]): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const low = Math.floor((min - 8) / 10) * 10;
  const high = Math.ceil((max + 8) / 10) * 10;
  return {
    min: Math.min(low, high - 40),
    max: Math.max(high, low + 40),
  };
}

/** Line chart of systolic / diastolic values, drawn with react-native-svg. */
export function TrendChart({
  points,
  height = 190,
  summary,
}: {
  points: TrendPoint[];
  height?: number;
  summary?: string;
}) {
  const [width, setWidth] = useState(0);
  const nodeRef = useRef<unknown>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const setNode = (node: unknown) => {
    nodeRef.current = node;
  };

  // onLayout can miss the first paint on web (the node already has its size
  // when it mounts), which left the chart stuck on its placeholder. Measure
  // once after mount as well; on native getBoundingClientRect is absent and
  // onLayout remains the source of truth.
  useEffect(() => {
    const measure = () => {
      const node = nodeRef.current as
        | { getBoundingClientRect?: () => { width: number } }
        | null;
      const next = node?.getBoundingClientRect?.().width ?? 0;
      if (next > 0) setWidth(next);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, []);

  const values: number[] = [];
  for (const point of points) {
    if (typeof point.systolic === 'number') values.push(point.systolic);
    if (typeof point.diastolic === 'number') values.push(point.diastolic);
  }

  if (!values.length || width <= 0) {
    return (
      <View
        ref={setNode}
        style={[styles.chartBox, { height: Math.min(height, 76) }]}
        onLayout={onLayout}
      >
        <AppText variant="caption" tone="muted" style={{ padding: spacing.md }}>
          {summary ?? 'Not enough readings to draw a trend yet.'}
        </AppText>
      </View>
    );
  }

  const { min, max } = niceBounds(values);
  const plotWidth = Math.max(width - GUTTER_LEFT - 4, 10);
  const plotHeight = height - GUTTER_BOTTOM - 8;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  const xAt = (index: number) => GUTTER_LEFT + (points.length > 1 ? index * stepX : plotWidth / 2);
  const yAt = (value: number) => 4 + plotHeight - ((value - min) / (max - min)) * plotHeight;

  const pathFor = (key: 'systolic' | 'diastolic') => {
    let path = '';
    let started = false;
    points.forEach((point, index) => {
      const value = point[key];
      if (typeof value !== 'number') {
        started = false;
        return;
      }
      path += `${started ? 'L' : 'M'}${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)} `;
      started = true;
    });
    return path.trim();
  };

  const gridValues = [0, 1, 2, 3].map(
    (index) => min + ((max - min) * index) / 3,
  );
  const labelCount = Math.min(5, points.length);
  const labelIndices =
    labelCount <= 1
      ? [0]
      : Array.from(
          { length: labelCount },
          (_, index) =>
            Math.round((index * (points.length - 1)) / (labelCount - 1)),
        );

  const systolicPath = pathFor('systolic');
  const diastolicPath = pathFor('diastolic');

  return (
    <View ref={setNode} onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {gridValues.map((value, index) => {
            const y = yAt(value);
            return (
              <SvgText
                key={`ylab-${index}`}
                x={0}
                y={y + 3}
                fontSize={10}
                fontFamily={fonts.semibold}
                fill={colors.mutedLight}
              >
                {Math.round(value)}
              </SvgText>
            );
          })}
          {gridValues.map((value, index) => (
            <Line
              key={`grid-${index}`}
              x1={GUTTER_LEFT}
              x2={width - 2}
              y1={yAt(value)}
              y2={yAt(value)}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray={index === 0 ? undefined : '3 4'}
            />
          ))}

          {diastolicPath ? (
            <Path
              d={diastolicPath}
              stroke={colors.brandMuted}
              strokeWidth={2}
              strokeDasharray="5 5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {systolicPath ? (
            <Path
              d={systolicPath}
              stroke={colors.brand}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {points.map((point, index) =>
            typeof point.systolic === 'number' ? (
              <Circle
                key={`dot-${index}`}
                cx={xAt(index)}
                cy={yAt(point.systolic)}
                r={3.5}
                fill={colors.card}
                stroke={colors.brand}
                strokeWidth={2}
              />
            ) : null,
          )}

          {points.map((point, index) =>
            labelIndices.includes(index) ? (
              <SvgText
                key={`xlab-${index}`}
                x={xAt(index)}
                y={height - 5}
                fontSize={10}
                fontFamily={fonts.semibold}
                fill={colors.mutedLight}
                textAnchor={
                  index === 0
                    ? 'start'
                    : index === points.length - 1
                      ? 'end'
                      : 'middle'
                }
              >
                {point.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
      ) : null}
    </View>
  );
}

/** Rounded vertical bars for per-day averages. */
export function BarChart({
  bars,
  height = 170,
  suffix = '',
}: {
  bars: { label: string; value: number }[];
  height?: number;
  suffix?: string;
}) {
  const maxValue = bars.length ? Math.max(...bars.map((bar) => bar.value)) : 0;
  const top = maxValue > 0 ? Math.ceil((maxValue + 8) / 10) * 10 : 10;
  const plotHeight = height - 26;
  const ticks = [top, top * 0.75, top * 0.5, top * 0.25, 0];

  return (
    <View style={[styles.barRoot, { height }]}>
      <View style={[styles.barTicks, { height: plotHeight }]}>
        {ticks.map((tick, index) => (
          <AppText
            key={`tick-${index}`}
            variant="tiny"
            style={{ color: colors.mutedLight, fontFamily: fonts.semibold }}
          >
            {Math.round(tick)}
            {index === 0 ? suffix : ''}
          </AppText>
        ))}
      </View>

      <View style={{ flex: 1, height }}>
        <View style={[styles.barArea, { height: plotHeight }]}>
          {bars.map((bar, index) => (
            <View key={`${bar.label}-${index}`} style={styles.barSlot}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: Math.max(
                        bar.value > 0 ? 4 : 2,
                        (bar.value / top) * plotHeight,
                      ),
                      backgroundColor: bar.value > 0 ? colors.brand : colors.border,
                    },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
        <View style={styles.barLabels}>
          {bars.map((bar, index) => (
            <AppText
              key={`lab-${bar.label}-${index}`}
              variant="tiny"
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                color: colors.mutedLight,
                fontFamily: fonts.semibold,
              }}
            >
              {bar.label}
            </AppText>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartBox: {
    backgroundColor: colors.card,
  },
  barRoot: { flexDirection: 'row', gap: spacing.sm },
  barTicks: {
    width: 34,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: {
    width: '72%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabels: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
});
