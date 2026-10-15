/** Signature strokes → compact SVG (stored as a data URL on the consent record). */
import { toBase64, utf8 } from './crypto.ts';

export type Point = [number, number];
export type Stroke = Point[];

const r1 = (n: number) => Math.round(n * 10) / 10;

export function strokeToPath(s: Stroke): string {
  if (s.length === 0) return '';
  if (s.length === 1) {
    const [x, y] = s[0];
    return `M${r1(x)} ${r1(y)}l0.1 0.1`;
  }
  // Quadratic smoothing through midpoints.
  let d = `M${r1(s[0][0])} ${r1(s[0][1])}`;
  for (let i = 1; i < s.length - 1; i++) {
    const [x, y] = s[i];
    const mx = (x + s[i + 1][0]) / 2;
    const my = (y + s[i + 1][1]) / 2;
    d += `Q${r1(x)} ${r1(y)} ${r1(mx)} ${r1(my)}`;
  }
  const last = s[s.length - 1];
  return `${d}L${r1(last[0])} ${r1(last[1])}`;
}

/** Total ink length — used to reject accidental taps as "signatures". */
export function inkLength(strokes: Stroke[]): number {
  let total = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return total;
}

export function isSignatureAcceptable(strokes: Stroke[], width: number): boolean {
  return strokes.length > 0 && inkLength(strokes) >= Math.max(60, width * 0.25);
}

export function strokesToSvg(strokes: Stroke[], width: number, height: number, color = '#1C1C1C'): string {
  const paths = strokes
    .filter((s) => s.length)
    .map((s) => `<path d="${strokeToPath(s)}"/>`)
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    `<g fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`
  );
}

export function strokesToDataUrl(strokes: Stroke[], width: number, height: number): string {
  return `data:image/svg+xml;base64,${toBase64(utf8(strokesToSvg(strokes, width, height)))}`;
}
