
import React, { useMemo, useState } from "react";
import CalendarView from "../components/CalendarView";

const initialAppointments = [
  {
    id: "A001",
    time: "09:00",
    endTime: "09:30",
    patient: "Arun Kumar",
    patientId: "P001",
    doctor: "Dr. Meera Nair",
    department: "General Medicine",
    status: "Scheduled",
    room: "Room 101",
  },
  {
    id: "A002",
    time: "10:00",
    endTime: "10:30",
    patient: "Priya Menon",
    patientId: "P002",
    doctor: "Dr. Vikram Rao",
    department: "Cardiology",
    status: "Scheduled",
    room: "Room 203",
  },
  {
    id: "A003",
    time: "11:00",
    endTime: "11:30",
    patient: "Suresh Raina",
    patientId: "P003",
    doctor: "Dr. Meera Nair",
    department: "General Medicine",
    status: "Completed",
    room: "Room 101",
  },
  {
    id: "A004",
    time: "11:30",
    endTime: "12:00",
    patient: "Ananya Sharma",
    patientId: "P004",
    doctor: "Dr. Vikram Rao",
    department: "Cardiology",
    status: "Scheduled",
    room: "Room 203",
  },
  {
    id: "A005",
    time: "14:00",
    endTime: "14:30",
    patient: "Rahul Kumar",
    patientId: "P005",
    doctor: "Dr. Meera Nair",
    department: "General Medicine",
    status: "Scheduled",
    room: "Room 101",
  },
];

const doctors = [
  "Dr. Meera Nair",
  "Dr. Vikram Rao",
];

const departments = [
  "General Medicine",
  "Cardiology",
];

const availableTimes = [
  "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30",
];

const emptyForm = {
  patient: "",
  patientId: "",
  doctor: doctors[0],
  department: departments[0],
  time: "12:30",
  room: "Room 101",
};

export default function CalendarPage() {
  const [view, setView] = useState("day");
  const [doctorFilter, setDoctorFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [appointments, setAppointments] = useState(initialAppointments);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const doctorMatches =
        doctorFilter === "All" ||
        appointment.doctor === doctorFilter;

      const departmentMatches =
        departmentFilter === "All" ||
        appointment.department === departmentFilter;

      return doctorMatches && departmentMatches;
    });
  }, [appointments, doctorFilter, departmentFilter]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    setError("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.patient.trim() || !form.patientId.trim()) {
      setError("Enter the patient's name and patient ID.");
      return;
    }

    const slotTaken = appointments.some(
      (appointment) =>
        appointment.time === form.time &&
        appointment.doctor === form.doctor &&
        appointment.status !== "Cancelled"
    );

    if (slotTaken) {
      setError(
        "This doctor already has an appointment at that time. Choose another time."
      );
      return;
    }

    const newAppointment = {
      id: `A${Date.now()}`,
      patient: form.patient.trim(),
      patientId: form.patientId.trim(),
      doctor: form.doctor,
      department: form.department,
      time: form.time,
      endTime: (() => {
        const [hours, minutes] = form.time.split(":").map(Number);
        const end = new Date(2000, 0, 1, hours, minutes + 30);
        return `${String(end.getHours()).padStart(2, "0")}:${String(
          end.getMinutes()
        ).padStart(2, "0")}`;
      })(),
      room: form.room.trim() || "Room 101",
      status: "Scheduled",
    };

    setAppointments((current) =>
      [...current, newAppointment].sort((a, b) =>
        a.time.localeCompare(b.time)
      )
    );

    setDoctorFilter("All");
    setDepartmentFilter("All");
    setForm(emptyForm);
    setError("");
    setShowForm(false);
  }

  return (
    <div className="scheduling-page">
      <div className="page-title-row">
        <div>
          <h1>Scheduling</h1>
          <p>
            Manage appointments, doctors, rooms and scheduling conflicts.
          </p>
        </div>

        <button
          type="button"
          className="primary-action"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
        >
          + New Appointment
        </button>
      </div>

      <section className="schedule-toolbar">
        <div className="schedule-filters">
          <div className="schedule-filter">
            <label>Doctor</label>
            <select
              value={doctorFilter}
              onChange={(event) => setDoctorFilter(event.target.value)}
            >
              <option value="All">All</option>
              {[...new Set(appointments.map((a) => a.doctor))].map(
                (doctor) => (
                  <option key={doctor} value={doctor}>
                    {doctor}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="schedule-filter">
            <label>Department</label>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="All">All</option>
              {[...new Set(appointments.map((a) => a.department))].map(
                (department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        <div className="calendar-view-switcher">
          {["day", "week", "month"].map((option) => (
            <button
              type="button"
              key={option}
              className={view === option ? "selected" : ""}
              onClick={() => setView(option)}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <CalendarView
        view={view}
        appointments={filteredAppointments}
      />

      {showForm && (
        <div
          className="appointment-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowForm(false);
            }
          }}
        >
          <section
            className="appointment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-modal-title"
          >
            <div className="appointment-modal-header">
              <div>
                <h2 id="appointment-modal-title">New Appointment</h2>
                <p>Enter the patient's appointment details.</p>
              </div>

              <button
                type="button"
                className="appointment-modal-close"
                aria-label="Close"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="appointment-form-grid">
                <div className="appointment-form-field">
                  <label htmlFor="patient">Patient Name</label>
                  <input
                    id="patient"
                    name="patient"
                    value={form.patient}
                    onChange={updateField}
                    placeholder="Enter patient name"
                    required
                  />
                </div>

                <div className="appointment-form-field">
                  <label htmlFor="patientId">Patient ID</label>
                  <input
                    id="patientId"
                    name="patientId"
                    value={form.patientId}
                    onChange={updateField}
                    placeholder="e.g. P006"
                    required
                  />
                </div>

                <div className="appointment-form-field">
                  <label htmlFor="doctor">Doctor</label>
                  <select
                    id="doctor"
                    name="doctor"
                    value={form.doctor}
                    onChange={updateField}
                  >
                    {doctors.map((doctor) => (
                      <option key={doctor} value={doctor}>
                        {doctor}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="appointment-form-field">
                  <label htmlFor="department">Department</label>
                  <select
                    id="department"
                    name="department"
                    value={form.department}
                    onChange={updateField}
                  >
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="appointment-form-field">
                  <label htmlFor="time">Time</label>
                  <select
                    id="time"
                    name="time"
                    value={form.time}
                    onChange={updateField}
                  >
                    {availableTimes.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="appointment-form-field">
                  <label htmlFor="room">Room</label>
                  <input
                    id="room"
                    name="room"
                    value={form.room}
                    onChange={updateField}
                    placeholder="e.g. Room 101"
                  />
                </div>
              </div>

              {error && (
                <p className="appointment-form-error" role="alert">
                  {error}
                </p>
              )}

              <div className="appointment-form-actions">
                <button
                  type="button"
                  className="appointment-cancel-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-action">
                  Save Appointment
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
