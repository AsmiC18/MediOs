import { useMemo, useState } from "react";
import QueueTokenCard from "../components/QueueTokenCard";

const PRIORITY_RANK = {
  emergency: 3,
  priority: 2,
  normal: 1,
};

const PRIORITY_GROUPS = [
  {
    key: "emergency",
    label: "EMERGENCY",
  },
  {
    key: "priority",
    label: "PRIORITY",
  },
  {
    key: "normal",
    label: "NORMAL",
  },
];

const initialQueue = [
  {
    id: 1,
    patientName: "Ravi Kumar",
    description: "Chest discomfort and dizziness",
    arrivalTime: "09:02 AM",
    arrivalMinutes: 542,
    priority: "emergency",
    status: "waiting",
    manualOrder: 0,
  },
  {
    id: 2,
    patientName: "Priya Sharma",
    description: "Severe abdominal pain",
    arrivalTime: "09:08 AM",
    arrivalMinutes: 548,
    priority: "emergency",
    status: "waiting",
    manualOrder: 1,
  },
  {
    id: 3,
    patientName: "Arun Kumar",
    description: "High fever and weakness",
    arrivalTime: "09:12 AM",
    arrivalMinutes: 552,
    priority: "priority",
    status: "waiting",
    manualOrder: 0,
  },
  {
    id: 4,
    patientName: "Meena Devi",
    description: "Persistent headache",
    arrivalTime: "09:18 AM",
    arrivalMinutes: 558,
    priority: "priority",
    status: "waiting",
    manualOrder: 1,
  },
  {
    id: 5,
    patientName: "Karthik Raj",
    description: "Knee pain after injury",
    arrivalTime: "09:20 AM",
    arrivalMinutes: 560,
    priority: "normal",
    status: "waiting",
    manualOrder: 0,
  },
  {
    id: 6,
    patientName: "Lakshmi",
    description: "Routine diabetes follow-up",
    arrivalTime: "09:25 AM",
    arrivalMinutes: 565,
    priority: "normal",
    status: "waiting",
    manualOrder: 1,
  },
  {
    id: 7,
    patientName: "Suresh Kumar",
    description: "Back pain for three days",
    arrivalTime: "09:31 AM",
    arrivalMinutes: 571,
    priority: "normal",
    status: "called",
    manualOrder: 2,
  },
];

function sortPatients(patients) {
  return [...patients].sort((a, b) => {
    if (
      PRIORITY_RANK[a.priority] !==
      PRIORITY_RANK[b.priority]
    ) {
      return (
        PRIORITY_RANK[b.priority] -
        PRIORITY_RANK[a.priority]
      );
    }

    if (a.manualOrder !== b.manualOrder) {
      return a.manualOrder - b.manualOrder;
    }

    return a.arrivalMinutes - b.arrivalMinutes;
  });
}

function normalizeOrders(patients, priority) {
  return patients
    .filter((patient) => patient.priority === priority)
    .sort((a, b) => {
      if (a.manualOrder !== b.manualOrder) {
        return a.manualOrder - b.manualOrder;
      }

      return a.arrivalMinutes - b.arrivalMinutes;
    })
    .map((patient, index) => ({
      ...patient,
      manualOrder: index,
    }));
}

export default function LiveQueueBoardPage() {
  const [queue, setQueue] = useState(() =>
    sortPatients(initialQueue)
  );

  const [searchTerm, setSearchTerm] = useState("");

  const [draggedPatientId, setDraggedPatientId] =
    useState(null);

  const [dragOverPatientId, setDragOverPatientId] =
    useState(null);

  const [editingPatient, setEditingPatient] =
    useState(null);

  const [editForm, setEditForm] = useState({
    patientName: "",
    description: "",
    priority: "normal",
  });

  const waitingPatients = useMemo(
    () =>
      queue.filter(
        (patient) => patient.status === "waiting"
      ),
    [queue]
  );

  const calledPatients = useMemo(
    () =>
      queue.filter(
        (patient) => patient.status === "called"
      ),
    [queue]
  );

  const consultingPatients = useMemo(
    () =>
      queue.filter(
        (patient) => patient.status === "consulting"
      ),
    [queue]
  );

  const completedPatients = useMemo(
    () =>
      queue.filter(
        (patient) => patient.status === "completed"
      ),
    [queue]
  );

  const filteredWaitingPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return waitingPatients;
    }

    return waitingPatients.filter(
      (patient) =>
        patient.patientName
          .toLowerCase()
          .includes(term) ||
        patient.description
          .toLowerCase()
          .includes(term)
    );
  }, [waitingPatients, searchTerm]);

  const priorityGroups = useMemo(() => {
    return PRIORITY_GROUPS.map((group) => ({
      ...group,

      patients: filteredWaitingPatients
        .filter(
          (patient) =>
            patient.priority === group.key
        )
        .sort((a, b) => {
          if (a.manualOrder !== b.manualOrder) {
            return (
              a.manualOrder - b.manualOrder
            );
          }

          return (
            a.arrivalMinutes - b.arrivalMinutes
          );
        }),
    }));
  }, [filteredWaitingPatients]);

  /* =========================
     CALL PATIENT
  ========================= */

  const handleCallPatient = (patient) => {
    setQueue((currentQueue) =>
      currentQueue.map((item) =>
        item.id === patient.id
          ? {
              ...item,
              status: "called",
            }
          : item
      )
    );
  };

  /* =========================
     EDIT PATIENT
  ========================= */

  const handleEditPatient = (patient) => {
    setEditingPatient(patient);

    setEditForm({
      patientName: patient.patientName,
      description: patient.description,
      priority: patient.priority,
    });
  };

  const handleSaveEdit = () => {
    if (!editingPatient) {
      return;
    }

    const trimmedName =
      editForm.patientName.trim();

    const trimmedDescription =
      editForm.description.trim();

    if (!trimmedName) {
      return;
    }

    setQueue((currentQueue) => {
      const priorityChanged =
        editingPatient.priority !==
        editForm.priority;

      let updatedQueue = currentQueue.map(
        (patient) =>
          patient.id === editingPatient.id
            ? {
                ...patient,
                patientName: trimmedName,
                description: trimmedDescription,
                priority: editForm.priority,
                manualOrder: priorityChanged
                  ? 999
                  : patient.manualOrder,
              }
            : patient
      );

      /*
       * If priority changes, put the patient
       * into the new priority group and
       * normalize that group's ordering.
       */
      if (priorityChanged) {
        updatedQueue = normalizeOrders(
          updatedQueue,
          editForm.priority
        );
      }

      return sortPatients(updatedQueue);
    });

    setEditingPatient(null);
  };

  /* =========================
     DRAG START
  ========================= */

  const handleDragStart = (event, patient) => {
    if (patient.status !== "waiting") {
      return;
    }

    setDraggedPatientId(patient.id);

    event.dataTransfer.effectAllowed = "move";

    event.dataTransfer.setData(
      "text/plain",
      String(patient.id)
    );
  };

  /* =========================
     DRAG OVER
  ========================= */

  const handleDragOver = (event, patient) => {
    event.preventDefault();

    if (
      draggedPatientId === null ||
      patient.status !== "waiting"
    ) {
      return;
    }

    const draggedPatient = queue.find(
      (item) => item.id === draggedPatientId
    );

    if (!draggedPatient) {
      return;
    }

    /*
     * A patient cannot cross a priority boundary.
     *
     * Emergency stays Emergency.
     * Priority stays Priority.
     * Normal stays Normal.
     */
    if (
      draggedPatient.priority !==
      patient.priority
    ) {
      event.dataTransfer.dropEffect = "none";

      setDragOverPatientId(null);

      return;
    }

    event.dataTransfer.dropEffect = "move";

    setDragOverPatientId(patient.id);
  };

  /* =========================
     DROP
  ========================= */

  const handleDrop = (event, targetPatient) => {
    event.preventDefault();

    if (
      draggedPatientId === null ||
      targetPatient.status !== "waiting"
    ) {
      return;
    }

    const draggedPatient = queue.find(
      (item) => item.id === draggedPatientId
    );

    if (!draggedPatient) {
      return;
    }

    /*
     * Do not allow a patient to be
     * dragged into another priority.
     */
    if (
      draggedPatient.priority !==
      targetPatient.priority
    ) {
      setDraggedPatientId(null);
      setDragOverPatientId(null);

      return;
    }

    const priority =
      draggedPatient.priority;

    const priorityPatients = queue
      .filter(
        (patient) =>
          patient.priority === priority &&
          patient.status === "waiting"
      )
      .sort((a, b) => {
        if (a.manualOrder !== b.manualOrder) {
          return (
            a.manualOrder - b.manualOrder
          );
        }

        return (
          a.arrivalMinutes -
          b.arrivalMinutes
        );
      });

    const draggedIndex =
      priorityPatients.findIndex(
        (patient) =>
          patient.id === draggedPatientId
      );

    const targetIndex =
      priorityPatients.findIndex(
        (patient) =>
          patient.id === targetPatient.id
      );

    if (
      draggedIndex === -1 ||
      targetIndex === -1 ||
      draggedIndex === targetIndex
    ) {
      setDraggedPatientId(null);
      setDragOverPatientId(null);

      return;
    }

    const reorderedPatients = [
      ...priorityPatients,
    ];

    const [removedPatient] =
      reorderedPatients.splice(
        draggedIndex,
        1
      );

    reorderedPatients.splice(
      targetIndex,
      0,
      removedPatient
    );

    const updatedOrders =
      reorderedPatients.map(
        (patient, index) => ({
          ...patient,
          manualOrder: index,
        })
      );

    setQueue((currentQueue) => {
      const updatedQueue =
        currentQueue.map((patient) => {
          const updatedPatient =
            updatedOrders.find(
              (item) =>
                item.id === patient.id
            );

          return (
            updatedPatient || patient
          );
        });

      return sortPatients(updatedQueue);
    });

    setDraggedPatientId(null);
    setDragOverPatientId(null);
  };

  /* =========================
     DRAG END
  ========================= */

  const handleDragEnd = () => {
    setDraggedPatientId(null);
    setDragOverPatientId(null);
  };

  return (
    <div className="opd-page">
      {/* =========================
          HEADER
      ========================= */}

      <div className="opd-page-header">
        <div>
          <h1>OPD Queue</h1>

          <p>
            Manage the live outpatient queue
            and patient flow.
          </p>
        </div>

        <div className="opd-header-note">
          Drag patients to reorder within
          the same priority.
        </div>
      </div>

      {/* =========================
          STATS
      ========================= */}

      <div className="opd-stats-grid">
        <div className="opd-stat-card">
          <span className="opd-stat-label">
            Waiting
          </span>

          <strong>
            {waitingPatients.length}
          </strong>
        </div>

        <div className="opd-stat-card">
          <span className="opd-stat-label">
            Called
          </span>

          <strong>
            {calledPatients.length}
          </strong>
        </div>

        <div className="opd-stat-card">
          <span className="opd-stat-label">
            In Consultation
          </span>

          <strong>
            {consultingPatients.length}
          </strong>
        </div>

        <div className="opd-stat-card">
          <span className="opd-stat-label">
            Completed
          </span>

          <strong>
            {completedPatients.length}
          </strong>
        </div>
      </div>

      {/* =========================
          SEARCH
      ========================= */}

      <div className="opd-toolbar">
        <div className="opd-search-wrapper">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
            placeholder="Search patient..."
            className="opd-search-input"
          />
        </div>

        <div className="opd-queue-count">
          {filteredWaitingPatients.length}{" "}
          patients waiting
        </div>
      </div>

      {/* =========================
          PRIORITY QUEUES
      ========================= */}

      <div className="opd-queue-board">
        {priorityGroups.map((group) => (
          <section
            key={group.key}
            className="opd-priority-section"
          >
            <div
              className={`opd-priority-label ${group.key}`}
            >
              {group.label}
            </div>

            <div className="opd-queue-list">
              {group.patients.length > 0 ? (
                group.patients.map(
                  (patient) => (
                    <QueueTokenCard
                      key={patient.id}
                      patient={patient}
                      onCall={
                        handleCallPatient
                      }
                      onEdit={
                        handleEditPatient
                      }
                      onDragStart={
                        handleDragStart
                      }
                      onDragOver={
                        handleDragOver
                      }
                      onDrop={handleDrop}
                      onDragEnd={
                        handleDragEnd
                      }
                      isDragging={
                        draggedPatientId ===
                        patient.id
                      }
                      isDragOver={
                        dragOverPatientId ===
                        patient.id
                      }
                    />
                  )
                )
              ) : (
                <div className="opd-empty-queue">
                  No patients in this queue
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* =========================
          ACTIVE OPD FLOW
      ========================= */}

      {(calledPatients.length > 0 ||
        consultingPatients.length > 0) && (
        <section className="opd-active-section">
          <div className="opd-section-heading">
            <div>
              <h2>Active OPD Flow</h2>

              <p>
                Patients who have been called
                or are currently in
                consultation.
              </p>
            </div>
          </div>

          <div className="opd-active-list">
            {calledPatients.map(
              (patient) => (
                <div
                  key={patient.id}
                  className="opd-active-row"
                >
                  <div>
                    <strong>
                      {patient.patientName}
                    </strong>

                    <span>
                      {patient.description}
                    </span>
                  </div>

                  <span className="opd-flow-status called">
                    Called
                  </span>
                </div>
              )
            )}

            {consultingPatients.map(
              (patient) => (
                <div
                  key={patient.id}
                  className="opd-active-row"
                >
                  <div>
                    <strong>
                      {patient.patientName}
                    </strong>

                    <span>
                      {patient.description}
                    </span>
                  </div>

                  <span className="opd-flow-status consulting">
                    In Consultation
                  </span>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* =========================
          EDIT PATIENT MODAL
      ========================= */}

      {editingPatient && (
        <div
          className="opd-modal-overlay"
          onClick={() =>
            setEditingPatient(null)
          }
        >
          <div
            className="opd-edit-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="opd-modal-header">
              <div>
                <h2>
                  Edit Patient Queue
                </h2>

                <p>
                  Update patient details or
                  clinical priority.
                </p>
              </div>

              <button
                type="button"
                className="opd-modal-close"
                onClick={() =>
                  setEditingPatient(null)
                }
              >
                ×
              </button>
            </div>

            <div className="opd-edit-form">
              <label>
                Patient Name

                <input
                  type="text"
                  value={
                    editForm.patientName
                  }
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      patientName:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Description

                <textarea
                  rows="3"
                  value={
                    editForm.description
                  }
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      description:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Priority

                <select
                  value={
                    editForm.priority
                  }
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      priority:
                        event.target.value,
                    })
                  }
                >
                  <option value="emergency">
                    Emergency
                  </option>

                  <option value="priority">
                    Priority
                  </option>

                  <option value="normal">
                    Normal
                  </option>
                </select>
              </label>
            </div>

            <div className="opd-modal-actions">
              <button
                type="button"
                className="opd-cancel-button"
                onClick={() =>
                  setEditingPatient(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="opd-save-button"
                onClick={handleSaveEdit}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}