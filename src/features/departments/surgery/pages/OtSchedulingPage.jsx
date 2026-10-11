
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OtBookingCard, {
  getSurgeryBookings,
  getChecklistProgress,
  setSurgeryBookings,
} from "../components/OtBookingCard";

const today = "2026-10-10";

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

function toTimeInput(time) {
  if (!time) return "09:00";

  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) return time;

  let hours = Number(match[1]);
  const minutes = match[2];
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

function toTimeLabel(time) {
  const [hoursString, minutes] = time.split(":");
  let hours = Number(hoursString);
  const period = hours >= 12 ? "PM" : "AM";

  hours = hours % 12 || 12;

  return `${String(hours).padStart(2, "0")}:${minutes} ${period}`;
}

function toMinutes(time) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;

  let hours = Number(match[1]) % 12;
  const minutes = Number(match[2]);
  if (match[3].toUpperCase() === "PM") hours += 12;

  return hours * 60 + minutes;
}

export default function OtSchedulingPage() {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState(getSurgeryBookings);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(today);
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [roomFilter, setRoomFilter] = useState("All OTs");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState("");

  const updateBookings = (updater) => {
    setBookings((current) => {
      const next =
        typeof updater === "function" ? updater(current) : updater;

      setSurgeryBookings(next);
      return next;
    });
  };

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bookings
      .filter((booking) => {
        const matchesSearch =
          !query ||
          [
            booking.patientName,
            booking.patientId,
            booking.procedure,
            booking.surgeon,
            booking.id,
          ].some((value) =>
            String(value || "").toLowerCase().includes(query)
          );

        return (
          matchesSearch &&
          (!dateFilter || booking.date === dateFilter) &&
          (statusFilter === "All statuses" ||
            booking.status === statusFilter) &&
          (roomFilter === "All OTs" || booking.otRoom === roomFilter)
        );
      })
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }, [bookings, search, dateFilter, statusFilter, roomFilter]);

  const stats = [
    {
      label: "Bookings shown",
      value: filteredBookings.length,
    },
    {
      label: "Confirmed slots",
      value: filteredBookings.filter(
        (booking) => booking.status === "Confirmed"
      ).length,
    },
    {
      label: "Pre-op checks remaining",
      value: filteredBookings.reduce((total, booking) => {
        const progress = getChecklistProgress(booking);
        return total + progress.total - progress.completed;
      }, 0),
    },
    {
      label: "Insurance pending",
      value: filteredBookings.filter(
        (booking) => booking.insuranceStatus === "Pending"
      ).length,
    },
  ];

  const openNewBooking = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      date: dateFilter || today,
    });
    setNotice("");
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
      time: toTimeInput(booking.time),
      duration: String(booking.duration),
      otRoom: booking.otRoom,
      insuranceStatus: booking.insuranceStatus,
      notes: booking.notes || "",
    });

    setNotice("");
    setModalOpen(true);
  };

  const updateForm = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const saveBooking = (event) => {
    event.preventDefault();

    if (Number(form.age) <= 0 || Number(form.duration) <= 0) {
      setNotice("Enter a valid patient age and procedure duration.");
      return;
    }

    const startMinutes = Number(form.time.split(":")[0]) * 60 +
      Number(form.time.split(":")[1]);
    const endMinutes = startMinutes + Number(form.duration);

    const hasConflict = bookings.some((booking) => {
      if (booking.id === editingId) return false;
      if (booking.date !== form.date || booking.otRoom !== form.otRoom) {
        return false;
      }

      const existingStart = toMinutes(booking.time);
      const existingEnd = existingStart + Number(booking.duration);

      return (
        startMinutes < existingEnd &&
        endMinutes > existingStart
      );
    });

    if (hasConflict) {
      setNotice(
        "This theatre already has a booking during the selected time."
      );
      return;
    }

    const bookingData = {
      patientName: form.patientName.trim(),
      patientId: form.patientId.trim(),
      age: Number(form.age),
      gender: form.gender,
      procedure: form.procedure.trim(),
      surgeon: form.surgeon.trim(),
      date: form.date,
      time: toTimeLabel(form.time),
      duration: Number(form.duration),
      otRoom: form.otRoom,
      insuranceStatus: form.insuranceStatus,
      notes: form.notes.trim(),
    };

    if (editingId) {
      updateBookings((current) =>
        current.map((booking) =>
          booking.id === editingId
            ? { ...booking, ...bookingData }
            : booking
        )
      );

      setNotice("OT booking updated.");
    } else {
      const newBooking = {
        ...bookingData,
        id: `OT-${String(Date.now()).slice(-6)}`,
        status: "Pending",
        checklistItems: {},
      };

      updateBookings((current) => [...current, newBooking]);
      setNotice(
        "Booking added for this session. Complete the pre-op checklist before confirming the OT slot."
      );
    }

    setDateFilter(form.date);
    setModalOpen(false);
  };

  const confirmBooking = (id) => {
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;

    if (!getChecklistProgress(booking).isComplete) {
      setNotice(
        "Complete all 10 required pre-operative checks before confirming this OT slot."
      );

      navigate(
        `/staff/departments/surgery/pre-op-checklist?booking=${encodeURIComponent(id)}`
      );
      return;
    }

    updateBookings((current) =>
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
          <h1>OT Scheduling</h1>
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

      <section className="surgery-stats" aria-label="OT booking summary">
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
          </div>
        </div>

        <div className="surgery-toolbar">
          <label className="surgery-filter-field">
            Surgery date
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
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
              onChange={(event) => setStatusFilter(event.target.value)}
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
              onChange={(event) => setRoomFilter(event.target.value)}
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
              No OT bookings match these filters. Try another date or create a new booking.
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
                  {editingId ? "Edit OT booking" : "New OT booking"}
                </h2>
            
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
                  Patient name *
                  <input
                    name="patientName"
                    value={form.patientName}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Patient ID *
                  <input
                    name="patientId"
                    value={form.patientId}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Age *
                  <input
                    name="age"
                    type="number"
                    min="1"
                    max="120"
                    value={form.age}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Gender *
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
                  Procedure *
                  <input
                    name="procedure"
                    value={form.procedure}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Surgeon *
                  <input
                    name="surgeon"
                    value={form.surgeon}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  OT room *
                  <select
                    name="otRoom"
                    value={form.otRoom}
                    onChange={updateForm}
                    required
                  >
                    <option>OT-1</option>
                    <option>OT-2</option>
                    <option>OT-3</option>
                  </select>
                </label>

                <label className="surgery-field">
                  Date *
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
                  Start time *
                  <input
                    name="time"
                    type="time"
                    value={form.time}
                    onChange={updateForm}
                    required
                  />
                </label>

                <label className="surgery-field">
                  Duration (minutes) *
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
                  Insurance pre-authorisation *
                  <select
                    name="insuranceStatus"
                    value={form.insuranceStatus}
                    onChange={updateForm}
                    required
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
                  {editingId ? "Save changes" : "Create booking"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
