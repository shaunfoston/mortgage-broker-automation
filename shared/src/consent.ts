/**
 * Consent wording and consent-record integrity.
 *
 * IMPORTANT: the wording below is a working draft written for software
 * testing. It has NOT been reviewed by a compliance professional or
 * solicitor and must be replaced/approved by the firm (and its network,
 * if an appointed representative) before use with real clients.
 */
import { canonicalJson, sha256Hex } from './crypto.ts';

export const CONSENT_VERSION = 'consent-2026-10-draft-1';

export interface ConsentItem {
  key: string;
  label: string;
  required: boolean;
  /** Explicit consent is only one of several possible lawful bases; see docs/COMPLIANCE.md. */
  basisNote: string;
}

export const FIRM_PLACEHOLDER = '[Firm legal name], [FCA FRN]';

export const CONSENT_INTRO =
  'Mortgage Options will use the information you give us to research and recommend a mortgage and any related insurance, ' +
  'and to arrange it with the lenders and insurers you choose. Our privacy notice explains how long we keep your data, ' +
  'who we share it with and your rights, including access, correction and erasure.';

export const CONSENT_ITEMS: readonly ConsentItem[] = [
  {
    key: 'privacyNotice',
    label: 'I have been given, or offered, the Mortgage Options privacy notice.',
    required: true,
    basisNote: 'Transparency (UK GDPR Arts. 13–14).',
  },
  {
    key: 'processing',
    label:
      'I understand my personal and financial information will be used to give me mortgage and protection advice and shared with lenders, insurers and credit reference agencies when I apply.',
    required: true,
    basisNote: 'Typically contract / pre-contract steps (Art. 6(1)(b)) — confirm with compliance.',
  },
  {
    key: 'specialCategory',
    label:
      'I consent to Mortgage Options processing any health or other sensitive information I choose to share, where it is needed for my advice or applications.',
    required: false,
    basisNote: 'Explicit consent for special category data (Art. 9(2)(a)).',
  },
  {
    key: 'recording',
    label:
      'I agree to this meeting being audio-recorded. The recording is transcribed by an AI service and summarised with AI assistance; my adviser checks everything before it is used.',
    required: false,
    basisNote: 'Recording/AI processing disclosure; confirm basis and DPIA with compliance.',
  },
  {
    key: 'marketing',
    label: 'I would like to hear from Mortgage Options about reviews and relevant products in future. (Optional)',
    required: false,
    basisNote: 'Consent for direct marketing (PECR).',
  },
];

export const RECORDING_DISCLOSURE_VERSION = 'recording-disclosure-2026-10-draft-1';

/** Script the broker reads aloud before pressing record. */
export const RECORDING_DISCLOSURE_SCRIPT =
  'Before we start, I’d like to record our conversation so I don’t miss anything. ' +
  'The recording is converted to text by a transcription service and summarised with AI help. ' +
  'I check everything myself before it goes on your file. The audio is deleted from the transcription service once ' +
  'the text is back, and we keep records in line with our privacy notice. Are you happy for me to record? ' +
  'You can ask me to stop at any time.';

export function consentTextForHash(): string {
  return canonicalJson({ version: CONSENT_VERSION, intro: CONSENT_INTRO, items: CONSENT_ITEMS.map((i) => ({ key: i.key, label: i.label })) });
}

export function consentTextHash(): string {
  return sha256Hex(consentTextForHash());
}

export interface ConsentRecordCore {
  id: string;
  caseId: string;
  applicantIndex: 1 | 2;
  signerName: string;
  consentVersion: string;
  consentTextHash: string;
  answers: Record<string, boolean>;
  signatureSha256: string;
  signedAtUtc: string;
  signedAtLocal: string;
  timeZone: string;
  brokerName: string;
  device: string;
}

export function validateConsentAnswers(answers: Record<string, boolean>): string[] {
  return CONSENT_ITEMS.filter((i) => i.required && answers[i.key] !== true).map((i) => i.label);
}

/** Hash binding every element of the consent record (including the signature image hash). */
export function consentRecordHash(c: ConsentRecordCore): string {
  return sha256Hex(canonicalJson(c));
}

/** Strip a data-URL prefix and hash the base64 image bytes as text. */
export function signatureHash(dataUrl: string): string {
  const b64 = dataUrl.replace(/^data:image\/[a-z+]+;base64,/, '');
  return sha256Hex(b64);
}
