
import React from "react";

export default function ExportButtons({
  rows = [],
  reportTitle = "Hospital Report",
  columns,
}) {
  const exportCsv = () => {
    if (!rows.length) {
      window.alert("There are no records to export.");
      return;
    }

    const headers = columns?.length ? columns : Object.keys(rows[0]);

    const escapeCsv = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csv = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) =>
        headers.map((header) => escapeCsv(row[header])).join(",")
      ),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = reportTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    link.href = url;
    link.download = `${filename || "hospital-report"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-export-actions">
      <button type="button" onClick={exportCsv}>
        Export CSV
      </button>

      <button type="button" onClick={() => window.print()}>
        Export PDF
      </button>
    </div>
  );
}
