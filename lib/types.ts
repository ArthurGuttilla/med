export interface Patient {
  id: number;
  mrn: string;
  name: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  insurance: string;
  blood_type: string;
  allergies: string;
  tropicalia_project_id: string | null;
  created_at: string;
}

export interface PatientRecord {
  id: number;
  patient_id: number;
  record_type: "vital" | "diagnosis" | "medication" | "lab" | "procedure";
  title: string;
  data: string; // JSON string
  recorded_at: string;
}

export interface Note {
  id: number;
  patient_id: number;
  title: string;
  content: string;
  note_type: "progress" | "consultation" | "discharge" | "admission" | "general";
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatSession {
  id: number;
  patient_id: number;
  created_at: string;
}
