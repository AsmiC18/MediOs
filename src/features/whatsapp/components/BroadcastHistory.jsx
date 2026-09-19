import React from "react";
import {
  broadcastStatusLabel,
  broadcastStatusClass,
} from "../utils/broadcastStatus";

const BroadcastHistory = ({ broadcasts = [], loading, onView }) => {
  if (loading) {
    return (
      <div className="wa-loading-block wa-history-loading" role="status">
        <span className="wa-spinner" aria-hidden="true"></span>
        <p>Loading broadcasts…</p>
      </div>
    );
  }

  if (broadcasts.length === 0) {
    return (
      <div className="wa-empty-state wa-history-empty">
        <span className="wa-empty-state-icon" aria-hidden="true">
          ≡
        </span>
        <h3>No broadcasts yet</h3>
        <p>
          Sending a broadcast from the composer above will automatically
          appear in the history.
        </p>
      </div>
    );
  }

  return (
    <div className="wa-broadcast-history">
      <table className="wa-history-table">
        <thead>
          <tr>
            <th>Broadcast</th>
            <th className="is-audience">Audience</th>
            <th>Recipients</th>
            <th>Sent</th>
            <th>Failed</th>
            <th>Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {broadcasts.map((broadcast) => (
            <tr
              key={broadcast.id}
              onClick={() => onView(broadcast)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onView(broadcast);
                }
              }}
              title={`View details of ${broadcast.name}`}
            >
              <td>
                <span className="wa-history-primary">
                  <strong>{broadcast.name}</strong>
                  <small>
                    {broadcast.templateName || broadcast.id}
                  </small>
                </span>
              </td>

              <td className="is-audience">
                {broadcast.segmentLabel}
              </td>

              <td>
                <span className="wa-history-num">
                  {broadcast.recipientCount}
                </span>
              </td>

              <td>
                <span className="wa-history-num">
                  {broadcast.sentCount}
                </span>
              </td>

              <td>
                <span
                  className={`wa-history-num${
                    broadcast.failedCount > 0 ? " failed" : ""
                  }`}
                >
                  {broadcast.failedCount}
                </span>
              </td>

              <td>{broadcast.sentAt || "—"}</td>

              <td>
                <span
                  className={`wa-status-badge ${broadcastStatusClass(
                    broadcast.status
                  )}`}
                >
                  {broadcastStatusLabel(broadcast.status)}
                </span>
              </td>

              <td>
                <button
                  type="button"
                  className="view-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onView(broadcast);
                  }}
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BroadcastHistory;