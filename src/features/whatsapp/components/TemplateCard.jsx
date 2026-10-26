import React, { useEffect, useRef, useState } from "react";
import { extractVariables } from "../utils/templateVariables";

const TemplateCard = ({
  template,
  canManage,
  busy,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const variables = extractVariables(template.body);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const closeOnOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("resize", closeOnOutside);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("resize", closeOnOutside);
    };
  }, [menuOpen]);

  const run = (handler) => {
    setMenuOpen(false);
    handler();
  };

  return (
    <article className="wa-template-card">
      <div className="wa-template-card-head">
        <div className="wa-template-card-title-row">
          <h3 title={template.name}>{template.name}</h3>

          <span
            className={`wa-status-badge ${template.status.toLowerCase()}`}
          >
            {template.status}
          </span>
        </div>

        <div className="wa-template-card-meta">
          <span className="wa-category-tag">{template.category}</span>
          <span>{template.id}</span>
          <span aria-hidden="true">·</span>
          <span>{template.language.toUpperCase()}</span>
        </div>
      </div>

      <div className="wa-template-card-body">
        <p className="wa-body-preview">{template.body}</p>
      </div>

      <div className="wa-template-card-foot">
        <span className="wa-template-updated" title={`Updated ${template.updatedAt} by ${template.createdBy}`}>
          Updated {template.updatedAt}
        </span>

        <div className="wa-template-card-actions">
          <button
            type="button"
            className="view-button"
            onClick={onPreview}
          >
            Preview
          </button>

          {canManage && (
            <div className="wa-menu-container" ref={menuRef}>
              <button
                type="button"
                className="wa-more-button"
                aria-label="Template actions"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
                disabled={busy}
              >
                ⋯
              </button>

              {menuOpen && (
                <div className="wa-menu-popover">
                  <button
                    type="button"
                    onClick={() => run(onPreview)}
                  >
                    Preview
                  </button>

                  <button type="button" onClick={() => run(onEdit)}>
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      setMenuOpen(false);
                      onDuplicate(event);
                    }}
                  >
                    Duplicate
                  </button>

                  <button
                    type="button"
                    className="danger"
                    onClick={() => run(onDelete)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default TemplateCard;