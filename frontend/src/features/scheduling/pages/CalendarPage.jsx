import React, { useMemo, useState } from "react";
import CalendarView from "../components/CalendarView";

const appointments = [
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

const CalendarPage = () => {
  const [view, setView] = useState("day");
  const [doctorFilter, setDoctorFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const doctors = [
    "All",
    ...new Set(appointments.map((appointment) => appointment.doctor)),
  ];

  const departments = [
    "All",
    ...new Set(
      appointments.map((appointment) => appointment.department)
    ),
  ];

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
  }, [doctorFilter, departmentFilter]);

  return (
    <div className="scheduling-page">

      <div className="page-title-row">
        <div>
          <h1>Scheduling</h1>
          <p>
            Manage appointments, doctors, rooms and scheduling conflicts.
          </p>
        </div>

        <button className="primary-action">
          + New Appointment
        </button>
      </div>


      {/* Filters */}

      <section className="schedule-toolbar">

        <div className="schedule-filters">

          <div className="schedule-filter">
            <label>Doctor</label>

            <select
              value={doctorFilter}
              onChange={(event) =>
                setDoctorFilter(event.target.value)
              }
            >
              {doctors.map((doctor) => (
                <option key={doctor} value={doctor}>
                  {doctor}
                </option>
              ))}
            </select>
          </div>


          <div className="schedule-filter">
            <label>Department</label>

            <select
              value={departmentFilter}
              onChange={(event) =>
                setDepartmentFilter(event.target.value)
              }
            >
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>

        </div>


        {/* View selector */}

        <div className="calendar-view-switcher">

          <button
            className={view === "day" ? "selected" : ""}
            onClick={() => setView("day")}
          >
            Day
          </button>

          <button
            className={view === "week" ? "selected" : ""}
            onClick={() => setView("week")}
          >
            Week
          </button>

          <button
            className={view === "month" ? "selected" : ""}
            onClick={() => setView("month")}
          >
            Month
          </button>

        </div>

      </section>


      {/* Calendar */}

      <CalendarView
        view={view}
        appointments={filteredAppointments}
      />

    </div>
  );
};

export default CalendarPage;