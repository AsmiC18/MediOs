import { useState } from "react";
import { useNavigate } from "react-router-dom";

import AttachmentUpload from "../components/AttachmentUpload";
import Icd10Lookup from "../components/Icd10Lookup";
import SoapFields from "../components/SoapFields";
import {
  addClinicalNote,
  useClinicalNotes,
} from "../ClinicalNotesStore";


const emptyNote = {
  patientName: "",
  patientId: "",
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

const soapSections = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

export default function SoapNoteEntryPage() {
  const navigate = useNavigate();
  const savedNotes = useClinicalNotes();

  const [note, setNote] = useState({ ...emptyNote });
  const [diagnosis, setDiagnosis] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [feedback, setFeedback] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState(null);

  function updateField(field, value) {
    setNote((current) => ({
      ...current,
      [field]: value,
    }));

    setFeedback("");
  }

  function resetForm() {
    setNote({ ...emptyNote });
    setDiagnosis(null);
    setAttachments([]);
  }

  function handleSave(event) {
    event.preventDefault();

    if (!note.patientName.trim()) {
      setFeedback("Please enter the patient's name.");
      return;
    }

    const hasSoapContent = soapSections.some((section) =>
      note[section.key].trim()
    );

    if (!hasSoapContent) {
      setFeedback("Please complete at least one SOAP section.");
      return;
    }

    const savedNote = {
      ...note,
      id: `NOTE-${Date.now()}`,
      patientName: note.patientName.trim(),
      patientId: note.patientId.trim(),
      diagnosis: diagnosis ? { ...diagnosis } : null,
      attachments: attachments.map((file) => ({ ...file })),
      visitId: `VISIT-${Date.now()}`,
      savedAt: new Date().toLocaleString(),
      createdAt: new Date().toISOString(),
    };

    addClinicalNote(savedNote);

    // Clear the form immediately so the next note starts fresh.
    resetForm();
    setFeedback("Clinical note saved successfully.");
    setExpandedNoteId(savedNote.id);
  }

  return (
    <div className="page-content clinical-page">
      <div className="page-header">
        <div>
          <h1>Clinical Notes</h1>
     
        </div>

        <button
          type="button"
          className="secondary-action"
          onClick={() => navigate("/staff/clinical-records")}
        >
          ← Back to Clinical Records
        </button>
      </div>

      <form onSubmit={handleSave}>
        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Patient Details</h2>
          </div>

          <div className="clinical-form-grid">
            <div className="clinical-form-field">
              <label htmlFor="note-patient-name">Patient Name *</label>
              <input
                id="note-patient-name"
                type="text"
                value={note.patientName}
                onChange={(event) =>
                  updateField("patientName", event.target.value)
                }
                required
              />
            </div>

            <div className="clinical-form-field">
              <label htmlFor="note-patient-id">Patient ID</label>
              <input
                id="note-patient-id"
                type="text"
                value={note.patientId}
                onChange={(event) =>
                  updateField("patientId", event.target.value)
                }
              />
            </div>
          </div>
        </section>

        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Clinical Note</h2>
          </div>

          <SoapFields value={note} onChange={updateField} />

          <div className="clinical-diagnosis-section">
            <Icd10Lookup
              value={diagnosis}
              onChange={(value) => {
                setDiagnosis(value);
                setFeedback("");
              }}
            />
          </div>
        </section>

        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Visit Attachments</h2>
          </div>

          <AttachmentUpload
            files={attachments}
            onChange={(files) => {
              setAttachments(files);
              setFeedback("");
            }}
          />
        </section>

        {feedback && (
          <p
            className={`clinical-feedback ${
              feedback.includes("successfully")
                ? "clinical-feedback-success"
                : "clinical-feedback-error"
            }`}
            role="status"
          >
            {feedback}
          </p>
        )}

        <div className="clinical-form-actions">
          <button type="submit" className="primary-action">
            Save Clinical Note
          </button>

          <button
            type="button"
            className="secondary-action"
            onClick={resetForm}
          >
            Clear Form
          </button>
        </div>
      </form>

      <section className="clinical-card clinical-history-section">
        <div className="clinical-card-header">
          <div>
            <h2>Saved Clinical Notes</h2>
            <p>
              {savedNotes.length}{" "}
              {savedNotes.length === 1 ? "record" : "records"}
            </p>
          </div>
        </div>

        {savedNotes.length === 0 ? (
          <div className="clinical-empty-state">
            No clinical notes saved yet.
          </div>
        ) : (
          <div className="clinical-record-list">
            {savedNotes.map((saved) => {
              const isExpanded = expandedNoteId === saved.id;

              return (
                <article className="clinical-record-item" key={saved.id}>
                  <div className="clinical-record-heading">
                    <div>
                      <strong>{saved.patientName}</strong>
                      <p>
                        {saved.patientId
                          ? `Patient ID: ${saved.patientId} · `
                          : ""}
                        {saved.savedAt}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="clinical-text-button"
                      onClick={() =>
                        setExpandedNoteId(
                          isExpanded ? null : saved.id
                        )
                      }
                    >
                      {isExpanded ? "Hide details" : "View note"}
                    </button>
                  </div>

                  <p className="clinical-note-visit-id">
                    {saved.visitId}
                    {saved.diagnosis
                      ? ` · ${saved.diagnosis.code} — ${saved.diagnosis.name}`
                      : ""}
                  </p>

                  {isExpanded && (
                    <div className="clinical-note-details">
                      {soapSections.map((section) =>
                        saved[section.key]?.trim() ? (
                          <div
                            className="clinical-record-item"
                            key={section.key}
                          >
                            <strong>{section.label}</strong>
                            <p>{saved[section.key]}</p>
                          </div>
                        ) : null
                      )}

                      {saved.attachments?.length > 0 && (
                        <div className="clinical-record-item">
                          <strong>Attachments</strong>
                          {saved.attachments.map((file) => (
                            <p key={file.id}>
                              {file.name} · {(file.size / 1024).toFixed(1)} KB
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
