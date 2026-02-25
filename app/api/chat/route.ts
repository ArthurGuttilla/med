import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { searchProject, TropicaliaChunk } from "@/lib/tropicalia";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patient_id, session_id, message } = body;

    const db = getDb();

    // Get patient context
    const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(patient_id) as
      | Record<string, unknown>
      | undefined;
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const records = db
      .prepare("SELECT * FROM patient_records WHERE patient_id = ? ORDER BY recorded_at DESC")
      .all(patient_id) as Array<Record<string, unknown>>;

    const notes = db
      .prepare("SELECT * FROM notes WHERE patient_id = ? ORDER BY created_at DESC")
      .all(patient_id) as Array<Record<string, unknown>>;

    // Get or create session
    let currentSessionId = session_id;
    if (!currentSessionId) {
      const sessionResult = db
        .prepare("INSERT INTO chat_sessions (patient_id) VALUES (?)")
        .run(patient_id);
      currentSessionId = sessionResult.lastInsertRowid;
    }

    // Get chat history
    const history = db
      .prepare(
        "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC"
      )
      .all(currentSessionId) as Array<{ role: string; content: string }>;

    // Save user message
    db.prepare(
      "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)"
    ).run(currentSessionId, message);

    // ── Tropicalia RAG ───────────────────────────────────────────────────────
    // Query the patient's Tropicalia project for chunks relevant to the user's message.
    let tropicaliaChunks: TropicaliaChunk[] = [];
    const projectId = patient.tropicalia_project_id as string | undefined;
    if (projectId) {
      tropicaliaChunks = await searchProject(projectId, message);
    }

    const hasTropicaliaContext = tropicaliaChunks.length > 0;

    // ── Build system prompt ──────────────────────────────────────────────────
    const vitalRecords = records.filter((r) => r.record_type === "vital");
    const diagnoses = records.filter((r) => r.record_type === "diagnosis");
    const medications = records.filter((r) => r.record_type === "medication");
    const labs = records.filter((r) => r.record_type === "lab");
    const procedures = records.filter((r) => r.record_type === "procedure");

    const systemPrompt = `You are a medical AI assistant helping a doctor review patient information and clinical history. You provide concise, clinically relevant responses to support medical decision-making. Format your responses using Markdown — use headers, bullet lists, bold for key terms, and code blocks for structured data where appropriate.

## Patient: ${patient.name} (MRN: ${patient.mrn})
- **DOB**: ${patient.dob} | **Gender**: ${patient.gender} | **Blood Type**: ${patient.blood_type}
- **Allergies**: ${patient.allergies || "None documented"}
- **Insurance**: ${patient.insurance}

## Active Diagnoses
${
  diagnoses
    .map((d) => {
      const data = JSON.parse(d.data as string);
      return `- ${d.title}: ${data.icd10 || ""} | Status: ${data.status || "Active"} | Onset: ${d.recorded_at}`;
    })
    .join("\n") || "None documented"
}

## Current Medications
${
  medications
    .map((m) => {
      const data = JSON.parse(m.data as string);
      return `- ${m.title}: ${data.frequency || ""} (since ${data.startDate || m.recorded_at})`;
    })
    .join("\n") || "None documented"
}

## Recent Vitals
${
  vitalRecords
    .map((v) => {
      const data = JSON.parse(v.data as string);
      return `- ${v.title}: ${data.value || `${data.systolic}/${data.diastolic}`} ${data.unit || ""} (${v.recorded_at})`;
    })
    .join("\n") || "None recorded"
}

## Recent Lab Results
${
  labs
    .map((l) => {
      const data = JSON.parse(l.data as string);
      return `- ${l.title}: ${data.value} ${data.unit || ""} (Reference: ${data.reference || "N/A"}, Status: ${data.status || "N/A"}) - ${l.recorded_at}`;
    })
    .join("\n") || "None recorded"
}

${
  procedures.length > 0
    ? `## Procedures\n${procedures.map((p) => `- ${p.title}: ${p.recorded_at}`).join("\n")}`
    : ""
}

## Clinical Notes (most recent first)
${
  notes
    .map((n) => `### ${n.title} [${n.note_type}] - ${n.created_at}\n${n.content}`)
    .join("\n\n") || "No notes documented"
}
${
  hasTropicaliaContext
    ? `
---
## Retrieved from Knowledge Base (Tropicalia)
The following passages were retrieved from the patient's medical record knowledge base as most relevant to this question:

${tropicaliaChunks
  .map(
    (chunk, i) =>
      `### Source ${i + 1}: ${chunk.filename} (relevance: ${(chunk.score * 100).toFixed(0)}%)\n${chunk.content}`
  )
  .join("\n\n")}

Use these retrieved passages as additional authoritative context when forming your answer.`
    : ""
}

---
Answer questions about this patient based on the above clinical data. If asked about topics outside the patient's record, clarify what information is available. Always remind the doctor to verify information against source systems.`;

    // Build messages for Claude
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: message },
    ];

    // Stream the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let assistantMessage = "";

        const anthropicStream = await client.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          thinking: { type: "adaptive" },
          system: systemPrompt,
          messages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            assistantMessage += event.delta.text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
              )
            );
          }
        }

        // Save assistant message
        db.prepare(
          "INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'assistant', ?)"
        ).run(currentSessionId, assistantMessage);

        // Emit sources from Tropicalia alongside the done signal
        const sources = tropicaliaChunks.map((c) => ({
          document_id: c.document_id,
          filename: c.filename,
          score: c.score,
        }));

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, session_id: currentSessionId, sources })}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Chat request failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const patient_id = searchParams.get("patient_id");

    if (!patient_id) {
      return NextResponse.json({ error: "patient_id required" }, { status: 400 });
    }

    const db = getDb();
    const sessions = db
      .prepare(
        `SELECT s.*,
        (SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY created_at ASC LIMIT 1) as first_message,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) as message_count
      FROM chat_sessions s
      WHERE s.patient_id = ?
      ORDER BY s.created_at DESC`
      )
      .all(patient_id);

    return NextResponse.json(sessions);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
