import React, { useEffect, useState } from "react";
import { TEMPLATE_VARIABLES } from "../utils/templateVariables";
import TemplatePreview from "./TemplatePreview";

const STATUSES = ["Approved", "Draft", "Suspended"];

const initialForm = {
  name: "",
  category: "",
  language: "en",
  status: "Draft",
  body: "",
};

const TemplateEditor = ({
  open,
  initial,
  categories,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (initial) {
      setForm({
        name: initial.name,
        category: initial.category,
        language: initial.language || "en",
        status: initial.status,
        body: initial.body,
      });
    } else {
      setForm(initialForm);
    }

    setErrors({});
  }, [open, initial]);

  if (!open) {
    return null;
  }

  const editing = Boolean(initial);
  const categoryOptions =
    categories.length > 0 ? categories : [form.category || ""];

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const insertVariable = (variable) => {
    updateField("body", `${form.body}${form.body ? "\n" : ""}{{${variable.key}}}`);
  };

  const validate = () => {
    const nextErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Template name is required.";
    }

    if (!form.category) {
      nextErrors.category = "Choose a category.";
    }

    if (!form.body.trim()) {
      nextErrors.body = "Message body is required.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        language: form.language,
        status: form.status,
        body: form.body.trim(),
      };

      const saved = await onSave(editing, payload);

      onClose(saved);
    } catch (error) {
      setSaving(false);
    }
  };

  return (
    <div
      className="wa-modal-overlay"
      onClick={() => !saving && onClose()}
    >
      <div
        className="wa-modal wa-template-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="wa-modal-header">
          <div>
            <span className="section-label">
              {editing ? "EDIT" : "NEW"} TEMPLATE
            </span>
            <h2 id="template-editor-title">
              {editing ? "Edit Template" : "Create Template"}
            </h2>
            <p>
              Approved templates are eligible to be sent through the
              WhatsApp Business API once connected.
            </p>
          </div>

          <button
            type="button"
            className="wa-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>

        <div className="wa-template-form-grid">
          <div className="wa-template-form-fields">
            <div className="form-field">
              <label htmlFor="wa-template-name">Template name</label>
              <input
                id="wa-template-name"
                type="text"
                value={form.name}
                onChange={(event) =>
                  updateField("name", event.target.value)
                }
                placeholder="e.g. Appointment Reminder"
              />
              {errors.name && <span className="wa-field-error">{errors.name}</span>}
            </div>

            <div className="form-field">
              <label htmlFor="wa-template-category">Category</label>
              <select
                id="wa-template-category"
                value={form.category}
                onChange={(event) =>
                  updateField("category", event.target.value)
                }
              >
                <option value="">Select a category</option>

                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              {errors.category && (
                <span className="wa-field-error">{errors.category}</span>
              )}
            </div>

            <div className="wa-template-form-row">
              <div className="form-field">
                <label htmlFor="wa-template-language">Language</label>
                <select
                  id="wa-template-language"
                  value={form.language}
                  onChange={(event) =>
                    updateField("language", event.target.value)
                  }
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi (setup required)</option>
                  <option value="ta">Tamil (setup required)</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="wa-template-status">Status</label>
                <select
                  id="wa-template-status"
                  value={form.status}
                  onChange={(event) =>
                    updateField("status", event.target.value)
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="wa-template-body">Message body</label>
              <textarea
                id="wa-template-body"
                rows={7}
                value={form.body}
                onChange={(event) =>
                  updateField("body", event.target.value)
                }
                placeholder="Hello {{patient_name}}, ..."
              />
              {errors.body && (
                <span className="wa-field-error">{errors.body}</span>
              )}
            </div>

            <div className="wa-variable-insert">
              <span className="wa-variable-insert-label">
                Insert variable
              </span>

              <div className="wa-variable-chips">
                {TEMPLATE_VARIABLES.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    className="wa-variable-chip actionable"
                    onClick={() => insertVariable(variable)}
                    title={variable.label}
                  >
                    {`{{${variable.key}}}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="wa-template-form-preview">
            <TemplatePreview
              body={form.body}
              category={form.category}
            />
          </div>
        </div>

        <div className="wa-modal-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-action"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create template"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;