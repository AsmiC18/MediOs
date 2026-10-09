
import { useMemo, useState } from "react";

const initialCases = [
  {
    id: "ER-2041",
    patient: "Rahul Sharma",
    age: "46",
    complaint: "Chest pain and breathlessness",
    severity: "Critical",
    arrival: "14:32",
    status: "Awaiting assessment",
    assignedTo: "Unassigned",
    contact: "9876543210",
    vitals: "BP 90/60 mmHg, SpO₂ 91%",
  },
  {
    id: "ER-2040",
    patient: "Meena Devi",
    age: "62",
    complaint: "Fall with leg injury",
    severity: "High",
    arrival: "14:25",
    status: "Under assessment",
    assignedTo: "Dr. Nisha Patel",
    contact: "9876501234",
    vitals: "BP 126/82 mmHg",
  },
  {
    id: "ER-2039",
    patient: "Arjun Kumar",
    age: "28",
    complaint: "Fever and weakness",
    severity: "Moderate",
    arrival: "14:10",
    status: "Awaiting assessment",
    assignedTo: "Unassigned",
    contact: "9876512340",
    vitals: "",
  },
];

const severityClass = {
  Critical: "emergency-severity-critical",
  High: "emergency-severity-high",
  Moderate: "emergency-severity-moderate",
  Low: "emergency-severity-low",
};

const initialForm = {
  patient: "",
  age: "",
  contact: "",
  complaint: "",
  severity: "Moderate",
  vitals: "",
};

export default function EmergencyPage() {
  const [cases, setCases] = useState(initialCases);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [selectedCase, setSelectedCase] = useState(null);
  const [notice, setNotice] = useState("");
  const [alertCase, setAlertCase] = useState(null);
  const [showAlertConfirmation, setShowAlertConfirmation] = useState(false);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    return cases.filter((item) => {
      const matchesSearch =
        !query ||
        item.id.toLowerCase().includes(query) ||
        item.patient.toLowerCase().includes(query) ||
        item.complaint.toLowerCase().includes(query);

      const matchesSeverity =
        severityFilter === "All" || item.severity === severityFilter;

      return matchesSearch && matchesSeverity;
    });
  }, [cases, search, severityFilter]);

  const counts = {
    total: cases.length,
    critical: cases.filter((item) => item.severity === "Critical").length,
    waiting: cases.filter(
      (item) => item.status === "Awaiting assessment"
    ).length,
    active: cases.filter((item) => item.status === "Under assessment").length,
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const registerPatient = (event) => {
    event.preventDefault();

    const newCase = {
      id: `ER-${Date.now().toString().slice(-6)}`,
      patient: form.patient.trim(),
      age: form.age,
      contact: form.contact.trim(),
      complaint: form.complaint.trim(),
      severity: form.severity,
      arrival: new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      status: "Awaiting assessment",
      assignedTo: "Unassigned",
      vitals: form.vitals.trim(),
    };

    setCases((current) => [newCase, ...current]);
    setNotice(
      `Emergency case ${newCase.id} registered. Assign clinical staff and assess the patient promptly.`
    );
    setForm(initialForm);
  };

  const updateCaseStatus = (caseId, status) => {
    setCases((current) =>
      current.map((item) =>
        item.id === caseId ? { ...item, status } : item
      )
    );

    setSelectedCase((current) =>
      current?.id === caseId ? { ...current, status } : current
    );

    setNotice(`${caseId} updated to "${status}".`);
  };

  const requestCriticalAlert = (item) => {
    setAlertCase(item);
    setShowAlertConfirmation(true);
  };


const confirmCriticalAlert = () => {
  if (alertCase) {
    setCases((current) =>
      current.map((item) =>
        item.id === alertCase.id
          ? { ...item, severity: "Critical" }
          : item
      )
    );

    setNotice(
      `CRITICAL ALERT recorded for ${alertCase.patient} (${alertCase.id}).`
    );
  } else {
    setNotice(
      "Department-wide critical alert recorded."
    );
  }

  setShowAlertConfirmation(false);
  setAlertCase(null);
};

  return (
    <div className="emergency-page">
      <div className="emergency-header">
        <div>
          <p className="emergency-eyebrow">DEPARTMENTS / EMERGENCY</p>
          <h1>Emergency Department</h1>
         
        </div>
      
      </div>

      

      {notice && (
        <div className="emergency-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      <div className="emergency-stats">
        <div className="emergency-stat-card">
          <span>Patients registered</span>
          <strong>{counts.total}</strong>
       
        </div>
        <div className="emergency-stat-card emergency-stat-critical">
          <span>Critical cases</span>
          <strong>{counts.critical}</strong>
       
        </div>
        <div className="emergency-stat-card">
          <span>Awaiting assessment</span>
          <strong>{counts.waiting}</strong>
        

        </div>
        <div className="emergency-stat-card">
          <span>Under assessment</span>
          <strong>{counts.active}</strong>
     
        </div>
      </div>

      <div className="emergency-layout">
        <section className="emergency-panel emergency-intake-panel">
          <div className="emergency-panel-header">
            <div>
              <p className="emergency-eyebrow">QUICK REGISTRATION</p>
              <h2>Triage intake</h2>
             
            </div>
          
          </div>

          <form className="emergency-form" onSubmit={registerPatient}>
            <label className="emergency-field">
              Patient name <span>*</span>
              <input
                value={form.patient}
                onChange={(event) => updateForm("patient", event.target.value)}
             
                required
              />
            </label>

            <div className="emergency-form-row">
              <label className="emergency-field">
                Age
                <input
                  type="number"
                  min="0"
                  max="125"
                  value={form.age}
                  onChange={(event) => updateForm("age", event.target.value)}
            
                />
              </label>

              <label className="emergency-field">
                Contact number
                <input
                  type="tel"
                  value={form.contact}
                  onChange={(event) => updateForm("contact", event.target.value)}
                
                />
              </label>
            </div>

            <label className="emergency-field">
              Presenting complaint <span>*</span>
              <textarea
                rows="3"
                value={form.complaint}
                onChange={(event) => updateForm("complaint", event.target.value)}
          
                required
              />
            </label>

            <label className="emergency-field">
              Triage severity <span>*</span>
              <select
                value={form.severity}
                onChange={(event) => updateForm("severity", event.target.value)}
                required
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Moderate">Moderate</option>
                <option value="Low">Low</option>
              </select>
           
            </label>

            <label className="emergency-field">
              Initial vitals / observations
              <textarea
                rows="2"
                value={form.vitals}
                onChange={(event) => updateForm("vitals", event.target.value)}
              
              />
            </label>

            <button type="submit" className="emergency-primary-button">
              Register emergency case
            </button>
        
          </form>
        </section>

        <section className="emergency-panel emergency-queue-panel">
          <div className="emergency-panel-header">
            <div>
            
              <h2>Emergency queue</h2>
            
            </div>
            <span className="emergency-queue-count">{filteredCases.length} cases</span>
          </div>

          <div className="emergency-toolbar">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, complaint or ID..."
              aria-label="Search emergency cases"
            />
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              aria-label="Filter by severity"
            >
              <option value="All">All severity levels</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div className="emergency-case-list">
            {filteredCases.map((item) => (
              <article
                key={item.id}
                className={`emergency-case-card ${
                  item.severity === "Critical" ? "is-critical" : ""
                }`}
              >
                <div className="emergency-case-top">
                  <div>
                    <span className="emergency-case-id">{item.id}</span>
                    <h3>{item.patient}</h3>
                    <span className="emergency-case-meta">
                    </span>
                  </div>
                  <span className={`emergency-severity ${severityClass[item.severity]}`}>
                    {item.severity}
                  </span>
                </div>

                <p className="emergency-complaint">{item.complaint}</p>


                <div className="emergency-case-details">
                  <span>Assigned: <strong>{item.assignedTo}</strong></span>
                  <span>Status: <strong>{item.status}</strong></span>
                </div>

                <div className="emergency-case-actions">
                  <button
                    type="button"
                    className="emergency-secondary-button"
                    onClick={() => setSelectedCase(item)}
                  >
                    View details
                  </button>

                  <button
                    type="button"
                    className="emergency-secondary-button"
                    onClick={() => requestCriticalAlert(item)}
                  >
                    Escalate
                  </button>

                  {item.status === "Awaiting assessment" ? (
                    <button
                      type="button"
                      className="emergency-primary-button"
                      onClick={() => updateCaseStatus(item.id, "Under assessment")}
                    >
                      Start assessment
                    </button>
                  ) : item.status === "Under assessment" ? (
                    <button
                      type="button"
                      className="emergency-primary-button"
                      onClick={() => updateCaseStatus(item.id, "Stabilized")}
                    >
                      Mark stabilized
                    </button>
                  ) : (
                    <span className="emergency-complete-label">Stabilized</span>
                  )}
                </div>
              </article>
            ))}

            {filteredCases.length === 0 && (
              <div className="emergency-empty">
                No emergency cases match the selected filters.
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedCase && (
        <div
          className="emergency-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCase(null);
            }
          }}
        >
          <section
            className="emergency-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emergency-detail-title"
          >
            <div className="emergency-modal-header">
              <div>
                <p className="emergency-eyebrow">{selectedCase.id}</p>
                <h2 id="emergency-detail-title">{selectedCase.patient}</h2>
                <span className={`emergency-severity ${severityClass[selectedCase.severity]}`}>
                  {selectedCase.severity}
                </span>
              </div>
              <button
                type="button"
                className="emergency-close-button"
                onClick={() => setSelectedCase(null)}
                aria-label="Close case details"
              >
                ×
              </button>
            </div>

            <div className="emergency-detail-grid">
              <div><span>Age</span><strong>{selectedCase.age || "Not recorded"}</strong></div>
              <div><span>Contact</span><strong>{selectedCase.contact || "Not recorded"}</strong></div>
              <div><span>Arrival</span><strong>{selectedCase.arrival}</strong></div>
              <div><span>Assigned staff</span><strong>{selectedCase.assignedTo}</strong></div>
              <div><span>Current status</span><strong>{selectedCase.status}</strong></div>
              <div><span>Initial observations</span><strong>{selectedCase.vitals || "Not recorded"}</strong></div>
            </div>

            <div className="emergency-detail-complaint">
              <span>Presenting complaint</span>
              <p>{selectedCase.complaint}</p>
            </div>

            <div className="emergency-modal-footer">
              <button
                type="button"
                className="emergency-secondary-button"
                onClick={() => setSelectedCase(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="emergency-alert-button"
                onClick={() => {
                  setSelectedCase(null);
                  requestCriticalAlert(selectedCase);
                }}
              >
                Escalate case
              </button>
            </div>
          </section>
        </div>
      )}

      {showAlertConfirmation && (
        <div className="emergency-modal-overlay">
          <section
            className="emergency-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="emergency-confirm-title"
          >
            <div className="emergency-alert-symbol">!</div>
            <h2 id="emergency-confirm-title">Confirm critical escalation</h2>
            <p>
              {alertCase
                ? `Mark ${alertCase.patient} (${alertCase.id}) as Critical?`
                : "Record a critical emergency alert for the department?"}
            </p>
          
            <div className="emergency-modal-footer">
              <button
                type="button"
                className="emergency-secondary-button"
                onClick={() => {
                  setShowAlertConfirmation(false);
                  setAlertCase(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="emergency-alert-button"
                onClick={confirmCriticalAlert}
              >
                Confirm escalation
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}