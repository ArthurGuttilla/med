import { getDb } from "./db";

const BASE = "https://api.tropicalia.dev/v1";

export function isEnabled(): boolean {
  return !!process.env.TROPICALIA_API_KEY;
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.TROPICALIA_API_KEY}` };
}

// ─── Projects ────────────────────────────────────────────────────────────────

interface TropicaliaProject {
  public_id: string;
  name: string;
  description: string | null;
  created_at: string;
  modified_at: string;
}

export async function createProject(
  name: string,
  description?: string
): Promise<TropicaliaProject> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? null }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tropicalia createProject ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Returns the Tropicalia project_id for the patient, creating one if needed.
 * Returns null if TROPICALIA_API_KEY is not configured.
 */
export async function ensurePatientProject(
  patientId: number
): Promise<string | null> {
  if (!isEnabled()) return null;

  const db = getDb();
  const patient = db
    .prepare("SELECT * FROM patients WHERE id = ?")
    .get(patientId) as
    | { id: number; name: string; mrn: string; dob: string; tropicalia_project_id?: string }
    | undefined;

  if (!patient) return null;
  if (patient.tropicalia_project_id) return patient.tropicalia_project_id;

  const project = await createProject(
    `${patient.name} — ${patient.mrn}`,
    `Clinical records and notes for patient ${patient.name} (MRN: ${patient.mrn})`
  );

  db.prepare("UPDATE patients SET tropicalia_project_id = ? WHERE id = ?").run(
    project.public_id,
    patientId
  );

  return project.public_id;
}

// ─── File upload ─────────────────────────────────────────────────────────────

interface UploadResponse {
  document_id: string;
  filename: string;
}

function formatNoteAsText(
  note: {
    id: number;
    title: string;
    content: string;
    note_type: string;
    created_at: string;
    updated_at: string;
  },
  patient: { name: string; mrn: string; dob: string; allergies: string }
): string {
  return [
    "CLINICAL NOTE",
    "=============",
    `Patient  : ${patient.name}`,
    `MRN      : ${patient.mrn}`,
    `DOB      : ${patient.dob}`,
    `Allergies: ${patient.allergies || "None documented"}`,
    "",
    `Title    : ${note.title}`,
    `Type     : ${note.note_type}`,
    `Date     : ${note.created_at}`,
    `Updated  : ${note.updated_at}`,
    "",
    "─".repeat(60),
    "",
    note.content,
  ].join("\n");
}

export async function syncNoteToProject(
  projectId: string,
  note: {
    id: number;
    title: string;
    content: string;
    note_type: string;
    created_at: string;
    updated_at: string;
  },
  patient: { name: string; mrn: string; dob: string; allergies: string }
): Promise<UploadResponse | null> {
  if (!isEnabled()) return null;

  const text = formatNoteAsText(note, patient);
  const filename = `note-${note.id}-${note.note_type}-${note.created_at
    .replace(/[: ]/g, "-")
    .slice(0, 19)}.txt`;

  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/plain" }), filename);

  const res = await fetch(`${BASE}/projects/${projectId}/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[Tropicalia] upload failed ${res.status}: ${body}`);
    return null;
  }

  return res.json();
}

/**
 * Convenience: ensures a project exists for the patient, then uploads the note.
 * Silently skips if TROPICALIA_API_KEY is not set.
 * Never throws — failures are logged but don't interrupt the caller.
 */
export async function syncNoteForPatient(
  patientId: number,
  note: {
    id: number;
    title: string;
    content: string;
    note_type: string;
    created_at: string;
    updated_at: string;
  }
): Promise<void> {
  if (!isEnabled()) return;

  try {
    const projectId = await ensurePatientProject(patientId);
    if (!projectId) return;

    const db = getDb();
    const patient = db
      .prepare("SELECT name, mrn, dob, allergies FROM patients WHERE id = ?")
      .get(patientId) as
      | { name: string; mrn: string; dob: string; allergies: string }
      | undefined;

    if (!patient) return;

    const result = await syncNoteToProject(projectId, note, patient);
    if (result) {
      console.log(
        `[Tropicalia] note ${note.id} synced → document ${result.document_id}`
      );
    }
  } catch (err) {
    console.error(`[Tropicalia] syncNoteForPatient error:`, err);
  }
}
