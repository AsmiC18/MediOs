
import React from "react";

const checklistItemIds = [
  "identity",
  "consent",
  "site",
  "assessment",
  "allergies",
  "investigations",
  "fasting",
  "anaesthesia",
  "equipment",
  "insurance",
];

const completeChecklist = Object.fromEntries(
  checklistItemIds.map((id) => [id, true])
);

export const initialBookings = [
  {
    id: "OT-1001",
    patientName: "Priya Menon",
    patientId: "P002",
    age: 42,
    gender: "Female",
    procedure: "Laparoscopic cholecystectomy",
    surgeon: "Dr. Mehta",
    date: "2026-10-10",
    time: "10:20 AM",
    duration: 120,
    otRoom: "OT-1",
    status: "Confirmed",
    checklistItems: { ...completeChecklist },
    insuranceStatus: "Approved",
    notes: "Nil known allergies",
  },
  {
    id: "OT-1002",
    patientName: "Arun Kumar",
    patientId: "P014",
    age: 56,
    gender: "Male",
    procedure: "Hernia repair",
    surgeon: "Dr. Sharma",
    date: "2026-10-10",
    time: "11:30 AM",
    duration: 90,
    otRoom: "OT-2",
    status: "Pending",
    checklistItems: {},
    insuranceStatus: "Pending",
    notes: "Review current medication",
  },
  {
    id: "OT-1003",
    patientName: "Rahul Singh",
    patientId: "P021",
    age: 31,
    gender: "Male",
    procedure: "Appendectomy",
    surgeon: "Dr. Rao",
    date: "2026-10-10",
    time: "02:00 PM",
    duration: 75,
    otRoom: "OT-1",
    status: "Pending",
    checklistItems: {},
    insuranceStatus: "Approved",
    notes: "",
  },
];

// Shared in-memory state. This is not browser storage.
let surgeryBookings = initialBookings;

export function getSurgeryBookings() {
  return surgeryBookings;
}

export function setSurgeryBookings(nextBookings) {
  surgeryBookings = nextBookings;
}

export function getChecklistProgress(booking) {
  const checklist = booking.checklistItems || {};
  const completed = checklistItemIds.filter(
    (id) => checklist[id] === true
  ).length;

  return {
    completed,
    total: checklistItemIds.length,
    isComplete: completed === checklistItemIds.length,
  };
}

export default function OtBookingCard({
  booking,
  onEdit,
  onOpenChecklist,
  onConfirm,
}) {
  const progress = getChecklistProgress(booking);

  const insuranceClass =
    booking.insuranceStatus === "Approved"
      ? "surgery-insurance-approved"
      : booking.insuranceStatus === "Rejected"
        ? "surgery-insurance-rejected"
        : "surgery-insurance-pending";

  const statusClass =
    booking.status === "Confirmed"
      ? "confirmed"
      : "pending";

  return (
    <article className="surgery-booking-card">
      <div className="surgery-booking-card-main">
        <div className="surgery-booking-time">
          <strong>{booking.time}</strong>
          <span>{booking.date}</span>
          <small>{booking.duration} minutes</small>
        </div>

        <div className="surgery-booking-patient">
          <strong>{booking.patientName}</strong>

          <span>
            {booking.patientId} · {booking.age} years · {booking.gender}
          </span>

          <p>{booking.procedure}</p>

          <span>Surgeon: {booking.surgeon}</span>
          <small>OT: {booking.otRoom}</small>

          {booking.notes && (
            <small>Notes: {booking.notes}</small>
          )}
        </div>

        <div className="surgery-booking-statuses">
          <span
            className={`surgery-booking-status ${statusClass}`}
            title="Whether the operating theatre booking has been confirmed"
          >
            Booking: {booking.status}
          </span>

          <span
            className={`surgery-checklist-status ${
              progress.isComplete ? "complete" : "incomplete"
            }`}
            title="Number of completed pre-operative checklist items"
          >
            Pre-op checklist: {progress.completed}/{progress.total} complete
          </span>

          <span
            className={`surgery-insurance-status ${insuranceClass}`}
            title="Insurance pre-authorisation status"
          >
            Insurance: {booking.insuranceStatus}
          </span>
        </div>
      </div>

      <div className="surgery-booking-actions">
        <button
          type="button"
          className="surgery-secondary-button"
          onClick={() => onEdit(booking)}
        >
          Booking details
        </button>

        <button
          type="button"
          className="surgery-secondary-button"
          onClick={() => onOpenChecklist(booking.id)}
        >
          Pre-op checklist
        </button>

        {booking.status !== "Confirmed" && (
          <button
            type="button"
            className="surgery-primary-button"
            disabled={!progress.isComplete}
            title={
              !progress.isComplete
                ? "Complete every required pre-operative check first"
                : "Confirm OT booking"
            }
            onClick={() => onConfirm(booking.id)}
          >
            Confirm OT slot
          </button>
        )}
      </div>
    </article>
  );
}
