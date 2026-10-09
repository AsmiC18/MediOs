import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const dashboardData = {
  revenue: {
    amount: "₹1,24,500",
    label: "Today's revenue",
  },

  appointments: {
    total: 48,
    completed: 31,
    pending: 12,
    cancelled: 5,
  },

  patients: {
    newPatients: 12,
    returningPatients: 24,
  },

  criticalFlags: {
    count: 4,
  },

  pendingBills: 8,
};

const appointments = [
  {
    id: "A001",
    patient: "Arun Kumar",
    doctor: "Dr. Meera Nair",
    department: "OPD",
    time: "10:00 AM",
    status: "Scheduled",
  },
  {
    id: "A002",
    patient: "Priya Menon",
    doctor: "Dr. Vikram Rao",
    department: "Cardiology",
    time: "11:30 AM",
    status: "Scheduled",
  },
  {
    id: "A003",
    patient: "Rahul Kumar",
    doctor: "Dr. Anjali Sharma",
    department: "Diagnostics",
    time: "12:15 PM",
    status: "Completed",
  },
  {
    id: "A004",
    patient: "Anita Singh",
    doctor: "Dr. Karthik",
    department: "OPD",
    time: "02:00 PM",
    status: "Waiting",
  },
  {
    id: "A005",
    patient: "Vikram Das",
    doctor: "Dr. Priya",
    department: "Emergency",
    time: "03:30 PM",
    status: "Critical",
  },
];

/*
|--------------------------------------------------------------------------
| Critical flags
|--------------------------------------------------------------------------
| These are mock dashboard records for now.
| Later these can come from the backend.
*/
const criticalItems = [
  {
    id: "CF001",
    title: "Critical patient flag",
    description: "Patient P005 requires immediate attention",
    details: {
      patientId: "P005",
      patientName: "Vikram Das",
      department: "Emergency",
      doctor: "Dr. Priya",
      flag: "Immediate medical attention required",
      priority: "Critical",
      created: "15 minutes ago",
      note: "Patient has been marked as requiring urgent review by the clinical team.",
    },
  },
  {
    id: "CF002",
    title: "Pending insurance pre-authorisation",
    description: "2 requests require review",
    details: {
      requestCount: "2 requests",
      department: "Insurance",
      status: "Pending review",
      oldestRequest: "45 minutes ago",
      note: "Insurance pre-authorisation requests are waiting for review and approval.",
    },
  },
  {
    id: "CF003",
    title: "Low pharmacy stock",
    description: "4 medicines below threshold",
    details: {
      medicines: [
        "Paracetamol 500mg — 18 units",
        "Amoxicillin 500mg — 12 units",
        "Pantoprazole 40mg — 9 units",
        "Insulin Glargine — 6 units",
      ],
      department: "Pharmacy",
      status: "Reorder recommended",
      note: "These medicines have fallen below their configured minimum stock threshold.",
    },
  },
  {
    id: "CF004",
    title: "Follow-up overdue",
    description: "6 at-risk patients require follow-up",
    details: {
      patientCount: "6 patients",
      department: "Follow-ups",
      status: "Overdue",
      oldestFollowUp: "2 days overdue",
      note: "These patients are currently marked as requiring follow-up contact.",
    },
  },
];

/*
|--------------------------------------------------------------------------
| Recent activity
|--------------------------------------------------------------------------
*/
const recentActivities = [
  {
    id: "ACT001",
    title: "New patient registered",
    description: "Rahul Kumar · 10 minutes ago",
    details: {
      patient: "Rahul Kumar",
      patientId: "P006",
      action: "New patient registration",
      department: "Reception",
      time: "10 minutes ago",
      note: "Patient profile was created successfully.",
    },
  },
  {
    id: "ACT002",
    title: "Appointment completed",
    description: "Priya Sharma · 25 minutes ago",
    details: {
      patient: "Priya Sharma",
      appointmentId: "A003",
      action: "Appointment completed",
      doctor: "Dr. Anjali Sharma",
      department: "Diagnostics",
      time: "25 minutes ago",
      note: "Appointment was marked as completed.",
    },
  },
  {
    id: "ACT003",
    title: "Invoice generated",
    description: "Patient P003 · 40 minutes ago",
    details: {
      patientId: "P003",
      action: "Invoice generated",
      invoiceId: "INV-003",
      amount: "₹4,850",
      time: "40 minutes ago",
      note: "Invoice was generated and is currently available for payment.",
    },
  },
];

export default function DailyDashboardPage() {
  const navigate = useNavigate();

const criticalFlagsRef = useRef(null);

const [openCritical, setOpenCritical] = useState(null);
const [openActivity, setOpenActivity] = useState(null);

  const toggleCritical = (id) => {
    setOpenCritical((current) => (current === id ? null : id));
  };

  const toggleActivity = (id) => {
    setOpenActivity((current) => (current === id ? null : id));
  };

  return (
    <div className="admin-dashboard">

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of today's hospital operations</p>
        </div>

        <div className="dashboard-header-actions">
          <button
            className="secondary-button"
            type="button"
          >
            Export CSV
          </button>

          <button
            className="secondary-button"
            type="button"
          >
            Export PDF
          </button>
        </div>
      </div>


      {/* Quick Actions */}
      <div className="dashboard-actions">

        <button
          type="button"
          onClick={() => navigate("/staff/patients/new")}
        >
          + New Patient
        </button>

        <button
          type="button"
          onClick={() => navigate("/staff/scheduling")}
        >
          + New Appointment
        </button>

        <button
          type="button"
          onClick={() => navigate("/staff/billing")}
        >
          + New Bill
        </button>

      </div>


      {/* Statistics */}
      {/* Statistics */}
<div className="dashboard-stats">

  <button
  type="button"
  className="stat-card stat-card-button"
  onClick={() => navigate("/staff/reports/revenue")}
>
  <span>Today's Revenue</span>

  <strong>
    {dashboardData.revenue.amount}
  </strong>

  <small>
    Revenue collected today
  </small>

  <span className="stat-card-link">
    View revenue →
  </span>
</button>


  <button
    type="button"
    className="stat-card stat-card-button"
    onClick={() => navigate("/staff/scheduling")}
  >
    <span>Appointments</span>

    <strong>
      {dashboardData.appointments.total}
    </strong>

    <small>
      Today's appointments
    </small>

    <span className="stat-card-link">
      View appointments →
    </span>
  </button>


  <button
  type="button"
  className="stat-card stat-card-button"
  onClick={() => {
    criticalFlagsRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }}
>
  <span>Critical Flags</span>

  <strong>
    {dashboardData.criticalFlags.count}
  </strong>

  <small>
    Require attention
  </small>

  <span className="stat-card-link">
    View critical flags →
  </span>
</button>


  <button
    type="button"
    className="stat-card stat-card-button"
    onClick={() => navigate("/staff/billing")}
  >
    <span>Pending Bills</span>

    <strong>
      {dashboardData.pendingBills}
    </strong>

    <small>
      Require attention
    </small>

    <span className="stat-card-link">
      View pending bills →
    </span>
  </button>

</div>


      {/* Main Dashboard Grid */}
      <div className="dashboard-grid">

        {/* Today's Appointments */}
        <section className="dashboard-section">

          <div className="section-header">

            <h3>
              Today's Appointments
            </h3>

            <button
              className="text-button"
              type="button"
              onClick={() => navigate("/staff/scheduling")}
            >
              View all
            </button>

          </div>


          <div className="appointment-list">

            {appointments.map((appointment) => (

              <div
                className="appointment-row"
                key={appointment.id}
              >

                <div>
                  <strong>
                    {appointment.patient}
                  </strong>

                  <small>
                    {appointment.doctor} ·{" "}
                    {appointment.department}
                  </small>
                </div>


                <span>
                  {appointment.time}
                </span>


                <span className="status-badge">
                  {appointment.status}
                </span>

              </div>

            ))}

          </div>

        </section>


        {/* Hospital Overview */}
        <section className="dashboard-section">

          <div className="section-header">
            <h3>
              Hospital Overview
            </h3>
          </div>


          <div className="overview-item">
            <span>New Patients</span>

            <strong>
              {dashboardData.patients.newPatients}
            </strong>
          </div>


          <div className="overview-item">
            <span>Returning Patients</span>

            <strong>
              {dashboardData.patients.returningPatients}
            </strong>
          </div>


          <div className="overview-item">
            <span>Completed Appointments</span>

            <strong>
              {dashboardData.appointments.completed}
            </strong>
          </div>


          <div className="overview-item">
            <span>Pending Appointments</span>

            <strong>
              {dashboardData.appointments.pending}
            </strong>
          </div>


          <div className="overview-item">
            <span>Cancelled</span>

            <strong>
              {dashboardData.appointments.cancelled}
            </strong>
          </div>

        </section>

      </div>


      {/* Critical Flags */}
      <section className="dashboard-section">

        <div className="section-header">

          <h3>
            Critical Flags
          </h3>

          <button
            className="text-button"
            type="button"
          >
            View all
          </button>

        </div>


        <div className="critical-list">

          {criticalItems.map((item) => {

            const isOpen = openCritical === item.id;

            return (
              <div
                className={`critical-item ${
                  isOpen ? "expanded" : ""
                }`}
                key={item.id}
              >

                {/* Clickable row */}
                <button
                  type="button"
                  className="critical-row"
                  onClick={() => toggleCritical(item.id)}
                  aria-expanded={isOpen}
                >

                  <span className="critical-dot"></span>

                  <div className="critical-content">

                    <strong>
                      {item.title}
                    </strong>

                    <small>
                      {item.description}
                    </small>

                  </div>

                  <span className="critical-chevron">
                    {isOpen ? "⌃" : "⌄"}
                  </span>

                </button>


                {/* Expanded details */}
                {isOpen && (
                  <div className="critical-details">

                    {item.id === "CF001" && (
                      <>
                        <div className="detail-grid">

                          <div>
                            <span>Patient</span>
                            <strong>
                              {item.details.patientName}
                            </strong>
                          </div>

                          <div>
                            <span>Patient ID</span>
                            <strong>
                              {item.details.patientId}
                            </strong>
                          </div>

                          <div>
                            <span>Department</span>
                            <strong>
                              {item.details.department}
                            </strong>
                          </div>

                          <div>
                            <span>Doctor</span>
                            <strong>
                              {item.details.doctor}
                            </strong>
                          </div>

                          <div>
                            <span>Priority</span>
                            <strong className="critical-text">
                              {item.details.priority}
                            </strong>
                          </div>

                          <div>
                            <span>Created</span>
                            <strong>
                              {item.details.created}
                            </strong>
                          </div>

                        </div>

                        <div className="detail-note">
                          <strong>Flag</strong>
                          <p>{item.details.flag}</p>

                          <p>{item.details.note}</p>
                        </div>

                        <button
                          type="button"
                          className="detail-action-button"
                          onClick={() =>
                            navigate(
                              `/staff/patients/${item.details.patientId}`
                            )
                          }
                        >
                          View Patient
                        </button>
                      </>
                    )}


                    {item.id === "CF002" && (
                      <>
                        <div className="detail-grid">

                          <div>
                            <span>Requests</span>
                            <strong>
                              {item.details.requestCount}
                            </strong>
                          </div>

                          <div>
                            <span>Department</span>
                            <strong>
                              {item.details.department}
                            </strong>
                          </div>

                          <div>
                            <span>Status</span>
                            <strong>
                              {item.details.status}
                            </strong>
                          </div>

                          <div>
                            <span>Oldest request</span>
                            <strong>
                              {item.details.oldestRequest}
                            </strong>
                          </div>

                        </div>

                        <div className="detail-note">
                          <strong>Details</strong>
                          <p>{item.details.note}</p>
                        </div>

                        <button
                          type="button"
                          className="detail-action-button"
                          onClick={() =>
                            navigate("/staff/insurance")
                          }
                        >
                          Review Insurance
                        </button>
                      </>
                    )}


                    {item.id === "CF003" && (
                      <>
                        <div className="pharmacy-alert-list">

                          {item.details.medicines.map(
                            (medicine) => (
                              <div
                                className="pharmacy-alert-item"
                                key={medicine}
                              >
                                <span>{medicine}</span>

                                <span className="critical-text">
                                  Low stock
                                </span>
                              </div>
                            )
                          )}

                        </div>

                        <div className="detail-note">
                          <strong>Status</strong>
                          <p>
                            {item.details.status}
                          </p>

                          <p>
                            {item.details.note}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="detail-action-button"
                          onClick={() =>
                            navigate(
                              "/staff/departments/pharmacy/stock"
                            )
                          }
                        >
                          Open Pharmacy Stock
                        </button>
                      </>
                    )}


                    {item.id === "CF004" && (
                      <>
                        <div className="detail-grid">

                          <div>
                            <span>Patients</span>
                            <strong>
                              {item.details.patientCount}
                            </strong>
                          </div>

                          <div>
                            <span>Department</span>
                            <strong>
                              {item.details.department}
                            </strong>
                          </div>

                          <div>
                            <span>Status</span>
                            <strong className="critical-text">
                              {item.details.status}
                            </strong>
                          </div>

                          <div>
                            <span>Oldest follow-up</span>
                            <strong>
                              {item.details.oldestFollowUp}
                            </strong>
                          </div>

                        </div>

                        <div className="detail-note">
                          <strong>Details</strong>
                          <p>{item.details.note}</p>
                        </div>

                        <button
                          type="button"
                          className="detail-action-button"
                          onClick={() =>
                            navigate("/staff/follow-up")
                          }
                        >
                          Open Follow-ups
                        </button>
                      </>
                    )}

                  </div>
                )}

              </div>
            );

          })}

        </div>

      </section>


      {/* Recent Activity */}
      <section className="dashboard-section recent-activity">

        <div className="section-header">

          <h3>
            Recent Activity
          </h3>

          <button
            className="text-button"
            type="button"
          >
            View all
          </button>

        </div>


        <div className="activity-list">

          {recentActivities.map((activity) => {

            const isOpen = openActivity === activity.id;

            return (
              <div
                className={`activity-item ${
                  isOpen ? "expanded" : ""
                }`}
                key={activity.id}
              >

                <button
                  type="button"
                  className="activity-row"
                  onClick={() => toggleActivity(activity.id)}
                  aria-expanded={isOpen}
                >

                  <span className="activity-dot"></span>

                  <div>

                    <strong>
                      {activity.title}
                    </strong>

                    <small>
                      {activity.description}
                    </small>

                  </div>

                  <span className="activity-chevron">
                    {isOpen ? "⌃" : "⌄"}
                  </span>

                </button>


                {isOpen && (
                  <div className="activity-details">

                    <div className="detail-grid">

                      {activity.details.patient && (
                        <div>
                          <span>Patient</span>
                          <strong>
                            {activity.details.patient}
                          </strong>
                        </div>
                      )}

                      {activity.details.patientId && (
                        <div>
                          <span>Patient ID</span>
                          <strong>
                            {activity.details.patientId}
                          </strong>
                        </div>
                      )}

                      {activity.details.appointmentId && (
                        <div>
                          <span>Appointment</span>
                          <strong>
                            {activity.details.appointmentId}
                          </strong>
                        </div>
                      )}

                      {activity.details.invoiceId && (
                        <div>
                          <span>Invoice</span>
                          <strong>
                            {activity.details.invoiceId}
                          </strong>
                        </div>
                      )}

                      {activity.details.doctor && (
                        <div>
                          <span>Doctor</span>
                          <strong>
                            {activity.details.doctor}
                          </strong>
                        </div>
                      )}

                      {activity.details.department && (
                        <div>
                          <span>Department</span>
                          <strong>
                            {activity.details.department}
                          </strong>
                        </div>
                      )}

                      {activity.details.amount && (
                        <div>
                          <span>Amount</span>
                          <strong>
                            {activity.details.amount}
                          </strong>
                        </div>
                      )}

                      <div>
                        <span>Time</span>
                        <strong>
                          {activity.details.time}
                        </strong>
                      </div>

                    </div>

                    <div className="detail-note">

                      <strong>Activity</strong>

                      <p>
                        {activity.details.note}
                      </p>

                    </div>

                  </div>
                )}

              </div>
            );

          })}

        </div>

      </section>

    </div>
  );
}