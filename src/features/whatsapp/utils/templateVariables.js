// Template variable specs, safe resolution and WhatsApp time formatting.

export const TEMPLATE_VARIABLES = [
  { key: "patient_name", label: "Patient Name", sample: "Kavita Joshi" },
  { key: "doctor_name", label: "Doctor Name", sample: "Dr. Sunita Rao" },
  {
    key: "appointment_date",
    label: "Appointment Date",
    sample: "21 Sep 2026",
  },
  {
    key: "appointment_time",
    label: "Appointment Time",
    sample: "5:15 PM",
  },
  { key: "department", label: "Department", sample: "Cardiology" },
  { key: "hospital_name", label: "Hospital Name", sample: "MediOS Hospital" },
  {
    key: "report_link",
    label: "Report Link",
    sample: "https://reports.medios.in/RPT-20419",
  },
];

// Resolves {{variable}} tokens in a template body.
// Uses supplied values when available, otherwise falls back to realistic
// sample values so previews always render cleanly. Tokens that are unknown or
// empty remain untouched in the output.
export function resolveTemplate(body, values = {}) {
  const safeValues = values || {};

  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (safeValues[key] !== undefined && safeValues[key] !== null && safeValues[key] !== "") {
      return safeValues[key];
    }

    const spec = TEMPLATE_VARIABLES.find((variable) => variable.key === key);

    return spec ? spec.sample : match;
  });
}

// Returns the keys of every {{variable}} present in a body.
export function extractVariables(body) {
  const keys = [];
  const pattern = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  let match = pattern.exec(body);

  while (match) {
    if (!keys.includes(match[1])) {
      keys.push(match[1]);
    }

    match = pattern.exec(body);
  }

  return keys;
}

// Returns the keys of every {{variable}} that is NOT a known template
// variable. Used to keep template bodies aligned with the approved set.
export function extractUnknownVariables(body) {
  const known = TEMPLATE_VARIABLES.map((variable) => variable.key);
  const unknown = [];
  const pattern = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  let match = pattern.exec(body);

  while (match) {
    if (!known.includes(match[1]) && !unknown.includes(match[1])) {
      unknown.push(match[1]);
    }

    match = pattern.exec(body);
  }

  return unknown;
}

const HOUR = 3600000;

const pad = (n) => String(n).padStart(2, "0");

export function formatClock(date = new Date()) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;

  return `${display}:${pad(minutes)} ${suffix}`;
}

export function formatConversationListTime(iso) {
  const date = new Date(iso);
  const nowDate = new Date();

  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  ).getTime();

  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  const diffDays = Math.round((startOfToday - startOfDate) / (24 * HOUR));

  if (diffDays === 0) {
    return formatClock(date);
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

// "Today" / "Yesterday" / "12 Sep", plus the day name when > 2 days old.
export function formatThreadDayLabel(iso) {
  const date = new Date(iso);
  const nowDate = new Date();

  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  ).getTime();

  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  const diffDays = Math.round((startOfToday - startOfDate) / (24 * HOUR));

  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function formatMessageTime(iso) {
  return formatClock(new Date(iso));
}

export function formatDateTime(iso) {
  const date = new Date(iso);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initialsOf(name = "") {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 0) {
    return "?";
  }

  const first = parts[0]?.[0] || "";
  const last = parts[parts.length - 1]?.[0] || "";

  return `${first}${last}`.toUpperCase();
}