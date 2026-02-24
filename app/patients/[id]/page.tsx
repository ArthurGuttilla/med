"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Patient, PatientRecord, Note } from "@/lib/types";
import Link from "next/link";

const AGE_FROM_DOB = (dob: string) => {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  progress: "bg-blue-50 text-blue-700 border-blue-100",
  consultation: "bg-purple-50 text-purple-700 border-purple-100",
  discharge: "bg-green-50 text-green-700 border-green-100",
  admission: "bg-orange-50 text-orange-700 border-orange-100",
  general: "bg-gray-100 text-gray-600 border-gray-200",
};

const RECORD_TYPE_ICON: Record<string, string> = {
  vital: "🩺",
  diagnosis: "🔬",
  medication: "💊",
  lab: "🧪",
  procedure: "🏥",
};

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "records">("overview");

  // Note editor state
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteForm, setNoteForm] = useState({ title: "", content: "", note_type: "progress" });
  const [savingNote, setSavingNote] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/patients/${id}`);
    if (res.ok) {
      const data = await res.json();
      setPatient(data.patient);
      setRecords(data.records);
      setNotes(data.notes);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openNewNote = () => {
    setEditingNote(null);
    setNoteForm({ title: "", content: "", note_type: "progress" });
    setShowNoteEditor(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setNoteForm({ title: note.title, content: note.content, note_type: note.note_type });
    setShowNoteEditor(true);
  };

  const saveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNote(true);
    if (editingNote) {
      await fetch(`/api/notes/${editingNote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteForm),
      });
    } else {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...noteForm, patient_id: id }),
      });
    }
    setShowNoteEditor(false);
    fetchData();
    setSavingNote(false);
  };

  const deleteNote = async (noteId: number) => {
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    setDeleteConfirm(null);
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!patient) {
    return <div className="text-center py-12 text-gray-500">Patient not found</div>;
  }

  const vitals = records.filter(r => r.record_type === "vital");
  const diagnoses = records.filter(r => r.record_type === "diagnosis");
  const medications = records.filter(r => r.record_type === "medication");
  const labs = records.filter(r => r.record_type === "lab");
  const procedures = records.filter(r => r.record_type === "procedure");

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/" className="hover:text-gray-700">Patients</Link>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 font-medium">{patient.name}</span>
      </div>

      {/* Patient Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-700 font-semibold text-lg">
                {patient.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{patient.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{patient.mrn}</span>
                <span>{AGE_FROM_DOB(patient.dob)} years</span>
                <span>{patient.gender}</span>
                {patient.blood_type && (
                  <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs font-medium border border-red-100">
                    {patient.blood_type}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/patients/${id}/chat`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Chat with AI
            </Link>
            <button
              onClick={openNewNote}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Note
            </button>
          </div>
        </div>

        {/* Quick info row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400">Date of Birth</p>
            <p className="text-sm font-medium text-gray-700">{new Date(patient.dob).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Contact</p>
            <p className="text-sm font-medium text-gray-700">{patient.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Insurance</p>
            <p className="text-sm font-medium text-gray-700">{patient.insurance || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Allergies</p>
            <p className="text-sm font-medium text-red-600">{patient.allergies || "None"}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-5 w-fit">
        {(["overview", "notes", "records"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
            {tab === "notes" && ` (${notes.length})`}
            {tab === "records" && ` (${records.length})`}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Diagnoses */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>🔬</span> Active Diagnoses
            </h3>
            {diagnoses.length === 0 ? <p className="text-sm text-gray-400">No diagnoses recorded</p> : (
              <div className="space-y-3">
                {diagnoses.map(d => {
                  const data = JSON.parse(d.data);
                  return (
                    <div key={d.id} className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{d.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {data.icd10 && <span className="font-mono mr-2">{data.icd10}</span>}
                          Since {new Date(d.recorded_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                        data.status === "Active" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {data.status || "Active"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Medications */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>💊</span> Current Medications
            </h3>
            {medications.length === 0 ? <p className="text-sm text-gray-400">No medications recorded</p> : (
              <div className="space-y-3">
                {medications.map(m => {
                  const data = JSON.parse(m.data);
                  return (
                    <div key={m.id}>
                      <p className="text-sm font-medium text-gray-800">{m.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{data.frequency} · {data.route} · Since {data.startDate || new Date(m.recorded_at).toLocaleDateString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Latest Vitals */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>🩺</span> Latest Vitals
            </h3>
            {vitals.length === 0 ? <p className="text-sm text-gray-400">No vitals recorded</p> : (
              <div className="grid grid-cols-2 gap-3">
                {vitals.map(v => {
                  const data = JSON.parse(v.data);
                  const value = data.value !== undefined ? `${data.value} ${data.unit || ""}` : `${data.systolic}/${data.diastolic} ${data.unit || ""}`;
                  return (
                    <div key={v.id} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">{v.title}</p>
                      <p className="text-base font-semibold text-gray-800 mt-0.5">{value}</p>
                      {data.note && <p className="text-xs text-orange-500 mt-0.5">{data.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lab Results */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>🧪</span> Recent Lab Results
            </h3>
            {labs.length === 0 ? <p className="text-sm text-gray-400">No labs recorded</p> : (
              <div className="space-y-2">
                {labs.map(l => {
                  const data = JSON.parse(l.data);
                  return (
                    <div key={l.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{l.title}</p>
                        <p className="text-xs text-gray-400">{data.reference && `Ref: ${data.reference}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-800">{data.value} {data.unit}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          data.status === "Normal" ? "bg-green-50 text-green-600" :
                          data.status === "High" || data.status === "Low" ? "bg-red-50 text-red-600" :
                          "bg-yellow-50 text-yellow-600"
                        }`}>{data.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Procedures */}
          {procedures.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span>🏥</span> Procedures
              </h3>
              <div className="space-y-2">
                {procedures.map(p => {
                  const data = JSON.parse(p.data);
                  return (
                    <div key={p.id} className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.title}</p>
                        {data.result && <p className="text-xs text-gray-500 mt-0.5">{data.result}</p>}
                      </div>
                      <p className="text-xs text-gray-400">{new Date(p.recorded_at).toLocaleDateString()}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{notes.length} notes</p>
            <button onClick={openNewNote}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Note
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No notes yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{note.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.general}`}>
                          {note.note_type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{new Date(note.created_at).toLocaleString()}</p>
                      <p className="mt-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditNote(note)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => setDeleteConfirm(note.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Records Tab */}
      {activeTab === "records" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Record</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Details</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map(r => {
                const data = JSON.parse(r.data);
                return (
                  <tr key={r.id}>
                    <td className="py-3 px-4">
                      <span className="text-base" title={r.record_type}>{RECORD_TYPE_ICON[r.record_type]}</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-gray-800">{r.title}</td>
                    <td className="py-3 px-4 text-gray-500 hidden md:table-cell">
                      {r.record_type === "vital" && (
                        <span>{data.value !== undefined ? `${data.value} ${data.unit}` : `${data.systolic}/${data.diastolic} ${data.unit}`}</span>
                      )}
                      {r.record_type === "lab" && (
                        <span>{data.value} {data.unit} — <span className={data.status === "Normal" ? "text-green-600" : "text-red-600"}>{data.status}</span></span>
                      )}
                      {r.record_type === "diagnosis" && <span className="font-mono text-xs">{data.icd10}</span>}
                      {r.record_type === "medication" && <span>{data.frequency}</span>}
                      {r.record_type === "procedure" && <span>{data.result || ""}</span>}
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{new Date(r.recorded_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Note Editor Modal */}
      {showNoteEditor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editingNote ? "Edit Note" : "New Note"}</h2>
              <button onClick={() => setShowNoteEditor(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={saveNote} className="flex flex-col flex-1 p-5 gap-4 overflow-hidden">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                  <input required value={noteForm.title} onChange={e => setNoteForm({...noteForm, title: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Note title" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={noteForm.note_type} onChange={e => setNoteForm({...noteForm, note_type: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="progress">Progress</option>
                    <option value="consultation">Consultation</option>
                    <option value="admission">Admission</option>
                    <option value="discharge">Discharge</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
                <textarea
                  value={noteForm.content}
                  onChange={e => setNoteForm({...noteForm, content: e.target.value})}
                  className="w-full h-full min-h-[200px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Clinical note content..."
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNoteEditor(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={savingNote}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {savingNote ? "Saving..." : "Save Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Note</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => deleteNote(deleteConfirm)}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
