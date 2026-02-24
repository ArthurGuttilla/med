import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    db.prepare(`
      UPDATE notes SET title=?, content=?, note_type=?, updated_at=datetime('now')
      WHERE id=?
    `).run(body.title, body.content, body.note_type || "general", id);

    const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
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
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
