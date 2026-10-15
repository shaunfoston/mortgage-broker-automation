import React, { useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { PanResponder, View, Text, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { strokeToPath, strokesToDataUrl, isSignatureAcceptable, type Stroke } from '@mortgage-options/shared/signature.ts';
import { C, R } from '../lib/theme.ts';

export interface SignaturePadHandle {
  clear(): void;
  /** Returns an SVG data URL, or null if nothing (or too little) was drawn. */
  toDataUrl(): string | null;
  isEmpty(): boolean;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; onChange?: (hasInk: boolean) => void; onDrawingChange?: (drawing: boolean) => void }>(function SignaturePad(
  { height = 200, onChange, onDrawingChange },
  ref,
) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [, force] = useState(0);
  const width = useRef(320);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        onDrawingChange?.(true);
        current.current = [[e.nativeEvent.locationX, e.nativeEvent.locationY]];
        force((x) => x + 1);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        const s = current.current;
        if (!s) return;
        const last = s[s.length - 1];
        if (Math.hypot(locationX - last[0], locationY - last[1]) >= 1.5) {
          s.push([locationX, locationY]);
          force((x) => x + 1);
        }
      },
      onPanResponderRelease: () => {
        onDrawingChange?.(false);
        const s = current.current;
        current.current = null;
        if (s) {
          setStrokes((prev) => {
            const next = [...prev, s];
            onChange?.(true);
            return next;
          });
        }
      },
    }),
  ).current;

  useImperativeHandle(ref, () => ({
    clear() {
      setStrokes([]);
      current.current = null;
      onChange?.(false);
    },
    toDataUrl() {
      if (!isSignatureAcceptable(strokes, width.current)) return null;
      return strokesToDataUrl(strokes, width.current, height);
    },
    isEmpty() {
      return strokes.length === 0;
    },
  }));

  const all = current.current ? [...strokes, current.current] : strokes;
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)}
      style={{ height, borderRadius: R.md, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.white, overflow: 'hidden' }}
      accessibilityLabel="Signature area. Sign with your finger."
      {...pan.panHandlers}
    >
      <Svg width="100%" height="100%" pointerEvents="none">
        <Line x1="16" x2="96%" y1={height - 40} y2={height - 40} stroke={C.line} strokeWidth={1} />
        {all.map((s, i) => (
          <Path key={i} d={strokeToPath(s)} stroke={C.graphite} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
      {all.length === 0 ? (
        <Text pointerEvents="none" style={{ position: 'absolute', left: 16, bottom: 46, color: C.muted, fontSize: 14 }}>
          Sign here
        </Text>
      ) : null}
    </View>
  );
});
