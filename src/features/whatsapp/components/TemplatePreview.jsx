import React from "react";
import {
  resolveTemplate,
  extractVariables,
} from "../utils/templateVariables";

// Preview of a template body rendered as a WhatsApp-style chat card with
// realistic sample variables, plus the detected variables used in the body.
const TemplatePreview = ({ body = "", category, values }) => {
  const resolved = resolveTemplate(body, values);
  const variables = extractVariables(body);

  return (
    <div className="wa-template-preview">
      <span className="wa-preview-label">Live preview · sample patient data</span>

      <div className="wa-preview-phone">
        <div className="wa-preview-phone-head">
          <span className="wa-preview-phone-avatar" aria-hidden="true">
            M
          </span>
          <div>
            <strong>MediOS Chat</strong>
            <small>WhatsApp Business API</small>
          </div>
        </div>

        <div className="wa-preview-phone-body">
          <div className="wa-preview-chat-row">
            <p className={`wa-preview-chat-text${resolved ? "" : " is-empty"}`}>
              {resolved || "Your message will appear here after you type."}
            </p>
            <span className="wa-preview-chat-time">now</span>
          </div>
        </div>
      </div>

      <div className="wa-preview-meta">
        {category && (
          <span className="wa-preview-meta-category">{category}</span>
        )}

        {variables.length > 0 && (
          <>
            {category && <span className="wa-dot" aria-hidden="true"></span>}
            <span>
              {variables.length === 1
                ? "1 variable"
                : `${variables.length} variables`}
            </span>
          </>
        )}
      </div>

      {variables.length > 0 && (
        <div className="wa-preview-variables">
          <span className="wa-preview-variables-label">Variables used</span>

          <div className="wa-variable-chips">
            {variables.map((variable) => (
              <span key={variable} className="wa-variable-chip">
                {`{{${variable}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {variables.length === 0 && resolved && (
        <div className="wa-preview-variables">
          <span className="wa-preview-note">
            This template is a plain message with no dynamic fields.
          </span>
        </div>
      )}
    </div>
  );
};

export default TemplatePreview;