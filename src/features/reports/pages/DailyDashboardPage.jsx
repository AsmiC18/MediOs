import React from "react";

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

const criticalItems = [
  {
    title: "Critical patient flag",
    description: "Patient P005 requires immediate attention",
  },
  {
    title: "Pending insurance pre-authorisation",
    description: "2 requests require review",
  },
  {
    title: "Low pharmacy stock",
    description: "4 medicines below threshold",
  },
  {
    title: "Follow-up overdue",
    description: "6 at-risk patients require follow-up",
  },
];

export default function DailyDashboardPage() {
  return (
    <div className="admin-dashboard">

      {/* Page Header */}
      <div className="page-header">

        <div>
          <h1>Dashboard</h1>
          <p>
            Overview of today's hospital operations
          </p>
        </div>

        <div className="dashboard-header-actions">
          <button className="secondary-button">
            Export CSV
          </button>

          <button className="secondary-button">
            Export PDF
          </button>
        </div>

      </div>


      {/* Quick Actions */}
      <div className="dashboard-actions">

        <button>
          + New Patient
        </button>

        <button>
          + New Appointment
        </button>

        <button>
          + New Bill
        </button>

      </div>


      {/* Statistics */}
      <div className="dashboard-stats">

        <div className="stat-card">
          <span>Today's Revenue</span>

          <strong>
            {dashboardData.revenue.amount}
          </strong>

          <small>
            Revenue collected today
          </small>
        </div>


        <div className="stat-card">
          <span>Appointments</span>

          <strong>
            {dashboardData.appointments.total}
          </strong>

          <small>
            Today's appointments
          </small>
        </div>


        <div className="stat-card">
          <span>Critical Flags</span>

          <strong>
            {dashboardData.criticalFlags.count}
          </strong>

          <small>
            Require attention
          </small>
        </div>


        <div className="stat-card">
          <span>Pending Bills</span>

          <strong>
            {dashboardData.pendingBills}
          </strong>

          <small>
            Require attention
          </small>
        </div>

      </div>


      {/* Main Dashboard Grid */}
      <div className="dashboard-grid">

        {/* Today's Appointments */}
        <section className="dashboard-section">

          <div className="section-header">

            <h3>
              Today's Appointments
            </h3>

            <button className="text-button">
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

          <button className="text-button">
            View all
          </button>

        </div>


        <div className="critical-list">

          {criticalItems.map((item, index) => (

            <div
              className="critical-row"
              key={index}
            >

              <span className="critical-dot"></span>

              <div>

                <strong>
                  {item.title}
                </strong>

                <small>
                  {item.description}
                </small>

              </div>

            </div>

          ))}

        </div>

      </section>


      {/* Recent Activity */}
      <section className="dashboard-section recent-activity">

        <div className="section-header">

          <h3>
            Recent Activity
          </h3>

          <button className="text-button">
            View all
          </button>

        </div>


        <div className="activity-row">

          <span className="activity-dot"></span>

          <div>

            <strong>
              New patient registered
            </strong>

            <small>
              Rahul Kumar · 10 minutes ago
            </small>

          </div>

        </div>


        <div className="activity-row">

          <span className="activity-dot"></span>

          <div>

            <strong>
              Appointment completed
            </strong>

            <small>
              Priya Sharma · 25 minutes ago
            </small>

          </div>

        </div>


        <div className="activity-row">

          <span className="activity-dot"></span>

          <div>

            <strong>
              Invoice generated
            </strong>

            <small>
              Patient P003 · 40 minutes ago
            </small>

          </div>

        </div>

      </section>

    </div>
  );
}