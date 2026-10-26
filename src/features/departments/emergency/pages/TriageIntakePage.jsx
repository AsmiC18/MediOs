
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getEmergencyCases,
  updateEmergencyCases,
} from "../components/CriticalAlertBanner";

const initialForm = {
  patientName: "",
  age: "",
  complaint: "",
  severity: "Moderate",
  contact: "",
  bloodPressure: "",
  oxygenSaturation: "",
};

export default function TriageIntakePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (
      !form.patientName.trim() ||
      !form.complaint.trim() ||
      !form.severity
    ) {
      setError(
        "Enter the patient name, presenting complaint and triage severity."
      );
      return;
    }

    const existingCases = getEmergencyCases();

    const nextNumber =
      existingCases.reduce((max, item) => {
        const match = item.id.match(/^ER-(\d+)$/);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 2000) + 1;

    const newCase = {
      id: `ER-${nextNumber}`,
      patientName: form.patientName.trim(),
      age: form.age.trim(),
      complaint: form.complaint.trim(),
      severity: form.severity,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      status: "Awaiting assessment",
      assignedTo: "Unassigned",
      contact: form.contact.trim(),
      bloodPressure: form.bloodPressure.trim(),
      oxygenSaturation: form.oxygenSaturation.trim(),
    };

    updateEmergencyCases((current) => [newCase, ...current]);
    navigate("/staff/departments/emergency");
  }

  return (
    <main className="emergency-page emergency-intake-page">
      <header className="emergency-page-header">
        <div>
          <p className="emergency-eyebrow">
            DEPARTMENT / EMERGENCY / TRIAGE INTAKE
          </p>
          <h1>Register emergency patient</h1>
          <p className="emergency-page-subtitle">
            Record essential information first. Additional details can
            be completed during assessment.
          </p>
        </div>

        <button
          type="button"
          className="emergency-secondary-button"
          onClick={() => navigate("/staff/departments/emergency")}
        >
          Back to queue
        </button>
      </header>

      <form className="emergency-intake-form" onSubmit={handleSubmit}>
        <div className="emergency-form-heading">
          <h2>Patient intake</h2>
          <p>
            Fields marked with <span>*</span> are required.
          </p>
        </div>

        {error && (
          <div className="emergency-form-error" role="alert">
            {error}
          </div>
        )}

        <div className="emergency-form-grid">
          <label className="emergency-field">
            Patient name <span>*</span>
            <input
              name="patientName"
              value={form.patientName}
              onChange={updateField}
              placeholder="Enter patient's full name"
              autoComplete="name"
              required
            />
          </label>

          <label className="emergency-field">
            Age
            <input
              name="age"
              type="number"
              min="0"
              max="125"
              value={form.age}
              onChange={updateField}
              placeholder="Enter age"
            />
          </label>

          <label className="emergency-field emergency-field-full">
            Presenting complaint <span>*</span>
            <textarea
              name="complaint"
              value={form.complaint}
              onChange={updateField}
              placeholder="Briefly describe the reason for arrival"
              rows={3}
              required
            />
          </label>

          <label className="emergency-field">
            Triage severity <span>*</span>
            <select
              name="severity"
              value={form.severity}
              onChange={updateField}
              required
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
          </label>

          <label className="emergency-field">
            Contact number
            <input
              name="contact"
              type="tel"
              value={form.contact}
              onChange={updateField}
              placeholder="Enter contact number"
              autoComplete="tel"
            />
          </label>
        </div>

        <div className="emergency-form-subheading">
          <h3>Initial observations</h3>
          <p>Optional — can be recorded during assessment.</p>
        </div>

        <div className="emergency-form-grid">
          <label className="emergency-field">
            Blood pressure
            <input
              name="bloodPressure"
              value={form.bloodPressure}
              onChange={updateField}
              placeholder="e.g. 120/80"
            />
          </label>

          <label className="emergency-field">
            Oxygen saturation (%)
            <input
              name="oxygenSaturation"
              type="number"
              min="0"
              max="100"
              value={form.oxygenSaturation}
              onChange={updateField}
              placeholder="e.g. 98"
            />
          </label>
        </div>

        <div className="emergency-form-actions">
          <button
            type="button"
            className="emergency-secondary-button"
            onClick={() => navigate("/staff/departments/emergency")}
          >
            Cancel
          </button>

          <button type="submit" className="emergency-primary-button">
            Register patient
          </button>
        </div>
      </form>
    </main>
  );
}
