import React, { useEffect, useMemo, useState } from "react";
import whatsappService from "../../../services/whatsappService";

// Patient segment picker for the broadcast audience step.
// Lists the available segments with live recipient counts, and expands a
// searchable patient checklist when "Custom Selection" is chosen.
const SegmentPicker = ({ selectedId, customIds = [], onSelect }) => {
  const [segments, setSegments] = useState([]);
  const [counts, setCounts] = useState({});
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const [segmentList, patientList] = await Promise.all([
          whatsappService.getSegments(),
          whatsappService.getSegmentPatients("all-patients"),
        ]);

        const countEntries = await Promise.all(
          segmentList.map(async (segment) => {
            if (segment.id === "custom") {
              return [segment.id, null];
            }

            const count = await whatsappService.getSegmentCount(segment.id);
            return [segment.id, count];
          })
        );

        if (cancelled) {
          return;
        }

        setSegments(segmentList);
        setPatients(patientList);
        setCounts(Object.fromEntries(countEntries));
      } catch (error) {
        // leave the list empty; the page keeps its own error handling
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return patients;
    }

    return patients.filter(
      (patient) =>
        patient.name.toLowerCase().includes(query) ||
        patient.phone.replace(/\s+/g, "").includes(query)
    );
  }, [patients, search]);

  const togglePatient = (patientId) => {
    const selected = customIds.includes(patientId)
      ? customIds.filter((id) => id !== patientId)
      : [...customIds, patientId];

    onSelect("custom", selected);
  };

  if (loading) {
    return (
      <div className="wa-loading-block wa-segment-picker-loading" role="status">
        <span className="wa-spinner" aria-hidden="true"></span>
        <p>Loading audiences…</p>
      </div>
    );
  }

  return (
    <div className="wa-segment-picker">
      <ul className="wa-segment-list">
        {segments.map((segment) => (
          <li key={segment.id}>
            <button
              type="button"
              className={`wa-segment-option${
                selectedId === segment.id ? " selected" : ""
              }`}
              onClick={() => onSelect(segment.id, [])}
              aria-pressed={selectedId === segment.id}
            >
              <span className="wa-segment-radio" aria-hidden="true"></span>

              <span className="wa-segment-text">
                <strong>{segment.label}</strong>
                <small>{segment.description}</small>
              </span>

              <span className="wa-segment-count">
                {segment.id === "custom"
                  ? `${customIds.length} patient${
                      customIds.length === 1 ? "" : "s"
                    }`
                  : `${counts[segment.id] ?? "…"} patient${
                      counts[segment.id] === 1 ? "" : "s"
                    }`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selectedId === "custom" && (
        <div className="wa-custom-picker">
          <input
            type="search"
            className="wa-custom-search"
            placeholder="Search patients by name or phone…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search patients"
          />

          <ul className="wa-custom-list">
            {filteredPatients.map((patient) => (
              <li key={patient.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={customIds.includes(patient.id)}
                    onChange={() => togglePatient(patient.id)}
                  />
                  <span>
                    <strong>{patient.name}</strong>
                    <small>
                      {patient.id} · {patient.phone}
                    </small>
                  </span>
                </label>
              </li>
            ))}

            {filteredPatients.length === 0 && (
              <li className="wa-custom-empty">
                No patients match your search.
              </li>
            )}
          </ul>

          <p className="wa-custom-hint">
            {customIds.length > 0
              ? `${customIds.length} recipient${
                  customIds.length === 1 ? "" : "s"
                } selected. The count updates as you select.`
              : "Select at least one patient to use this audience."}
          </p>
        </div>
      )}
    </div>
  );
};

export default SegmentPicker;