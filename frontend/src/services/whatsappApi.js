// Access tokens live in memory only. Meta credentials never enter this client.
let accessToken = null;
export const isLiveWhatsApp = import.meta.env.VITE_WHATSAPP_MODE === "api";
const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api").replace(/\/$/, "");

export class WhatsAppApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, { method = "GET", body, key, token = accessToken, signal } = {}) {
  if (!token) throw new WhatsAppApiError("Connect a backend session first.", 401);
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method, signal: signal || AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new WhatsAppApiError(method === "POST"
      ? "The send request could not be confirmed. Retry the same draft to check its existing request; do not create a duplicate."
      : "Cannot reach the backend. Check its address and connection.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message;
    throw new WhatsAppApiError(Array.isArray(message) ? message.join(" ") : message || `Request failed (${response.status}).`, response.status);
  }
  return data;
}

export const whatsappApi = {
  async connect(token) {
    const identity = await request("/whatsapp/session", { token });
    accessToken = token;
    return identity;
  },
  disconnect() { accessToken = null; },
  conversations: (offset = 0, signal) => request(`/whatsapp/conversations?offset=${offset}&limit=30`, { signal }),
  messages: (id, offset = 0, signal) => request(`/whatsapp/conversations/${encodeURIComponent(id)}/messages?offset=${offset}&limit=30`, { signal }),
  send: (id, text, key) => request(`/whatsapp/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: { text }, key }),
  read: (id) => request(`/whatsapp/conversations/${encodeURIComponent(id)}/read`, { method: "PATCH", body: { unreadCount: 0 } }),
  status: (id, status) => request(`/whatsapp/conversations/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
};
