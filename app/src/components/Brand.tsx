import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { C } from '../lib/theme.ts';

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityLabel="Mortgage Options">
      <Rect width="40" height="40" rx="9" fill={C.royal} />
      <Path d="M8 20.5 20 10l12 10.5" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12.5 18.5V30h15V18.5" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinejoin="round" />
      <Rect x="17.5" y="22.5" width="5" height="7.5" rx="1" fill="#fff" />
    </Svg>
  );
}

export function Wordmark({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LogoMark size={size} />
      <Text style={{ fontSize: size * 0.55, fontWeight: '800', color: light ? C.white : C.graphite, letterSpacing: -0.3 }}>
        Mortgage <Text style={{ color: light ? '#9DB5FF' : C.royal }}>Options</Text>
      </Text>
    </View>
  );
}
