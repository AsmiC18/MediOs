
import React from "react";
import { useNavigate } from "react-router-dom";

export default function ComingSoonPage({ moduleName = "This module" }) {
  const navigate = useNavigate();

  return (
    <div className="coming-soon-page">
      <div className="coming-soon-card">
        <div className="coming-soon-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M3 12h3" />
            <path d="M18 12h3" />
            <path d="m5.64 5.64 2.12 2.12" />
            <path d="m16.24 16.24 2.12 2.12" />
            <path d="m18.36 5.64-2.12 2.12" />
            <path d="m7.76 16.24-2.12 2.12" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>

        <span className="coming-soon-badge">COMING SOON</span>

        <h1>{moduleName}</h1>

        <p className="coming-soon-message">
          We're working on this module to make it a useful part of
          your hospital workflow.
        </p>

        <p className="coming-soon-subtext">
          This section is currently under development. Please check
          back in a future update.
        </p>

        <button
          type="button"
          className="coming-soon-button"
          onClick={() => navigate("/staff/dashboard")}
        >
          Back to Dashboard
        </button>

        <span className="coming-soon-footer">
          MediOS 
        </span>
      </div>
    </div>
  );
}
