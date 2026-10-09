import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OtBookingCard from "../components/OtBookingCard";

const today = "2026-10-10";
const bookingsStorageKey = "medios-surgery-ot-bookings";

const initialBookings = [
  {
    id: "OT-1001",
    patientName: "Priya Menon",
    patientId: "P002",
    age: 42,
    gender: "Female",
    procedure: "Laparoscopic cholecystectomy",
    surgeon: "Dr. Mehta",
    date: today,
    time: "09:00 AM",
    duration: 120,
    otRoom: "OT-1",
    status: "Confirmed",
    checklistComplete: true,
    insuranceStatus: "Approved",
    notes: "Nil known allergies",
  },
  {
    id: "OT-1002",
    patientName: "Arun Kumar",
    patientId: "P014",
    age: 56,
    gender: "Male",
    procedure: "Hernia repair",
    surgeon: "Dr. Sharma",
    date: today,
    time: "11:30 AM",
    duration: 90,
    otRoom: "OT-2",
    status: "Pending",
    checklistComplete: false,
    insuranceStatus: "Pending",
    notes: "Review current medication",
  },
  {
    id: "OT-1003",
    patientName: "Rahul Singh",
    patientId: "P021",
    age: 31,
    gender: "Male",
    procedure: "Appendectomy",
    surgeon: "Dr. Rao",
    date: today,
    time: "02:00 PM",
    duration: 75,
    otRoom: "OT-1",
    status: "Pending",
    checklistComplete: false,
    insuranceStatus: "Approved",
    notes: "",
  },
];

function readSavedBookings() {
  try {
    const saved = localStorage.getItem(bookingsStorageKey);
    return saved ? JSON.parse(saved) : initialBookings;
  } catch {
    return initialBookings;
  }
}

const emptyForm = {
  patientName: "",
  patientId: "",
  age: "",
  gender: "",
  procedure: "",
  surgeon: "",
  date: today,
  time: "09:00",
  duration: "60",
  otRoom: "OT-1",
  insuranceStatus: "Pending",
  notes: "",
};

export default function OtSchedulingPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState(readSavedBookings);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(today);
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [roomFilter, setRoomFilter] = useState("All OTs");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState("");

  // Save the latest booking data so it is available on the checklist page.
  useEffect(() => {
    try {
      localStorage.setItem(
        bookingsStorageKey,
        JSON.stringify(bookings)
      );
    } catch {
      // The schedule remains usable for this session.
    }
  }, [bookings]);

  // Read changes made on another page when returning to this page.
  useEffect(() => {
    const syncBookings = () => {
      setBookings(readSavedBookings());
    };

    window.addEventListener("focus", syncBookings);
    window.addEventListener("pageshow", syncBookings);

    return () => {
      window.removeEventListener("focus", syncBookings);
      window.removeEventListener("pageshow", syncBookings);
    };
  }, []);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        [
          booking.patientName,
          booking.patientId,
          booking.procedure,
          booking.surgeon,
          booking.id,
        ].some((value) =>
          String(value).toLowerCase().includes(query)
        );

      return (
        matchesSearch &&
        (!dateFilter || booking.date === dateFilter) &&
        (statusFilter === "All statuses" ||
          booking.status === statusFilter) &&
        (roomFilter === "All OTs" ||
          booking.otRoom === roomFilter)
      );
    });
  }, [bookings, search, dateFilter, statusFilter, roomFilter]);

  const stats = [
    {
      label: "Bookings shown",
      value: filteredBookings.length,
    },
    {
      label: "Confirmed slots",
      value: filteredBookings.filter(
        (item) => item.status === "Confirmed"
      ).length,
    },
    {
      label: "Pre-op incomplete",
      value: filteredBookings.filter(
        (item) => !item.checklistComplete
      ).length,
    },
    {
      label: "Insurance pending",
      value: filteredBookings.filter(
        (item) => item.insuranceStatus === "Pending"
      ).length,
    },
  ];

  const openNewBooking = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      date: dateFilter || today,
    });
    setModalOpen(true);
  };

  const openEditBooking = (booking) => {
    setEditingId(booking.id);

    setForm({
      patientName: booking.patientName,
      patientId: booking.patientId,
      age: String(booking.age),
      gender: booking.gender,
      procedure: booking.procedure,
      surgeon: booking.surgeon,
      date: booking.date,
      time: booking.time,
      duration: String(booking.duration),
      otRoom: booking.otRoom,
      insuranceStatus: booking.insuranceStatus,
      notes: booking.notes || "",
    });

    setModalOpen(true);
  };

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const saveBooking = (event) => {
    event.preventDefault();

    const timeLabel =
      form.time.includes("AM") || form.time.includes("PM")
        ? form.time
        : new Date(
            `2000-01-01T${form.time}:00`
          ).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });

    const bookingData = {
      ...form,
      age: Number(form.age),
      duration: Number(form.duration),
      time: timeLabel,
      status: "Pending",
    };

    if (editingId) {
      setBookings((current) =>
        current.map((booking) =>
          booking.id === editingId
            ? {
                ...booking,
                ...bookingData,
                checklistComplete:
                  booking.date === form.date
                    ? booking.checklistComplete
                    : false,
              }
            : booking
        )
      );

      setNotice("OT booking updated.");
    } else {
      const id = `OT-${String(Date.now()).slice(-6)}`;

      setBookings((current) => [
        ...current,
        {
          ...bookingData,
          id,
          checklistComplete: false,
        },
      ]);

      setNotice(
        "OT booking created. Complete the pre-op checklist before confirming the slot."
      );
    }

    setModalOpen(false);
  };

  const confirmBooking = (id) => {
    const booking = bookings.find((item) => item.id === id);

    if (!booking?.checklistComplete) {
      setNotice(
        "Complete every required pre-op item before confirming this OT slot."
      );
      return;
    }

    setBookings((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: "Confirmed" }
          : item
      )
    );

    setNotice("OT slot confirmed.");
  };

  return (
    <div className="surgery-page">
      <header className="surgery-header">
        <div>
          <p className="surgery-eyebrow">
            DEPARTMENT MODULE · SURGERY
          </p>
          <h1>OT Scheduling</h1>
          <p>
            Schedule operation theatres, review pre-operative
            readiness and track insurance pre-authorisation.
          </p>
        </div>

        <button
          type="button"
          className="surgery-primary-button"
          onClick={openNewBooking}
        >
          + New OT booking
        </button>
      </header>

      {notice && (
        <div className="surgery-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}

      <section
        className="surgery-stats"
        aria-label="OT booking summary"
      >
        {stats.map((stat) => (
          <div className="surgery-stat" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </section>

      <section className="surgery-panel">
        <div className="surgery-panel-header">
          <div>
            <h2>Operation theatre schedule</h2>
            <p>
              Search bookings and filter by date, status or OT room.
            </p>
          </div>

          <button
            type="button"
            className="surgery-secondary-button"
            onClick={() =>
              navigate(
                "/staff/departments/surgery/pre-op-checklist"
              )
            }
          >
            Open pre-op checklist
          </button>
        </div>

        <div className="surgery-toolbar">
          <label className="surgery-filter-field">
            Surgery date
            <input
              type="date"
              value={dateFilter}
              onChange={(event) =>
                setDateFilter(event.target.value)
              }
            />
          </label>

          <label className="surgery-filter-field">
            Search bookings
            <input
              type="search"
              placeholder="Patient, procedure, surgeon or booking ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="surgery-filter-field">
            Booking status
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
            >
              <option>All statuses</option>
              <option>Pending</option>
              <option>Confirmed</option>
            </select>
          </label>

          <label className="surgery-filter-field">
            Operation theatre
            <select
              value={roomFilter}
              onChange={(event) =>
                setRoomFilter(event.target.value)
              }
            >
              <option>All OTs</option>
              <option>OT-1</option>
              <option>OT-2</option>
              <option>OT-3</option>
            </select>
          </label>
        </div>

        <div className="surgery-booking-list">
          {filteredBookings.length ? (
            filteredBookings.map((booking) => (
              <OtBookingCard
                key={booking.id}
                booking={booking}
                onEdit={openEditBooking}
                onOpenChecklist={(id) =>
                  navigate(
                    `/staff/departments/surgery/pre-op-checklist?booking=${encodeURIComponent(id)}`
                  )
                }
                onConfirm={confirmBooking}
              />
            ))
          ) : (
            <p className="surgery-empty">
              No OT bookings match these filters. Try another date
              or create a new booking.
            </p>
          )}
        </div>
      </section>

      {modalOpen && (
        <div
          className="surgery-modal-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setModalOpen(false);
            }
          }}
        >
          <section
            className="surgery-modal surgery-manage-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="surgery-booking-modal-title"
          >
            <div className="surgery-modal-header">
              <div>
                <p className="surgery-eyebrow">OT MANAGEMENT</p>
                <h2 id="surgery-booking-modal-title">
                  {editingId
                    ? "Edit OT booking"
                    : "New OT booking"}
                </h2>
                <p>
                  Enter the patient, procedure and theatre details.
                </p>
              </div>

              <button
                type="button"
                className="surgery-close-button"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={saveBooking}>
              <div className="surgery-form-grid">
                <label className="surgery-field">
                  Patient name
                  <input
                    name="patientName"
                    value={form.patientName}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Patient ID
                  <input
                    name="patientId"
                    value={form.patientId}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Age
                  <input
                    name="age"
                    type="number"
                    min="0"
                    max="120"
                    value={form.age}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Gender
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={updateForm}
                    required
                  >
                    <option value="">Select gender</option>
                    <option>Female</option>
                    <option>Male</option>
                    <option>Other</option>
                    <option>Prefer not to say</option>
                  </select>
                </label>

                <label className="surgery-field surgery-field-full">
                  Procedure
                  <input
                    name="procedure"
                    value={form.procedure}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Surgeon
                  <input
                    name="surgeon"
                    value={form.surgeon}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  OT room
                  <select
                    name="otRoom"
                    value={form.otRoom}
                    onChange={updateForm}
                  >
                    <option>OT-1</option>
                    <option>OT-2</option>
                    <option>OT-3</option>
                  </select>
                </label>

                <label className="surgery-field">
                  Date
                  <input
                    name="date"
                    type="date"
                    min={today}
                    value={form.date}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Start time
                  <input
                    name="time"
                    type="time"
                    value={form.time}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Duration (minutes)
                  <input
                    name="duration"
                    type="number"
                    min="15"
                    step="15"
                    value={form.duration}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Insurance pre-authorisation
                  <select
                    name="insuranceStatus"
                    value={form.insuranceStatus}
                    onChange={updateForm}
                  >
                    <option>Pending</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                  </select>
                </label>

                <label className="surgery-field surgery-field-full">
                  Notes
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={updateForm}
                    rows="2"
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #d5d6ce",
                      borderRadius: 7,
                      font: "inherit",
                    }}
                  />
                </label>
              </div>

              <div className="surgery-modal-footer">
                <button
                  type="button"
                  className="surgery-secondary-button"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="surgery-primary-button"
                >
                  Save booking
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}