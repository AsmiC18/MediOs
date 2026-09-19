import React from "react";
import {
  formatMessageTime,
  formatConversationListTime,
} from "../utils/templateVariables";

const Detail = ({ label, value }) => (
  <div className="wa-context-detail">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const ActivityRow = ({ outgoing, heading, text, time }) => (
  <div
    className={`wa-activity-row ${outgoing ? "outgoing" : "incoming"}`}
  >
    <span className="wa-activity-dot" aria-hidden="true"></span>
    <div className="wa-activity-content">
      <strong>{heading}</strong>
      {text && <p>{text}</p>}
      <small>{time}</small>
    </div>
  </div>
);

const PatientContextPanel = ({
  conversation,
  open,
  onClose,
  onViewPatient,
  onViewAppointment,
  onCreateFollowUp,
  canCreateFollowUp = false,
  followUpCreated = false,
}) => {
  if (!conversation) {
    return (
      <aside
        className="wa-context-panel"
        aria-label="Patient context"
      >
        <div className="wa-context-empty">
          <span aria-hidden="true">•</span>
          <p>
            Select a conversation to see the patient's details,
            appointment and recent activity.
          </p>
        </div>
      </aside>
    );
  }

  const { patient, context } = conversation;
  const hasAllergy = patient.allergies && patient.allergies !== "None";

  const recentMessages = [...conversation.messages].slice(-3).reverse();

  const activity = recentMessages.map((message) => ({
    outgoing: message.outgoing,
    heading: message.outgoing ? "You replied" : "Patient messaged",
    text: message.text,
    time: formatMessageTime(message.at),
  }));

  return (
    <aside
      className={`wa-context-panel ${open ? "open" : ""}`}
      aria-label="Patient context"
    >
      <div className="wa-context-header">
        <div>
          <span className="wa-context-eyebrow">Patient context</span>
          <h2>{patient.name}</h2>
        </div>

        <button
          type="button"
          className="wa-context-close"
          onClick={onClose}
          aria-label="Close patient context"
        >
          ×
        </button>
      </div>

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

      <div className="wa-context-body">
        <div className="wa-context-details">
          <Detail label="Patient ID" value={patient.id} />
          <Detail label="Phone" value={patient.phone} />
          <Detail
            label="Age / Gender"
            value={`${patient.age} / ${patient.gender}`}
          />
          <Detail label="Last visit" value={patient.lastVisit} />
        </div>

        <section className="wa-context-section">
          <h3>Appointment</h3>
          <div className="wa-context-list">
            {context?.appointment ? (
              <>
                <div className="wa-context-item">
                  <span>Slot</span>
                  <strong>
                    {context.appointment.date} · {context.appointment.time}
                  </strong>
                </div>
                <div className="wa-context-item">
                  <span>Status</span>
                  <strong>{context.appointment.status}</strong>
                </div>
              </>
            ) : (
              <div className="wa-context-item">
                <span>Slot</span>
                <strong>—</strong>
              </div>
            )}

            <div className="wa-context-item">
              <span>Doctor</span>
              <strong>{context?.doctor || "—"}</strong>
            </div>

            <div className="wa-context-item">
              <span>Department</span>
              <strong>{context?.department || "—"}</strong>
            </div>
          </div>

          {context?.followUpDate && (
            <div className="wa-context-note">
              Follow-up on {context.followUpDate}.
            </div>
          )}

          {context?.pendingReport && (
            <div className="wa-context-note pending">{context.pendingReport}</div>
          )}

          {context?.billing && (
            <div className="wa-context-note billing">
              {context.billing}
            </div>
          )}
        </section>

        <section className="wa-context-section">
          <h3>Recent activity</h3>
          <div className="wa-context-activity">
            <ActivityRow
              outgoing={false}
              heading="Conversation"
              text={`Wa thread ${conversation.id}`}
              time={formatConversationListTime(conversation.lastMessageAt)}
            />

            {activity.map((item, index) => (
              <ActivityRow
                key={`${item.heading}-${index}`}
                outgoing={item.outgoing}
                heading={item.heading}
                text={item.text}
                time={item.time}
              />
            ))}

            {activity.length === 0 && (
              <p className="wa-context-note">
                No messages yet in this conversation.
              </p>
            )}
          </div>
        </section>

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

          {canCreateFollowUp &&
            (followUpCreated ? (
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
            ))}
        </div>
      </div>
    </aside>
  );
};

export default PatientContextPanel;