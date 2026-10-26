import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClinicalNotes } from "../ClinicalNotesStore";

export default function ClinicalRecordsPage() {
  const navigate = useNavigate();
  const notes = useClinicalNotes();
  const [expandedNoteId, setExpandedNoteId] = useState(null);

  const soapSections = [
    { key: "subjective", label: "Subjective" },
    { key: "objective", label: "Objective" },
    { key: "assessment", label: "Assessment" },
    { key: "plan", label: "Plan" },
  ];

  return (
    <div className="page-content clinical-page">
      <div className="page-header">
        <div>
          <h1>Clinical Records</h1>
          <p>Manage clinical notes and prescriptions.</p>
        </div>
      </div>

      <div className="clinical-records-options">
        <button
          type="button"
          className="clinical-record-option"
          onClick={() => navigate("/staff/clinical-records/notes")}
        >
          <h2>Clinical Notes</h2>
          <p>
            Record symptoms, examination findings, diagnoses and treatment
            plans.
          </p>
          <span className="clinical-record-option-link">
            Create a Clinical Note →
          </span>
        </button>

        <button
          type="button"
          className="clinical-record-option"
          onClick={() =>
            navigate("/staff/clinical-records/prescriptions")
          }
        >
          <h2>Prescriptions</h2>
          <p>Create and review patient prescriptions.</p>
          <span className="clinical-record-option-link">
            Open Prescriptions →
          </span>
        </button>
      </div>

      <section className="clinical-card clinical-history-section">
        <div className="clinical-card-header">
          <div>
            <h2>Recent Clinical Notes</h2>
            <p>
              {notes.length} {notes.length === 1 ? "record" : "records"}
            </p>
          </div>

          <button
            type="button"
            className="secondary-action"
            onClick={() => navigate("/staff/clinical-records/notes")}
          >
            + New Note
          </button>
        </div>

        {notes.length === 0 ? (
          <div className="clinical-empty-state">
            No clinical notes saved yet.
          </div>
        ) : (
          <div className="clinical-record-list">
            {notes.map((note) => {
              const expanded = expandedNoteId === note.id;

              return (
                <article className="clinical-record-item" key={note.id}>
                  <div className="clinical-record-heading">
                    <div>
                      <strong>{note.patientName}</strong>
                      <p>
                        {note.patientId
                          ? `Patient ID: ${note.patientId} · `
                          : ""}
                        {note.savedAt}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="clinical-text-button"
                      onClick={() =>
                        setExpandedNoteId(expanded ? null : note.id)
                      }
                    >
                      {expanded ? "Hide details" : "View note"}
                    </button>
                  </div>

                  <p>
                    {note.visitId}
                    {note.diagnosis
                      ? ` · ${note.diagnosis.code} — ${note.diagnosis.name}`
                      : ""}
                  </p>

                  {expanded && (
                    <div className="clinical-note-details">
                      {soapSections.map((section) =>
                        note[section.key]?.trim() ? (
                          <div
                            className="clinical-record-item"
                            key={section.key}
                          >
                            <strong>{section.label}</strong>
                            <p>{note[section.key]}</p>
                          </div>
                        ) : null
                      )}

                      {note.attachments?.length > 0 && (
                        <div className="clinical-record-item">
                          <strong>Visit Attachments</strong>
                          {note.attachments.map((file) => (
                            <p key={file.id}>{file.name}</p>
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
