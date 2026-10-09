import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function StaffConsoleLayout() {
  const [departmentsOpen, setDepartmentsOpen] = useState(true);

  const navItems = [
    { label: "Dashboard", path: "/staff/dashboard" },
    { label: "Patients", path: "/staff/patients" },
    { label: "Scheduling", path: "/staff/scheduling" },
    { label: "WhatsApp", path: "/staff/whatsapp" },
    { label: "Billing", path: "/staff/billing" },
    { label: "Attendance", path: "/staff/attendance" },
    { label: "ABDM", path: "/staff/abdm" },
    { label: "Insurance", path: "/staff/insurance" },
  ];

  const departments = [
    { label: "OPD", path: "/staff/departments/opd" },
    { label: "IPD", path: "/staff/departments/ipd" },
    { label: "Pharmacy", path: "/staff/departments/pharmacy" },
    { label: "Diagnostics", path: "/staff/departments/diagnostics" },
    { label: "Emergency", path: "/staff/departments/emergency" },
    { label: "Surgery", path: "/staff/departments/surgery" },
  ];

  const bottomNavItems = [
    { label: "Clinical Records", path: "/staff/clinical-records" },
    { label: "Follow-ups", path: "/staff/follow-up" },
    { label: "Reports", path: "/staff/reports" },
  ];

  return (
    <div className="app-layout">

      {/* SIDEBAR */}
      <aside className="sidebar">

        <div className="sidebar-brand">
          <h2>MediOS</h2>
          <span>Staff Console</span>
        </div>

        <nav className="sidebar-nav">

          {/* Main navigation */}
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? "active" : ""
              }
            >
              {item.label}
            </NavLink>
          ))}

          {/* Departments */}
          <div className="sidebar-departments">

            <button
              type="button"
              className={`departments-toggle ${
                departmentsOpen ? "open" : ""
              }`}
              onClick={() =>
                setDepartmentsOpen(!departmentsOpen)
              }
            >
              <span>Departments</span>

              <span className="department-arrow">
                {departmentsOpen ? "▾" : "▸"}
              </span>
            </button>

            {departmentsOpen && (
              <div className="department-submenu">

                {departments.map((department) => (
                  <NavLink
                    key={department.path}
                    to={department.path}
                    className={({ isActive }) =>
                      isActive ? "active" : ""
                    }
                  >
                    {department.label}
                  </NavLink>
                ))}

              </div>
            )}

          </div>

          {/* Remaining navigation */}
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive ? "active" : ""
              }
            >
              {item.label}
            </NavLink>
          ))}

        </nav>

      </aside>

      {/* MAIN AREA */}
      <div className="main-area">

        <header className="navbar">

          <div className="navbar-left">
            <button className="branch-switcher">
              Main Branch ▾
            </button>
          </div>

          <div className="navbar-right">
            <button className="notification-button">
              Notifications
            </button>

            <span className="staff-role">
              Admin
            </span>
          </div>

        </header>

        <main className="page-content">
          <Outlet />
        </main>

      </div>

    </div>
  );
}