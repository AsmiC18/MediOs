import React from "react";

const mockConsentLogs = [
  {
    id: 1,
    patient: "Priya Menon",
    purpose: "Share Medical Records",
    date: "18 Sep 2026",
    status: "Granted",
  },
  {
    id: 2,
    patient: "Arun Kumar",
    purpose: "View Health Records",
    date: "18 Sep 2026",
    status: "Pending",
  },
  {
    id: 3,
    patient: "Rahul Verma",
    purpose: "Share Prescription",
    date: "17 Sep 2026",
    status: "Granted",
  },
  {
    id: 4,
    patient: "Sneha Nair",
    purpose: "Access Diagnostic Reports",
    date: "16 Sep 2026",
    status: "Revoked",
  },
];

export default function ConsentLogTable() {
  return (
    <div className="consent-table-card">

      <div className="invoice-section-header">
        <div>
          <span className="section-label">
            CONSENT
          </span>

          <h2>Consent Activity</h2>
        </div>
      </div>

      <div className="consent-table-wrapper">

        <table className="consent-table">

          <thead>
            <tr>
              <th>Patient</th>
              <th>Purpose</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>

            {mockConsentLogs.map((log) => (
              <tr key={log.id}>

                <td>
                  <strong>{log.patient}</strong>
                </td>

                <td>{log.purpose}</td>

                <td>{log.date}</td>

                <td>
                  <span
                    className={`consent-status ${log.status.toLowerCase()}`}
                  >
                    {log.status}
                  </span>
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}