import React from "react";
import {
  resolveTemplate,
  extractVariables,
} from "../utils/templateVariables";

// Preview of a template body rendered as a WhatsApp-style message with
// realistic sample variables, plus the raw body and detected variables.
const TemplatePreview = ({ body, category, values }) => {
  const resolved = resolveTemplate(body, values);
  const variables = extractVariables(body);

  return (
    <div className="wa-template-preview">
      <div className="wa-preview-label">
        Preview with sample data
      </div>

      <div className="wa-preview-phone">
        <div className="wa-message-row incoming">
          <div className="wa-message-bubble">
            <p className="wa-preview-body">
              {resolved.split("\n").map((line, index) => (
                <React.Fragment key={index}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </p>
          </div>
        </div>
      </div>

      {category && (
        <div className="wa-preview-meta">
          <span className="wa-mini-status approved">Category</span>
          <span>{category}</span>
        </div>
      )}

      <div className="wa-preview-variables">
        <span className="wa-preview-variables-label">
          {variables.length > 0
            ? `${variables.length} variable${variables.length > 1 ? "s" : ""} used`
            : "No variables used"}
        </span>

        <div className="wa-variable-chips">
          {variables.map((variable) => (
            <span key={variable} className="wa-variable-chip">
              {`{{${variable}}}`}
            </span>
          ))}

          {variables.length === 0 && (
            <span className="wa-preview-note">
              This template is a plain message with no dynamic fields.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplatePreview;