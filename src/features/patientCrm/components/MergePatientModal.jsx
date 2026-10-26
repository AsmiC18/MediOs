import React, { useState } from "react";

const MergePatientModal = ({ patient, onClose }) => {

  const [duplicateId, setDuplicateId] =
    useState("");

  const [message, setMessage] =
    useState("");

  const handleMerge = () => {

    if (!duplicateId.trim()) {
      setMessage(
        "Enter the duplicate patient ID."
      );
      return;
    }

    if (duplicateId === patient.id) {
      setMessage(
        "The duplicate ID cannot be the same as the current patient."
      );
      return;
    }

    setMessage(
      `Patient ${duplicateId} is ready to be merged into ${patient.id}.`
    );
  };

  return (
    <div className="modal-overlay">

      <div className="merge-modal">

        <div className="modal-header">

          <div>
            <h2>
              Merge Duplicate Patient
            </h2>

            <p>
              Merge another patient record into this
              patient's record.
            </p>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>


        <div className="merge-current-patient">

          <span>
            Primary Patient
          </span>

          <strong>
            {patient.name}
          </strong>

          <small>
            {patient.id} · {patient.phone}
          </small>

        </div>


        <div className="form-field">

          <label>
            Duplicate Patient ID
          </label>

          <input
            type="text"
            value={duplicateId}
            onChange={(event) =>
              setDuplicateId(event.target.value)
            }
            placeholder="Example: P006"
          />

        </div>


        {message && (
          <div className="merge-message">
            {message}
          </div>
        )}


        <div className="merge-warning">

          <strong>
            Before merging
          </strong>

          <p>
            Verify that both records belong to the same
            patient. The merged record should retain the
            relevant patient history.
          </p>

        </div>


        <div className="modal-actions">

          <button
            className="secondary-action"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            className="primary-action"
            onClick={handleMerge}
          >
            Merge Records
          </button>

        </div>

      </div>

    </div>
  );
};

export default MergePatientModal;