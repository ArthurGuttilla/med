import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncNoteForPatient, deleteDocument } from "@/lib/tropicalia";
import type { Note } from "@/lib/types";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    db.prepare(
      `UPDATE notes SET title=?, content=?, note_type=?, updated_at=datetime('now')
       WHERE id=?`
    ).run(body.title, body.content, body.note_type || "general", id);

    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Note;

    // Sync updated note to Tropicalia asynchronously
    syncNoteForPatient(note.patient_id, note).catch((err) =>
      console.error("[Tropicalia] sync error:", err)
    );

    return NextResponse.json(note);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Note | undefined;

    if (note?.tropicalia_document_id) {
      const patient = db
        .prepare("SELECT tropicalia_project_id FROM patients WHERE id = ?")
        .get(note.patient_id) as { tropicalia_project_id: string | null } | undefined;

      if (patient?.tropicalia_project_id) {
        deleteDocument(patient.tropicalia_project_id, note.tropicalia_document_id).catch(
          (err) => console.error("[Tropicalia] delete error:", err)
        );
      }
    }

    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
