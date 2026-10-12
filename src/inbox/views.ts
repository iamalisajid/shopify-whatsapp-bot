import type { Conversation, Label, Message, Order } from "@prisma/client";

export type ConversationListItem = Conversation & {
  labels: Array<{ label: Label }>;
  messages: Message[];
  _count: { messages: number };
};

export type ConversationDetail = Conversation & {
  labels: Array<{ label: Label }>;
  messages: Message[];
  orders: Order[];
};

const CSS = /* css */ `
  :root {
    --bg: #f6f6f4;
    --panel: #ffffff;
    --border: #e5e7eb;
    --muted: #6b7280;
    --text: #111827;
    --accent: #128c7e;
    --accent-soft: #dcf8c6;
    --danger: #ef4444;
    --warn: #f59e0b;
    --good: #10b981;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); }
  a { color: inherit; text-decoration: none; }
  .app { display: grid; grid-template-columns: 360px 1fr; height: 100vh; }
  .sidebar { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
  .sidebar header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .brand { font-weight: 700; }
  .filters { display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .filter { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); font-size: 12px; background: white; cursor: pointer; }
  .filter.active { background: var(--accent); color: white; border-color: var(--accent); }
  .conv-list { overflow-y: auto; flex: 1; min-height: 0; }
  .conv { display: block; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .conv:hover { background: #fafafa; }
  .conv.active { background: #eef2ff; }
  .conv .row1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .conv .name { font-weight: 600; }
  .conv .time { font-size: 11px; color: var(--muted); }
  .conv .preview { color: var(--muted); font-size: 13px; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badges { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
  .badge { font-size: 10px; padding: 2px 8px; border-radius: 999px; color: white; }
  .status-NEW { background: #6b7280; }
  .status-AWAITING_CONFIRMATION { background: var(--warn); }
  .status-CONFIRMED { background: var(--good); }
  .status-NEEDS_HUMAN { background: var(--danger); }
  .status-RESOLVED { background: #9ca3af; }
  .main { display: flex; flex-direction: column; min-height: 0; }
  .empty { display: flex; flex: 1; align-items: center; justify-content: center; color: var(--muted); }
  .thread-header { padding: 14px 20px; border-bottom: 1px solid var(--border); background: var(--panel); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .thread-header .who { font-weight: 600; }
  .thread-header .actions { display: flex; gap: 8px; }
  button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: white; cursor: pointer; }
  button.primary { background: var(--accent); color: white; border-color: var(--accent); }
  button.danger { background: var(--danger); color: white; border-color: var(--danger); }
  .thread-body { flex: 1; display: grid; grid-template-columns: 1fr 320px; min-height: 0; }
  .messages { padding: 20px; overflow-y: auto; background: #efeae2; min-height: 0; }
  .msg { max-width: 70%; padding: 8px 12px; border-radius: 10px; margin-bottom: 8px; word-wrap: break-word; white-space: pre-wrap; box-shadow: 0 1px 1px rgba(0,0,0,0.05); position: relative; }
  .msg .meta { display: block; font-size: 10px; color: #6b7280; margin-top: 4px; }
  .msg.IN { background: white; }
  .msg.OUT { background: var(--accent-soft); margin-left: auto; }
  .msg.OUT.HUMAN { background: #c8e6c9; }
  .msg.OUT.SYSTEM { background: #f3f4f6; font-style: italic; }
  .msg img { max-width: 100%; border-radius: 6px; margin-bottom: 4px; }
  .order-card { padding: 16px; background: var(--panel); border-left: 1px solid var(--border); overflow-y: auto; }
  .order-card h3 { margin-top: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .order { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .order .name { font-weight: 600; font-size: 15px; }
  .order .total { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .order ul { padding-left: 18px; margin: 8px 0 0; font-size: 13px; }
  .composer { display: flex; gap: 8px; padding: 12px; background: var(--panel); border-top: 1px solid var(--border); }
  .composer textarea { flex: 1; resize: none; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); font: inherit; min-height: 44px; max-height: 160px; }
  .toast { position: fixed; bottom: 16px; right: 16px; background: #111827; color: white; padding: 10px 14px; border-radius: 8px; opacity: 0; transition: opacity 0.2s; }
  .toast.show { opacity: 1; }
  .pulse { animation: pulse 1.4s ease-out infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); } 100% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); } }
`;

const FILTERS = [
  { id: "needs_human", label: "Needs Human" },
  { id: "awaiting", label: "Awaiting" },
  { id: "confirmed", label: "Confirmed" },
  { id: "all", label: "All" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

const SCRIPT = /* javascript */ `
(function() {
  function timeAgo(iso) {
    var d = new Date(iso); var diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return Math.floor(diff) + 's';
    if (diff < 3600) return Math.floor(diff/60) + 'm';
    if (diff < 86400) return Math.floor(diff/3600) + 'h';
    return d.toLocaleDateString();
  }
  document.querySelectorAll('[data-time]').forEach(function(el) {
    el.textContent = timeAgo(el.getAttribute('data-time'));
  });

  var es = new EventSource('/inbox/events');
  es.addEventListener('human-needed', function(ev) {
    showToast('Human needed: ' + JSON.parse(ev.data).customerPhone);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('WhatsApp: human needed', { body: JSON.parse(ev.data).customerPhone });
    }
    setTimeout(function() { window.location.reload(); }, 800);
  });
  es.addEventListener('message', function() {
    var convId = window.location.pathname.split('/').pop();
    if (convId && document.getElementById('messages')) {
      fetch('/inbox/' + convId + '/messages').then(function(r) { return r.text(); }).then(function(html) {
        var el = document.getElementById('messages'); el.innerHTML = html; el.scrollTop = el.scrollHeight;
      });
    }
  });
  es.addEventListener('status', function() { /* visual refresh handled by reload on next click */ });

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  function showToast(t) {
    var el = document.getElementById('toast'); if (!el) return;
    el.textContent = t; el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 3000);
  }

  var ml = document.getElementById('messages'); if (ml) ml.scrollTop = ml.scrollHeight;

  var ta = document.querySelector('.composer textarea');
  if (ta) {
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ta.form.requestSubmit();
      }
    });
  }
})();
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function layout(opts: {
  filter: FilterId;
  conversations: ConversationListItem[];
  selectedId?: string;
  detail?: ConversationDetail;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Inbox</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="app">
    ${sidebar(opts.filter, opts.conversations, opts.selectedId)}
    <main class="main">
      ${opts.detail ? threadView(opts.detail) : `<div class="empty">Select a conversation</div>`}
    </main>
  </div>
  <div id="toast" class="toast"></div>
  <script>${SCRIPT}</script>
</body>
</html>`;
}

function sidebar(
  filter: FilterId,
  conversations: ConversationListItem[],
  selectedId?: string,
): string {
  return `<aside class="sidebar">
    <header><span class="brand">📥 Inbox</span></header>
    <nav class="filters">
      ${FILTERS.map(
        (f) =>
          `<a class="filter ${f.id === filter ? "active" : ""}" href="/inbox?filter=${f.id}">${f.label}</a>`,
      ).join("")}
    </nav>
    <div class="conv-list">
      ${conversations
        .map((c) => {
          const last = c.messages[0];
          const preview = last ? last.body.replace(/\n/g, " ").slice(0, 80) : "(no messages)";
          const name = escapeHtml(c.customerName ?? c.customerPhone);
          const labels = c.labels
            .map((cl) => `<span class="badge" style="background:${cl.label.color}">${escapeHtml(cl.label.name)}</span>`)
            .join("");
          const isUrgent = c.status === "NEEDS_HUMAN";
          return `<a class="conv ${selectedId === c.id ? "active" : ""}" href="/inbox/${c.id}?filter=${filter}">
            <div class="row1">
              <span class="name">${name}</span>
              <span class="time" data-time="${c.lastMessageAt.toISOString()}"></span>
            </div>
            <div class="preview">${escapeHtml(preview)}</div>
            <div class="badges">
              <span class="badge status-${c.status} ${isUrgent ? "pulse" : ""}">${c.status.replace(/_/g, " ")}</span>
              ${labels}
            </div>
          </a>`;
        })
        .join("")}
      ${conversations.length === 0 ? `<div style="padding:20px;color:var(--muted)">No conversations</div>` : ""}
    </div>
  </aside>`;
}

function threadView(d: ConversationDetail): string {
  const name = escapeHtml(d.customerName ?? d.customerPhone);
  const phone = escapeHtml(d.customerPhone);
  return `
    <header class="thread-header">
      <div>
        <div class="who">${name}</div>
        <div style="color:var(--muted);font-size:12px">${phone} · <span class="badge status-${d.status}">${d.status.replace(/_/g, " ")}</span></div>
      </div>
      <div class="actions">
        ${
          d.aiPaused
            ? `<form method="post" action="/inbox/${d.id}/resume-ai" style="display:inline">
                 <button class="primary" type="submit">Resume AI</button>
               </form>`
            : `<form method="post" action="/inbox/${d.id}/pause-ai" style="display:inline">
                 <button type="submit">Pause AI</button>
               </form>`
        }
        ${
          d.status !== "RESOLVED"
            ? `<form method="post" action="/inbox/${d.id}/resolve" style="display:inline">
                 <button type="submit">Mark resolved</button>
               </form>`
            : ""
        }
      </div>
    </header>
    <div class="thread-body">
      <div id="messages" class="messages">${renderMessages(d.messages)}</div>
      ${renderOrderCard(d.orders)}
    </div>
    <form class="composer" method="post" action="/inbox/${d.id}/reply">
      <textarea name="body" placeholder="Type a reply… (⌘/Ctrl + Enter to send)" required></textarea>
      <button class="primary" type="submit">Send</button>
    </form>
  `;
}

export function renderMessages(messages: Message[]): string {
  return messages
    .map((m) => {
      const cls = `msg ${m.direction} ${m.sender}`;
      const time = new Date(m.createdAt).toLocaleString();
      const senderTag = m.sender !== "CUSTOMER" ? `${m.sender.toLowerCase()} · ` : "";
      const img = m.mediaUrl ? `<img src="${escapeHtml(m.mediaUrl)}" alt="" />` : "";
      return `<div class="${cls}">${img}${escapeHtml(m.body)}<span class="meta">${senderTag}${escapeHtml(time)}</span></div>`;
    })
    .join("");
}

function renderOrderCard(orders: Order[]): string {
  if (orders.length === 0) {
    return `<aside class="order-card"><h3>Orders</h3><p style="color:var(--muted);font-size:13px">None on file.</p></aside>`;
  }
  return `<aside class="order-card">
    <h3>Orders</h3>
    ${orders
      .map((o) => {
        let items: Array<{ title: string; quantity: number; price: string; image?: string | null }> = [];
        try {
          items = JSON.parse(o.lineItems);
        } catch {
          // ignore
        }
        const status = o.confirmedAt ? "CONFIRMED" : "Awaiting";
        const color = o.confirmedAt ? "var(--good)" : "var(--warn)";
        return `<div class="order">
          <div class="name">${escapeHtml(o.shopifyOrderName)}</div>
          <div class="total">${escapeHtml(o.currency)} ${escapeHtml(o.totalPrice)} · <span style="color:${color}">${status}</span></div>
          <ul>
            ${items
              .map(
                (it) =>
                  `<li>${it.quantity}× ${escapeHtml(it.title)} (${escapeHtml(it.price)})</li>`,
              )
              .join("")}
          </ul>
        </div>`;
      })
      .join("")}
  </aside>`;
}
