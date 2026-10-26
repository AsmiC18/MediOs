import React, { useMemo, useState } from "react";

const initialBeds = [
  // Floor 1 - General Ward
  { id: "101-A", floor: 1, ward: "General Ward", room: "101", bed: "A", type: "General", status: "available", patient: null, doctor: null, staff: null },
  { id: "101-B", floor: 1, ward: "General Ward", room: "101", bed: "B", type: "General", status: "occupied", patient: "Priya Menon", doctor: "Dr. Arun Kumar", staff: "Nurse Anitha" },
  { id: "101-C", floor: 1, ward: "General Ward", room: "101", bed: "C", type: "General", status: "available", patient: null, doctor: null, staff: null },
  { id: "101-D", floor: 1, ward: "General Ward", room: "101", bed: "D", type: "General", status: "occupied", patient: "Rahul Verma", doctor: "Dr. Meera Shah", staff: "Nurse Kavya" },

  { id: "102-A", floor: 1, ward: "General Ward", room: "102", bed: "A", type: "General", status: "occupied", patient: "Arun Kumar", doctor: "Dr. Arun Kumar", staff: "Nurse Anitha" },
  { id: "102-B", floor: 1, ward: "General Ward", room: "102", bed: "B", type: "General", status: "available", patient: null, doctor: null, staff: null },
  { id: "102-C", floor: 1, ward: "General Ward", room: "102", bed: "C", type: "General", status: "cleaning", patient: null, doctor: null, staff: "Housekeeping" },
  { id: "102-D", floor: 1, ward: "General Ward", room: "102", bed: "D", type: "General", status: "available", patient: null, doctor: null, staff: null },

  { id: "103-A", floor: 1, ward: "General Ward", room: "103", bed: "A", type: "General", status: "available", patient: null, doctor: null, staff: null },
  { id: "103-B", floor: 1, ward: "General Ward", room: "103", bed: "B", type: "General", status: "available", patient: null, doctor: null, staff: null },
  { id: "103-C", floor: 1, ward: "General Ward", room: "103", bed: "C", type: "General", status: "occupied", patient: "Sneha Nair", doctor: "Dr. Meera Shah", staff: "Nurse Divya" },
  { id: "103-D", floor: 1, ward: "General Ward", room: "103", bed: "D", type: "General", status: "occupied", patient: "Vikram Rao", doctor: "Dr. Arjun Menon", staff: "Nurse Divya" },

  // Floor 2 - Private Ward
  { id: "201-A", floor: 2, ward: "Private Ward", room: "201", bed: "A", type: "Private", status: "occupied", patient: "Riya Singh", doctor: "Dr. Arjun Menon", staff: "Nurse Priya" },
  { id: "201-B", floor: 2, ward: "Private Ward", room: "201", bed: "B", type: "Private", status: "available", patient: null, doctor: null, staff: null },

  { id: "202-A", floor: 2, ward: "Private Ward", room: "202", bed: "A", type: "Private", status: "available", patient: null, doctor: null, staff: null },
  { id: "202-B", floor: 2, ward: "Private Ward", room: "202", bed: "B", type: "Private", status: "cleaning", patient: null, doctor: null, staff: "Housekeeping" },

  { id: "203-A", floor: 2, ward: "Private Ward", room: "203", bed: "A", type: "Private", status: "occupied", patient: "Karan Patel", doctor: "Dr. Meera Shah", staff: "Nurse Priya" },
  { id: "203-B", floor: 2, ward: "Private Ward", room: "203", bed: "B", type: "Private", status: "occupied", patient: "Aisha Khan", doctor: "Dr. Arjun Menon", staff: "Nurse Priya" },

  // Floor 3 - ICU
  { id: "301-A", floor: 3, ward: "ICU", room: "301", bed: "A", type: "ICU", status: "occupied", patient: "Mohammed Ali", doctor: "Dr. Arjun Menon", staff: "Nurse Lakshmi" },
  { id: "301-B", floor: 3, ward: "ICU", room: "301", bed: "B", type: "ICU", status: "available", patient: null, doctor: null, staff: null },
  { id: "302-A", floor: 3, ward: "ICU", room: "302", bed: "A", type: "ICU", status: "occupied", patient: "Neha Joshi", doctor: "Dr. Meera Shah", staff: "Nurse Lakshmi" },
  { id: "302-B", floor: 3, ward: "ICU", room: "302", bed: "B", type: "ICU", status: "available", patient: null, doctor: null, staff: null },
];

const statusLabels = {
  available: "Available",
  occupied: "Occupied",
  cleaning: "Cleaning",
  reserved: "Reserved",
};

const doctors = [
  "Dr. Arun Kumar",
  "Dr. Meera Shah",
  "Dr. Arjun Menon",
];

const staffMembers = [
  "Nurse Anitha",
  "Nurse Kavya",
  "Nurse Divya",
  "Nurse Priya",
  "Nurse Lakshmi",
];

export default function BedBoardPage() {
  const [beds, setBeds] = useState(initialBeds);

  const [floorFilter, setFloorFilter] = useState("all");
  const [wardFilter, setWardFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [selectedBed, setSelectedBed] = useState(null);

  const [patientName, setPatientName] = useState("");
  const [doctor, setDoctor] = useState("");
  const [staff, setStaff] = useState("");

  const availableCount = beds.filter(
    (bed) => bed.status === "available"
  ).length;

  const occupiedCount = beds.filter(
    (bed) => bed.status === "occupied"
  ).length;

  const cleaningCount = beds.filter(
    (bed) => bed.status === "cleaning"
  ).length;

  const reservedCount = beds.filter(
    (bed) => bed.status === "reserved"
  ).length;

  const wards = [...new Set(beds.map((bed) => bed.ward))];

  const filteredBeds = useMemo(() => {
    return beds.filter((bed) => {
      const matchesFloor =
        floorFilter === "all" || String(bed.floor) === floorFilter;

      const matchesWard =
        wardFilter === "all" || bed.ward === wardFilter;

      const matchesStatus =
        statusFilter === "all" || bed.status === statusFilter;

      const searchText = search.toLowerCase();

      const matchesSearch =
        !searchText ||
        bed.room.toLowerCase().includes(searchText) ||
        bed.bed.toLowerCase().includes(searchText) ||
        bed.patient?.toLowerCase().includes(searchText) ||
        bed.doctor?.toLowerCase().includes(searchText);

      return (
        matchesFloor &&
        matchesWard &&
        matchesStatus &&
        matchesSearch
      );
    });
  }, [beds, floorFilter, wardFilter, statusFilter, search]);

  const groupedBeds = filteredBeds.reduce((groups, bed) => {
    const key = `${bed.floor}-${bed.ward}`;

    if (!groups[key]) {
      groups[key] = {
        floor: bed.floor,
        ward: bed.ward,
        beds: [],
      };
    }

    groups[key].beds.push(bed);

    return groups;
  }, {});

  const openAllocation = (bed) => {
    setSelectedBed(bed);

    if (bed.status === "available") {
      setPatientName("");
      setDoctor("");
      setStaff("");
    }
  };

  const closeModal = () => {
    setSelectedBed(null);
    setPatientName("");
    setDoctor("");
    setStaff("");
  };

  const handleAllocate = () => {
    if (
      !selectedBed ||
      !patientName.trim() ||
      !doctor ||
      !staff
    ) {
      return;
    }

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id === selectedBed.id
          ? {
              ...bed,
              status: "occupied",
              patient: patientName.trim(),
              doctor,
              staff,
            }
          : bed
      )
    );

    closeModal();
  };

  const handleDischarge = () => {
    if (!selectedBed) return;

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id === selectedBed.id
          ? {
              ...bed,
              status: "cleaning",
              patient: null,
              doctor: null,
              staff: "Housekeeping",
            }
          : bed
      )
    );

    closeModal();
  };

  const handleMarkAvailable = () => {
    if (!selectedBed) return;

    setBeds((currentBeds) =>
      currentBeds.map((bed) =>
        bed.id === selectedBed.id
          ? {
              ...bed,
              status: "available",
              patient: null,
              doctor: null,
              staff: null,
            }
          : bed
      )
    );

    closeModal();
  };

  return (
    <div className="bed-board-page">

      {/* HEADER */}
      <div className="page-title-row">
        <div>
          <h1>Bed Allocation</h1>
          <p>
            Monitor rooms, beds, patients, doctors and assigned staff.
          </p>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="bed-summary">
        <div className="bed-summary-card">
          <span>Available</span>
          <strong>{availableCount}</strong>
        </div>

        <div className="bed-summary-card">
          <span>Occupied</span>
          <strong>{occupiedCount}</strong>
        </div>

        <div className="bed-summary-card">
          <span>Cleaning</span>
          <strong>{cleaningCount}</strong>
        </div>

        <div className="bed-summary-card">
          <span>Reserved</span>
          <strong>{reservedCount}</strong>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bed-board-controls">

        <input
          type="text"
          placeholder="Search room, bed, patient or doctor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bed-search"
        />

        <select
          value={floorFilter}
          onChange={(e) => setFloorFilter(e.target.value)}
        >
          <option value="all">All Floors</option>
          <option value="1">Floor 1</option>
          <option value="2">Floor 2</option>
          <option value="3">Floor 3</option>
        </select>

        <select
          value={wardFilter}
          onChange={(e) => setWardFilter(e.target.value)}
        >
          <option value="all">All Wards</option>

          {wards.map((ward) => (
            <option key={ward} value={ward}>
              {ward}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="available">Available</option>
          <option value="occupied">Occupied</option>
          <option value="cleaning">Cleaning</option>
          <option value="reserved">Reserved</option>
        </select>

      </div>

      {/* LEGEND */}
      <div className="bed-legend">
        <span>
          <i className="legend-dot available"></i>
          Available
        </span>

        <span>
          <i className="legend-dot occupied"></i>
          Occupied
        </span>

        <span>
          <i className="legend-dot cleaning"></i>
          Cleaning
        </span>

        <span>
          <i className="legend-dot reserved"></i>
          Reserved
        </span>
      </div>

      {/* BED BOARD */}
      <div className="compact-bed-board">

        {Object.values(groupedBeds).map((group) => (
          <section
            className="ward-section"
            key={`${group.floor}-${group.ward}`}
          >

            <div className="ward-heading">
              <div>
                <span>Floor {group.floor}</span>
                <h2>{group.ward}</h2>
              </div>

              <small>
                {group.beds.length} beds shown
              </small>
            </div>

            <div className="room-list">

              {[...new Set(group.beds.map((bed) => bed.room))].map(
                (roomNumber) => {

                  const roomBeds = group.beds.filter(
                    (bed) => bed.room === roomNumber
                  );

                  return (
                    <div className="compact-room" key={roomNumber}>

                      <div className="room-number">
                        <span>ROOM</span>
                        <strong>{roomNumber}</strong>
                      </div>

                      <div className="room-beds">

                        {roomBeds.map((bed) => (

                          <button
                            key={bed.id}
                            className={`compact-bed ${bed.status}`}
                            onClick={() => openAllocation(bed)}
                            title={
                              bed.status === "occupied"
                                ? `${bed.patient} — ${bed.doctor}`
                                : `${statusLabels[bed.status]}`
                            }
                          >

                            <span className="compact-bed-icon">
                              🛏
                            </span>

                            <strong>{bed.bed}</strong>

                          </button>

                        ))}

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          </section>
        ))}

        {filteredBeds.length === 0 && (
          <div className="no-beds">
            No beds match your current filters.
          </div>
        )}

      </div>

      {/* BED DETAILS / ALLOCATION MODAL */}
      {selectedBed && (
        <div
          className="bed-modal-overlay"
          onClick={closeModal}
        >

          <div
            className="bed-allocation-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="bed-modal-header">

              <div>
                <span className="modal-label">
                  {selectedBed.status === "available"
                    ? "AVAILABLE BED"
                    : "BED DETAILS"}
                </span>

                <h2>
                  Room {selectedBed.room} · Bed {selectedBed.bed}
                </h2>

                <p>
                  Floor {selectedBed.floor} · {selectedBed.ward}
                </p>
              </div>

              <button
                className="modal-close"
                onClick={closeModal}
              >
                ×
              </button>

            </div>

            {/* OCCUPIED BED */}
            {selectedBed.status === "occupied" && (
              <div className="bed-details">

                <div className="bed-detail-status occupied">
                  OCCUPIED
                </div>

                <div className="bed-detail-grid">

                  <div>
                    <span>Patient</span>
                    <strong>{selectedBed.patient}</strong>
                  </div>

                  <div>
                    <span>Doctor</span>
                    <strong>{selectedBed.doctor}</strong>
                  </div>

                  <div>
                    <span>Assigned Staff</span>
                    <strong>{selectedBed.staff}</strong>
                  </div>

                  <div>
                    <span>Bed Type</span>
                    <strong>{selectedBed.type}</strong>
                  </div>

                </div>

                <div className="modal-actions">

                  <button
                    className="secondary-action"
                    onClick={closeModal}
                  >
                    Close
                  </button>

                  <button
                    className="primary-action"
                    onClick={handleDischarge}
                  >
                    Discharge Patient
                  </button>

                </div>

              </div>
            )}

            {/* CLEANING BED */}
            {selectedBed.status === "cleaning" && (
              <div className="bed-details">

                <div className="bed-detail-status cleaning">
                  CLEANING
                </div>

                <p>
                  This bed is currently unavailable while
                  housekeeping prepares it for the next patient.
                </p>

                <div className="bed-details-simple">
                  <span>Assigned Staff</span>
                  <strong>{selectedBed.staff}</strong>
                </div>

                <div className="modal-actions">

                  <button
                    className="secondary-action"
                    onClick={closeModal}
                  >
                    Close
                  </button>

                  <button
                    className="primary-action"
                    onClick={handleMarkAvailable}
                  >
                    Mark Available
                  </button>

                </div>

              </div>
            )}

            {/* AVAILABLE BED */}
            {selectedBed.status === "available" && (
              <div className="allocation-form">

                <div className="bed-detail-status available">
                  AVAILABLE
                </div>

                <div className="form-field">
                  <label>Patient</label>

                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) =>
                      setPatientName(e.target.value)
                    }
                    placeholder="Search or enter patient name"
                  />
                </div>

                <div className="form-field">
                  <label>Doctor</label>

                  <select
                    value={doctor}
                    onChange={(e) =>
                      setDoctor(e.target.value)
                    }
                  >
                    <option value="">
                      Select doctor
                    </option>

                    {doctors.map((doctorName) => (
                      <option
                        key={doctorName}
                        value={doctorName}
                      >
                        {doctorName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Assigned Staff</label>

                  <select
                    value={staff}
                    onChange={(e) =>
                      setStaff(e.target.value)
                    }
                  >
                    <option value="">
                      Select staff
                    </option>

                    {staffMembers.map((staffName) => (
                      <option
                        key={staffName}
                        value={staffName}
                      >
                        {staffName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modal-actions">

                  <button
                    className="secondary-action"
                    onClick={closeModal}
                  >
                    Cancel
                  </button>

                  <button
                    className="primary-action"
                    onClick={handleAllocate}
                    disabled={
                      !patientName.trim() ||
                      !doctor ||
                      !staff
                    }
                  >
                    Allocate Bed
                  </button>

                </div>

              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}