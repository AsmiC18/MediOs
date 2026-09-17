import { NavLink, Outlet } from "react-router-dom";

export default function StaffConsoleLayout() {
  const navItems = [
    {
      label: "Dashboard",
      path: "/staff/dashboard",
    },
    {
      label: "Patients",
      path: "/staff/patients",
    },
    {
      label: "Scheduling",
      path: "/staff/scheduling",
    },
    {
      label: "WhatsApp",
      path: "/staff/whatsapp",
    },
    {
      label: "Billing",
      path: "/staff/billing",
    },
    {
      label: "Attendance",
      path: "/staff/attendance",
    },
    {
      label: "ABDM",
      path: "/staff/abdm",
    },
    {
      label: "Insurance",
      path: "/staff/insurance",
    },
    {
      label: "Departments",
      path: "/staff/departments",
    },
    {
      label: "Clinical Records",
      path: "/staff/clinical-records",
    },
    {
      label: "Follow-ups",
      path: "/staff/follow-up",
    },
    {
      label: "Reports",
      path: "/staff/reports",
    },
  ];

  return (
    <div className="app-layout">

      {/* Sidebar */}
      <aside className="sidebar">

        <div className="sidebar-brand">
          <h2>MediOS</h2>
          <span>Staff Console</span>
        </div>

        <nav>
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
        </nav>

      </aside>

      {/* Main Area */}
      <div className="main-area">

        {/* Top Navbar */}
        <header className="navbar">

          <div className="navbar-left">
            <button className="branch-switcher">
              Main Branch ▾
            </button>

            <div className="global-search">
              <input
                type="text"
                placeholder="Search patients, appointments..."
              />
            </div>
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

        {/* Page Content */}
        <main className="page-content">
          <Outlet />
        </main>

      </div>

    </div>
  );
}