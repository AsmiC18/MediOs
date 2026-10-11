
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getSurgeryBookings,
  getChecklistProgress,
  setSurgeryBookings,
} from "../components/OtBookingCard";

const checklistSections = [
  {
    title: "Patient and consent",
    items: [
      {
        id: "identity",
        label: "Patient identity verified",
        detail: "Confirm the patient's identity using approved identifiers.",
      },
      {
        id: "consent",
        label: "Procedure consent documented",
        detail: "Confirm the required consent is documented in the patient record.",
      },
      {
        id: "site",
        label: "Procedure and site confirmed",
        detail: "Confirm the planned procedure and site with the surgical team.",
      },
    ],
  },
  {
    title: "Clinical readiness",
    items: [
      {
        id: "assessment",
        label: "Pre-operative assessment reviewed",
        detail: "Confirm the responsible clinician has reviewed the assessment.",
      },
      {
        id: "allergies",
        label: "Allergies and current medicines reviewed",
        detail: "Review documented allergies, medicines and relevant medical history.",
      },
      {
        id: "investigations",
        label: "Required investigations available",
        detail: "Confirm required test results and reports are available.",
      },
      {
        id: "fasting",
        label: "Fasting status checked and documented",
        detail: "Confirm the responsible clinical team has checked fasting requirements.",
      },
    ],
  },
  {
    title: "Theatre and administrative readiness",
    items: [
      {
        id: "anaesthesia",
        label: "Anaesthesia review documented",
        detail: "Confirm the anaesthesia review is recorded where applicable.",
      },
      {
        id: "equipment",
        label: "Required equipment and supplies checked",
        detail: "Confirm equipment, instruments and required supplies have been checked.",
      },
      {
        id: "insurance",
        label: "Insurance pre-authorisation status reviewed",
        detail: "Check the linked insurance status and follow up on pending approval.",
      },
    ],
  },
];

export default function PreOpChecklistPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedBooking = searchParams.get("booking");

  const [bookings, setBookings] = useState(getSurgeryBookings);
  const [selectedId, setSelectedId] = useState(
    requestedBooking || getSurgeryBookings()[0]?.id || ""
  );
  const [notice, setNotice] = useState("");

  const allItems = useMemo(
    () => checklistSections.flatMap((section) => section.items),
    []
  );

  useEffect(() => {
    if (requestedBooking) {
      setSelectedId(requestedBooking);
    }
  }, [requestedBooking]);

  const selectedBooking = bookings.find(
    (booking) => booking.id === selectedId
  );

  const checkedItems = selectedBooking?.checklistItems || {};

  const completedCount = allItems.filter(
    (item) => checkedItems[item.id] === true
  ).length;

  const isComplete = completedCount === allItems.length;

  const progress = Math.round(
    (completedCount / allItems.length) * 100
  );

  const updateChecklist = (itemId, checked) => {
    const nextBookings = bookings.map((booking) =>
      booking.id === selectedId
        ? {
            ...booking,
            checklistItems: {
              ...(booking.checklistItems || {}),
              [itemId]: checked,
            },
          }
        : booking
    );

    setBookings(nextBookings);
    setSurgeryBookings(nextBookings);
    setNotice("");
  };

  const saveChecklist = () => {
    const progressNow = getChecklistProgress(selectedBooking);

    if (!progressNow.isComplete) {
      setNotice(
        `${progressNow.completed} of ${progressNow.total} checks completed. Finish the remaining checks before confirming the OT slot.`
      );
      return;
    }

    setNotice(
      "All 10 pre-operative checks are complete. You can now confirm the OT slot from the schedule."
    );
  };

  if (!selectedBooking) {
    return (
      <div className="surgery-page">
        <header className="surgery-header">
          <div>
            <p className="surgery-eyebrow">DEPARTMENT / SURGERY</p>
            <h1>Pre-operative checklist</h1>
            <p>No OT bookings are available.</p>
          </div>

          <button
            type="button"
            className="surgery-secondary-button"
            onClick={() => navigate("/staff/departments/surgery")}
          >
            Back to OT schedule
          </button>
        </header>
      </div>
    );
  }

  return (
    <div className="surgery-page">
      <header className="surgery-header">
        <div>
          <p className="surgery-eyebrow">DEPARTMENT / SURGERY</p>
          <h1>Pre-operative checklist</h1>
          <p>
            Complete the required checks for this procedure before confirming the OT slot.
          </p>
        </div>

        <button
          type="button"
          className="surgery-secondary-button"
          onClick={() => navigate("/staff/departments/surgery")}
        >
          Back to OT schedule
        </button>
      </header>

      {notice && (
        <div className="surgery-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      <section className="surgery-panel">
        <div className="surgery-panel-header">
          <div>
            <h2>Booking details</h2>
            <p>Select the OT booking whose checklist you are reviewing.</p>
          </div>

          <span
            className={`surgery-checklist-status ${
              isComplete ? "complete" : "incomplete"
            }`}
          >
            {isComplete
              ? "All checks complete"
              : `${allItems.length - completedCount} checks remaining`}
          </span>
        </div>

        <div className="surgery-checklist-booking-select">
          <label className="surgery-field">
            OT booking *
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setNotice("");
              }}
              required
            >
              {bookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.id} — {booking.patientName} ({booking.procedure})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="surgery-booking-details">
          <div>
            <span>Patient</span>
            <strong>
              {selectedBooking.patientName} · {selectedBooking.patientId}
            </strong>
          </div>

          <div>
            <span>Procedure</span>
            <strong>{selectedBooking.procedure}</strong>
          </div>

          <div>
            <span>Surgeon</span>
            <strong>{selectedBooking.surgeon}</strong>
          </div>

          <div>
            <span>Date and time</span>
            <strong>
              {selectedBooking.date} · {selectedBooking.time}
            </strong>
          </div>

          <div>
            <span>Operation theatre</span>
            <strong>{selectedBooking.otRoom}</strong>
          </div>

          <div>
            <span>Insurance pre-authorisation</span>
            <strong>{selectedBooking.insuranceStatus}</strong>
          </div>
        </div>

        <div className="surgery-checklist-section">
          <div className="surgery-section-heading">
            <h3>Required pre-operative checks</h3>
            <span>
              {completedCount} of {allItems.length} complete
            </span>
          </div>

          <div
            className="surgery-checklist-progress"
            role="progressbar"
            aria-label="Pre-operative checklist completion"
            aria-valuemin="0"
            aria-valuemax={allItems.length}
            aria-valuenow={completedCount}
          >
            <div style={{ width: `${progress}%` }} />
          </div>

          {checklistSections.map((section) => {
            const sectionCompleted = section.items.filter(
              (item) => checkedItems[item.id]
            ).length;

            return (
              <section
                key={section.title}
                style={{ marginTop: 22 }}
              >
                <div className="surgery-section-heading">
                  <h3>{section.title}</h3>
                  <span>
                    {sectionCompleted}/{section.items.length} complete
                  </span>
                </div>

                {section.items.map((item) => (
                  <label
                    className="surgery-checklist-item"
                    key={item.id}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checkedItems[item.id])}
                      onChange={(event) =>
                        updateChecklist(item.id, event.target.checked)
                      }
                    />

                    <span className="surgery-checklist-label">
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </label>
                ))}
              </section>
            );
          })}

          <p className="surgery-checklist-note">
            Verify each item against the patient record and hospital safety protocol.
            Insurance approval may require separate confirmation by the authorised team.
          </p>
        </div>

        <div className="surgery-checklist-page-footer">
          <button
            type="button"
            className="surgery-secondary-button"
            onClick={() => navigate("/staff/departments/surgery")}
          >
            Back to schedule
          </button>

          <button
            type="button"
            className="surgery-primary-button"
            onClick={saveChecklist}
            disabled={!isComplete}
          >
            {isComplete ? "Checklist complete" : `Complete checks (${completedCount}/${allItems.length})`}
          </button>
        </div>
      </section>
    </div>
  );
}
