import React, { useMemo, useState } from "react";


const initialPatients = [
  {
    id: "PT-1042",
    name: "Ananya Sharma",
    lastVisit: "2026-07-10",
    cadence: 60,
    reason: "Routine follow-up",
    doctor: "Dr. Meera Nair",
    phone: "+91 98XXXXXX21",
    status: "Overdue",
  },
  {
    id: "PT-1085",
    name: "Rahul Menon",
    lastVisit: "2026-08-01",
    cadence: 60,
    reason: "Chronic care review",
    doctor: "Dr. Arjun Rao",
    phone: "+91 97XXXXXX34",
    status: "Overdue",
  },
  {
    id: "PT-1093",
    name: "Priya Nair",
    lastVisit: "2026-08-15",
    cadence: 60,
    reason: "Post-surgery follow-up",
    doctor: "Dr. Meera Nair",
    phone: "+91 99XXXXXX12",
    status: "Overdue",
  },
  {
    id: "PT-1120",
    name: "Vikram Patel",
    lastVisit: "2026-06-20",
    cadence: 45,
    reason: "Routine review",
    doctor: "Dr. Sanjay Iyer",
    phone: "+91 96XXXXXX48",
    status: "At risk",
  },
  {
    id: "PT-1148",
    name: "Meera Krishnan",
    lastVisit: "2026-09-01",
    cadence: 30,
    reason: "Chronic care review",
    doctor: "Dr. Arjun Rao",
    phone: "+91 95XXXXXX62",
    status: "Overdue",
  },
  {
    id: "PT-1172",
    name: "Karan Shah",
    lastVisit: "2026-04-12",
    cadence: 60,
    reason: "Inactive patient",
    doctor: "Dr. Sanjay Iyer",
    phone: "+91 94XXXXXX19",
    status: "At risk",
  },
];

const formatDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getDaysOverdue = (patient) => {
  const lastVisit = new Date(`${patient.lastVisit}T00:00:00`);
  const expectedVisit = new Date(lastVisit);

  expectedVisit.setDate(expectedVisit.getDate() + patient.cadence);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Math.max(
    0,
    Math.floor((today - expectedVisit) / (1000 * 60 * 60 * 24))
  );
};

const AtRiskListPage = () => {
  const [patients, setPatients] = useState(initialPatients);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All patients");
  const [sortBy, setSortBy] = useState("Most overdue");
  const [notice, setNotice] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);

  const patientRows = useMemo(() => {
    const rows = patients.map((patient) => {
      const daysOverdue = getDaysOverdue(patient);

      return {
        ...patient,
        daysOverdue,
        status: daysOverdue > 0 ? "Overdue" : "Upcoming",
      };
    });

    const query = search.trim().toLowerCase();

    return rows
      .filter((patient) => {
        const matchesSearch = [
          patient.id,
          patient.name,
          patient.doctor,
          patient.reason,
        ].some((value) => value.toLowerCase().includes(query));

        const matchesStatus =
          statusFilter === "All patients" ||
          (statusFilter === "At risk"
            ? patient.daysOverdue >= 30
            : patient.status === statusFilter);

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "Most overdue") {
          return b.daysOverdue - a.daysOverdue;
        }

        if (sortBy === "Least overdue") {
          return a.daysOverdue - b.daysOverdue;
        }

        return a.name.localeCompare(b.name);
      });
  }, [patients, search, statusFilter, sortBy]);

  const overdueCount = patients.filter(
    (patient) => getDaysOverdue(patient) > 0
  ).length;

  const dismissPatient = (patient) => {
    setPatients((previous) =>
      previous.filter((item) => item.id !== patient.id)
    );
    setSelectedPatient(null);
    setNotice(
      `${patient.name} was dismissed from this demonstration list.`
    );
  };

  const sendReminder = (patient) => {
    setNotice(
      `Reminder prepared for ${patient.name}. Connect your approved messaging service to send it.`
    );
  };

  return (
    <main className="followup-page">
      <header className="followup-header">
        <div>
          <div className="followup-breadcrumb">
            PATIENT CARE <span>/</span> FOLLOW-UP
          </div>
          <h1>At-risk patients</h1>
          <p>
            Identify patients who have missed their expected visit interval
            and prioritise follow-up.
          </p>
        </div>
      </header>

      <div className="followup-demo-note">
        <span />
        Demonstration records — not connected to live patient data.
      </div>

      {notice && (
        <div className="followup-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="followup-summary">
        <article className="followup-stat-card">
          <span className="followup-stat-label">Patients monitored</span>
          <strong>{patients.length}</strong>
          <small>Records in this demonstration list</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Overdue patients</span>
          <strong>{overdueCount}</strong>
          <small>Past their expected visit date</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">High priority</span>
          <strong>
            {
              patients.filter(
                (patient) => getDaysOverdue(patient) >= 30
              ).length
            }
          </strong>
          <small>At least 30 days overdue</small>
        </article>

        <article className="followup-stat-card">
          <span className="followup-stat-label">Expected cadence</span>
          <strong>
            {patients.length
              ? Math.round(
                  patients.reduce(
                    (sum, patient) => sum + patient.cadence,
                    0
                  ) / patients.length
                )
              : 0}
            <span className="followup-stat-suffix"> days</span>
          </strong>
          <small>Average interval across listed records</small>
        </article>
      </section>

      <section className="followup-card">
        <div className="followup-card-heading">
          <div>
            <h2>Follow-up list</h2>
            <p>
              Sort and filter patients by their expected visit interval.
            </p>
          </div>
        </div>

        <div className="followup-toolbar">
          <label className="followup-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, ID or doctor..."
              aria-label="Search patients"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter patients"
          >
            <option>All patients</option>
            <option>Overdue</option>
            <option>At risk</option>
          </select>

          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            aria-label="Sort patient list"
          >
            <option>Most overdue</option>
            <option>Least overdue</option>
            <option>Patient name</option>
          </select>
        </div>

        <div className="followup-table-wrap">
          <table className="followup-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Last visit</th>
                <th>Usual cadence</th>
                <th>Days overdue</th>
                <th>Reason</th>
                <th>Assigned doctor</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {patientRows.map((patient) => (
                <tr key={patient.id}>
                  <td>
                    <button
                      type="button"
                      className="followup-patient-link"
                      onClick={() => setSelectedPatient(patient)}
                    >
                      {patient.name}
                    </button>
                    <span className="followup-secondary-text">
                      {patient.id}
                    </span>
                  </td>

                  <td>{formatDate(patient.lastVisit)}</td>
                  <td>Every {patient.cadence} days</td>

                  <td>
                    <strong
                      className={
                        patient.daysOverdue >= 30
                          ? "followup-overdue-high"
                          : "followup-overdue"
                      }
                    >
                      {patient.daysOverdue > 0
                        ? `${patient.daysOverdue} days`
                        : "Not overdue"}
                    </strong>
                  </td>

                  <td>{patient.reason}</td>
                  <td>{patient.doctor}</td>

                  <td>
                    <span
                      className={`followup-status ${
                        patient.status === "Overdue"
                          ? "followup-status-overdue"
                          : "followup-status-reviewed"
                      }`}
                    >
                      {patient.status}
                    </span>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="followup-action-link"
                      onClick={() => sendReminder(patient)}
                    >
                      Send reminder
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {patientRows.length === 0 && (
            <div className="followup-empty">
              No patients match the selected search or filters.
            </div>
          )}
        </div>

        <div className="followup-table-footer">
          Showing {patientRows.length} of {patients.length} patients
        </div>
      </section>

      {selectedPatient && (
        <div
          className="followup-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedPatient(null);
            }
          }}
        >
          <section
            className="followup-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="followup-patient-heading"
          >
            <div className="followup-modal-header">
              <div>
                <span className="followup-eyebrow">PATIENT DETAILS</span>
                <h2 id="followup-patient-heading">
                  {selectedPatient.name}
                </h2>
                <p>{selectedPatient.id}</p>
              </div>

              <button
                type="button"
                className="followup-close-button"
                onClick={() => setSelectedPatient(null)}
                aria-label="Close details"
              >
                ×
              </button>
            </div>

            <div className="followup-detail-grid">
              <div>
                <span>Phone</span>
                <strong>{selectedPatient.phone}</strong>
              </div>
              <div>
                <span>Assigned doctor</span>
                <strong>{selectedPatient.doctor}</strong>
              </div>
              <div>
                <span>Last visit</span>
                <strong>{formatDate(selectedPatient.lastVisit)}</strong>
              </div>
              <div>
                <span>Usual cadence</span>
                <strong>Every {selectedPatient.cadence} days</strong>
              </div>
              <div>
                <span>Days overdue</span>
                <strong>{selectedPatient.daysOverdue}</strong>
              </div>
              <div>
                <span>Reason</span>
                <strong>{selectedPatient.reason}</strong>
              </div>
            </div>

            <div className="followup-modal-actions">
              <button
                type="button"
                className="followup-secondary-button"
                onClick={() => dismissPatient(selectedPatient)}
              >
                Dismiss from list
              </button>
              <button
                type="button"
                className="followup-primary-button"
                onClick={() => sendReminder(selectedPatient)}
              >
                Send reminder
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default AtRiskListPage;