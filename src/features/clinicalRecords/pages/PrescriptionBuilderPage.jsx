
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";




const initialMedicine = {
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
};

const PrescriptionBuilderPage = () => {

  const navigate = useNavigate();
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState([]);
  const [medicine, setMedicine] = useState(initialMedicine);
  const [prescriptions, setPrescriptions] = useState([]);
  const [savedPrescriptionId, setSavedPrescriptionId] = useState(null);
  const [feedback, setFeedback] = useState("");

  const updateMedicine = (field, value) => {
    setMedicine((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const addMedicine = () => {
    if (
      !medicine.name.trim() ||
      !medicine.dosage.trim() ||
      !medicine.frequency.trim() ||
      !medicine.duration.trim()
    ) {
      setFeedback("Please complete the medicine name, dosage, frequency and duration.");
      return;
    }

    setMedicines((current) => [
      ...current,
      { ...medicine, id: `${Date.now()}-${current.length}` },
    ]);

    setMedicine(initialMedicine);
    setFeedback("");
    setSavedPrescriptionId(null);
  };

  const removeMedicine = (id) => {
    setMedicines((current) => current.filter((item) => item.id !== id));
    setSavedPrescriptionId(null);
    setFeedback("");
  };

  const savePrescription = (event) => {
    event.preventDefault();

    if (!patientName.trim()) {
      setFeedback("Please enter the patient's name.");
      return;
    }

    if (medicines.length === 0) {
      setFeedback("Add at least one medicine before saving.");
      return;
    }

    const prescription = {
      id: `RX-${Date.now()}`,
      patientName: patientName.trim(),
      patientId: patientId.trim(),
      diagnosis: diagnosis.trim(),
      medicines: medicines.map(({ id, ...item }) => ({ ...item })),
      date: new Date().toLocaleDateString(),
    };

    setPrescriptions((current) => [prescription, ...current]);
    setSavedPrescriptionId(prescription.id);
    setFeedback("Prescription saved successfully.");
  };

  const startNewPrescription = () => {
    setPatientName("");
    setPatientId("");
    setDiagnosis("");
    setMedicines([]);
    setMedicine(initialMedicine);
    setSavedPrescriptionId(null);
    setFeedback("");
  };

  const isSaved = savedPrescriptionId !== null;

  return (
    <div className="page-content clinical-page">
      <div className="page-header">
        <div>
          <h1>Prescription Builder</h1>
          <p>Create and review patient prescriptions.</p>
        </div>

        <button
  type="button"
  className="secondary-action"
  onClick={() => navigate("/staff/clinical-records")}
>
  ← Back to Clinical Records
</button>

        {isSaved && (
          <button
            type="button"
            className="secondary-action"
            onClick={startNewPrescription}
          >
            + New Prescription
          </button>
        )}
      </div>

      <form onSubmit={savePrescription}>
        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Patient Details</h2>
          </div>

          <div className="clinical-form-grid">
            <div className="clinical-form-field">
              <label htmlFor="prescription-patient-name">
                Patient Name *
              </label>
              <input
                id="prescription-patient-name"
                type="text"
                value={patientName}
                onChange={(event) => {
                  setPatientName(event.target.value);
                  setSavedPrescriptionId(null);
                }}
                placeholder="Enter patient name"
                required
                disabled={isSaved}
              />
            </div>

            <div className="clinical-form-field">
              <label htmlFor="prescription-patient-id">
                Patient ID
              </label>
              <input
                id="prescription-patient-id"
                type="text"
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value);
                  setSavedPrescriptionId(null);
                }}
                placeholder="Enter patient ID"
                disabled={isSaved}
              />
            </div>

            <div className="clinical-form-field">
              <label htmlFor="prescription-diagnosis">Diagnosis</label>
              <input
                id="prescription-diagnosis"
                type="text"
                value={diagnosis}
                onChange={(event) => {
                  setDiagnosis(event.target.value);
                  setSavedPrescriptionId(null);
                }}
                placeholder="Enter diagnosis"
                disabled={isSaved}
              />
            </div>
          </div>
        </section>

        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Medicine Details</h2>
          </div>

          {!isSaved && (
            <>
              <div className="clinical-form-grid">
                <div className="clinical-form-field">
                  <label htmlFor="medicine-name">Medicine Name *</label>
                  <input
                    id="medicine-name"
                    value={medicine.name}
                    onChange={(event) =>
                      updateMedicine("name", event.target.value)
                    }
                    placeholder="Enter medicine name"
                  />
                </div>

                <div className="clinical-form-field">
                  <label htmlFor="medicine-dosage">Dosage *</label>
                  <input
                    id="medicine-dosage"
                    value={medicine.dosage}
                    onChange={(event) =>
                      updateMedicine("dosage", event.target.value)
                    }
                    placeholder="e.g. 500 mg"
                  />
                </div>

                <div className="clinical-form-field">
                  <label htmlFor="medicine-frequency">Frequency *</label>
                  <input
                    id="medicine-frequency"
                    value={medicine.frequency}
                    onChange={(event) =>
                      updateMedicine("frequency", event.target.value)
                    }
                    placeholder="e.g. Twice daily"
                  />
                </div>

                <div className="clinical-form-field">
                  <label htmlFor="medicine-duration">Duration *</label>
                  <input
                    id="medicine-duration"
                    value={medicine.duration}
                    onChange={(event) =>
                      updateMedicine("duration", event.target.value)
                    }
                    placeholder="e.g. 5 days"
                  />
                </div>

                <div className="clinical-form-field">
                  <label htmlFor="medicine-instructions">
                    Instructions
                  </label>
                  <input
                    id="medicine-instructions"
                    value={medicine.instructions}
                    onChange={(event) =>
                      updateMedicine("instructions", event.target.value)
                    }
                    placeholder="e.g. Take after food"
                  />
                </div>
              </div>

              <div className="clinical-form-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={addMedicine}
                >
                  + Add Medicine
                </button>
              </div>
            </>
          )}

          {medicines.length > 0 ? (
            <div className="clinical-record-list">
              {medicines.map((item, index) => (
                <div className="clinical-record-item" key={item.id}>
                  <div className="clinical-record-heading">
                    <strong>
                      {index + 1}. {item.name}
                    </strong>

                    {!isSaved && (
                      <button
                        type="button"
                        className="clinical-text-button"
                        onClick={() => removeMedicine(item.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <p>
                    {item.dosage} · {item.frequency} · {item.duration}
                  </p>

                  {item.instructions && <p>{item.instructions}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="clinical-empty-state">
              No medicines added yet.
            </div>
          )}
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
              disabled={!patientName.trim() || medicines.length === 0}
            >
              Save Prescription
            </button>
          </div>
        )}
      </form>

      {prescriptions.length > 0 && (
        <section className="clinical-card">
          <div className="clinical-card-header">
            <h2>Saved Prescriptions</h2>
          </div>

          <div className="clinical-record-list">
            {prescriptions.map((prescription) => (
              <div className="clinical-record-item" key={prescription.id}>
                <div className="clinical-record-heading">
                  <strong>{prescription.patientName}</strong>
                  <span>{prescription.date}</span>
                </div>

                <p>
                  {prescription.id}
                  {prescription.patientId
                    ? ` · Patient ID: ${prescription.patientId}`
                    : ""}
                </p>

                {prescription.diagnosis && (
                  <p>Diagnosis: {prescription.diagnosis}</p>
                )}

                <p>
                  {prescription.medicines.length} medicine
                  {prescription.medicines.length === 1 ? "" : "s"}
                </p>

                {prescription.medicines.map((item, index) => (
                  <p key={`${prescription.id}-${index}`}>
                    {item.name} — {item.dosage}, {item.frequency},{" "}
                    {item.duration}
                    {item.instructions ? ` · ${item.instructions}` : ""}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default PrescriptionBuilderPage;