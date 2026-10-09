import React from "react";
import { Link } from "react-router-dom";

// TODO: replace hardcoded links with backend-driven permissions later
const navItems = [
  { label: "Patients", path: "/patients" },
  { label: "Scheduling", path: "/scheduling" },
  { label: "Billing", path: "/billing" },
];

const RoleBasedNav = () => (
  <nav style={{ width: 200, borderRight: "1px solid #ddd", padding: "16px" }}>
    {navItems.map((item) => (
      <div key={item.path} style={{ marginBottom: "12px" }}>
        <Link to={item.path}>{item.label}</Link>
      </div>
    ))}
  </nav>
);

export default RoleBasedNav;