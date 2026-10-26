export default function QueueTokenCard({
  patient,
  onCall,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragOver,
}) {
  const isEmergency = patient.priority === "emergency";
  const isWaiting = patient.status === "waiting";

  return (
    <div
      className={[
        "opd-queue-card",
        isEmergency ? "emergency-card" : "",
        isDragging ? "dragging" : "",
        isDragOver ? "drag-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={isWaiting}
      onDragStart={(event) => onDragStart(event, patient)}
      onDragOver={(event) => onDragOver(event, patient)}
      onDrop={(event) => onDrop(event, patient)}
      onDragEnd={onDragEnd}
    >
      <div className="opd-drag-handle" title="Drag to reorder">
        ⠿
      </div>

      <div className="opd-patient-info">
        <div className="opd-patient-topline">
          <span className="opd-patient-name">{patient.patientName}</span>

          <span
            className={`opd-priority-badge ${
              isEmergency ? "emergency" : "normal"
            }`}
          >
            {isEmergency ? "Emergency" : "Normal"}
          </span>
        </div>

        <div className="opd-patient-description">
          {patient.description}
        </div>

        <div className="opd-arrival-time">
          Arrived {patient.arrivalTime}
        </div>
      </div>

      <div className="opd-card-actions">
        <span className={`opd-status-label ${patient.status}`}>
          {patient.status === "waiting" ? "Waiting" : "Called"}
        </span>

        <button
          type="button"
          className="opd-edit-button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(patient);
          }}
        >
          Edit
        </button>

        <button
          type="button"
          className="opd-call-button"
          onClick={(event) => {
            event.stopPropagation();
            onCall(patient);
          }}
          disabled={!isWaiting}
        >
          {isWaiting ? "Call Patient" : "Called"}
        </button>
      </div>
    </div>
  );
}