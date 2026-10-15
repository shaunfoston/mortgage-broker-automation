import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkLength, isSignatureAcceptable, strokeToPath, strokesToDataUrl, strokesToSvg } from '../src/signature.ts';
import { fromBase64, fromUtf8 } from '../src/crypto.ts';
import { signatureHash } from '../src/consent.ts';

test('signature strokes become a valid SVG data URL', () => {
  const strokes: [number, number][][] = [
    [[10, 50], [40, 20], [80, 60], [120, 30], [160, 70]],
    [[30, 80], [150, 80]],
  ];
  assert.match(strokeToPath(strokes[0]), /^M10 50Q40 20 60 40/);
  assert.ok(inkLength(strokes) > 200);
  assert.ok(isSignatureAcceptable(strokes, 320));
  assert.ok(!isSignatureAcceptable([[[5, 5]]], 320), 'a tap is not a signature');
  const svg = strokesToSvg(strokes, 320, 160);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="320" height="160"/);
  const url = strokesToDataUrl(strokes, 320, 160);
  assert.match(url, /^data:image\/svg\+xml;base64,/);
  assert.equal(fromUtf8(fromBase64(url.split(',')[1])), svg);
  assert.equal(signatureHash(url).length, 64);
});
