import { getDb } from "./db";

export function seedDatabase() {
  const db = getDb();

  const count = (db.prepare("SELECT COUNT(*) as c FROM patients").get() as { c: number }).c;
  if (count > 0) return;

  const insertPatient = db.prepare(`
    INSERT INTO patients (mrn, name, dob, gender, phone, email, address, insurance, blood_type, allergies)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRecord = db.prepare(`
    INSERT INTO patient_records (patient_id, record_type, title, data, recorded_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertNote = db.prepare(`
    INSERT INTO notes (patient_id, title, content, note_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seed = db.transaction(() => {
    // Patient 1
    const p1 = insertPatient.run(
      "MRN-001",
      "Maria Santos",
      "1978-03-15",
      "Female",
      "+1 (555) 234-5678",
      "maria.santos@email.com",
      "123 Oak Street, Springfield, IL 62701",
      "BlueCross BlueShield",
      "A+",
      "Penicillin, Sulfa drugs"
    );

    insertRecord.run(p1.lastInsertRowid, "vital", "Blood Pressure", JSON.stringify({ systolic: 138, diastolic: 88, unit: "mmHg", note: "Slightly elevated" }), "2025-01-10 09:00:00");
    insertRecord.run(p1.lastInsertRowid, "vital", "Heart Rate", JSON.stringify({ value: 78, unit: "bpm" }), "2025-01-10 09:00:00");
    insertRecord.run(p1.lastInsertRowid, "vital", "Weight", JSON.stringify({ value: 72, unit: "kg" }), "2025-01-10 09:00:00");
    insertRecord.run(p1.lastInsertRowid, "vital", "Temperature", JSON.stringify({ value: 36.8, unit: "°C" }), "2025-01-10 09:00:00");
    insertRecord.run(p1.lastInsertRowid, "diagnosis", "Type 2 Diabetes Mellitus", JSON.stringify({ icd10: "E11.9", status: "Active", onset: "2020-05-12", severity: "Moderate" }), "2020-05-12 10:00:00");
    insertRecord.run(p1.lastInsertRowid, "diagnosis", "Hypertension", JSON.stringify({ icd10: "I10", status: "Active", onset: "2019-08-20", severity: "Stage 1" }), "2019-08-20 10:00:00");
    insertRecord.run(p1.lastInsertRowid, "medication", "Metformin 1000mg", JSON.stringify({ dosage: "1000mg", frequency: "Twice daily", route: "Oral", prescriber: "Dr. Johnson", startDate: "2020-05-20" }), "2020-05-20 08:00:00");
    insertRecord.run(p1.lastInsertRowid, "medication", "Lisinopril 10mg", JSON.stringify({ dosage: "10mg", frequency: "Once daily", route: "Oral", prescriber: "Dr. Johnson", startDate: "2019-09-01" }), "2019-09-01 08:00:00");
    insertRecord.run(p1.lastInsertRowid, "lab", "HbA1c", JSON.stringify({ value: 7.2, unit: "%", reference: "< 7.0", status: "High", trend: "Improving" }), "2025-01-05 07:30:00");
    insertRecord.run(p1.lastInsertRowid, "lab", "Fasting Glucose", JSON.stringify({ value: 142, unit: "mg/dL", reference: "70-100", status: "High" }), "2025-01-05 07:30:00");
    insertRecord.run(p1.lastInsertRowid, "lab", "Creatinine", JSON.stringify({ value: 0.9, unit: "mg/dL", reference: "0.6-1.2", status: "Normal" }), "2025-01-05 07:30:00");

    insertNote.run(p1.lastInsertRowid, "Follow-up Visit - Diabetes Management", "Patient presents for routine follow-up of Type 2 DM. HbA1c improved from 7.8% to 7.2% since last visit. Patient reports good medication compliance. No hypoglycemic episodes. Continues Metformin 1000mg BID. Diet compliance moderate. Recommending referral to nutritionist. Blood pressure slightly elevated at 138/88 - continue current antihypertensive. Next HbA1c in 3 months.", "progress", "2025-01-10 10:30:00", "2025-01-10 10:30:00");
    insertNote.run(p1.lastInsertRowid, "Annual Physical Examination", "Comprehensive annual exam performed. Patient in generally good health. Weight stable at 72kg (BMI 26.5). Cardiovascular: regular rhythm, no murmurs. Respiratory: clear. Abdominal: soft, non-tender. Diabetic foot exam: intact sensation, no ulcers. Ophthalmology referral placed for annual dilated eye exam. Mammography ordered. Recommended increase in physical activity to 150 min/week.", "general", "2024-07-15 14:00:00", "2024-07-15 14:00:00");

    // Patient 2
    const p2 = insertPatient.run(
      "MRN-002",
      "James Thornton",
      "1965-11-28",
      "Male",
      "+1 (555) 345-6789",
      "j.thornton@email.com",
      "456 Maple Ave, Chicago, IL 60601",
      "United Healthcare",
      "B-",
      "Aspirin, Codeine"
    );

    insertRecord.run(p2.lastInsertRowid, "vital", "Blood Pressure", JSON.stringify({ systolic: 152, diastolic: 94, unit: "mmHg", note: "Elevated - Stage 2" }), "2025-01-08 08:30:00");
    insertRecord.run(p2.lastInsertRowid, "vital", "Heart Rate", JSON.stringify({ value: 84, unit: "bpm" }), "2025-01-08 08:30:00");
    insertRecord.run(p2.lastInsertRowid, "vital", "Weight", JSON.stringify({ value: 95, unit: "kg" }), "2025-01-08 08:30:00");
    insertRecord.run(p2.lastInsertRowid, "vital", "SpO2", JSON.stringify({ value: 97, unit: "%" }), "2025-01-08 08:30:00");
    insertRecord.run(p2.lastInsertRowid, "diagnosis", "Coronary Artery Disease", JSON.stringify({ icd10: "I25.10", status: "Active", onset: "2018-02-14", severity: "Moderate" }), "2018-02-14 09:00:00");
    insertRecord.run(p2.lastInsertRowid, "diagnosis", "Hypertension - Stage 2", JSON.stringify({ icd10: "I10", status: "Active", onset: "2015-06-10", severity: "Stage 2" }), "2015-06-10 09:00:00");
    insertRecord.run(p2.lastInsertRowid, "diagnosis", "Hypercholesterolemia", JSON.stringify({ icd10: "E78.5", status: "Active", onset: "2016-03-22" }), "2016-03-22 09:00:00");
    insertRecord.run(p2.lastInsertRowid, "medication", "Atorvastatin 40mg", JSON.stringify({ dosage: "40mg", frequency: "Once daily at bedtime", route: "Oral", prescriber: "Dr. Williams", startDate: "2016-04-01" }), "2016-04-01 08:00:00");
    insertRecord.run(p2.lastInsertRowid, "medication", "Metoprolol Succinate 50mg", JSON.stringify({ dosage: "50mg", frequency: "Once daily", route: "Oral", prescriber: "Dr. Williams", startDate: "2018-03-01" }), "2018-03-01 08:00:00");
    insertRecord.run(p2.lastInsertRowid, "medication", "Amlodipine 5mg", JSON.stringify({ dosage: "5mg", frequency: "Once daily", route: "Oral", prescriber: "Dr. Williams", startDate: "2020-01-15" }), "2020-01-15 08:00:00");
    insertRecord.run(p2.lastInsertRowid, "lab", "LDL Cholesterol", JSON.stringify({ value: 98, unit: "mg/dL", reference: "< 70 for CAD patients", status: "High", trend: "Stable" }), "2025-01-03 07:00:00");
    insertRecord.run(p2.lastInsertRowid, "lab", "Troponin I", JSON.stringify({ value: 0.01, unit: "ng/mL", reference: "< 0.04", status: "Normal" }), "2025-01-03 07:00:00");

    insertNote.run(p2.lastInsertRowid, "Cardiology Follow-up", "Patient with known CAD for routine cardiology follow-up. Denies chest pain, dyspnea at rest. Experiences mild exertional dyspnea after 2 flights of stairs. BP 152/94 - suboptimal control. Increased Amlodipine to 10mg. EKG: normal sinus rhythm, no acute ST changes. Echo ordered for evaluation of LV function. LDL 98 - above target of 70 for CAD patients. Consider adding Ezetimibe. Follow-up in 6 weeks.", "consultation", "2025-01-08 11:00:00", "2025-01-08 11:00:00");
    insertNote.run(p2.lastInsertRowid, "Emergency Department Visit", "Patient presented to ED with chest tightness and diaphoresis lasting 2 hours. Initial troponin negative. Serial EKGs without acute changes. Diagnosed with unstable angina. Admitted for observation and stress testing. Stress test negative for ischemia. Discharged with medication adjustment.", "admission", "2024-09-15 22:00:00", "2024-09-15 22:00:00");

    // Patient 3
    const p3 = insertPatient.run(
      "MRN-003",
      "Aisha Patel",
      "1992-07-04",
      "Female",
      "+1 (555) 456-7890",
      "aisha.patel@email.com",
      "789 Pine Road, Evanston, IL 60201",
      "Aetna",
      "O+",
      "Latex, Ibuprofen"
    );

    insertRecord.run(p3.lastInsertRowid, "vital", "Blood Pressure", JSON.stringify({ systolic: 118, diastolic: 76, unit: "mmHg" }), "2025-01-12 10:00:00");
    insertRecord.run(p3.lastInsertRowid, "vital", "Heart Rate", JSON.stringify({ value: 72, unit: "bpm" }), "2025-01-12 10:00:00");
    insertRecord.run(p3.lastInsertRowid, "vital", "Weight", JSON.stringify({ value: 58, unit: "kg" }), "2025-01-12 10:00:00");
    insertRecord.run(p3.lastInsertRowid, "diagnosis", "Asthma - Moderate Persistent", JSON.stringify({ icd10: "J45.40", status: "Active", onset: "2005-03-18", severity: "Moderate" }), "2005-03-18 09:00:00");
    insertRecord.run(p3.lastInsertRowid, "diagnosis", "Allergic Rhinitis", JSON.stringify({ icd10: "J30.1", status: "Active", onset: "2010-04-20" }), "2010-04-20 09:00:00");
    insertRecord.run(p3.lastInsertRowid, "medication", "Fluticasone/Salmeterol 250/50 Inhaler", JSON.stringify({ dosage: "250/50mcg", frequency: "Twice daily", route: "Inhaled", prescriber: "Dr. Chen", startDate: "2020-06-01" }), "2020-06-01 08:00:00");
    insertRecord.run(p3.lastInsertRowid, "medication", "Albuterol Inhaler PRN", JSON.stringify({ dosage: "90mcg/actuation", frequency: "As needed", route: "Inhaled", prescriber: "Dr. Chen", startDate: "2005-04-01" }), "2005-04-01 08:00:00");
    insertRecord.run(p3.lastInsertRowid, "medication", "Cetirizine 10mg", JSON.stringify({ dosage: "10mg", frequency: "Once daily", route: "Oral", prescriber: "Dr. Chen", startDate: "2010-05-01" }), "2010-05-01 08:00:00");
    insertRecord.run(p3.lastInsertRowid, "lab", "IgE Total", JSON.stringify({ value: 285, unit: "IU/mL", reference: "< 100", status: "High" }), "2024-11-20 07:30:00");
    insertRecord.run(p3.lastInsertRowid, "lab", "Eosinophils", JSON.stringify({ value: 4.2, unit: "%", reference: "1-4%", status: "Slightly High" }), "2024-11-20 07:30:00");
    insertRecord.run(p3.lastInsertRowid, "procedure", "Spirometry", JSON.stringify({ fev1: 82, fvc: 95, fev1_fvc: 86, result: "Mild obstruction, reversible", date: "2024-11-20" }), "2024-11-20 09:00:00");

    insertNote.run(p3.lastInsertRowid, "Asthma Management Review", "Patient presents for quarterly asthma review. Good control on current regimen. Albuterol use 2-3 times per week - slightly above goal. Spirometry shows mild obstruction with good reversibility. Advised on proper inhaler technique and avoidance of triggers (dust, pollen). Considering step-up therapy. Peak flow diary reviewed. No ER visits since last encounter. Follow up in 3 months or sooner if worsening.", "progress", "2025-01-12 09:30:00", "2025-01-12 09:30:00");

    // Patient 4
    const p4 = insertPatient.run(
      "MRN-004",
      "Robert Chen",
      "1955-09-12",
      "Male",
      "+1 (555) 567-8901",
      "r.chen@email.com",
      "321 Elm Street, Oak Park, IL 60301",
      "Medicare",
      "AB+",
      "Shellfish, Contrast dye"
    );

    insertRecord.run(p4.lastInsertRowid, "vital", "Blood Pressure", JSON.stringify({ systolic: 145, diastolic: 90, unit: "mmHg" }), "2025-01-09 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "vital", "Heart Rate", JSON.stringify({ value: 68, unit: "bpm" }), "2025-01-09 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "vital", "Weight", JSON.stringify({ value: 82, unit: "kg" }), "2025-01-09 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "vital", "SpO2", JSON.stringify({ value: 94, unit: "%" }), "2025-01-09 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "diagnosis", "COPD - Moderate", JSON.stringify({ icd10: "J44.1", status: "Active", onset: "2010-11-05", severity: "GOLD Stage II", smokingHistory: "40 pack-years, quit 2015" }), "2010-11-05 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "diagnosis", "Osteoarthritis - Bilateral Knees", JSON.stringify({ icd10: "M17.11", status: "Active", onset: "2018-07-30" }), "2018-07-30 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "diagnosis", "Chronic Kidney Disease - Stage 3", JSON.stringify({ icd10: "N18.3", status: "Active", onset: "2022-03-15", gfr: 42 }), "2022-03-15 09:00:00");
    insertRecord.run(p4.lastInsertRowid, "medication", "Tiotropium Bromide 18mcg Inhaler", JSON.stringify({ dosage: "18mcg", frequency: "Once daily", route: "Inhaled", prescriber: "Dr. Martinez", startDate: "2010-12-01" }), "2010-12-01 08:00:00");
    insertRecord.run(p4.lastInsertRowid, "medication", "Prednisone 5mg (maintenance)", JSON.stringify({ dosage: "5mg", frequency: "Once daily", route: "Oral", prescriber: "Dr. Martinez", startDate: "2021-01-01" }), "2021-01-01 08:00:00");
    insertRecord.run(p4.lastInsertRowid, "lab", "eGFR", JSON.stringify({ value: 42, unit: "mL/min/1.73m²", reference: "> 60", status: "Low", trend: "Stable" }), "2025-01-05 07:30:00");
    insertRecord.run(p4.lastInsertRowid, "lab", "FEV1", JSON.stringify({ value: 58, unit: "% predicted", reference: "80-120%", status: "Low" }), "2024-12-01 09:00:00");

    insertNote.run(p4.lastInsertRowid, "COPD Exacerbation - Moderate", "Patient presents with increased dyspnea, productive cough with yellow sputum for 3 days. SpO2 94% on RA. Using rescue inhaler every 2-3 hours. CXR: hyperinflation, no acute infiltrates. Consistent with moderate COPD exacerbation. Started on Prednisone 40mg x5 days, Azithromycin 5-day course. Continue regular inhalers. Instructed to monitor SpO2 and return if drops below 92%. Follow-up in 1 week.", "progress", "2025-01-09 10:00:00", "2025-01-09 10:00:00");
  });

  seed();
}
