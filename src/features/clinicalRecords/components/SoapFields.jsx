import { useId } from "react";

const fields = [
  {
    key: "subjective",
    label: "Subjective",
    description: "Patient-reported symptoms and medical history",
  },
  {
    key: "objective",
    label: "Objective",
    description: "Examination findings and observations",
  },
  {
    key: "assessment",
    label: "Assessment",
    description: "Clinical impression and diagnosis",
  },
  {
    key: "plan",
    label: "Plan",
    description: "Treatment and follow-up",
  },
];

export default function SoapFields({ value, onChange }) {
  const id = useId();

  return (
    <div className="clinical-soap-fields">
      {fields.map((field) => (
        <div className="clinical-form-field" key={field.key}>
          <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
          <p className="clinical-field-description">
            {field.description}
          </p>
          <textarea
            id={`${id}-${field.key}`}
            rows={4}
            value={value[field.key] || ""}
            onChange={(event) =>
              onChange(field.key, event.target.value)
            }
            placeholder={field.placeholder}
          />
        </div>
      ))}
    </div>
  );
}