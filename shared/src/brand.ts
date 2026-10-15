/**
 * Mortgage Options brand tokens.
 * Royal blue is deepened from the v3 #007BFF (3.98:1 on white — fails WCAG AA
 * for body text) to #1F4FD8 (6.6:1). Graphite #1C1C1C is kept from the brand doc.
 */
export const BRAND = {
  name: 'Mortgage Options',
  royal: '#1F4FD8',
  royalDark: '#163BA8',
  royalTint: '#E8EEFC',
  graphite: '#1C1C1C',
  graphite2: '#2B2F33',
  slate: '#5B6470',
  line: '#DDE2EA',
  surface: '#F4F6FA',
  white: '#FFFFFF',
  success: '#167A3E',
  successTint: '#E3F4EA',
  warning: '#8A5A00',
  warningTint: '#FFF3D6',
  danger: '#B42318',
  dangerTint: '#FDE7E5',
  footer: '© Mortgage Options | Powered by Dimond Automations',
} as const;

/** Original mark: rounded royal-blue tile with a white roofline and doorway. */
export function logoSvg(size = 40): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40" role="img" aria-label="Mortgage Options">
  <rect width="40" height="40" rx="9" fill="${BRAND.royal}"/>
  <path d="M8 20.5 20 10l12 10.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12.5 18.5V30h15V18.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/>
  <rect x="17.5" y="22.5" width="5" height="7.5" rx="1" fill="#fff"/>
</svg>`;
}
