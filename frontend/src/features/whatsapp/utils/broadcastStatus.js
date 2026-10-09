// Normalizes the stored broadcast status into a display label and a stable
// CSS class for the WhatsApp status badges. Legacy seed data used "sent",
// so both "sent" and "completed" map to the Completed badge.

const STATUS_LABELS = {
  completed: "Completed",
  sent: "Completed",
  sending: "Sending",
  failed: "Failed",
  draft: "Draft",
};

export function broadcastStatusKey(status) {
  return status === "sent" ? "completed" : status || "draft";
}

export function broadcastStatusLabel(status) {
  return STATUS_LABELS[broadcastStatusKey(status)] || "Unknown";
}

export function broadcastStatusClass(status) {
  return broadcastStatusKey(status);
}