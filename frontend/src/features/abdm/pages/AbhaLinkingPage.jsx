import React, { useState } from "react";
import AbhaScanForm from "../components/AbhaScanForm";

const mockPatients = [
  {
    id: "P001",
    name: "Priya Menon",
    phone: "9876543210",
    abha: "12-3456-7890-1234",
    status: "Linked",
  },
  {
    id: "P002",
    name: "Arun Kumar",
    phone: "9876543211",
    abha: null,
    status: "Not Linked",
  },
  {
    id: "P003",
    name: "Rahul Verma",
    phone: "9876543212",
    abha: "23-4567-8901-2345",
    status: "Linked",
  },
  {
    id: "P004",
    name: "Sneha Nair",
    phone: "9876543213",
    abha: null,
    status: "Not Linked",
  },
];

export default function AbhaLinkingPage() {
  const [patients, setPatients] = useState(mockPatients);
  const [search, setSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);

  const filteredPatients = patients.filter((patient) => {
    const value = search.toLowerCase();

    return (
      patient.name.toLowerCase().includes(value) ||
      patient.id.toLowerCase().includes(value) ||
      patient.phone.includes(value)
    );
  });

  const handleLink = (abhaNumber) => {
    if (!selectedPatient || !abhaNumber.trim()) return;

    setPatients((current) =>
      current.map((patient) =>
        patient.id === selectedPatient.id
          ? {
              ...patient,
              abha: abhaNumber.trim(),
              status: "Linked",
            }
          : patient
      )
    );

    setSelectedPatient(null);
  };

  return (
    <div className="abdm-page">

      <div className="page-title-row">
        <div>
          <h1>ABHA Linking</h1>
          <p>
            Link patient records with their ABHA account.
          </p>
        </div>

        <div className="abdm-title-badge">
          ABDM
        </div>
      </div>

      <div className="abdm-info-banner">
        <div className="abdm-info-icon">A</div>

        <div>
          <strong>Ayushman Bharat Digital Mission</strong>
          <p>
            Manage ABHA linking and digital health identity
            information for registered patients.
          </p>
        </div>
      </div>

      <div className="abdm-search-card">

        <label>Search Patient</label>

        <input
          type="text"
          placeholder="Search by name, patient ID or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

      </div>

      <div className="abdm-patient-table">

        <div className="abdm-table-header">
          <span>Patient</span>
          <span>Patient ID</span>
          <span>ABHA</span>
          <span>Status</span>
          <span>Action</span>
        </div>

        {filteredPatients.map((patient) => (
          <div className="abdm-table-row" key={patient.id}>

            <div>
              <strong>{patient.name}</strong>
              <small>{patient.phone}</small>
            </div>

            <span>{patient.id}</span>

            <span>
              {patient.abha || "Not linked"}
            </span>

            <span>
              <span
                className={`abha-status ${
                  patient.status === "Linked"
                    ? "linked"
                    : "not-linked"
                }`}
              >
                {patient.status}
              </span>
            </span>

            <button
              className="abdm-action-button"
              onClick={() => setSelectedPatient(patient)}
            >
              {patient.status === "Linked"
                ? "View"
                : "Link ABHA"}
            </button>

          </div>
        ))}

      </div>

      {filteredPatients.length === 0 && (
        <div className="abdm-empty-state">
          No patients found.
        </div>
      )}

      {selectedPatient && (
        <div
          className="abdm-modal-overlay"
          onClick={() => setSelectedPatient(null)}
        >
          <div
            className="abdm-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="abdm-modal-header">

              <div>
                <span>ABHA</span>
                <h2>{selectedPatient.name}</h2>
              </div>

              <button
                onClick={() => setSelectedPatient(null)}
              >
                ×
              </button>

            </div>

            {selectedPatient.status === "Linked" ? (
              <div className="abha-profile">

                <div className="abha-linked-badge">
                  ✓ ABHA Linked
                </div>

                <div className="abha-detail">
                  <span>Patient ID</span>
                  <strong>{selectedPatient.id}</strong>
                </div>

                <div className="abha-detail">
                  <span>ABHA Number</span>
                  <strong>{selectedPatient.abha}</strong>
                </div>

                <button
                  className="secondary-action"
                  onClick={() => setSelectedPatient(null)}
                >
                  Close
                </button>

              </div>
            ) : (
              <AbhaScanForm
                patient={selectedPatient}
                onLink={handleLink}
                onCancel={() => setSelectedPatient(null)}
              />
            )}

          </div>
        </div>
      )}

    </div>
  );
}