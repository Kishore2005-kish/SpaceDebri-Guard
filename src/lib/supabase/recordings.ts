import { db } from '@/lib/db';

export interface RecordingInput { recordType: string; recordId?: string | null; payload: unknown; source?: string; }

export async function saveRecording(input: RecordingInput) {
  return db.recording.create({ data: {
    recordType: input.recordType,
    recordId: input.recordId ?? null,
    payload: input.payload as object,
    source: input.source ?? 'sentinel',
  }});
}

export async function listRecordings(limit = 50) {
  return db.recording.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

