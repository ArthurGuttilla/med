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
 * Never throws — failures are logged but don't interrupt the caller.
 */
export async function syncPatientFullRecord(patientId: number): Promise<void> {
  if (!isEnabled()) return;

  try {
    const projectId = await ensurePatientProject(patientId);
    if (!projectId) return;

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
