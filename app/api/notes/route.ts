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

    // Await so the upload completes before the response is sent —
    // fire-and-forget risks the runtime killing the fetch mid-flight.
    await syncNoteForPatient(Number(body.patient_id), note);

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}
