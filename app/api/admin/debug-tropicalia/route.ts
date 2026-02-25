import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedDatabase } from "@/lib/seed";
import { ensurePatientProject, isEnabled } from "@/lib/tropicalia";

const BASE = "https://api.tropicalia.dev/v1";

function auth() {
  return { Authorization: `Bearer ${process.env.TROPICALIA_API_KEY}` };
}

async function probe(label: string, url: string, init: RequestInit) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(t);
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return { label, status: res.status, ok: res.ok, body: json };
  } catch (err) {
    return { label, status: 0, ok: false, body: String(err) };
  }
}

/**
 * GET /api/admin/debug-tropicalia?patient_id=1&query=medications
 *
 * Auto-resolves the patient's Tropicalia project (relinking from the live
 * API if needed after a cold start), then probes five search endpoint
 * variants so we can see exactly which one the API accepts.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const patientId = Number(searchParams.get("patient_id") ?? "1");
  const query = searchParams.get("query") ?? "What medications is this patient on?";

  if (!isEnabled()) {
    return NextResponse.json({ error: "TROPICALIA_API_KEY not set" }, { status: 503 });
  }

  seedDatabase();
  const db = getDb();
  const patient = db
    .prepare("SELECT id, name, tropicalia_project_id FROM patients WHERE id = ?")
    .get(patientId) as { id: number; name: string; tropicalia_project_id: string | null } | undefined;

  if (!patient) return NextResponse.json({ error: "patient not found" }, { status: 404 });

  // Auto-relink project from Tropicalia API if the cold-start DB lost the ID
  const pid = await ensurePatientProject(patientId);
  if (!pid) return NextResponse.json({ error: "could not resolve tropicalia project" }, { status: 500 });

  const [docs, search, queryEp, retrieve, searchGet] = await Promise.all([
    probe("GET /projects/{id}/documents", `${BASE}/projects/${pid}/documents`, {
      headers: auth(),
    }),
    probe("POST /projects/{id}/search", `${BASE}/projects/${pid}/search`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: 3 }),
    }),
    probe("POST /projects/{id}/query", `${BASE}/projects/${pid}/query`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: 3 }),
    }),
    probe("POST /projects/{id}/retrieve", `${BASE}/projects/${pid}/retrieve`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: 3 }),
    }),
    probe("GET /projects/{id}/search?q=", `${BASE}/projects/${pid}/search?q=${encodeURIComponent(query)}&top_k=3`, {
      headers: auth(),
    }),
  ]);

  return NextResponse.json({
    patient: { id: patient.id, name: patient.name, project_id: pid },
    query,
    probes: [docs, search, queryEp, retrieve, searchGet],
  });
}
