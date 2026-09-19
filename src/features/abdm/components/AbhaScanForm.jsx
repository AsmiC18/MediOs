import React, { useState } from "react";

export default function AbhaScanForm({
  patient,
  onLink,
  onCancel,
}) {
  const [abhaNumber, setAbhaNumber] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!abhaNumber.trim()) return;

    onLink(abhaNumber);
  };

  return (
    <form className="abha-form" onSubmit={handleSubmit}>

      <div className="abha-patient-summary">
        <span>Patient</span>
        <strong>{patient.name}</strong>
        <small>
          {patient.id} · {patient.phone}
        </small>
      </div>

      <div className="form-field">

        <label>ABHA Number</label>

        <input
          type="text"
          value={abhaNumber}
          onChange={(e) =>
            setAbhaNumber(e.target.value)
          }
          placeholder="XX-XXXX-XXXX-XXXX"
        />

        <small>
          Enter the patient's ABHA number to link the
          digital health account.
        </small>

      </div>

      <div className="abha-scan-placeholder">
        <div>▣</div>
        <strong>ABHA QR Scan</strong>
        <span>
          QR scanning will be connected to ABDM services
          during backend integration.
        </span>
      </div>

      <div className="modal-actions">

        <button
          type="button"
          className="secondary-action"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="primary-action"
          disabled={!abhaNumber.trim()}
        >
          Link ABHA
        </button>

      </div>

    </form>
  );
}