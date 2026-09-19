import React from "react";

const Detail = ({ label, value }) => (
  <div className="wa-context-detail">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const PatientContextPanel = ({
  conversation,
  open,
  onToggle,
  onViewPatient,
  onViewAppointment,
  onCreateFollowUp,
  canCreateFollowUp = false,
  followUpCreated = false,
}) => {
  const { patient, context } = conversation;
  const hasAllergy = patient.allergies && patient.allergies !== "None";

  return (
    <section className="wa-context-panel">
      <button
        type="button"
        className="wa-context-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="wa-patient-context"
      >
        <span>
          <strong>Patient context</strong>
          <small>
            {patient.name} · {patient.id}
          </small>
        </span>
        <span className="wa-context-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {hasAllergy && (
        <div className="wa-allergy-strip">
          <span className="wa-allergy-icon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Allergy alert</strong>
            <p>{patient.allergies}</p>
          </div>
        </div>
      )}

      {open && (
        <div className="wa-context-body" id="wa-patient-context">
          <div className="wa-context-grid">
            <Detail label="Phone" value={patient.phone} />
            <Detail
              label="Age / Gender"
              value={`${patient.age} / ${patient.gender}`}
            />
            <Detail label="Last visit" value={patient.lastVisit} />

            {context?.appointment ? (
              <>
                <Detail
                  label="Appointment"
                  value={`${context.appointment.date} · ${context.appointment.time}`}
                />
                <Detail
                  label="Doctor"
                  value={context.doctor || "—"}
                />
                <Detail
                  label="Department"
                  value={context.department || "—"}
                />
                <Detail
                  label="Appointment status"
                  value={context.appointment.status || "—"}
                />
              </>
            ) : (
              <>
                <Detail label="Doctor" value={context.doctor || "—"} />
                <Detail label="Department" value={context.department || "—"} />
              </>
            )}

            {context?.followUpDate && (
              <Detail label="Follow-up" value={context.followUpDate} />
            )}

            {context?.pendingReport && (
              <div className="wa-context-pending">
                <span className="wa-mini-status pending">
                  Report pending
                </span>
                {context.pendingReport}
              </div>
            )}

            {context?.billing && (
              <div className="wa-context-billing">
                {context.billing}
              </div>
            )}
          </div>

          <div className="wa-context-actions">
            <button
              type="button"
              className="view-button"
              onClick={onViewPatient}
            >
              View patient
            </button>

            <button
              type="button"
              className="view-button"
              onClick={onViewAppointment}
            >
              View appointment
            </button>

            {canCreateFollowUp && (
              followUpCreated ? (
                <span className="wa-followup-done">
                  ✓ Follow-up scheduled
                </span>
              ) : (
                <button
                  type="button"
                  className="view-button"
                  onClick={onCreateFollowUp}
                >
                  Create follow-up
                </button>
              )
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default PatientContextPanel;