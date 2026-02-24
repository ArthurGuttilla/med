import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncNoteForPatient } from "@/lib/tropicalia";
import type { Note } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO notes (patient_id, title, content, note_type)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        body.patient_id,
        body.title,
        body.content || "",
        body.note_type || "general"
      );

    const note = db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(result.lastInsertRowid) as Note;

    // Sync to Tropicalia asynchronously — never blocks the HTTP response
    syncNoteForPatient(body.patient_id, note).catch((err) =>
      console.error("[Tropicalia] sync error:", err)
    );

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
