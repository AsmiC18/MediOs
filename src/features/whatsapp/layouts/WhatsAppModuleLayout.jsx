import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { isLiveWhatsApp } from "../../../services/whatsappApi";
import "../styles/live.css";

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
        {TABS.filter(tab => !isLiveWhatsApp || tab.label === "Inbox").map((tab) => (
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

      <p className="wa-connection-note" role="status">{isLiveWhatsApp
        ? "Backend mode: inbox APIs enabled. Templates and broadcasts are not connected yet."
        : "Demo mode: conversations and sends are simulated locally. No WhatsApp messages are sent."}</p>
      <Outlet />
    </div>
  );
};

export default WhatsAppModuleLayout;
