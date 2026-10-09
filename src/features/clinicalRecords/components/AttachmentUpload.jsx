import { useId } from "react";

export default function AttachmentUpload({ files = [], onChange }) {
  const id = useId();

  function handleFiles(event) {
    const selected = Array.from(event.target.files || []);

    const additions = selected.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
      type: file.type || "Unknown file type",
    }));

    onChange([...files, ...additions]);
    event.target.value = "";
  }

  return (
    <div className="clinical-attachments">
      <label htmlFor={id}>Upload visit documents</label>
      <p className="clinical-field-description">
        Attach laboratory reports, X-rays and other relevant documents.
      </p>

      <input
        id={id}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
        onChange={handleFiles}
      />

      {files.length > 0 && (
        <div className="clinical-attachment-list">
          {files.map((file) => (
            <div className="clinical-attachment-item" key={file.id}>
              <div className="clinical-attachment-details">
                <strong>{file.name}</strong>
                <span>
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>

              <button
                type="button"
                className="clinical-text-button"
                onClick={() =>
                  onChange(files.filter((item) => item.id !== file.id))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}