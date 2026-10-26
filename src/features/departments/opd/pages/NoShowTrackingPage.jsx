
import { useMemo, useState } from "react";

const initialPatients = [
  {
    id: "OPD-1042",
    patientName: "Ananya Rao",
    phone: "+91 98765 43210",
    department: "Cardiology",
    missedCount: 3,
    lastMissed: "08 Oct 2026",
    nextAppointment: "14 Oct 2026",
    reviewed: false,
    history: [
      "08 Oct 2026",
      "25 Sep 2026",
      "10 Sep 2026",
    ],
  },
  {
    id: "OPD-1086",
    patientName: "Vikram Singh",
    phone: "+91 98765 12340",
    department: "Orthopedics",
    missedCount: 2,
    lastMissed: "07 Oct 2026",
    nextAppointment: "Not scheduled",
    reviewed: false,
    history: ["07 Oct 2026", "18 Sep 2026"],
  },
  {
    id: "OPD-1091",
    patientName: "Neha Sharma",
    phone: "+91 98765 67890",
    department: "General Medicine",
    missedCount: 2,
    lastMissed: "05 Oct 2026",
    nextAppointment: "16 Oct 2026",
    reviewed: true,
    history: ["05 Oct 2026", "12 Sep 2026"],
  },
  {
    id: "OPD-1103",
    patientName: "Rahul Verma",
    phone: "+91 98765 11223",
    department: "Dermatology",
    missedCount: 1,
    lastMissed: "09 Oct 2026",
    nextAppointment: "Not scheduled",
    reviewed: false,
    history: ["09 Oct 2026"],
  },
  {
    id: "OPD-1120",
    patientName: "Meera Nair",
    phone: "+91 98765 44556",
    department: "Endocrinology",
    missedCount: 4,
    lastMissed: "06 Oct 2026",
    nextAppointment: "15 Oct 2026",
    reviewed: false,
    history: [
      "06 Oct 2026",
      "20 Sep 2026",
      "02 Sep 2026",
      "18 Aug 2026",
    ],
  },
];

export default function NoShowTrackingPage() {
  const [patients, setPatients] = useState(initialPatients);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [notice, setNotice] = useState("");

  const repeatedCount = patients.filter(
    (patient) => patient.missedCount >= 2
  ).length;

  const pendingReviewCount = patients.filter(
    (patient) =>
      patient.missedCount >= 2 && !patient.reviewed
  ).length;

  const totalMissed = patients.reduce(
    (total, patient) => total + patient.missedCount,
    0
  );

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return patients
      .filter((patient) => {
        const matchesSearch =
          patient.patientName.toLowerCase().includes(query) ||
          patient.id.toLowerCase().includes(query) ||
          patient.department.toLowerCase().includes(query);

        const matchesFilter =
          filter === "all" ||
          (filter === "repeated" && patient.missedCount >= 2) ||
          (filter === "pending" &&
            patient.missedCount >= 2 &&
            !patient.reviewed) ||
          (filter === "reviewed" && patient.reviewed);

        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => b.missedCount - a.missedCount);
  }, [patients, search, filter]);

  const markReviewed = (patient) => {
    setPatients((current) =>
      current.map((item) =>
        item.id === patient.id
          ? { ...item, reviewed: true }
          : item
      )
    );

    setNotice(`${patient.patientName} marked as reviewed.`);

    if (selectedPatient?.id === patient.id) {
      setSelectedPatient((current) => ({
        ...current,
        reviewed: true,
      }));
    }
  };

  return (
    <div className="noshow-page">
      <header className="noshow-page-header">
        <div>
          <span className="noshow-eyebrow">
            OUTPATIENT DEPARTMENT
          </span>
          <h1>No-Show Tracking</h1>
          <p>
            Identify patients with repeated missed appointments
            and follow up when needed.
          </p>
        </div>

        <div className="noshow-header-count">
          <span>Patients flagged</span>
          <strong>{repeatedCount}</strong>
        </div>
      </header>

      {notice && (
        <div className="noshow-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="noshow-stats">
        <article className="noshow-stat-card">
          <span>Total missed appointments</span>
          <strong>{totalMissed}</strong>
          <p>Across the listed patients</p>
        </article>

        <article className="noshow-stat-card">
          <span>Repeated no-shows</span>
          <strong>{repeatedCount}</strong>
          <p>Patients with 2 or more missed visits</p>
        </article>

        <article className="noshow-stat-card">
          <span>Pending review</span>
          <strong>{pendingReviewCount}</strong>
          <p>Flagged patients not yet reviewed</p>
        </article>
      </section>

      <section className="noshow-main-section">
        <div className="noshow-section-heading">
          <div>
            <h2>Patient follow-up list</h2>
            <p>
              Review appointment history and identify patients
              who may need assistance.
            </p>
          </div>
          <span className="noshow-result-count">
            {filteredPatients.length} patients
          </span>
        </div>

        <div className="noshow-toolbar">
          <div className="noshow-search">
            <span aria-hidden="true">
              <icon name="search" size="sm" />
            </span>
            <input
              type="search"
              placeholder="Search name, patient ID or department..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search patients"
            />
          </div>

          <select
            className="noshow-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter patients"
          >
            <option value="all">All patients</option>
            <option value="repeated">Repeated no-shows</option>
            <option value="pending">Pending review</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>

        <div className="noshow-table-wrapper">
          <table className="noshow-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Department</th>
                <th>Missed visits</th>
                <th>Last missed</th>
                <th>Follow-up status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredPatients.map((patient) => {
                const repeated = patient.missedCount >= 2;

                return (
                  <tr key={patient.id}>
                    <td>
                      <div className="noshow-patient-cell">
                        <strong>{patient.patientName}</strong>
                        <span>{patient.id}</span>
                      </div>
                    </td>

                    <td>{patient.department}</td>

                    <td>
                      <span
                        className={`noshow-missed-count ${
                          repeated ? "repeated" : ""
                        }`}
                      >
                        {patient.missedCount}
                      </span>
                    </td>

                    <td>{patient.lastMissed}</td>

                    <td>
                      <span
                        className={`noshow-status ${
                          !repeated
                            ? "monitor"
                            : patient.reviewed
                              ? "reviewed"
                              : "pending"
                        }`}
                      >
                        {!repeated
                          ? "Monitor"
                          : patient.reviewed
                            ? "Reviewed"
                            : "Needs review"}
                      </span>
                    </td>

                    <td>
                      <div className="noshow-row-actions">
                        <button
                          type="button"
                          className="noshow-view-button"
                          onClick={() =>
                            setSelectedPatient(patient)
                          }
                        >
                          View
                        </button>

                        {repeated && !patient.reviewed && (
                          <button
                            type="button"
                            className="noshow-review-button"
                            onClick={() => markReviewed(patient)}
                          >
                            Mark reviewed
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredPatients.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="noshow-empty">
                      <strong>No matching patients</strong>
                      <p>
                        Try changing your search or filter.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="noshow-table-footnote">
          Repeated no-show flag: 2 or more missed appointments.
          This threshold is configurable and is currently used
          for the frontend mock data.
        </p>
      </section>

      {selectedPatient && (
        <div
          className="noshow-modal-overlay"
          onClick={() => setSelectedPatient(null)}
        >
          <section
            className="noshow-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="noshow-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="noshow-modal-header">
              <div>
                <span className="noshow-eyebrow">
                  PATIENT DETAILS
                </span>
                <h2 id="noshow-detail-title">
                  {selectedPatient.patientName}
                </h2>
                <p>{selectedPatient.id}</p>
              </div>

              <button
                type="button"
                className="noshow-close-button"
                aria-label="Close details"
                onClick={() => setSelectedPatient(null)}
              >
                ×
              </button>
            </header>

            <div className="noshow-detail-grid">
              <div>
                <span>Contact</span>
                <strong>{selectedPatient.phone}</strong>
              </div>
              <div>
                <span>Department</span>
                <strong>{selectedPatient.department}</strong>
              </div>
              <div>
                <span>Missed appointments</span>
                <strong>{selectedPatient.missedCount}</strong>
              </div>
              <div>
                <span>Next appointment</span>
                <strong>
                  {selectedPatient.nextAppointment}
                </strong>
              </div>
            </div>

            <div className="noshow-history">
              <h3>Missed appointment history</h3>
              {selectedPatient.history.map((date, index) => (
                <div className="noshow-history-row" key={`${date}-${index}`}>
                  <span className="noshow-history-dot" />
                  <span>Missed appointment</span>
                  <strong>{date}</strong>
                </div>
              ))}
            </div>

            <footer className="noshow-modal-actions">
              <button
                type="button"
                className="noshow-view-button"
                onClick={() => setSelectedPatient(null)}
              >
                Close
              </button>

              {selectedPatient.missedCount >= 2 &&
                !selectedPatient.reviewed && (
                  <button
                    type="button"
                    className="noshow-review-button"
                    onClick={() => markReviewed(selectedPatient)}
                  >
                    Mark reviewed
                  </button>
                )}
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
