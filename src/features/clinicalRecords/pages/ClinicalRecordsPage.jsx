
import React from "react";
import { useNavigate } from "react-router-dom";

export default function ClinicalRecordsPage() {
  const navigate = useNavigate();

  return (
    <div className="page-content clinical-page">
      <div className="page-header">
        <div>
          <h1>Clinical Records</h1>
          <p>
            Manage clinical notes and prescriptions.
          </p>
        </div>
      </div>

      <div className="clinical-records-options">
        <button
          type="button"
          className="clinical-record-option"
          onClick={() =>
            navigate("/staff/clinical-records/notes")
          }
        >
          <h2>Clinical Notes</h2>
          <p>
            Record patient symptoms, examination findings,
            diagnoses and treatment plans.
          </p>
          <span className="clinical-record-option-link">
            Open Clinical Notes →
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
          <p>
            Create and review patient prescriptions.
          </p>
          <span className="clinical-record-option-link">
            Open Prescriptions →
          </span>
        </button>
      </div>
    </div>
  );
}

