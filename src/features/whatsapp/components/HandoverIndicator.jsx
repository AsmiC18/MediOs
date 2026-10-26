import React from "react";

// Shows the staff member a conversation is assigned to, and allows
// assign / handover to another staff member via a native (accessible) select.
const HandoverIndicator = ({ assignedTo, staff, onAssign, disabled = false }) => {
  const assignee = staff.find((member) => member.id === assignedTo);

  const handleChange = (event) => {
    const value = event.target.value;

    onAssign(value === "unassigned" ? null : value);
  };

  return (
    <div className="wa-handover">
      <span
        className={`wa-assignee-chip ${assignedTo ? "" : "unassigned"}`}
      >
        {assignedTo ? assignee?.name : "Unassigned"}
      </span>

      <select
        className="wa-handover-select"
        value={assignedTo || "unassigned"}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Assigned staff member"
        title="Assign or hand over this conversation"
      >
        <option value="unassigned">Unassigned</option>

        {staff.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name} · {member.role}
          </option>
        ))}
      </select>
    </div>
  );
};

export default HandoverIndicator;