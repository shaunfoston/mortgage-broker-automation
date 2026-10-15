// Must be imported before anything that needs secure randomness.
import * as ExpoCrypto from 'expo-crypto';
import { setRandomSource } from '@mortgage-options/shared/crypto.ts';

const g = globalThis as any;
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = (arr: any) => ExpoCrypto.getRandomValues(arr);
}
setRandomSource((n) => ExpoCrypto.getRandomBytes(n));
