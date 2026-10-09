import React from "react";

const AtRiskBadge = ({ atRisk }) => {
  if (!atRisk) {
    return (
      <span className="normal-badge">
        Normal
      </span>
    );
  }

  return (
    <span className="risk-badge">
      At Risk
    </span>
  );
};

export default AtRiskBadge;