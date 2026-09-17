import React from "react";

const DashboardPage = () => {
  return (
    <div>
      <h1>Dashboard</h1>

      <p>
        Welcome to the MediOS Staff Console.
      </p>

      <div className="stats-grid">

        <div className="stat-card">
          <span>Today's Appointments</span>
          <strong>42</strong>
        </div>

        <div className="stat-card">
          <span>Patients Today</span>
          <strong>38</strong>
        </div>

        <div className="stat-card">
          <span>Today's Revenue</span>
          <strong>₹84,500</strong>
        </div>

        <div className="stat-card">
          <span>Critical Flags</span>
          <strong>3</strong>
        </div>

      </div>
    </div>
  );
};

export default DashboardPage;