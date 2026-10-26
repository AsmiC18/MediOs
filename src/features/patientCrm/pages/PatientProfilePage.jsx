import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import AllergyWarningStrip from "../components/AllergyWarningStrip";
import AtRiskBadge from "../components/AtRiskBadge";
import PatientTimeline from "../components/PatientTimeline";
import EditHistoryLog from "../components/EditHistoryLog";
import MergePatientModal from "../components/MergePatientModal";

const STORAGE_KEY = "medios_patients";

const defaultPatients = [
  {
    id: "P001",
    name: "Arun Kumar",
    age: 34,
    gender: "Male",
    phone: "9876543210",
    lastVisit: "12 Sep 2026",
    status: "Active",
    atRisk: false,
    allergies: "None",
    address: "Vellore, Tamil Nadu",
    emergencyContact: "9876500001",
    medicalFlags: "None",
  },
  {
    id: "P002",
    name: "Priya Menon",
    age: 28,
    gender: "Female",
    phone: "9876543211",
    lastVisit: "08 Jul 2026",
    status: "Active",
    atRisk: true,
    allergies: "Penicillin",
    address: "Chennai, Tamil Nadu",
    emergencyContact: "9876500002",
    medicalFlags: "Requires regular follow-up",
  },
  {
    id: "P003",
    name: "Suresh Raina",
    age: 45,
    gender: "Male",
    phone: "9876543212",
    lastVisit: "14 Sep 2026",
    status: "Active",
    atRisk: false,
    allergies: "None",
    address: "Bangalore, Karnataka",
    emergencyContact: "9876500003",
    medicalFlags: "None",
  },
];

const PatientProfilePage = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const [patient, setPatient] = useState(null);
  const [showMergeModal, setShowMergeModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);

    const patients = stored
      ? JSON.parse(stored)
      : defaultPatients;

    const foundPatient = patients.find(
      (item) => item.id === patientId
    );

    setPatient(foundPatient || null);
  }, [patientId]);

  if (!patient) {
    return (
      <div className="patient-page">
        <section className="patient-profile-card">
          <h2>Patient not found</h2>

          <p>
            No patient record was found for ID: {patientId}
          </p>

          <button
            className="primary-action"
            onClick={() => navigate("/staff/patients")}
          >
            ← Back to Patients
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="patient-page">

      {/* Header */}

      <div className="patient-profile-header">

        <div>

          <button
            className="back-button"
            onClick={() => navigate("/staff/patients")}
          >
            ← Patients
          </button>

          <h1>{patient.name}</h1>

          <p>
            Patient ID: {patient.id}
          </p>

        </div>

        <div className="profile-actions">

          <button className="secondary-action">
            Edit Patient
          </button>

          <button
            className="secondary-action"
            onClick={() => setShowMergeModal(true)}
          >
            Merge Duplicate
          </button>

        </div>

      </div>


      {/* Allergy Warning */}

      {patient.allergies &&
        patient.allergies.toLowerCase() !== "none" && (
          <AllergyWarningStrip
            allergies={patient.allergies}
          />
        )}


      {/* Patient Details */}

      <section className="patient-profile-card">

        <div className="profile-section-header">

          <div>
            <h2>Patient Information</h2>

            <p>
              Basic demographic and contact information.
            </p>
          </div>

          <span className="status-badge active-status">
            {patient.status}
          </span>

        </div>


        <div className="patient-details-grid">

          <div className="patient-detail">
            <span>Full Name</span>
            <strong>{patient.name}</strong>
          </div>

          <div className="patient-detail">
            <span>Patient ID</span>
            <strong>{patient.id}</strong>
          </div>

          <div className="patient-detail">
            <span>Age</span>
            <strong>{patient.age}</strong>
          </div>

          <div className="patient-detail">
            <span>Gender</span>
            <strong>{patient.gender}</strong>
          </div>

          <div className="patient-detail">
            <span>Phone</span>
            <strong>{patient.phone}</strong>
          </div>

          <div className="patient-detail">
            <span>Emergency Contact</span>
            <strong>
              {patient.emergencyContact || "Not provided"}
            </strong>
          </div>

          <div className="patient-detail">
            <span>Address</span>
            <strong>
              {patient.address || "Not provided"}
            </strong>
          </div>

          <div className="patient-detail">
            <span>Last Visit</span>
            <strong>{patient.lastVisit}</strong>
          </div>

        </div>

      </section>


      {/* Risk */}

      <section className="patient-profile-card">

        <div className="profile-section-header">

          <div>
            <h2>Patient Risk</h2>

            <p>
              Follow-up and patient risk status.
            </p>
          </div>

          <AtRiskBadge atRisk={patient.atRisk} />

        </div>


        {patient.atRisk ? (

          <div className="risk-action-box">

            <div>
              <strong>
                Patient requires follow-up
              </strong>

              <p>
                This patient has been identified as at risk.
                Review their history and consider contacting
                them for follow-up.
              </p>
            </div>

            <button className="primary-action">
              Contact Patient
            </button>

          </div>

        ) : (

          <div className="normal-risk-box">
            No current at-risk flag for this patient.
          </div>

        )}

      </section>


      {/* Medical Information */}

      <section className="patient-profile-card">

        <div className="profile-section-header">

          <div>
            <h2>Medical Information</h2>

            <p>
              Important medical information for staff.
            </p>
          </div>

        </div>


        <div className="medical-information">

          <div>
            <span>Allergies</span>

            <strong>
              {patient.allergies || "None recorded"}
            </strong>
          </div>

          <div>
            <span>Medical Flags</span>

            <strong>
              {patient.medicalFlags || "None recorded"}
            </strong>
          </div>

        </div>

      </section>


      {/* Timeline */}

      <PatientTimeline patient={patient} />


      {/* Edit History */}

      <EditHistoryLog patientId={patient.id} />


      {/* Merge Modal */}

      {showMergeModal && (

        <MergePatientModal
          patient={patient}
          onClose={() => setShowMergeModal(false)}
        />

      )}

    </div>
  );
};

export default PatientProfilePage;