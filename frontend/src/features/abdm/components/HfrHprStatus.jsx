import React from "react";

const mockRegistryData = {
  hfr: {
    name: "MediOS Hospital",
    id: "HFR-IND-45821",
    status: "Verified",
    lastUpdated: "18 Sep 2026",
  },
  hpr: {
    professionals: 24,
    verified: 22,
    pending: 2,
    status: "Active",
  },
};

export default function HfrHprStatus() {
  return (
    <div className="registry-status-grid">

      <div className="registry-card">

        <div className="registry-card-top">
          <div>
            <span className="section-label">
              HFR
            </span>

            <h3>Health Facility Registry</h3>
          </div>

          <span className="registry-status verified">
            ✓ Verified
          </span>
        </div>

        <div className="registry-detail">
          <span>Facility</span>
          <strong>{mockRegistryData.hfr.name}</strong>
        </div>

        <div className="registry-detail">
          <span>Facility ID</span>
          <strong>{mockRegistryData.hfr.id}</strong>
        </div>

        <div className="registry-detail">
          <span>Last Updated</span>
          <strong>{mockRegistryData.hfr.lastUpdated}</strong>
        </div>

      </div>

      <div className="registry-card">

        <div className="registry-card-top">
          <div>
            <span className="section-label">
              HPR
            </span>

            <h3>
              Healthcare Professionals Registry
            </h3>
          </div>

          <span className="registry-status verified">
            ✓ Active
          </span>
        </div>

        <div className="registry-number">
          <strong>
            {mockRegistryData.hpr.professionals}
          </strong>

          <span>
            Registered professionals
          </span>
        </div>

        <div className="registry-professional-stats">

          <div>
            <strong>
              {mockRegistryData.hpr.verified}
            </strong>
            <span>Verified</span>
          </div>

          <div>
            <strong>
              {mockRegistryData.hpr.pending}
            </strong>
            <span>Pending</span>
          </div>

        </div>

      </div>

    </div>
  );
}