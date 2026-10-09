import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const bookingsStorageKey = "medios-surgery-ot-bookings";
const checklistStorageKey = "medios-surgery-preop-checklists";

const checklistSections = [
  {
    title: "Patient and consent",
    items: [
      {
        id: "identity",
        label: "Patient identity verified",
        detail: "Confirm the patient's identity using the hospital's approved identifiers.",
      },
      {
        id: "consent",
        label: "Procedure consent documented",
        detail: "Confirm the required consent is documented and available in the patient record.",
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
        detail: "Confirm the responsible clinician has reviewed the pre-operative assessment.",
      },
      {
        id: "allergies",
        label: "Allergies and current medicines reviewed",
        detail: "Review documented allergies, medicines and relevant medical history.",
      },
      {
        id: "investigations",
        label: "Required investigations available",
        detail: "Confirm the required test results and reports are available for the clinical team.",
      },
      {
        id: "fasting",
        label: "Fasting status checked and documented",
        detail: "Record that the responsible clinical team has checked fasting requirements.",
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
        detail: "Confirm the team has checked equipment, instruments and required supplies.",
      },
      {
        id: "insurance",
        label: "Insurance pre-authorisation status reviewed",
        detail: "Check the linked insurance status and resolve pending approval according to hospital policy.",
      },
    ],
  },
];

const initialBookings = [
  {
    id: "OT-1001",
    patientName: "Priya Menon",
    patientId: "P002",
    procedure: "Laparoscopic cholecystectomy",
    surgeon: "Dr. Mehta",
    date: "2026-10-10",
    time: "09:00 AM",
    otRoom: "OT-1",
    insuranceStatus: "Approved",
    checklistComplete: true,
  },
  {
    id: "OT-1002",
    patientName: "Arun Kumar",
    patientId: "P014",
    procedure: "Hernia repair",
    surgeon: "Dr. Sharma",
    date: "2026-10-10",
    time: "11:30 AM",
    otRoom: "OT-2",
    insuranceStatus: "Pending",
    checklistComplete: false,
  },
  {
    id: "OT-1003",
    patientName: "Rahul Singh",
    patientId: "P021",
    procedure: "Appendectomy",
    surgeon: "Dr. Rao",
    date: "2026-10-10",
    time: "02:00 PM",
    otRoom: "OT-1",
    insuranceStatus: "Approved",
    checklistComplete: false,
  },
];

function readSavedBookings() {
  try {
    const saved = localStorage.getItem(bookingsStorageKey);
    return saved ? JSON.parse(saved) : initialBookings;
  } catch {
    return initialBookings;
  }
}

function readSavedChecklists() {
  try {
    return JSON.parse(localStorage.getItem(checklistStorageKey) || "{}");
  } catch {
    return {};
  }
}

export default function PreOpChecklistPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedBooking = searchParams.get("booking");

  const [bookings, setBookings] = useState(readSavedBookings);
  const [savedChecklists, setSavedChecklists] = useState(
    readSavedChecklists
  );
  const [selectedId, setSelectedId] = useState(
    requestedBooking || initialBookings[0].id
  );
  const [notice, setNotice] = useState("");

  const allItems = useMemo(
    () => checklistSections.flatMap((section) => section.items),
    []
  );

  // Keep the selected booking in sync with the URL.
  useEffect(() => {
    if (
      requestedBooking &&
      bookings.some((booking) => booking.id === requestedBooking)
    ) {
      setSelectedId(requestedBooking);
    }
  }, [requestedBooking, bookings]);

  // Load current booking data when the page becomes active.
  useEffect(() => {
    const syncBookings = () => {
      setBookings(readSavedBookings());
    };

    window.addEventListener("focus", syncBookings);
    window.addEventListener("pageshow", syncBookings);

    return () => {
      window.removeEventListener("focus", syncBookings);
      window.removeEventListener("pageshow", syncBookings);
    };
  }, []);

  const selectedBooking = bookings.find(
    (booking) => booking.id === selectedId
  );

  const checkedItems = savedChecklists[selectedId] || {};

  const completedCount = allItems.filter(
    (item) => checkedItems[item.id]
  ).length;

  const isComplete = completedCount === allItems.length;

  const progress = Math.round(
    (completedCount / allItems.length) * 100
  );

  const updateChecklist = (itemId, checked) => {
    const nextChecklist = {
      ...checkedItems,
      [itemId]: checked,
    };

    const nextSavedChecklists = {
      ...savedChecklists,
      [selectedId]: nextChecklist,
    };

    setSavedChecklists(nextSavedChecklists);

    try {
      localStorage.setItem(
        checklistStorageKey,
        JSON.stringify(nextSavedChecklists)
      );
    } catch {
      setNotice(
        "Checklist updated for this session, but browser storage is unavailable."
      );
    }

    // Update the shared OT booking record immediately.
    const nextBookings = bookings.map((booking) =>
      booking.id === selectedId
        ? {
            ...booking,
            checklistComplete: allItems.every(
              (item) => nextChecklist[item.id]
            ),
          }
        : booking
    );

    setBookings(nextBookings);

    try {
      localStorage.setItem(
        bookingsStorageKey,
        JSON.stringify(nextBookings)
      );
    } catch {
      setNotice(
        "Checklist updated, but booking changes could not be saved in browser storage."
      );
    }
  };

  const saveChecklist = () => {
    const currentChecklist = savedChecklists[selectedId] || {};

    const complete = allItems.every(
      (item) => currentChecklist[item.id]
    );

    if (!complete) {
      setNotice(
        "Complete all required checklist items before marking the checklist complete."
      );
      return;
    }

    const nextBookings = bookings.map((booking) =>
      booking.id === selectedId
        ? { ...booking, checklistComplete: true }
        : booking
    );

    setBookings(nextBookings);

    try {
      localStorage.setItem(
        bookingsStorageKey,
        JSON.stringify(nextBookings)
      );
    } catch {
      setNotice(
        "Checklist completed for this session, but browser storage is unavailable."
      );
      return;
    }

    setNotice(
      "Checklist completed and saved. You can now return to the OT schedule."
    );
  };

  if (!selectedBooking) {
    return (
      <div className="surgery-page">
        <header className="surgery-header">
          <div>
            <p className="surgery-eyebrow">
              DEPARTMENT MODULE · SURGERY
            </p>
            <h1>Pre-operative checklist</h1>
            <p>No OT bookings are available.</p>
          </div>

          <button
            type="button"
            className="surgery-secondary-button"
            onClick={() =>
              navigate("/staff/departments/surgery")
            }
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
          <p className="surgery-eyebrow">
            DEPARTMENT MODULE · SURGERY
          </p>
          <h1>Pre-operative checklist</h1>
          <p>
            Record readiness checks for the selected OT booking.
            Every required item must be completed before the slot
            can be confirmed.
          </p>
        </div>

        <button
          type="button"
          className="surgery-secondary-button"
          onClick={() =>
            navigate("/staff/departments/surgery")
          }
        >
          ← Back to OT schedule
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
            <p>
              Select the surgery booking whose checklist you are
              reviewing.
            </p>
          </div>

          <span
            className={`surgery-checklist-status ${
              isComplete ? "complete" : "incomplete"
            }`}
          >
            {isComplete
              ? "Checklist complete"
              : "Checklist incomplete"}
          </span>
        </div>

        <div className="surgery-checklist-booking-select">
          <label className="surgery-field">
            OT booking
            <select
              value={selectedId}
              onChange={(event) =>
                setSelectedId(event.target.value)
              }
            >
              {bookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.id} — {booking.patientName} (
                  {booking.procedure})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="surgery-booking-details">
          <div>
            <span>Patient</span>
            <strong>
              {selectedBooking.patientName} ·{" "}
              {selectedBooking.patientId}
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
            <h3>Required pre-op checks</h3>
            <span>
              {completedCount} of {allItems.length} complete
            </span>
          </div>

          <div
            className="surgery-checklist-progress"
            role="progressbar"
            aria-label="Checklist completion"
            aria-valuemin="0"
            aria-valuemax={allItems.length}
            aria-valuenow={completedCount}
          >
            <div style={{ width: `${progress}%` }} />
          </div>

          {checklistSections.map((section) => (
            <section
              key={section.title}
              style={{ marginTop: 22 }}
            >
              <div className="surgery-section-heading">
                <h3>{section.title}</h3>
                <span>
                  {
                    section.items.filter(
                      (item) => checkedItems[item.id]
                    ).length
                  }
                  /{section.items.length}
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
                      updateChecklist(
                        item.id,
                        event.target.checked
                      )
                    }
                  />

                  <span className="surgery-checklist-label">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                </label>
              ))}
            </section>
          ))}

          <p className="surgery-checklist-note">
            This checklist supports the hospital's workflow and
            does not replace clinical judgement or local safety
            protocols. Insurance approval may require separate
            confirmation by the authorised team.
          </p>
        </div>

        <div className="surgery-checklist-page-footer">
          <button
            type="button"
            className="surgery-secondary-button"
            onClick={() =>
              navigate("/staff/departments/surgery")
            }
          >
            Cancel
          </button>

          <button
            type="button"
            className="surgery-primary-button"
            onClick={saveChecklist}
            disabled={!isComplete}
          >
            {isComplete
              ? "Complete checking"
              : `Complete all items (${completedCount}/${allItems.length})`}
          </button>
        </div>
      </section>
    </div>
  );
}