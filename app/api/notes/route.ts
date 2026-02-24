import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO notes (patient_id, title, content, note_type)
      VALUES (?, ?, ?, ?)
    `).run(body.patient_id, body.title, body.content || "", body.note_type || "general");

    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(result.lastInsertRowid);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
