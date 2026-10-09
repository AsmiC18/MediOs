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
  return (
    <div
      className={`opd-queue-card ${
        isDragging ? "dragging" : ""
      } ${isDragOver ? "drag-over" : ""}`}
      draggable={patient.status === "waiting"}
      onDragStart={(event) => onDragStart(event, patient)}
      onDragOver={(event) => onDragOver(event, patient)}
      onDrop={(event) => onDrop(event, patient)}
      onDragEnd={onDragEnd}
    >
      <div
        className="opd-drag-handle"
        title="Drag to reorder"
      >
        ⠿
      </div>

      <div className="opd-patient-info">
        <div className="opd-patient-name">
          {patient.patientName}
        </div>

        <div className="opd-patient-description">
          {patient.description}
        </div>
      </div>

      <div className="opd-card-actions">
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
          disabled={patient.status !== "waiting"}
        >
          Call Patient
        </button>
      </div>
    </div>
  );
}