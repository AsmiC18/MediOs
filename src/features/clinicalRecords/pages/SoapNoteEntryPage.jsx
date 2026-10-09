
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


const emptyNote = {
  patientName: "",
  patientId: "",
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

const SoapNoteEntryPage = () => {
  const navigate = useNavigate();

  const [note, setNote] = useState(emptyNote);
  const [savedNote, setSavedNote] = useState(null);
  const [feedback, setFeedback] = useState("");

  const isSaved = savedNote !== null;

  const updateField = (field, value) => {
    setNote((current) => ({
      ...current,
      [field]: value,
    }));
    setFeedback("");
  };

  const handleSave = (event) => {
    event.preventDefault();

    if (!note.patientName.trim()) {
      setFeedback("Please enter the patient's name.");
      return;
    }

    if (
      !note.subjective.trim() &&
      !note.objective.trim() &&
      !note.assessment.trim() &&
      !note.plan.trim()
    ) {
      setFeedback("Please enter at least one section of the clinical note.");
      return;
    }

    setSavedNote({
      ...note,
      savedAt: new Date().toLocaleString(),
    });

    setFeedback("Clinical note saved successfully.");
  };

  const handleNewNote = () => {
    setNote(emptyNote);
    setSavedNote(null);
    setFeedback("");
  };

  const fields = [
    {
      name: "subjective",
      label: "Subjective",
      description: "Symptoms reported by the patient and relevant history.",
      placeholder: "Describe the patient's symptoms and concerns...",
    },
    {
      name: "objective",
      label: "Objective",
      description: "Examination findings, observations and test results.",
      placeholder: "Enter examination findings and observations...",
    },
    {
      name: "assessment",
      label: "Assessment",
      description: "Clinical impression or diagnosis.",
      placeholder: "Enter the clinical assessment or diagnosis...",
    },
    {
      name: "plan",
      label: "Plan",
      description: "Treatment, investigations, advice and follow-up.",
      placeholder: "Enter the treatment and follow-up plan...",
    },
  ];

  return (
    <div className="page-content clinical-page">
      <div className="page-header">

        <div>
          
                <button
        type="button"
        className="secondary-action"
        onClick={() => navigate("/staff/clinical-records")}
      >
        ← Back to Clinical Records
      </button>

          <h1>Clinical Notes</h1>
          <p>Record and review clinical notes for a patient visit.</p>
        </div>

        {isSaved && (
          <button
            type="button"
            className="secondary-action"
            onClick={handleNewNote}
          >
            + New Note
          </button>
        )}
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
                placeholder="Enter patient name"
                required
                disabled={isSaved}
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
                placeholder="Enter patient ID"
                disabled={isSaved}
              />
            </div>
          </div>
        </section>

        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Clinical Note</h2>
          </div>

          <div className="clinical-soap-fields">
            {fields.map((field) => (
              <div className="clinical-form-field" key={field.name}>
                <label htmlFor={`note-${field.name}`}>
                  {field.label}
                </label>

                <p>{field.description}</p>

                <textarea
                  id={`note-${field.name}`}
                  rows={4}
                  value={note[field.name]}
                  onChange={(event) =>
                    updateField(field.name, event.target.value)
                  }
                  placeholder={field.placeholder}
                  disabled={isSaved}
                />
              </div>
            ))}
          </div>
        </section>

        {feedback && (
          <p
            className={
              isSaved
                ? "clinical-feedback clinical-feedback-success"
                : "clinical-feedback clinical-feedback-error"
            }
            role="status"
          >
            {feedback}
          </p>
        )}

        {!isSaved && (
          <div className="clinical-form-actions">
            <button
              type="submit"
              className="primary-action"
              disabled={!note.patientName.trim()}
            >
              Save Clinical Note
            </button>
          </div>
        )}
      </form>

      {isSaved && (
        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Saved Note</h2>
          </div>

          <div className="clinical-record-meta">
            <p>
              <strong>Patient:</strong> {savedNote.patientName}
            </p>

            {savedNote.patientId && (
              <p>
                <strong>Patient ID:</strong> {savedNote.patientId}
              </p>
            )}

            <p>
              <strong>Recorded:</strong> {savedNote.savedAt}
            </p>
          </div>

          {fields.map((field) =>
            savedNote[field.name].trim() ? (
              <div className="clinical-record-item" key={field.name}>
                <strong>{field.label}</strong>
                <p>{savedNote[field.name]}</p>
              </div>
            ) : null
          )}
        </section>
      )}
    </div>
  );
};

export default SoapNoteEntryPage;