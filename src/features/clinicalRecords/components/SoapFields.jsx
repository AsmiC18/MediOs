import { useId } from "react";

const fields = [
  {
    key: "subjective",
    label: "Subjective",
    description: "Patient-reported symptoms and medical history",
    placeholder: "Enter the chief complaint, symptoms and relevant history...",
  },
  {
    key: "objective",
    label: "Objective",
    description: "Examination findings and observations",
    placeholder: "Enter examination findings, vital signs and test results...",
  },
  {
    key: "assessment",
    label: "Assessment",
    description: "Clinical impression and diagnosis",
    placeholder: "Enter the clinical assessment...",
  },
  {
    key: "plan",
    label: "Plan",
    description: "Treatment and follow-up",
    placeholder: "Enter the treatment plan, investigations and follow-up...",
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