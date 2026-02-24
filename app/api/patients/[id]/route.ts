import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const records = db.prepare(`
      SELECT * FROM patient_records WHERE patient_id = ? ORDER BY recorded_at DESC
    `).all(id);

    const notes = db.prepare(`
      SELECT * FROM notes WHERE patient_id = ? ORDER BY created_at DESC
    `).all(id);

    return NextResponse.json({ patient, records, notes });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch patient" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    db.prepare(`
      UPDATE patients SET name=?, dob=?, gender=?, phone=?, email=?, address=?, insurance=?, blood_type=?, allergies=?
      WHERE id=?
    `).run(
      body.name, body.dob, body.gender, body.phone || "",
      body.email || "", body.address || "", body.insurance || "",
      body.blood_type || "", body.allergies || "", id
    );

    const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);
    return NextResponse.json(patient);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update patient" }, { status: 500 });
  }
}
