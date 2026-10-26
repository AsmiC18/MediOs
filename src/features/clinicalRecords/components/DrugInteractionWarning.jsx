export default function DrugInteractionWarning({ warnings = [] }) {
  return (
    <section
      className={`clinical-warning ${
        warnings.length ? "clinical-warning-danger" : "clinical-warning-neutral"
      }`}
      aria-live="polite"
    >
      <h3>
        {warnings.length
          ? "Medication safety review required"
          : "Medication safety review"}
      </h3>

      {warnings.length ? (
        <ul>
          {warnings.map((warning, index) => (
            <li key={`${index}-${warning}`}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p>
          No warnings were identified by the current rules.
        </p>
      )}

   
    </section>
  );
}