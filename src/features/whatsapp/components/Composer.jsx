import React, { forwardRef, useCallback } from "react";

const Composer = forwardRef(
  (
    {
      value,
      onChange,
      onSend,
      onToggleQuickReplies,
      openQuickReplies,
      disabled = false,
      placeholder = "Type a message…",
      quickReplyCount = 0,
    },
    ref
  ) => {
    const handleKeyDown = useCallback(
      (event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          value.trim() &&
          !disabled
        ) {
          event.preventDefault();
          onSend(value);
        }
      },
      [value, disabled, onSend]
    );

    return (
      <div className="wa-composer">
        {quickReplyCount > 0 && (
          <button
            type="button"
            className={`wa-quickreply-toggle ${openQuickReplies ? "open" : ""}`}
            onClick={onToggleQuickReplies}
            aria-expanded={openQuickReplies}
            disabled={disabled}
          >
            Quick replies
          </button>
        )}

        <div className="wa-composer-row">
          <textarea
            ref={ref}
            rows={2}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="Message"
            disabled={disabled}
          />

          <button
            type="button"
            className="wa-send-button"
            onClick={() => onSend(value)}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
          >
            Send
          </button>
        </div>

        <p className="wa-composer-hint">
          Press Enter to send · Shift + Enter for a new line
        </p>
      </div>
    );
  }
);

export default Composer;