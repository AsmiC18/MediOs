
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CriticalAlertBanner, {
  updateEmergencyCases,
  useEmergencyCases,
} from "../components/CriticalAlertBanner";

const STAFF_MEMBERS = [
  "Dr. Nisha Patel",
  "Dr. Mehta",
  "Dr. Rao",
];

const severityClass = {
  Critical: "critical",
  High: "high",
  Moderate: "moderate",
  Low: "low",
};

export default function EmergencyPage() {
  const navigate = useNavigate();
  const cases = useEmergencyCases();

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [escalationCaseId, setEscalationCaseId] = useState(null);
  const [notice, setNotice] = useState("");

  const selectedCase =
    cases.find((item) => item.id === selectedCaseId) || null;

  const escalationCase =
    cases.find((item) => item.id === escalationCaseId) || null;

  const activeCases = cases.filter(
    (item) => item.status !== "Completed"
  );

  const completedCases = cases.filter(
    (item) => item.status === "Completed"
  );

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activeCases.filter((item) => {
      const matchesSearch =
        !query ||
        item.patientName.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        item.complaint.toLowerCase().includes(query);

      const matchesSeverity =
        severityFilter === "All" ||
        item.severity === severityFilter;

      const matchesStatus =
        statusFilter === "All" ||
        item.status === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [activeCases, search, severityFilter, statusFilter]);

  const criticalCount = activeCases.filter(
    (item) =>
      item.severity === "Critical" &&
      item.status !== "Stabilized"
  ).length;

  const awaitingCount = activeCases.filter(
    (item) => item.status === "Awaiting assessment"
  ).length;

  const unassignedCount = activeCases.filter(
    (item) =>
      !item.assignedTo || item.assignedTo === "Unassigned"
  ).length;

  function updateCase(caseId, changes) {
    updateEmergencyCases((current) =>
      current.map((item) =>
        item.id === caseId ? { ...item, ...changes } : item
      )
    );
  }

  function assignStaff(caseId, staffName) {
    updateCase(caseId, { assignedTo: staffName });

    const patient = cases.find((item) => item.id === caseId);
    setNotice(
      staffName === "Unassigned"
        ? `${patient?.patientName || "Patient"} is now unassigned.`
        : `${patient?.patientName || "Patient"} assigned to ${staffName}.`
    );
  }

  function beginAssessment(item) {
    updateCase(item.id, { status: "Under assessment" });
    setNotice(`Assessment started for ${item.patientName}.`);
  }

  function markStabilized(item) {
    updateCase(item.id, { status: "Stabilized" });
    setNotice(
      `${item.patientName} marked as stabilized. The patient remains in the active queue until the case is completed.`
    );
  }

  function completeEmergencyCase(item) {
    updateCase(item.id, { status: "Completed" });
    setSelectedCaseId(null);
    setNotice(
      `${item.patientName}'s emergency case is now completed and has been removed from the active queue.`
    );
  }

  function confirmEscalation() {
    if (!escalationCase) return;

    updateCase(escalationCase.id, { severity: "Critical" });
    setNotice(`${escalationCase.patientName} escalated to Critical.`);
    setEscalationCaseId(null);
  }

  function renderCaseCard(item, completed = false) {
    return (
      <article className="emergency-case-card" key={item.id}>
        <div className="emergency-case-main">
          <div className="emergency-case-title-row">
            <span
              className={`emergency-severity ${
                severityClass[item.severity]
              }`}
            >
              {item.severity}
            </span>
            <span className="emergency-case-id">{item.id}</span>
            <span className="emergency-case-time">{item.time}</span>
          </div>

          <h3>{item.patientName}</h3>
          <p className="emergency-case-complaint">{item.complaint}</p>

          <div className="emergency-case-meta">
            <span>Age: {item.age || "Not recorded"}</span>
            <span>Assigned: {item.assignedTo || "Unassigned"}</span>
            <span>Status: {item.status}</span>
          </div>
        </div>

        <div className="emergency-case-actions">
          <button
            type="button"
            className="emergency-secondary-button"
            onClick={() => setSelectedCaseId(item.id)}
          >
            View details
          </button>

          {!completed && item.severity !== "Critical" && (
            <button
              type="button"
              className="emergency-alert-button"
              onClick={() => setEscalationCaseId(item.id)}
            >
              Escalate
            </button>
          )}

          {!completed && item.status === "Awaiting assessment" && (
            <button
              type="button"
              className="emergency-primary-button"
              onClick={() => beginAssessment(item)}
            >
              Begin assessment
            </button>
          )}

          {!completed && item.status === "Under assessment" && (
            <button
              type="button"
              className="emergency-primary-button"
              onClick={() => markStabilized(item)}
            >
              Mark stabilized
            </button>
          )}

          {!completed && item.status === "Stabilized" && (
            <button
              type="button"
              className="emergency-primary-button"
              onClick={() => completeEmergencyCase(item)}
            >
              Complete case
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <main className="emergency-page">
      <header className="emergency-page-header">
        <div>
          <p className="emergency-eyebrow">DEPARTMENT / EMERGENCY</p>
          <h1>Emergency department</h1>
          <p className="emergency-page-subtitle">
            Triage, prioritize and coordinate emergency patient care.
          </p>
        </div>

        <button
          type="button"
          className="emergency-primary-button"
          onClick={() =>
            navigate("/staff/departments/emergency/triage-intake")
          }
        >
          + Register patient
        </button>
      </header>

      {notice && (
        <div className="emergency-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      <section className="emergency-summary-grid">
        <article className="emergency-summary-card">
          <span>Active cases</span>
          <strong>{activeCases.length}</strong>
          <small>Currently in the queue</small>
        </article>

        <article className="emergency-summary-card emergency-summary-critical">
          <span>Critical cases needing attention</span>
          <strong>{criticalCount}</strong>
          <small>Excludes stabilized cases</small>
        </article>

        <article className="emergency-summary-card">
          <span>Awaiting assessment</span>
          <strong>{awaitingCount}</strong>
          <small>Not yet assessed</small>
        </article>

        <article className="emergency-summary-card">
          <span>Unassigned cases</span>
          <strong>{unassignedCount}</strong>
          <small>Require staff allocation</small>
        </article>
      </section>

      <CriticalAlertBanner
        cases={cases}
        onViewCase={(item) => setSelectedCaseId(item.id)}
      />

      <section className="emergency-queue-section">
        <div className="emergency-section-heading">
          <div>
            <h2>Active emergency queue</h2>
            <p>Cases still requiring emergency-department follow-up.</p>
          </div>
          <span className="emergency-queue-total">
            {filteredCases.length}{" "}
            {filteredCases.length === 1 ? "case" : "cases"}
          </span>
        </div>

        <div className="emergency-filters">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search patient, case ID or complaint..."
            aria-label="Search emergency cases"
          />

          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value)}
            aria-label="Filter by severity"
          >
            <option value="All">All severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            <option value="Awaiting assessment">Awaiting assessment</option>
            <option value="Under assessment">Under assessment</option>
            <option value="Stabilized">Stabilized</option>
          </select>
        </div>

        <div className="emergency-case-list">
          {filteredCases.length ? (
            filteredCases.map((item) => renderCaseCard(item))
          ) : (
            <div className="emergency-empty-state">
              <h3>No active cases match</h3>
              <p>Try changing your search or filters.</p>
            </div>
          )}
        </div>
      </section>

      
<section className="emergency-completed-section">
  <div className="emergency-section-heading">
    <div>
      <h2>Completed cases</h2>
      <p>Emergency cases marked as complete.</p>
    </div>

    <span className="emergency-queue-total">
      {completedCases.length}{" "}
      {completedCases.length === 1 ? "case" : "cases"}
    </span>
  </div>

  {completedCases.length === 0 ? (
    <div className="emergency-empty-state">
      <p>No completed cases yet.</p>
    </div>
  ) : (
    <div className="emergency-case-list">
      {completedCases.map((item) => renderCaseCard(item, true))}
    </div>
  )}
</section>


      {selectedCase && (
        <div
          className="emergency-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedCaseId(null);
            }
          }}
        >
          <section
            className="emergency-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emergency-details-title"
          >
            <div className="emergency-modal-header">
              <div>
                <p className="emergency-eyebrow">
                  CASE {selectedCase.id}
                </p>
                <h2 id="emergency-details-title">Patient details</h2>
              </div>

              <button
                type="button"
                className="emergency-modal-close"
                aria-label="Close patient details"
                onClick={() => setSelectedCaseId(null)}
              >
                ×
              </button>
            </div>

            <div className="emergency-detail-grid">
              <div><span>Patient name</span><strong>{selectedCase.patientName}</strong></div>
              <div><span>Age</span><strong>{selectedCase.age || "Not recorded"}</strong></div>
              <div><span>Case ID</span><strong>{selectedCase.id}</strong></div>
              <div><span>Severity</span><strong>{selectedCase.severity}</strong></div>
              <div><span>Contact</span><strong>{selectedCase.contact || "Not recorded"}</strong></div>
              <div><span>Presenting complaint</span><strong>{selectedCase.complaint}</strong></div>
              <div><span>Blood pressure</span><strong>{selectedCase.bloodPressure || "Not recorded"}</strong></div>
              <div><span>Oxygen saturation</span><strong>{selectedCase.oxygenSaturation ? `${selectedCase.oxygenSaturation}%` : "Not recorded"}</strong></div>
              <div><span>Current status</span><strong>{selectedCase.status}</strong></div>
            </div>

            {selectedCase.status !== "Completed" && (
              <label className="emergency-field">
                Assign to staff member
                <select
                  value={selectedCase.assignedTo || "Unassigned"}
                  onChange={(event) =>
                    assignStaff(selectedCase.id, event.target.value)
                  }
                >
                  <option value="Unassigned">Unassigned</option>
                  {STAFF_MEMBERS.map((staffName) => (
                    <option key={staffName} value={staffName}>
                      {staffName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="emergency-modal-footer">
              {selectedCase.status === "Stabilized" && (
                <button
                  type="button"
                  className="emergency-primary-button"
                  onClick={() => completeEmergencyCase(selectedCase)}
                >
                  Complete case
                </button>
              )}

              <button
                type="button"
                className="emergency-secondary-button"
                onClick={() => setSelectedCaseId(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {escalationCase && (
        <div className="emergency-modal-backdrop">
          <section
            className="emergency-modal emergency-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emergency-escalation-title"
          >
            <p className="emergency-eyebrow">SEVERITY CHANGE</p>
            <h2 id="emergency-escalation-title">
              Escalate this case to Critical?
            </h2>
            <p>
              {escalationCase.patientName} will be marked Critical and
              added to the critical alert banner.
            </p>

            <div className="emergency-modal-footer">
              <button
                type="button"
                className="emergency-secondary-button"
                onClick={() => setEscalationCaseId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="emergency-alert-button"
                onClick={confirmEscalation}
              >
                Confirm escalation
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
