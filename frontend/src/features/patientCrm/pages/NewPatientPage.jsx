import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "medios_patients";

export default function NewPatientPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    age: "",
    gender: "",
    address: "",
    emergencyContact: "",
    allergies: "",
    medicalFlags: "",
  });

  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };


  const handleSubmit = (event) => {
    event.preventDefault();

    setError("");

    /* Basic validation */

    if (!formData.name.trim()) {
      setError("Patient name is required.");
      return;
    }

    if (!formData.phone.trim()) {
      setError("Phone number is required.");
      return;
    }

    if (!/^\d{10}$/.test(formData.phone.trim())) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }

    if (!formData.age) {
      setError("Age is required.");
      return;
    }

    if (!formData.gender) {
      setError("Please select gender.");
      return;
    }


    /* Get existing patients */

    const storedPatients =
      localStorage.getItem(STORAGE_KEY);

    const patients = storedPatients
      ? JSON.parse(storedPatients)
      : [];


    /* Prevent duplicate phone number */

    const duplicatePhone = patients.some(
      (patient) =>
        patient.phone === formData.phone.trim()
    );

    if (duplicatePhone) {
      setError(
        "A patient with this phone number already exists."
      );
      return;
    }


    /* Generate next patient ID */

    const nextNumber =
      patients.length + 1;

    const patientId =
      `P${String(nextNumber).padStart(3, "0")}`;


    /* Create new patient */

    const newPatient = {
      id: patientId,

      name: formData.name.trim(),

      phone: formData.phone.trim(),

      age: Number(formData.age),

      gender: formData.gender,

      address: formData.address.trim(),

      emergencyContact:
        formData.emergencyContact.trim(),

      allergies:
        formData.allergies.trim() || "None",

      medicalFlags:
        formData.medicalFlags.trim() || "None",

      lastVisit: "New Patient",

      status: "Active",

      atRisk: false,
    };


    /* Save */

    const updatedPatients = [
      ...patients,
      newPatient,
    ];

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updatedPatients)
    );


    /* Return to patient list */

    navigate("/staff/patients");
  };


  return (
    <div className="patient-page">

      {/* =========================
          HEADER
      ========================= */}

      <div className="patient-page-header">

        <div>
          <h1>Add Patient</h1>

          <p>
            Create a new patient record.
          </p>
        </div>

        <button
          className="secondary-action"
          onClick={() => navigate("/staff/patients")}
        >
          ← Back to Patients
        </button>

      </div>


      {/* =========================
          FORM
      ========================= */}

      <section className="patient-form-card">

        <form onSubmit={handleSubmit}>

          {/* Personal Information */}

          <div className="form-section">

            <h2>Patient Information</h2>

            <p className="form-section-description">
              Enter the patient's basic identification and contact details.
            </p>


            <div className="form-grid">

              <div className="form-field">

                <label>
                  Full Name *
                </label>

                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter patient name"
                />

              </div>


              <div className="form-field">

                <label>
                  Phone Number *
                </label>

                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="10-digit phone number"
                  maxLength="10"
                />

              </div>


              <div className="form-field">

                <label>
                  Age *
                </label>

                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  placeholder="Age"
                  min="0"
                  max="120"
                />

              </div>


              <div className="form-field">

                <label>
                  Gender *
                </label>

                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                >

                  <option value="">
                    Select gender
                  </option>

                  <option value="Male">
                    Male
                  </option>

                  <option value="Female">
                    Female
                  </option>

                  <option value="Other">
                    Other
                  </option>

                </select>

              </div>


              <div className="form-field full-width">

                <label>
                  Address
                </label>

                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Enter patient address"
                  rows="3"
                />

              </div>


              <div className="form-field">

                <label>
                  Emergency Contact
                </label>

                <input
                  type="tel"
                  name="emergencyContact"
                  value={formData.emergencyContact}
                  onChange={handleChange}
                  placeholder="Emergency contact number"
                />

              </div>

            </div>

          </div>


          {/* Medical Information */}

          <div className="form-section">

            <h2>Medical Information</h2>

            <p className="form-section-description">
              Medical flags should be clearly available to staff.
            </p>


            <div className="form-grid">

              <div className="form-field full-width">

                <label>
                  Allergies
                </label>

                <textarea
                  name="allergies"
                  value={formData.allergies}
                  onChange={handleChange}
                  placeholder="Example: Penicillin, peanuts, latex"
                  rows="3"
                />

              </div>


              <div className="form-field full-width">

                <label>
                  Medical Flags
                </label>

                <textarea
                  name="medicalFlags"
                  value={formData.medicalFlags}
                  onChange={handleChange}
                  placeholder="Important medical information or flags"
                  rows="3"
                />

              </div>

            </div>

          </div>


          {/* Error */}

          {error && (

            <div className="form-error">
              {error}
            </div>

          )}


          {/* Actions */}

          <div className="form-actions">

            <button
              type="button"
              className="secondary-action"
              onClick={() =>
                navigate("/staff/patients")
              }
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary-action"
            >
              Save Patient
            </button>

          </div>

        </form>

      </section>

    </div>
  );
}