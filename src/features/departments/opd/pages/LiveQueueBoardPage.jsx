import { useMemo, useState } from "react";
import QueueTokenCard from "../components/QueueTokenCard";

const initialQueue = [
  {
    id: 1,
    patientName: "Ravi Kumar",
    description: "Chest pain",
    priority: "emergency",
    status: "waiting",
    arrivalTime: "09:10 AM",
    manualOrder: 1,
  },
  {
    id: 2,
    patientName: "Priya Sharma",
    description: "Breathing difficulty",
    priority: "emergency",
    status: "waiting",
    arrivalTime: "09:15 AM",
    manualOrder: 2,
  },
  {
    id: 3,
    patientName: "Arun Kumar",
    description: "Fever and headache",
    priority: "normal",
    status: "waiting",
    arrivalTime: "09:20 AM",
    manualOrder: 1,
  },
  {
    id: 4,
    patientName: "Meena Devi",
    description: "Follow-up consultation",
    priority: "normal",
    status: "waiting",
    arrivalTime: "09:25 AM",
    manualOrder: 2,
  },
  {
    id: 5,
    patientName: "Karthik Raj",
    description: "Stomach pain",
    priority: "normal",
    status: "waiting",
    arrivalTime: "09:30 AM",
    manualOrder: 3,
  },
  {
    id: 6,
    patientName: "Lakshmi",
    description: "Headache",
    priority: "normal",
    status: "waiting",
    arrivalTime: "09:35 AM",
    manualOrder: 4,
  },
  {
    id: 7,
    patientName: "Suresh Kumar",
    description: "General consultation",
    priority: "normal",
    status: "called",
    arrivalTime: "09:00 AM",
    manualOrder: 5,
  },
];

function sortQueue(patients) {
  return [...patients].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority === "emergency" ? -1 : 1;
    }

    return a.manualOrder - b.manualOrder;
  });
}

function matchesSearch(patient, term) {
  return (
    patient.patientName.toLowerCase().includes(term) ||
    patient.description.toLowerCase().includes(term)
  );
}

export default function LiveQueueBoardPage() {
  const [patients, setPatients] = useState(initialQueue);
  const [search, setSearch] = useState("");
  const [editingPatient, setEditingPatient] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const orderedPatients = useMemo(() => sortQueue(patients), [patients]);

  const searchTerm = search.trim().toLowerCase();

  const waitingPatients = useMemo(
    () =>
      orderedPatients.filter(
        (patient) =>
          patient.status === "waiting" &&
          matchesSearch(patient, searchTerm)
      ),
    [orderedPatients, searchTerm]
  );

  const calledPatients = useMemo(
    () =>
      orderedPatients.filter(
        (patient) =>
          patient.status === "called" &&
          matchesSearch(patient, searchTerm)
      ),
    [orderedPatients, searchTerm]
  );

  const waitingCount = patients.filter(
    (patient) => patient.status === "waiting"
  ).length;

  const emergencyCount = patients.filter(
    (patient) =>
      patient.status === "waiting" && patient.priority === "emergency"
  ).length;

  const calledCount = patients.filter(
    (patient) => patient.status === "called"
  ).length;

  const consultingCount = patients.filter(
    (patient) => patient.status === "consulting"
  ).length;

  function handleCall(patient) {
    setPatients((current) =>
      current.map((item) =>
        item.id === patient.id ? { ...item, status: "called" } : item
      )
    );
  }

  function handleEditSave(event) {
    event.preventDefault();

    if (!editingPatient) return;

    const name = editingPatient.patientName.trim();
    const description = editingPatient.description.trim();

    if (!name || !description) return;

    const original = patients.find(
      (patient) => patient.id === editingPatient.id
    );

    if (!original) return;

    const newPriority = editingPatient.priority;

    // if (
    //   original.priority !== "emergency" &&
    //   newPriority === "emergency" &&
    //   !window.confirm(
    //     "Change this patient to Emergency? They will move to the Emergency group at the top of the waiting queue."
    //   )
    // ) {
    //   return;
    // }

    setPatients((current) => {
      const updated = current.map((patient) => {
        if (patient.id !== editingPatient.id) return patient;

        return {
          ...patient,
          patientName: name,
          description,
          priority: newPriority,
          manualOrder:
            patient.priority === newPriority
              ? patient.manualOrder
              : Date.now(),
        };
      });

      const emergency = sortQueue(
        updated.filter((patient) => patient.priority === "emergency")
      ).map((patient, index) => ({
        ...patient,
        manualOrder: index + 1,
      }));

      const normal = sortQueue(
        updated.filter((patient) => patient.priority === "normal")
      ).map((patient, index) => ({
        ...patient,
        manualOrder: index + 1,
      }));

      return [...emergency, ...normal];
    });

    setEditingPatient(null);
  }

  function handleDragStart(event, patient) {
    if (patient.status !== "waiting") {
      event.preventDefault();
      return;
    }

    setDraggedId(patient.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(patient.id));
  }

  function handleDragOver(event, targetPatient) {
    event.preventDefault();

    if (
      draggedId === null ||
      draggedId === targetPatient.id ||
      targetPatient.status !== "waiting"
    ) {
      return;
    }

    const draggedPatient = patients.find(
      (patient) => patient.id === draggedId
    );

    if (
      !draggedPatient ||
      draggedPatient.priority !== targetPatient.priority
    ) {
      event.dataTransfer.dropEffect = "none";
      setDragOverId(null);
      return;
    }

    event.dataTransfer.dropEffect = "move";
    setDragOverId(targetPatient.id);
  }

  function handleDrop(event, targetPatient) {
    event.preventDefault();

    const sourceId = draggedId;
    setDragOverId(null);

    if (sourceId === null || sourceId === targetPatient.id) {
      setDraggedId(null);
      return;
    }

    setPatients((current) => {
      const source = current.find((patient) => patient.id === sourceId);
      const target = current.find(
        (patient) => patient.id === targetPatient.id
      );

      if (
        !source ||
        !target ||
        source.status !== "waiting" ||
        target.status !== "waiting" ||
        source.priority !== target.priority
      ) {
        return current;
      }

      const categoryPatients = sortQueue(
        current.filter(
          (patient) =>
            patient.priority === source.priority &&
            patient.status === "waiting"
        )
      );

      const fromIndex = categoryPatients.findIndex(
        (patient) => patient.id === sourceId
      );
      const toIndex = categoryPatients.findIndex(
        (patient) => patient.id === targetPatient.id
      );

      if (fromIndex < 0 || toIndex < 0) return current;

      const reordered = [...categoryPatients];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      const updatedCategory = reordered.map((patient, index) => ({
        ...patient,
        manualOrder: index + 1,
      }));

      const categoryIds = new Set(
        categoryPatients.map((patient) => patient.id)
      );

      return [
        ...current.filter((patient) => !categoryIds.has(patient.id)),
        ...updatedCategory,
      ];
    });

    setDraggedId(null);
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  function openEdit(patient) {
    setEditingPatient({ ...patient });
  }

  function renderPatientCard(patient) {
    return (
      <QueueTokenCard
        key={patient.id}
        patient={patient}
        onCall={handleCall}
        onEdit={openEdit}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        isDragging={draggedId === patient.id}
        isDragOver={dragOverId === patient.id}
      />
    );
  }

  return (
    <div className="opd-page">
      <div className="opd-page-header">
        <div>
          <h1>Live Queue Board</h1>
          <p>Manage patient flow and consultation order.</p>
        </div>
      </div>

      <div className="opd-stats">
        <div className="opd-stat-card">
          <span>Waiting</span>
          <strong>{waitingCount}</strong>
        </div>

        <div className="opd-stat-card">
          <span>Emergency</span>
          <strong>{emergencyCount}</strong>
        </div>

        <div className="opd-stat-card">
          <span>Called</span>
          <strong>{calledCount}</strong>
        </div>

        <div className="opd-stat-card">
          <span>In Consultation</span>
          <strong>{consultingCount}</strong>
        </div>
      </div>

      <div className="opd-queue-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search patients..."
          aria-label="Search patients"
        />

        <span className="opd-queue-count">
          {waitingPatients.length} waiting · {calledPatients.length} called
        </span>
      </div>

      <div className="opd-queue-sections">
        <section className="opd-queue-section">
          <div className="opd-queue-section-heading">
            <h2>Waiting Queue</h2>
            <span>{waitingPatients.length}</span>
          </div>

          <div className="opd-unified-queue">
            {waitingPatients.length === 0 ? (
              <div className="opd-empty-queue">No patients waiting.</div>
            ) : (
              waitingPatients.map(renderPatientCard)
            )}
          </div>
        </section>

        <section className="opd-queue-section">
          <div className="opd-queue-section-heading">
            <h2>Called Patients</h2>
            <span>{calledPatients.length}</span>
          </div>

          <div className="opd-unified-queue called-queue">
            {calledPatients.length === 0 ? (
              <div className="opd-empty-queue">
                No patients have been called yet.
              </div>
            ) : (
              calledPatients.map(renderPatientCard)
            )}
          </div>
        </section>
      </div>

      {editingPatient && (
        <div
          className="opd-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingPatient(null);
            }
          }}
        >
          <div
            className="opd-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="opd-edit-title"
          >
            <div className="opd-modal-header">
              <div>
                <h2 id="opd-edit-title">Edit Patient</h2>
                <p>Update patient details and priority.</p>
              </div>

              <button
                type="button"
                className="opd-modal-close"
                onClick={() => setEditingPatient(null)}
                aria-label="Close edit form"
              >
                ×
              </button>
            </div>

            <form className="opd-edit-form" onSubmit={handleEditSave}>
              <label>
                Patient name
                <input
                  type="text"
                  value={editingPatient.patientName}
                  onChange={(event) =>
                    setEditingPatient((current) => ({
                      ...current,
                      patientName: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Complaint
                <input
                  type="text"
                  value={editingPatient.description}
                  onChange={(event) =>
                    setEditingPatient((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Priority
                <select
                  value={editingPatient.priority}
                  onChange={(event) =>
                    setEditingPatient((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="emergency">Emergency</option>
                </select>
              </label>

              <div className="opd-modal-actions">
                <button
                  type="button"
                  className="opd-cancel-button"
                  onClick={() => setEditingPatient(null)}
                >
                  Cancel
                </button>

                <button type="submit" className="opd-save-button">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}