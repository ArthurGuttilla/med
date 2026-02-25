import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { seedDatabase } from "@/lib/seed";
import { ensurePatientProject, syncPatientFullRecord } from "@/lib/tropicalia";

export async function GET() {
  try {
    seedDatabase();
    const db = getDb();
    const patients = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM notes WHERE patient_id = p.id) as note_count,
        (SELECT recorded_at FROM patient_records WHERE patient_id = p.id ORDER BY recorded_at DESC LIMIT 1) as last_record_date
      FROM patients p
      ORDER BY p.name ASC
    `).all() as Array<{ id: number; tropicalia_project_id: string | null }>;

    // For any patient without a Tropicalia project, create one and upload their full record.
    // Runs async and non-blocking so it never delays the response.
    const unsynced = patients.filter((p) => !p.tropicalia_project_id);
    for (const p of unsynced) {
      syncPatientFullRecord(p.id).catch((err) =>
        console.error("[Tropicalia] full-record sync error for patient", p.id, err)
      );
    }

    return NextResponse.json(patients);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO patients (mrn, name, dob, gender, phone, email, address, insurance, blood_type, allergies)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.mrn, body.name, body.dob, body.gender,
      body.phone || "", body.email || "", body.address || "",
      body.insurance || "", body.blood_type || "", body.allergies || ""
    );
    const patientId = result.lastInsertRowid as number;

    // Create a Tropicalia project for the patient (non-blocking, best-effort)
    ensurePatientProject(patientId).catch((err) =>
      console.error("[Tropicalia] project creation error:", err)
    );

    const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(patientId);
    return NextResponse.json(patient, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create patient" }, { status: 500 });
  }
}
