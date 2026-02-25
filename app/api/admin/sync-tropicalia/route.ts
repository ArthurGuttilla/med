import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedDatabase } from "@/lib/seed";
import { syncPatientFullRecord, isEnabled } from "@/lib/tropicalia";

/**
 * GET /api/admin/sync-tropicalia
 *
 * Force-syncs all patients that don't yet have a Tropicalia project.
 * Call this once from your browser or curl after setting TROPICALIA_API_KEY
 * in your Vercel environment variables and redeploying.
 *
 * Example:
 *   curl https://<your-app>.vercel.app/api/admin/sync-tropicalia
 */
export async function GET() {
  if (!isEnabled()) {
    return NextResponse.json(
      { error: "TROPICALIA_API_KEY is not set — Tropicalia is disabled." },
      { status: 503 }
    );
  }

  seedDatabase();
  const db = getDb();
  const patients = db
    .prepare("SELECT id, name, tropicalia_project_id FROM patients")
    .all() as Array<{ id: number; name: string; tropicalia_project_id: string | null }>;

  const results: Array<{ id: number; name: string; status: string; project_id?: string }> = [];

  for (const p of patients) {
    if (p.tropicalia_project_id) {
      results.push({ id: p.id, name: p.name, status: "already_synced", project_id: p.tropicalia_project_id });
      continue;
    }

    try {
      await syncPatientFullRecord(p.id);
      const updated = db
        .prepare("SELECT tropicalia_project_id FROM patients WHERE id = ?")
        .get(p.id) as { tropicalia_project_id: string | null };
      results.push({ id: p.id, name: p.name, status: "synced", project_id: updated.tropicalia_project_id ?? undefined });
    } catch (err) {
      results.push({ id: p.id, name: p.name, status: `error: ${String(err)}` });
    }
  }

  return NextResponse.json({ results });
}
