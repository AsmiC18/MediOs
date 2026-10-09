import React from "react";

export default function OtBookingCard({
  booking,
  onEdit,
  onOpenChecklist,
  onConfirm,
}) {
  const checklistComplete = booking.checklistComplete;

  const insuranceClass =
    booking.insuranceStatus === "Approved"
      ? "surgery-insurance-approved"
      : booking.insuranceStatus === "Rejected"
        ? "surgery-insurance-rejected"
        : "surgery-insurance-pending";

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

          {booking.notes && <small>Notes: {booking.notes}</small>}
        </div>

        <div className="surgery-booking-statuses">
          <span
            className={`surgery-booking-status ${booking.status.toLowerCase()}`}
          >
            {booking.status}
          </span>

          <span
            className={`surgery-checklist-status ${
              checklistComplete ? "complete" : "incomplete"
            }`}
          >
            Pre-op: {checklistComplete ? "Complete" : "Incomplete"}
          </span>

          <span className={`surgery-insurance-status ${insuranceClass}`}>
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
          Edit booking
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
            disabled={!checklistComplete}
            title={
              !checklistComplete
                ? "Complete the pre-op checklist before confirming"
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