import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const initialPatients = [
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
  },
  {
    id: "P004",
    name: "Anita Sharma",
    age: 39,
    gender: "Female",
    phone: "9876543213",
    lastVisit: "01 Jun 2026",
    status: "Active",
    atRisk: true,
    allergies: "Sulfa drugs",
  },
  {
    id: "P005",
    name: "Rahul Kumar",
    age: 52,
    gender: "Male",
    phone: "9876543214",
    lastVisit: "10 Sep 2026",
    status: "Inactive",
    atRisk: false,
    allergies: "None",
  },
];

const STORAGE_KEY = "medios_patients";

export default function PatientSearchPage() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");

  /* Load patients from localStorage */
  useEffect(() => {
    const storedPatients = localStorage.getItem(STORAGE_KEY);

    if (storedPatients) {
      setPatients(JSON.parse(storedPatients));
    } else {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(initialPatients)
      );

      setPatients(initialPatients);
    }
  }, []);

  /* Search by phone, name or patient ID */
  const filteredPatients = patients.filter((patient) => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return (
      patient.phone.toLowerCase().includes(query) ||
      patient.name.toLowerCase().includes(query) ||
      patient.id.toLowerCase().includes(query)
    );
  });

  return (
    <div className="patient-page">

      {/* =========================
          HEADER
      ========================= */}

      <div className="patient-page-header">

        <div>
          <h1>Patients</h1>

          <p>
            Search and manage patient records.
          </p>
        </div>

        <button
          className="primary-action"
          onClick={() => navigate("/staff/patients/new")}
        >
          + Add Patient
        </button>

      </div>


      {/* =========================
          SEARCH
      ========================= */}

      <section className="patient-search-card">

        <div className="search-label">
          Patient Search
        </div>

        <div className="patient-search-row">

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search by phone number, patient name or ID..."
          />

          {search && (
            <button
              className="clear-search"
              onClick={() => setSearch("")}
            >
              Clear
            </button>
          )}

        </div>

        <small>
          Search primarily by phone number, or use patient name or ID.
        </small>

      </section>


      {/* =========================
          RESULTS
      ========================= */}

      <section className="patient-table-card">

        <div className="patient-table-header">

          <div>
            <h2>Patient Records</h2>

            <span>
              Showing {filteredPatients.length} of{" "}
              {patients.length} patients
            </span>
          </div>

          <button
            className="secondary-action"
            onClick={() =>
              alert("Duplicate merge tool will be implemented next.")
            }
          >
            Merge Duplicates
          </button>

        </div>


        <div className="patient-table-wrapper">

          <table className="patient-table">

            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Patient</th>
                <th>Age / Gender</th>
                <th>Phone</th>
                <th>Last Visit</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>


            <tbody>

              {filteredPatients.map((patient) => (

                <tr key={patient.id}>

                  <td>
                    {patient.id}
                  </td>


                  <td>
                    <div className="patient-name">

                      <strong>
                        {patient.name}
                      </strong>

                      {patient.allergies &&
                        patient.allergies !== "None" && (
                          <small className="allergy-mini-warning">
                            Allergy: {patient.allergies}
                          </small>
                        )}

                    </div>
                  </td>


                  <td>
                    {patient.age} / {patient.gender}
                  </td>


                  <td>
                    {patient.phone}
                  </td>


                  <td>
                    {patient.lastVisit}
                  </td>


                  <td>

                    {patient.atRisk ? (
                      <span className="risk-badge">
                        At Risk
                      </span>
                    ) : (
                      <span className="normal-badge">
                        Normal
                      </span>
                    )}

                  </td>


                  <td>

                    <span
                      className={
                        patient.status === "Active"
                          ? "status-badge active-status"
                          : "status-badge inactive-status"
                      }
                    >
                      {patient.status}
                    </span>

                  </td>


                  <td>

                    <button
                      className="view-button"
                      onClick={() =>
                        navigate(
                          `/staff/patients/${patient.id}`
                        )
                      }
                    >
                      View
                    </button>

                  </td>

                </tr>

              ))}


              {filteredPatients.length === 0 && (

                <tr>

                  <td
                    colSpan="8"
                    className="empty-patients"
                  >
                    No patient records found.

                    <br />

                    <small>
                      Try another phone number, name or patient ID.
                    </small>

                  </td>

                </tr>

              )}

            </tbody>

          </table>

        </div>

      </section>

    </div>
  );
}