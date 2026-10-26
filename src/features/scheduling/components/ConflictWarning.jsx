import React from "react";

const ConflictWarning = ({
  appointment,
  onClose,
}) => {
  return (
    <div className="modal-overlay">

      <div className="schedule-modal">

        <div className="schedule-modal-header">

          <div>
            <span className="modal-label">
              Appointment Details
            </span>

            <h2>
              {appointment.patient}
            </h2>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>


        <div className="appointment-detail-list">

          <div>
            <span>Patient</span>
            <strong>
              {appointment.patient}
            </strong>
          </div>

          <div>
            <span>Doctor</span>
            <strong>
              {appointment.doctor}
            </strong>
          </div>

          <div>
            <span>Department</span>
            <strong>
              {appointment.department}
            </strong>
          </div>

          <div>
            <span>Time</span>
            <strong>
              {appointment.time} – {appointment.endTime}
            </strong>
          </div>

          <div>
            <span>Room</span>
            <strong>
              {appointment.room}
            </strong>
          </div>

          <div>
            <span>Status</span>
            <strong>
              {appointment.status}
            </strong>
          </div>

        </div>


        {/* Conflict warning */}

        <div className="conflict-warning">

          <strong>
            Scheduling check
          </strong>

          <p>
            Before moving or creating this appointment,
            the system should verify doctor, room and
            booking-rule conflicts.
          </p>

        </div>


        <div className="modal-actions">

          <button
            className="secondary-action"
            onClick={onClose}
          >
            Close
          </button>

          <button className="primary-action">
            Reschedule
          </button>

        </div>

      </div>

    </div>
  );
};

export default ConflictWarning;