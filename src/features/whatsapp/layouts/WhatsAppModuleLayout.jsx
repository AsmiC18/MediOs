import React from "react";
import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  {
    label: "Inbox",
    path: "/staff/whatsapp/inbox",
    title: "Shared WhatsApp inbox",
  },
  {
    label: "Templates",
    path: "/staff/whatsapp/templates",
    title: "Manage approved WhatsApp templates",
  },
  {
    label: "Broadcasts",
    path: "/staff/whatsapp/broadcasts",
    title: "Send bulk WhatsApp campaigns",
  },
];

const WhatsAppModuleLayout = () => {
  return (
    <div className="wa-module">
      <nav className="wa-module-tabs" aria-label="WhatsApp sections">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            title={tab.title}
            className={({ isActive }) =>
              isActive ? "wa-module-tab active" : "wa-module-tab"
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
};

export default WhatsAppModuleLayout;