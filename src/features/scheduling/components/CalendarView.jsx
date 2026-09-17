import React, { useState } from "react";
import ConflictWarning from "./ConflictWarning";

const timeSlots = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
];

const weekDays = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
];

const CalendarView = ({ view, appointments }) => {
  const [selectedAppointment, setSelectedAppointment] =
    useState(null);

  const getAppointment = (time) => {
    return appointments.find(
      (appointment) => appointment.time === time
    );
  };

  if (view === "month") {
    return (
      <section className="calendar-card">

        <div className="calendar-header">
          <button className="calendar-arrow">
            ←
          </button>

          <h2>September 2026</h2>

          <button className="calendar-arrow">
            →
          </button>
        </div>

        <div className="month-grid">

          {[
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
          ].map((day) => (
            <div
              key={day}
              className="month-day-name"
            >
              {day}
            </div>
          ))}


          {Array.from({ length: 30 }, (_, index) => {

            const day = index + 1;

            const dayAppointments =
              appointments.filter(
                (_, appointmentIndex) =>
                  (appointmentIndex + 1) % 7 ===
                  day % 7
              );

            return (
              <div
                className="month-day"
                key={day}
              >

                <strong>
                  {day}
                </strong>

                {dayAppointments.slice(0, 2).map(
                  (appointment) => (
                    <div
                      className="month-appointment"
                      key={appointment.id}
                    >
                      {appointment.time}{" "}
                      {appointment.patient}
                    </div>
                  )
                )}

              </div>
            );
          })}

        </div>

      </section>
    );
  }


  if (view === "week") {
    return (
      <section className="calendar-card">

        <div className="calendar-header">

          <button className="calendar-arrow">
            ←
          </button>

          <h2>
            14 – 18 September 2026
          </h2>

          <button className="calendar-arrow">
            →
          </button>

        </div>


        <div className="week-calendar">

          <div className="week-time-column">
            <div className="week-header-cell">
              Time
            </div>

            {timeSlots.map((time) => (
              <div
                className="week-time-cell"
                key={time}
              >
                {time}
              </div>
            ))}
          </div>


          {weekDays.map((day) => (

            <div
              className="week-day-column"
              key={day}
            >

              <div className="week-header-cell">
                {day}
              </div>

              {timeSlots.map((time) => {

                const appointment =
                  getAppointment(time);

                return (
                  <div
                    className="week-slot"
                    key={time}
                  >

                    {appointment && day === "Mon" && (

                      <button
                        className="appointment-block"
                        onClick={() =>
                          setSelectedAppointment(
                            appointment
                          )
                        }
                      >
                        <strong>
                          {appointment.patient}
                        </strong>

                        <small>
                          {appointment.doctor}
                        </small>

                      </button>

                    )}

                  </div>
                );
              })}

            </div>

          ))}

        </div>

        {selectedAppointment && (
          <ConflictWarning
            appointment={selectedAppointment}
            onClose={() =>
              setSelectedAppointment(null)
            }
          />
        )}

      </section>
    );
  }


  /* DAY VIEW */

  return (
    <section className="calendar-card">

      <div className="calendar-header">

        <button className="calendar-arrow">
          ←
        </button>

        <h2>
          Monday, 15 September 2026
        </h2>

        <button className="calendar-arrow">
          →
        </button>

      </div>


      <div className="day-calendar">

        {timeSlots.map((time) => {

          const appointment =
            getAppointment(time);

          return (
            <div
              className="day-time-row"
              key={time}
            >

              <div className="day-time">
                {time}
              </div>

              <div className="day-slot">

                {appointment && (

                  <button
                    className={`appointment-card ${
                      appointment.status ===
                      "Completed"
                        ? "completed"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedAppointment(
                        appointment
                      )
                    }
                  >

                    <div>
                      <strong>
                        {appointment.patient}
                      </strong>

                      <span>
                        {appointment.doctor}
                      </span>
                    </div>

                    <div>
                      <span>
                        {appointment.department}
                      </span>

                      <span>
                        {appointment.room}
                      </span>
                    </div>

                    <span className="appointment-status">
                      {appointment.status}
                    </span>

                  </button>

                )}

              </div>

            </div>
          );
        })}

      </div>


      {selectedAppointment && (
        <ConflictWarning
          appointment={selectedAppointment}
          onClose={() =>
            setSelectedAppointment(null)
          }
        />
      )}

    </section>
  );
};

export default CalendarView;