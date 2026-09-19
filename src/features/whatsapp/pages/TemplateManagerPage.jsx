import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useWhatsappAbilities } from "../utils/whatsappAbilities";
import whatsappService from "../../../services/whatsappService";
import { extractVariables } from "../utils/templateVariables";
import TemplateEditor from "../components/TemplateEditor";
import TemplatePreview from "../components/TemplatePreview";

const TemplateManagerPage = () => {
  const { user } = useAuth();
  const abilities = useWhatsappAbilities();

  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const [data, meta] = await Promise.all([
          whatsappService.getTemplates(),
          whatsappService.getTemplateMeta(),
        ]);

        if (cancelled) {
          return;
        }

        setTemplates(data);
        setCategories(meta.categories);
        setStatuses(meta.statuses);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError("Could not load WhatsApp templates.");
        }
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

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesCategory =
        categoryFilter === "all" || template.category === categoryFilter;

      const matchesStatus =
        statusFilter === "all" || template.status === statusFilter;

      const matchesSearch =
        !query ||
        template.name.toLowerCase().includes(query) ||
        template.body.toLowerCase().includes(query);

      return matchesCategory && matchesStatus && matchesSearch;
    });
  }, [templates, search, categoryFilter, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = {};

    statuses.forEach((status) => {
      counts[status] = templates.filter((t) => t.status === status).length;
    });

    counts.Total = templates.length;

    return counts;
  }, [templates, statuses]);

  const handleSave = async (editing, payload) => {
    if (editing) {
      return whatsappService.updateTemplate(editingTemplate.id, payload);
    }

    return whatsappService.createTemplate({
      ...payload,
      createdBy: user?.name || "Staff",
    });
  };

  const refresh = async () => {
    const data = await whatsappService.getTemplates();
    setTemplates(data);

    setPreviewTemplate((current) => {
      if (!current) {
        return null;
      }

      return data.find((template) => template.id === current.id) || null;
    });
  };

  const handleCreated = async (saved) => {
    await refresh();
    setNotice(`Template "${saved.name}" created.`);
    clearNoticeLater();
  };

  const handleUpdated = async (saved) => {
    await refresh();
    setNotice(`Template "${saved.name}" updated.`);
    clearNoticeLater();
  };

  const handleDuplicate = async (template, event) => {
    event.stopPropagation();
    setBusy(true);

    try {
      const duplicate = await whatsappService.duplicateTemplate(template.id);
      await refresh();
      setNotice(`Template "${duplicate.name}" created.`);
      clearNoticeLater();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setBusy(true);

    try {
      await whatsappService.deleteTemplate(deleteTarget.id);
      await refresh();
      setDeleteTarget(null);
      setNotice(`Template "${deleteTarget.name}" deleted.`);
      clearNoticeLater();
    } finally {
      setBusy(false);
    }
  };

  const clearNoticeLater = () => {
    setTimeout(() => setNotice(null), 3200);
  };

  const canManage = abilities.manageTemplates;

  return (
    <div className="wa-templates-page">
      <div className="page-title-row">
        <div>
          <h1>WhatsApp Templates</h1>
          <p>
            Reusable, pre-approved messages for confirmations, reminders,
            reports, prescriptions and follow-ups.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            className="primary-action"
            onClick={() => {
              setEditingTemplate(null);
              setEditorOpen(true);
            }}
          >
            + Create Template
          </button>
        )}
      </div>

      <div className="wa-summary-strip" aria-label="Template summary">
        <div className="wa-summary-item">
          <span>Total</span>
          <strong>{statusCounts.Total || 0}</strong>
        </div>

        {statuses.map((status) => (
          <div className="wa-summary-item" key={status}>
            <span>{status}</span>
            <strong>{statusCounts[status] || 0}</strong>
          </div>
        ))}
      </div>

      <div className="wa-toolbar">
        <input
          type="search"
          className="wa-filter-input"
          placeholder="Search templates..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search templates"
        />

        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>

          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>

          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {notice && (
        <div className="wa-notice" role="status">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="wa-loading-block" role="status">
          <span className="wa-spinner" aria-hidden="true"></span>
          <p>Loading templates…</p>
        </div>
      ) : loadError ? (
        <div className="wa-error-block" role="alert">
          <strong>Something went wrong</strong>
          <p>{loadError}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="wa-table-card">
          <div className="wa-table-scroll">
            <table className="wa-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Category</th>
                  <th>Message body</th>
                  <th>Variables</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredTemplates.map((template) => {
                  const variables = extractVariables(template.body);

                  return (
                    <tr key={template.id}>
                      <td>
                        <strong className="wa-cell-primary">
                          {template.name}
                        </strong>
                        <span className="wa-cell-secondary">
                          {template.id} · {template.language.toUpperCase()}
                        </span>
                      </td>

                      <td>
                        <span className="wa-category-tag">
                          {template.category}
                        </span>
                      </td>

                      <td>
                        <span className="wa-body-preview">
                          {template.body.split("\n")[0]}
                        </span>
                      </td>

                      <td>
                        <span className="wa-var-count">
                          {variables.length}
                        </span>
                      </td>

                      <td>
                        <span
                          className={`wa-status-badge ${template.status.toLowerCase()}`}
                        >
                          {template.status}
                        </span>
                      </td>

                      <td>
                        <span className="wa-cell-secondary">
                          {template.updatedAt}
                        </span>
                        <span className="wa-cell-muted">
                          by {template.createdBy}
                        </span>
                      </td>

                      <td>
                        <div className="wa-row-actions">
                          <button
                            type="button"
                            className="view-button"
                            onClick={() =>
                              setPreviewTemplate(template)
                            }
                          >
                            Preview
                          </button>

                          {canManage && (
                            <>
                              <button
                                type="button"
                                className="view-button"
                                onClick={() => {
                                  setEditingTemplate(template);
                                  setEditorOpen(true);
                                }}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="view-button"
                                onClick={(event) =>
                                  handleDuplicate(template, event)
                                }
                                disabled={busy}
                              >
                                Duplicate
                              </button>

                              <button
                                type="button"
                                className="view-button danger"
                                onClick={() => setDeleteTarget(template)}
                                disabled={busy}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredTemplates.length === 0 && (
                  <tr>
                    <td colSpan="7" className="wa-empty-cell">
                      {templates.length === 0
                        ? "No templates yet. Create your first template to get started."
                        : "No templates match your current filters."}

                      {!canManage && templates.length === 0 && (
                        <span className="wa-empty-sub">
                          Template management requires admin access.
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TemplateEditor
        open={editorOpen}
        initial={editingTemplate}
        categories={categories}
        onClose={() => setEditorOpen(false)}
        onSave={async (editing, payload) => {
          const saved = await handleSave(editing, payload);

          if (editing) {
            await handleUpdated(saved);
          } else {
            await handleCreated(saved);
          }

          return saved;
        }}
      />

      {previewTemplate && (
        <div
          className="wa-modal-overlay"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="wa-modal wa-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wa-modal-header">
              <div>
                <span className="section-label">PREVIEW</span>
                <h2 id="template-preview-title">
                  {previewTemplate.name}
                </h2>

                <p>
                  {previewTemplate.category} ·{" "}
                  {previewTemplate.language.toUpperCase()} ·{" "}
                  {previewTemplate.status}
                </p>
              </div>

              <button
                type="button"
                className="wa-modal-close"
                onClick={() => setPreviewTemplate(null)}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>

            <TemplatePreview
              body={previewTemplate.body}
              category={previewTemplate.category}
            />

            <div className="wa-modal-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() => setPreviewTemplate(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="wa-modal-overlay"
          onClick={() => !busy && setDeleteTarget(null)}
        >
          <div
            className="wa-modal wa-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-template-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="wa-modal-header">
              <div>
                <span className="section-label">DELETE TEMPLATE</span>
                <h2 id="delete-template-title">Delete this template?</h2>
                <p>
                  "{deleteTarget.name}" will be removed permanently. This
                  action cannot be undone.
                </p>
              </div>
            </div>

            <div className="wa-modal-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-action danger"
                onClick={handleDelete}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateManagerPage;