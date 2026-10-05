import React, { useMemo, useState } from "react";

const initialStaff = [
  {
    id: "EMP001",
    name: "Ananya Sharma",
    role: "Receptionist",
    department: "Front Desk",
    shift: "Morning",
    shiftTime: "08:00 AM - 04:00 PM",
    clockIn: "07:56 AM",
    clockOut: "04:03 PM",
    status: "Present",
  },
  {
    id: "EMP002",
    name: "Rahul Kumar",
    role: "Doctor",
    department: "OPD",
    shift: "Morning",
    shiftTime: "09:00 AM - 05:00 PM",
    clockIn: "09:12 AM",
    clockOut: "-",
    status: "Late",
  },
  {
    id: "EMP003",
    name: "Priya Menon",
    role: "Nurse",
    department: "IPD",
    shift: "Morning",
    shiftTime: "08:00 AM - 04:00 PM",
    clockIn: "07:58 AM",
    clockOut: "-",
    status: "Present",
  },
  {
    id: "EMP004",
    name: "Arjun Patel",
    role: "Pharmacist",
    department: "Pharmacy",
    shift: "Evening",
    shiftTime: "02:00 PM - 10:00 PM",
    clockIn: "01:55 PM",
    clockOut: "-",
    status: "Present",
  },
  {
    id: "EMP005",
    name: "Meera Iyer",
    role: "Billing Clerk",
    department: "Billing",
    shift: "Morning",
    shiftTime: "09:00 AM - 05:00 PM",
    clockIn: "-",
    clockOut: "-",
    status: "Absent",
  },
  {
    id: "EMP006",
    name: "Vikram Singh",
    role: "Receptionist",
    department: "Front Desk",
    shift: "Evening",
    shiftTime: "02:00 PM - 10:00 PM",
    clockIn: "01:58 PM",
    clockOut: "-",
    status: "Present",
  },
];

const shifts = [
  {
    id: "SHIFT001",
    name: "Morning",
    start: "08:00 AM",
    end: "04:00 PM",
    staff: 12,
  },
  {
    id: "SHIFT002",
    name: "General",
    start: "09:00 AM",
    end: "05:00 PM",
    staff: 18,
  },
  {
    id: "SHIFT003",
    name: "Evening",
    start: "02:00 PM",
    end: "10:00 PM",
    staff: 9,
  },
  {
    id: "SHIFT004",
    name: "Night",
    start: "10:00 PM",
    end: "06:00 AM",
    staff: 6,
  },
];

const getToday = () => {
  const date = new Date();

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getCurrentTime = () => {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AttendanceDashboardPage() {
  const [staff, setStaff] = useState(initialStaff);

  const [selectedDepartment, setSelectedDepartment] =
    useState("All Departments");

  const [selectedStatus, setSelectedStatus] =
    useState("All Status");

  const [search, setSearch] = useState("");

  const [activeTab, setActiveTab] = useState("today");

  const [showCorrectionModal, setShowCorrectionModal] =
    useState(false);

  const [showShiftModal, setShowShiftModal] =
    useState(false);

  const [selectedEmployee, setSelectedEmployee] =
    useState(null);

  const [correctionClockIn, setCorrectionClockIn] =
    useState("");

  const [correctionClockOut, setCorrectionClockOut] =
    useState("");

  const [selectedShift, setSelectedShift] =
    useState("Morning");

  const [clockedIn, setClockedIn] = useState(false);

  const [myClockIn, setMyClockIn] = useState(null);

  const today = getToday();

  const departments = [
    "All Departments",
    ...new Set(staff.map((employee) => employee.department)),
  ];

  const filteredStaff = useMemo(() => {
    const value = search.trim().toLowerCase();

    return staff.filter((employee) => {
      const matchesSearch =
        !value ||
        employee.name.toLowerCase().includes(value) ||
        employee.id.toLowerCase().includes(value) ||
        employee.role.toLowerCase().includes(value);

      const matchesDepartment =
        selectedDepartment === "All Departments" ||
        employee.department === selectedDepartment;

      const matchesStatus =
        selectedStatus === "All Status" ||
        employee.status === selectedStatus;

      return (
        matchesSearch &&
        matchesDepartment &&
        matchesStatus
      );
    });
  }, [
    staff,
    search,
    selectedDepartment,
    selectedStatus,
  ]);

  const presentCount = staff.filter(
    (employee) =>
      employee.status === "Present" ||
      employee.status === "Late"
  ).length;

  const lateCount = staff.filter(
    (employee) => employee.status === "Late"
  ).length;

  const absentCount = staff.filter(
    (employee) => employee.status === "Absent"
  ).length;

  const checkedInCount = staff.filter(
    (employee) =>
      employee.clockIn !== "-" &&
      employee.clockOut === "-"
  ).length;

  const handleClockIn = () => {
    const time = getCurrentTime();

    setClockedIn(true);
    setMyClockIn(time);
  };

  const handleClockOut = () => {
    setClockedIn(false);
  };

  const openCorrection = (employee) => {
    setSelectedEmployee(employee);
    setCorrectionClockIn(
      employee.clockIn === "-" ? "" : employee.clockIn
    );
    setCorrectionClockOut(
      employee.clockOut === "-" ? "" : employee.clockOut
    );
    setShowCorrectionModal(true);
  };

  const saveCorrection = () => {
    if (!selectedEmployee) return;

    setStaff((current) =>
      current.map((employee) =>
        employee.id === selectedEmployee.id
          ? {
              ...employee,
              clockIn:
                correctionClockIn || employee.clockIn,
              clockOut:
                correctionClockOut || employee.clockOut,
              status: "Present",
            }
          : employee
      )
    );

    setShowCorrectionModal(false);
    setSelectedEmployee(null);
  };

  const openShiftAssignment = (employee) => {
    setSelectedEmployee(employee);
    setSelectedShift(employee.shift);
    setShowShiftModal(true);
  };

  const saveShiftAssignment = () => {
    if (!selectedEmployee) return;

    const shift = shifts.find(
      (item) => item.name === selectedShift
    );

    setStaff((current) =>
      current.map((employee) =>
        employee.id === selectedEmployee.id
          ? {
              ...employee,
              shift: shift.name,
              shiftTime: `${shift.start} - ${shift.end}`,
            }
          : employee
      )
    );

    setShowShiftModal(false);
    setSelectedEmployee(null);
  };

  const exportAttendance = () => {
    const headers = [
      "Employee ID",
      "Employee",
      "Role",
      "Department",
      "Shift",
      "Clock In",
      "Clock Out",
      "Status",
    ];

    const rows = filteredStaff.map((employee) => [
      employee.id,
      employee.name,
      employee.role,
      employee.department,
      employee.shift,
      employee.clockIn,
      employee.clockOut,
      employee.status,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((value) =>
            `"${String(value).replaceAll('"', '""')}"`
          )
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = `medios-attendance-${today
      .replaceAll(" ", "-")
      .replaceAll(",", "")}.csv`;

    link.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="attendance-page">

      {/* HEADER */}

      <div className="attendance-page-header">
        <div>
          <h1>Attendance</h1>

          <p>
            Track staff attendance, shifts and
            clock-in / clock-out activity.
          </p>
        </div>

        <div className="attendance-header-actions">
          <button
            className="secondary-attendance-button"
            onClick={exportAttendance}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* CLOCK IN / OUT */}

      <div className="attendance-clock-card">

        <div>
          <span className="attendance-clock-label">
            My Attendance
          </span>

          <strong>
            {clockedIn
              ? `Clocked in at ${myClockIn}`
              : "You are currently clocked out"}
          </strong>

          <small>
            Today · {today}
          </small>
        </div>

        <div className="attendance-clock-actions">

          {!clockedIn ? (
            <button
              className="primary-attendance-button"
              onClick={handleClockIn}
            >
              Clock In
            </button>
          ) : (
            <button
              className="danger-attendance-button"
              onClick={handleClockOut}
            >
              Clock Out
            </button>
          )}

        </div>

      </div>

      {/* SUMMARY */}

      <div className="attendance-summary-grid">

        <div className="attendance-stat-card">
          <span>Total Staff</span>
          <strong>{staff.length}</strong>
          <small>Staff members</small>
        </div>

        <div className="attendance-stat-card">
          <span>Present</span>
          <strong>{presentCount}</strong>
          <small>Present or late</small>
        </div>

        <div className="attendance-stat-card">
          <span>Late</span>
          <strong>{lateCount}</strong>
          <small>Late arrivals</small>
        </div>

        <div className="attendance-stat-card">
          <span>Absent</span>
          <strong>{absentCount}</strong>
          <small>Not checked in</small>
        </div>

      </div>

      {/* TABS */}

      <div className="attendance-tabs">

        <button
          className={
            activeTab === "today"
              ? "active"
              : ""
          }
          onClick={() => setActiveTab("today")}
        >
          Today's Attendance
        </button>

        <button
          className={
            activeTab === "shifts"
              ? "active"
              : ""
          }
          onClick={() => setActiveTab("shifts")}
        >
          Shifts
        </button>

        <button
          className={
            activeTab === "monthly"
              ? "active"
              : ""
          }
          onClick={() => setActiveTab("monthly")}
        >
          Monthly Summary
        </button>

      </div>

      {/* TODAY */}

      {activeTab === "today" && (
        <section className="attendance-card">

          <div className="attendance-card-header">

            <div>
              <h2>Today's Attendance</h2>

              <p>
                {today} · {checkedInCount} staff
                currently checked in
              </p>
            </div>

          </div>

          {/* FILTERS */}

          <div className="attendance-filters">

            <input
              type="text"
              placeholder="Search employee..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />

            <select
              value={selectedDepartment}
              onChange={(event) =>
                setSelectedDepartment(
                  event.target.value
                )
              }
            >
              {departments.map((department) => (
                <option
                  key={department}
                  value={department}
                >
                  {department}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(
                  event.target.value
                )
              }
            >
              <option>All Status</option>
              <option>Present</option>
              <option>Late</option>
              <option>Absent</option>
            </select>

          </div>

          {/* TABLE */}

          <div className="attendance-table-wrapper">

            <table className="attendance-table">

              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Shift</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>

                {filteredStaff.map((employee) => (

                  <tr key={employee.id}>

                    <td>
                      <div className="attendance-employee">

                        <strong>
                          {employee.name}
                        </strong>

                        <span>
                          {employee.id} ·{" "}
                          {employee.role}
                        </span>

                      </div>
                    </td>

                    <td>
                      {employee.department}
                    </td>

                    <td>
                      <div className="attendance-shift">

                        <strong>
                          {employee.shift}
                        </strong>

                        <span>
                          {employee.shiftTime}
                        </span>

                      </div>
                    </td>

                    <td>
                      {employee.clockIn}
                    </td>

                    <td>
                      {employee.clockOut}
                    </td>

                    <td>

                      <span
                        className={`attendance-status ${
                          employee.status === "Present"
                            ? "success"
                            : employee.status === "Late"
                            ? "warning"
                            : "danger"
                        }`}
                      >
                        {employee.status}
                      </span>

                    </td>

                    <td>

                      <div className="attendance-actions">

                        <button
                          className="small-attendance-button"
                          onClick={() =>
                            openCorrection(employee)
                          }
                        >
                          Edit
                        </button>

                        <button
                          className="small-attendance-button"
                          onClick={() =>
                            openShiftAssignment(
                              employee
                            )
                          }
                        >
                          Shift
                        </button>

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </section>
      )}

      {/* SHIFTS */}

      {activeTab === "shifts" && (
        <section className="attendance-card">

          <div className="attendance-card-header">

            <div>
              <h2>Shift Management</h2>

              <p>
                View staff shifts and assigned
                working hours.
              </p>
            </div>

          </div>

          <div className="shift-grid">

            {shifts.map((shift) => (

              <div
                className="shift-card"
                key={shift.id}
              >

                <div className="shift-card-header">

                  <div>
                    <span>
                      {shift.id}
                    </span>

                    <h3>
                      {shift.name}
                    </h3>
                  </div>

                  <strong>
                    {shift.staff}
                  </strong>

                </div>

                <div className="shift-time">
                  {shift.start} — {shift.end}
                </div>

                <p>
                  {shift.staff} staff members
                  assigned
                </p>

              </div>

            ))}

          </div>

        </section>
      )}

      {/* MONTHLY */}

      {activeTab === "monthly" && (
        <section className="attendance-card">

          <div className="attendance-card-header">

            <div>
              <h2>Monthly Attendance Summary</h2>

              <p>
                Attendance summary for the current
                month.
              </p>
            </div>

            <button
              className="primary-attendance-button"
              onClick={exportAttendance}
            >
              Export Monthly CSV
            </button>

          </div>

          <div className="monthly-summary-grid">

            {staff.map((employee) => {

              const present =
                employee.status === "Present" ||
                employee.status === "Late"
                  ? 21
                  : 20;

              const late =
                employee.status === "Late"
                  ? 2
                  : 0;

              const absent =
                employee.status === "Absent"
                  ? 1
                  : 0;

              const percentage =
                Math.round(
                  (present / 22) * 100
                );

              return (
                <div
                  className="monthly-summary-card"
                  key={employee.id}
                >

                  <div>
                    <strong>
                      {employee.name}
                    </strong>

                    <span>
                      {employee.department}
                    </span>
                  </div>

                  <div className="monthly-summary-stats">

                    <div>
                      <span>Present</span>
                      <strong>{present}</strong>
                    </div>

                    <div>
                      <span>Late</span>
                      <strong>{late}</strong>
                    </div>

                    <div>
                      <span>Absent</span>
                      <strong>{absent}</strong>
                    </div>

                    <div>
                      <span>Attendance</span>
                      <strong>
                        {percentage}%
                      </strong>
                    </div>

                  </div>

                </div>
              );
            })}

          </div>

        </section>
      )}

      {/* CORRECTION MODAL */}

      {showCorrectionModal && (
        <div className="attendance-modal-overlay">

          <div className="attendance-modal">

            <div className="attendance-modal-header">

              <div>
                <h2>Edit Attendance</h2>

                <p>
                  {selectedEmployee?.name}
                </p>
              </div>

              <button
                className="attendance-modal-close"
                onClick={() =>
                  setShowCorrectionModal(false)
                }
              >
                ×
              </button>

            </div>

            <div className="attendance-form-grid">

              <div>
                <label>Clock In</label>

                <input
                  type="text"
                  placeholder="08:00 AM"
                  value={correctionClockIn}
                  onChange={(event) =>
                    setCorrectionClockIn(
                      event.target.value
                    )
                  }
                />
              </div>

              <div>
                <label>Clock Out</label>

                <input
                  type="text"
                  placeholder="04:00 PM"
                  value={correctionClockOut}
                  onChange={(event) =>
                    setCorrectionClockOut(
                      event.target.value
                    )
                  }
                />
              </div>

            </div>

            <div className="attendance-modal-actions">

              <button
                className="secondary-attendance-button"
                onClick={() =>
                  setShowCorrectionModal(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-attendance-button"
                onClick={saveCorrection}
              >
                Save Correction
              </button>

            </div>

          </div>

        </div>
      )}

      {/* SHIFT MODAL */}

      {showShiftModal && (
        <div className="attendance-modal-overlay">

          <div className="attendance-modal">

            <div className="attendance-modal-header">

              <div>
                <h2>Assign Shift</h2>

                <p>
                  {selectedEmployee?.name}
                </p>
              </div>

              <button
                className="attendance-modal-close"
                onClick={() =>
                  setShowShiftModal(false)
                }
              >
                ×
              </button>

            </div>

            <div className="attendance-form-field">

              <label>
                Select Shift
              </label>

              <select
                value={selectedShift}
                onChange={(event) =>
                  setSelectedShift(
                    event.target.value
                  )
                }
              >

                {shifts.map((shift) => (
                  <option
                    key={shift.id}
                    value={shift.name}
                  >
                    {shift.name} —{" "}
                    {shift.start} to{" "}
                    {shift.end}
                  </option>
                ))}

              </select>

            </div>

            <div className="attendance-modal-actions">

              <button
                className="secondary-attendance-button"
                onClick={() =>
                  setShowShiftModal(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-attendance-button"
                onClick={saveShiftAssignment}
              >
                Assign Shift
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}