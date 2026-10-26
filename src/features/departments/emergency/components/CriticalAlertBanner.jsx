
import { useEffect, useState } from "react";

const initialCases = [
  {
    id: "ER-2041",
    patientName: "Rahul Sharma",
    age: "46",
    complaint: "Chest pain and breathlessness",
    severity: "Critical",
    time: "14:32",
    status: "Awaiting assessment",
    assignedTo: "Unassigned",
    contact: "9876543210",
    bloodPressure: "90/60",
    oxygenSaturation: "91",
  },
  {
    id: "ER-2040",
    patientName: "Meena Devi",
    age: "62",
    complaint: "Fall with leg injury",
    severity: "High",
    time: "14:25",
    status: "Under assessment",
    assignedTo: "Dr. Nisha Patel",
    contact: "9876543211",
    bloodPressure: "126/82",
    oxygenSaturation: "",
  },
  {
    id: "ER-2039",
    patientName: "Arjun Kumar",
    age: "28",
    complaint: "Fever and weakness",
    severity: "Moderate",
    time: "14:10",
    status: "Awaiting assessment",
    assignedTo: "Unassigned",
    contact: "",
    bloodPressure: "",
    oxygenSaturation: "",
  },
];

let emergencyCases = initialCases.map((item) => ({ ...item }));
const listeners = new Set();

export function getEmergencyCases() {
  return emergencyCases;
}

export function updateEmergencyCases(updater) {
  emergencyCases =
    typeof updater === "function"
      ? updater(emergencyCases)
      : updater;

  listeners.forEach((listener) => listener(emergencyCases));
}

export function subscribeToEmergencyCases(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useEmergencyCases() {
  const [cases, setCases] = useState(getEmergencyCases);

  useEffect(() => subscribeToEmergencyCases(setCases), []);

  return cases;
}

const severityClass = {
  Critical: "critical",
  High: "high",
  Moderate: "moderate",
  Low: "low",
};

export default function CriticalAlertBanner({
  cases = [],
  onViewCase,
}) {
  const criticalCases = cases.filter(
    (item) =>
      item.severity === "Critical" &&
      item.status !== "Stabilized" &&
      item.status !== "Completed"
  );

  if (criticalCases.length === 0) return null;

  return (
    <section
      className="emergency-critical-banner"
      aria-label="Critical emergency cases"
    >
      <div className="emergency-critical-banner-header">
        <div>
          <p className="emergency-eyebrow">Immediate attention</p>
          <h2>
            {criticalCases.length} critical{" "}
            {criticalCases.length === 1 ? "case" : "cases"} require
            attention
          </h2>
          <p>Review these patients and coordinate the appropriate response.</p>
        </div>

        <span className="emergency-critical-count">
          {criticalCases.length}
        </span>
      </div>

      <div className="emergency-critical-list">
        {criticalCases.map((item) => (
          <article className="emergency-critical-item" key={item.id}>
            <div className="emergency-critical-patient">
              <strong>{item.patientName}</strong>
              <span>
                {item.id} · {item.complaint}
              </span>
              <small>
                Assigned to: {item.assignedTo || "Unassigned"}
              </small>
            </div>

            <div className="emergency-critical-actions">
              <span
                className={`emergency-severity ${
                  severityClass[item.severity]
                }`}
              >
                {item.severity}
              </span>

              <button
                type="button"
                className="emergency-secondary-button"
                onClick={() => onViewCase?.(item)}
              >
                View case
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
