import React, { useEffect, useRef, useState } from "react";
import { whatsappApi } from "../../../services/whatsappApi";
import MessageThread from "../components/MessageThread";
import Composer from "../components/Composer";
import "../styles/inbox.css";
import "../styles/live.css";

export default function LiveInboxPage() {
  const [identity, setIdentity] = useState(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageTotal, setMessageTotal] = useState(0);
  const [draft, setDraft] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const pendingSend = useRef(null);
  const selectionVersion = useRef(0);
  const can = permission => identity?.permissions?.includes(permission);

  const disconnect = () => {
    whatsappApi.disconnect(); setIdentity(null); setItems([]); setSelected(null);
    setMessages([]); setDraft(""); setOffset(0); pendingSend.current = null;
    selectionVersion.current += 1;
  };
  const report = err => {
    if (err.name === "AbortError") return;
    if (err.status === 401) disconnect();
    setError(err.message);
  };
  useEffect(() => () => whatsappApi.disconnect(), []);

  // Serial polling, bounded requests and cancellation avoid overlapping refreshes.
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const page = await whatsappApi.conversations(offset, controller.signal);
        if (controller.signal.aborted) return;
        setItems(page.items); setTotal(page.total);
        setSelected(current => current ? page.items.find(item => item.id === current.id) || current : null);
      } catch (err) { if (!controller.signal.aborted) report(err); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 5000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [identity, offset]);

  useEffect(() => {
    if (!identity || !selected) return;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const page = await whatsappApi.messages(selected.id, 0, controller.signal);
        if (controller.signal.aborted) return;
        setMessages(current => {
          const merged = new Map(current.map(m => [m.id, m]));
          page.items.forEach(m => merged.set(m.id, m));
          return [...merged.values()].sort((a, b) => new Date(a.at) - new Date(b.at));
        });
        setMessageTotal(page.total);
      } catch (err) { if (!controller.signal.aborted) report(err); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [identity, selected?.id]);

  const connect = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { setIdentity(await whatsappApi.connect(token.trim())); setToken(""); }
    catch (err) { report(err); }
    finally { setBusy(false); }
  };
  const choose = async item => {
    if (sending || pendingSend.current) {
      setError("Confirm the pending send by retrying the same draft before changing conversations."); return;
    }
    selectionVersion.current += 1;
    setSelected(item); setMessages([]); setMessageTotal(0); setDraft(""); setError("");
    try {
      await whatsappApi.read(item.id);
      setItems(current => current.map(c => c.id === item.id ? { ...c, unreadCount: 0 } : c));
    } catch (err) { report(err); }
  };
  const send = async text => {
    if (!selected || sending || !can("whatsapp.inbox.reply") || !text.trim()) return;
    const id = selected.id;
    const trimmed = text.trim();
    if (pendingSend.current && (pendingSend.current.id !== id || pendingSend.current.text !== trimmed)) {
      setError("Retry the unchanged pending draft to confirm its outcome first."); return;
    }
    const operation = pendingSend.current || { id, text: trimmed, key: crypto.randomUUID() };
    pendingSend.current = operation; setSending(true); setError("");
    try {
      const message = await whatsappApi.send(id, trimmed, operation.key);
      setMessages(current => [...current.filter(m => m.id !== message.id), message]);
      setDraft(""); pendingSend.current = null;
    } catch (err) {
      // A definitive rejection can be corrected; a timeout/5xx retains the key.
      if (err.status >= 400 && err.status < 500) pendingSend.current = null;
      report(err);
    } finally { setSending(false); }
  };
  const loadOlder = async () => {
    const version = selectionVersion.current;
    setHistoryBusy(true);
    try {
      const page = await whatsappApi.messages(selected.id, messages.length);
      if (version !== selectionVersion.current) return;
      setMessages(current => {
        const merged = new Map(current.map(m => [m.id, m]));
        page.items.forEach(m => merged.set(m.id, m));
        return [...merged.values()].sort((a,b) => new Date(a.at) - new Date(b.at));
      });
      setMessageTotal(page.total);
    } catch (err) { if (version === selectionVersion.current) report(err); }
    finally { setHistoryBusy(false); }
  };
  const toggleStatus = async () => {
    if (busy) return;
    const id = selected.id;
    setBusy(true);
    try {
      const updated = await whatsappApi.status(id, selected.status === "resolved" ? "open" : "resolved");
      setSelected(current => current?.id === id ? updated : current);
      setItems(current => current.map(c => c.id === id ? updated : c));
    } catch (err) { report(err); }
    finally { setBusy(false); }
  };

  const windowOpen = selected?.lastInboundAt && Date.now() - new Date(selected.lastInboundAt).getTime() < 86400000;
  return <div className="wa-live-page">
    <div className="page-title-row"><div><h1>WhatsApp Inbox</h1><p>Backend connection · text messaging</p></div>
      {identity && <button className="secondary-action" onClick={disconnect} disabled={sending}>Disconnect session</button>}
    </div>
    {error && <div className="wa-error-block" role="alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    {!identity ? <form className="wa-live-connect" onSubmit={connect}>
      <h2>Connect a backend session</h2>
      <p>Use a MediOS backend access token or a local development token. It stays in memory and is cleared on refresh. Mock login does not authenticate this API.</p>
      <label htmlFor="wa-access-token">Backend access token</label>
      <input id="wa-access-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} required />
      <button className="primary-action" disabled={busy}>{busy ? "Connecting…" : "Connect"}</button>
    </form> : <>
      <p>Hospital: {identity.hospitalId} · Branch: {identity.branchId}</p>
      <div className="wa-live-grid">
        <aside className="wa-live-conversations" aria-label="Conversations">
          <p>{total} conversations</p>
          {!items.length && <p>No conversations yet. Incoming WhatsApp messages appear here.</p>}
          {items.map(item => <button key={item.id} className={selected?.id === item.id ? "selected" : ""} onClick={() => choose(item)}>
            <strong>{item.displayName}</strong><span>{item.phone}</span><small>{item.patientId ? "Patient link exists; CRM details pending" : "Unmatched patient"} · {item.status} · {item.unreadCount} unread</small>
          </button>)}
          <div className="wa-live-pagination"><button disabled={!offset} onClick={() => setOffset(Math.max(0,offset-30))}>Previous</button><button disabled={offset+30>=total} onClick={() => setOffset(offset+30)}>Next</button></div>
        </aside>
        <section className="wa-live-thread" aria-label="Messages">
          {!selected ? <p>Select a conversation.</p> : <>
            <div className="wa-live-heading"><strong>{selected.displayName} · {selected.phone}</strong>
              {can("whatsapp.inbox.resolve") && <button onClick={toggleStatus} disabled={busy}>{selected.status === "resolved" ? "Reopen" : "Resolve"}</button>}
            </div>
            {messages.length<messageTotal && <button onClick={loadOlder} disabled={historyBusy}>{historyBusy ? "Loading…" : "Load older messages"}</button>}
            <MessageThread conversation={{ id: selected.id, messages }} />
            {!windowOpen && <p role="status">The text reply window is closed. Approved template sending is not connected yet.</p>}
            <Composer value={draft} onChange={setDraft} onSend={send} disabled={sending || (!windowOpen && !pendingSend.current) || !can("whatsapp.inbox.reply")} />
          </>}
        </section>
      </div>
    </>}
  </div>;
}
