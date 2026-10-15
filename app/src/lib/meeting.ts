import type { Backend } from '@mortgage-options/shared/apiClient.ts';
import type { Repo, Recording } from '@mortgage-options/shared/db/repo.ts';

/** Upload a saved recording and mark it as processing. */
export async function startTranscription(repo: Repo, backend: Backend, rec: Recording): Promise<void> {
  if (!rec.fileUri) throw new Error('The audio file for this recording is no longer on the device');
  const job = await backend.startTranscription(rec.fileUri, rec.mime ?? 'audio/mp4');
  await repo.markTranscriptionStarted(rec.id, job.id, job.provider);
}

/**
 * Check one processing recording. Returns true when it reached a final state.
 * On success the server's copy is deleted straight away (data minimisation).
 */
export async function pollTranscription(repo: Repo, backend: Backend, rec: Recording): Promise<boolean> {
  if (rec.status !== 'processing' || !rec.remoteJobId) return true;
  const s = await backend.getTranscription(rec.remoteJobId);
  if (s.status === 'completed') {
    await repo.setTranscript(rec.id, s.transcript, s.utterances);
    backend.deleteTranscription(rec.remoteJobId).catch(() => undefined);
    return true;
  }
  if (s.status === 'error') {
    await repo.markTranscriptionFailed(rec.id, s.error);
    return true;
  }
  if (s.status === 'expired') {
    await repo.markTranscriptionFailed(rec.id, 'Transcript expired on the server before it was collected — transcribe again');
    return true;
  }
  return false;
}

/** Send the transcript for AI extraction and store proposals for broker review. */
export async function runExtraction(repo: Repo, backend: Backend, rec: Recording): Promise<string> {
  if (!rec.transcript) throw new Error('No transcript yet');
  const k = await repo.getCase(rec.caseId);
  if (!k) throw new Error('Case not found');
  const { model, proposal } = await backend.extract(rec.transcript, k.numApplicants);
  const ex = await repo.createExtraction(rec.caseId, rec.id, proposal, model);
  return ex.id;
}
