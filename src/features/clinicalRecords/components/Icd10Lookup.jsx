import { useState } from "react";

const diagnoses = [
  { code: "J06.9", name: "Acute upper respiratory infection, unspecified" },
  { code: "J02.9", name: "Acute pharyngitis, unspecified" },
  { code: "I10", name: "Essential hypertension" },
  { code: "E11.9", name: "Type 2 diabetes mellitus without complications" },
  { code: "R50.9", name: "Fever, unspecified" },
  { code: "R51.9", name: "Headache, unspecified" },
  { code: "K21.9", name: "Gastro-oesophageal reflux disease" },
  { code: "M54.5", name: "Low back pain" },
];

export default function Icd10Lookup({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = diagnoses.filter((item) =>
    `${item.code} ${item.name}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  function selectDiagnosis(item) {
    onChange({ code: item.code, name: item.name });
    setQuery(`${item.code} — ${item.name}`);
    setOpen(false);
  }

  return (
    <div className="clinical-form-field clinical-diagnosis-lookup">
      <label htmlFor="clinical-diagnosis-search">
        Diagnosis (ICD-10)
      </label>

      <input
        id="clinical-diagnosis-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);

          if (!event.target.value) {
            onChange(null);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by diagnosis or ICD-10 code"
        autoComplete="off"
      />

      {open && query.trim() && (
        <div className="clinical-search-results">
          {results.length ? (
            results.map((item) => (
              <button
                type="button"
                key={item.code}
                className="clinical-search-result"
                onClick={() => selectDiagnosis(item)}
              >
                <strong>{item.code}</strong>
                <span>{item.name}</span>
              </button>
            ))
          ) : (
            <p className="clinical-empty-state">
              No matching diagnoses found.
            </p>
          )}
        </div>
      )}

      {value && (
        <p className="clinical-selected-value">
          Selected: {value.code} — {value.name}
        </p>
      )}

      <p className="clinical-field-description">
        Connect an approved ICD-10 catalogue for clinical use.
      </p>
    </div>
  );
}