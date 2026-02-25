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

async function listProjects(): Promise<TropicaliaProject[]> {
  try {
    const res = await fetch(`${BASE}/projects`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    // API may wrap in { projects: [...] } or return an array directly
    return (Array.isArray(data) ? data : data.projects ?? []) as TropicaliaProject[];
  } catch {
    return [];
  }
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
 * Returns the Tropicalia project_id for the patient.
 *
 * On each Vercel cold start the SQLite DB is fresh, so tropicalia_project_id
 * is null even though the project already exists. We therefore:
 *  1. Check the DB first (fast path for warm instances).
 *  2. List all Tropicalia projects and find one whose name matches the patient.
 *  3. Create a new project only if none found.
 *
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

  // Fast path: already linked in this DB instance
  if (patient.tropicalia_project_id) return patient.tropicalia_project_id;

  // Slow path: look for an existing Tropicalia project by name
  const expectedName = `${patient.name} — ${patient.mrn}`;
  const existing = await listProjects();
  const found = existing.find((p) => p.name === expectedName);

  let projectId: string;
  if (found) {
    projectId = found.public_id;
    console.log(`[Tropicalia] Relinked existing project ${projectId} for patient ${patient.name}`);
  } else {
    const project = await createProject(
      expectedName,
      `Clinical records and notes for patient ${patient.name} (MRN: ${patient.mrn})`
    );
    projectId = project.public_id;
    console.log(`[Tropicalia] Created new project ${projectId} for patient ${patient.name}`);
  }

  db.prepare("UPDATE patients SET tropicalia_project_id = ? WHERE id = ?").run(
    projectId,
    patientId
  );

  return projectId;
}

// ─── Documents ───────────────────────────────────────────────────────────────

interface TropicaliaDocument {
  document_id: string;
  filename: string;
  created_at?: string;
}

async function listDocuments(projectId: string): Promise<TropicaliaDocument[]> {
  try {
    const res = await fetch(`${BASE}/projects/${projectId}/documents`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : data.documents ?? []) as TropicaliaDocument[];
  } catch {
    return [];
  }
}

export async function deleteDocument(
  projectId: string,
  documentId: string
): Promise<void> {
  try {
    const res = await fetch(`${BASE}/projects/${projectId}/documents/${documentId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[Tropicalia] deleteDocument ${documentId} failed ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error("[Tropicalia] deleteDocument error:", err);
  }
}

// ─── Search / retrieval ───────────────────────────────────────────────────────

export interface TropicaliaChunk {
  content: string;
  document_id: string;
  filename: string;
  score: number;
}

export interface TropicaliaSearchResult {
  chunks: TropicaliaChunk[];
  /** AI-synthesised answer returned directly by the Tropicalia API, if present. */
  completion: string | null;
}

/**
 * Semantic search over the documents in a project.
 * Returns ranked chunks and an optional pre-synthesised completion,
 * or empty results on failure.
 *
 * The Tropicalia /search endpoint returns:
 *   { completion: string, retrieval_contents: Array<{ document, metadata, score }> }
 */
export async function searchProject(
  projectId: string,
  query: string,
  topK = 5
): Promise<TropicaliaSearchResult> {
  if (!isEnabled()) return { chunks: [], completion: null };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${BASE}/projects/${projectId}/search`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: topK }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Tropicalia] search failed ${res.status}: ${body}`);
      return { chunks: [], completion: null };
    }

    const data = await res.json();

    // Map retrieval_contents → TropicaliaChunk[]
    const raw: Array<{
      document: string;
      metadata: { document_id: string; file_name: string };
      score: number;
    }> = data.retrieval_contents ?? [];

    const chunks: TropicaliaChunk[] = raw.map((r) => ({
      content: r.document,
      document_id: r.metadata?.document_id ?? "",
      filename: r.metadata?.file_name ?? "",
      score: r.score ?? 0,
    }));

    return { chunks, completion: (data.completion as string | null) ?? null };
  } catch (err) {
    console.error("[Tropicalia] searchProject error:", err);
    return { chunks: [], completion: null };
  }
}

// ─── File upload ─────────────────────────────────────────────────────────────

interface UploadResponse {
  document_id: string;
  filename: string;
}

function formatNoteAsMarkdown(
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
    `# ${note.title}`,
    "",
    "## Patient Information",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Patient** | ${patient.name} |`,
    `| **MRN** | ${patient.mrn} |`,
    `| **DOB** | ${patient.dob} |`,
    `| **Allergies** | ${patient.allergies || "None documented"} |`,
    "",
    "## Note Details",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Type** | ${note.note_type} |`,
    `| **Created** | ${note.created_at} |`,
    `| **Updated** | ${note.updated_at} |`,
    "",
    "---",
    "",
    "## Content",
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

  const text = formatNoteAsMarkdown(note, patient);
  const filename = `note-${note.id}-${note.note_type}-${note.created_at
    .replace(/[: ]/g, "-")
    .slice(0, 19)}.md`;

  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/markdown" }), filename);

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

// ─── Full patient record ──────────────────────────────────────────────────────

function formatPatientFullRecord(
  patient: {
    mrn: string;
    name: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    address: string;
    insurance: string;
    blood_type: string;
    allergies: string;
  },
  records: Array<{ record_type: string; title: string; data: string; recorded_at: string }>,
  notes: Array<{ title: string; content: string; note_type: string; created_at: string }>
): string {
  const lines: string[] = [
    "PATIENT MEDICAL RECORD",
    "======================",
    "",
    "DEMOGRAPHICS",
    "------------",
    `Name         : ${patient.name}`,
    `MRN          : ${patient.mrn}`,
    `Date of Birth: ${patient.dob}`,
    `Gender       : ${patient.gender}`,
    `Blood Type   : ${patient.blood_type || "Unknown"}`,
    `Phone        : ${patient.phone || "—"}`,
    `Email        : ${patient.email || "—"}`,
    `Address      : ${patient.address || "—"}`,
    `Insurance    : ${patient.insurance || "—"}`,
    `Allergies    : ${patient.allergies || "None documented"}`,
    "",
  ];

  const byType = (type: string) => records.filter((r) => r.record_type === type);

  const diagnoses = byType("diagnosis");
  if (diagnoses.length > 0) {
    lines.push("DIAGNOSES", "---------");
    for (const d of diagnoses) {
      const data = JSON.parse(d.data);
      lines.push(`• ${d.title}`);
      if (data.icd10) lines.push(`  ICD-10   : ${data.icd10}`);
      if (data.status) lines.push(`  Status   : ${data.status}`);
      if (data.onset) lines.push(`  Onset    : ${data.onset}`);
      if (data.severity) lines.push(`  Severity : ${data.severity}`);
      if (data.smokingHistory) lines.push(`  History  : ${data.smokingHistory}`);
    }
    lines.push("");
  }

  const medications = byType("medication");
  if (medications.length > 0) {
    lines.push("MEDICATIONS", "-----------");
    for (const m of medications) {
      const data = JSON.parse(m.data);
      lines.push(`• ${m.title}`);
      if (data.frequency) lines.push(`  Frequency  : ${data.frequency}`);
      if (data.route) lines.push(`  Route      : ${data.route}`);
      if (data.prescriber) lines.push(`  Prescriber : ${data.prescriber}`);
      if (data.startDate) lines.push(`  Start Date : ${data.startDate}`);
    }
    lines.push("");
  }

  const vitals = byType("vital");
  if (vitals.length > 0) {
    lines.push("VITALS", "------");
    for (const v of vitals) {
      const data = JSON.parse(v.data);
      const value = data.systolic
        ? `${data.systolic}/${data.diastolic} ${data.unit}`
        : `${data.value} ${data.unit}`;
      lines.push(`• ${v.title}: ${value}  (${v.recorded_at.slice(0, 10)})`);
      if (data.note) lines.push(`  Note: ${data.note}`);
    }
    lines.push("");
  }

  const labs = byType("lab");
  if (labs.length > 0) {
    lines.push("LAB RESULTS", "-----------");
    for (const l of labs) {
      const data = JSON.parse(l.data);
      lines.push(
        `• ${l.title}: ${data.value} ${data.unit}  [ref: ${data.reference}]  Status: ${data.status}`
      );
      if (data.trend) lines.push(`  Trend: ${data.trend}`);
    }
    lines.push("");
  }

  const procedures = byType("procedure");
  if (procedures.length > 0) {
    lines.push("PROCEDURES", "----------");
    for (const p of procedures) {
      const data = JSON.parse(p.data);
      lines.push(`• ${p.title}  (${p.recorded_at.slice(0, 10)})`);
      if (data.result) lines.push(`  Result: ${data.result}`);
      if (data.fev1) lines.push(`  FEV1: ${data.fev1}%, FVC: ${data.fvc}%, FEV1/FVC: ${data.fev1_fvc}%`);
    }
    lines.push("");
  }

  if (notes.length > 0) {
    lines.push("CLINICAL NOTES", "--------------");
    for (const note of notes) {
      lines.push(
        `[${note.note_type.toUpperCase()}] ${note.title}  —  ${note.created_at.slice(0, 10)}`
      );
      lines.push("─".repeat(60));
      lines.push(note.content);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Creates a Tropicalia project for the patient (if one doesn't exist) and
 * uploads a comprehensive document containing all their medical data.
 * Skips the upload if the project already has documents (avoids duplicates
 * across cold starts on Vercel).
 */
export async function syncPatientFullRecord(patientId: number): Promise<void> {
  if (!isEnabled()) return;

  try {
    const projectId = await ensurePatientProject(patientId);
    if (!projectId) return;

    // Skip upload if the project already has documents (cold-start re-run)
    const existingDocs = await listDocuments(projectId);
    if (existingDocs.length > 0) {
      console.log(`[Tropicalia] Project ${projectId} already has ${existingDocs.length} doc(s), skipping upload`);
      return;
    }

    const db = getDb();
    const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(patientId) as
      | {
          mrn: string;
          name: string;
          dob: string;
          gender: string;
          phone: string;
          email: string;
          address: string;
          insurance: string;
          blood_type: string;
          allergies: string;
        }
      | undefined;
    if (!patient) return;

    const records = db
      .prepare(
        "SELECT record_type, title, data, recorded_at FROM patient_records WHERE patient_id = ? ORDER BY recorded_at ASC"
      )
      .all(patientId) as Array<{
      record_type: string;
      title: string;
      data: string;
      recorded_at: string;
    }>;

    const notes = db
      .prepare(
        "SELECT title, content, note_type, created_at FROM notes WHERE patient_id = ? ORDER BY created_at ASC"
      )
      .all(patientId) as Array<{
      title: string;
      content: string;
      note_type: string;
      created_at: string;
    }>;

    const text = formatPatientFullRecord(patient, records, notes);
    const filename = `patient-${patient.mrn}-full-record.txt`;

    const form = new FormData();
    form.append("file", new Blob([text], { type: "text/plain" }), filename);

    const res = await fetch(`${BASE}/projects/${projectId}/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Tropicalia] full-record upload failed ${res.status}: ${body}`);
      return;
    }

    const result = (await res.json()) as UploadResponse;
    console.log(
      `[Tropicalia] Full record for ${patient.name} (${patient.mrn}) synced → document ${result.document_id}`
    );
  } catch (err) {
    console.error(`[Tropicalia] syncPatientFullRecord error:`, err);
  }
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
    tropicalia_document_id?: string | null;
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

    // Delete the previously uploaded document so we don't accumulate duplicates
    if (note.tropicalia_document_id) {
      await deleteDocument(projectId, note.tropicalia_document_id);
    }

    const result = await syncNoteToProject(projectId, note, patient);
    if (result) {
      // Persist the new document_id so future edits/deletes can target it
      db.prepare("UPDATE notes SET tropicalia_document_id = ? WHERE id = ?").run(
        result.document_id,
        note.id
      );
      console.log(
        `[Tropicalia] note ${note.id} synced → document ${result.document_id}`
      );
    }
  } catch (err) {
    console.error(`[Tropicalia] syncNoteForPatient error:`, err);
  }
}
