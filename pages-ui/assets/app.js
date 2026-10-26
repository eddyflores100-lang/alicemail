// ═══════════════════════════════════════════════════════════════
// ALICE — Dashboard (GitHub Pages) · vanilla JS, sin dependencias
// Lee state.json del repo privado alice-data vía GitHub Contents API
// y escribe comandos / CSV / mailboxes.json hacia la VM.
// ═══════════════════════════════════════════════════════════════
'use strict';

const LS = {
  get repo() { return localStorage.getItem('alice_repo') || ''; },
  set repo(v) { localStorage.setItem('alice_repo', v); },
  get token() { return localStorage.getItem('alice_token') || ''; },
  set token(v) { localStorage.setItem('alice_token', v); },
  get interval() { return parseInt(localStorage.getItem('alice_interval') || '45', 10); },
  set interval(v) { localStorage.setItem('alice_interval', String(v)); },
};

let ST = null;          // último state.json parseado
let pollTimer = null;
let currentView = 'panel';
let cmdLogCache = [];

// ── Utilidades ──
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', Boolean(isErr));
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3800);
}

function timeAgo(isoStr) {
  if (!isoStr) return '—';
  const min = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function connected() { return Boolean(LS.repo && LS.token); }

// ── Cliente GitHub (Contents API) ──
async function ghFetch(path, acceptRaw) {
  const url = `https://api.github.com/repos/${LS.repo}/contents/${path}?ref=main&t=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LS.token}`,
      Accept: acceptRaw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (res.status === 404) return { status: 404, data: null };
  if (res.status === 200) return { status: 200, data: acceptRaw ? await res.text() : await res.json() };
  const body = await res.json().catch(() => ({}));
  throw new Error(`GitHub ${res.status}: ${body.message || res.statusText}`);
}

async function ghPut(path, contentStr, message) {
  let sha = null;
  try {
    const cur = await ghFetch(path);
    if (cur.status === 200 && cur.data && cur.data.sha) sha = cur.data.sha;
  } catch (e) { /* no existe todavía */ }
  const res = await fetch(`https://api.github.com/repos/${LS.repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${LS.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(contentStr))),
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status !== 200 && res.status !== 201) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`GitHub ${res.status}: ${body.message || res.statusText}`);
  }
  return true;
}

async function refreshState(manual) {
  if (!connected()) { render(); return; }
  try {
    const r = await ghFetch('state.json', true);
    if (r.status === 200) {
      try { ST = JSON.parse(r.data); } catch { ST = null; }
    } else {
      ST = null;
    }
    setConnOk(true);
  } catch (err) {
    setConnOk(false, err.message);
    if (manual) toast('Error al leer estado: ' + err.message, true);
  }
  updateFoot();
  render();
  $('#lastUpdate').textContent = ST ? `act. ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'sin datos aún';
}

function setConnOk(ok, errMsg) {
  const pill = $('#connPill');
  pill.classList.toggle('ok', ok);
  $('#connText').textContent = ok ? `Conectado · ${LS.repo.split('/')[0]}` : (errMsg ? 'Error de conexión' : 'Sin conectar');
  pill.title = errMsg || (ok ? `Repositorio ${LS.repo}` : 'Configura el token en ⚙️ Configuración');
}

function updateFoot() {
  const bar = $('#footQuotaBar'), txt = $('#footQuotaText');
  if (ST && ST.quota) {
    const cap = ST.quota.campaignCap || 0, sent = ST.quota.campaignSentToday || 0;
    txt.textContent = `${sent} / ${cap} correos hoy`;
    bar.style.width = cap ? `${Math.min(100, Math.round((sent / cap) * 100))}%` : '0%';
  } else {
    txt.textContent = '— / — hoy';
    bar.style.width = '0%';
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => refreshState(false), Math.max(15, LS.interval) * 1000);
}

// ── Router ──
const VIEWS = {
  panel:    { title: 'Panel', render: viewPanel },
  crm:      { title: 'CRM de leads', render: viewCrm },
  agentes:  { title: 'Agente IA', render: viewAgentes },
  buzones:  { title: 'Buzones', render: viewBuzones },
  promos:   { title: 'Promociones', render: viewPromos },
  comandos: { title: 'Consola de comandos', render: viewComandos },
  importar: { title: 'Importar leads', render: viewImportar },
  config:   { title: 'Configuración', render: viewConfig },
};

function route() {
  const hash = (location.hash || '#/panel').replace('#/', '');
  currentView = VIEWS[hash] ? hash : 'panel';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === currentView));
  $('#viewTitle').textContent = VIEWS[currentView].title;
  render();
  $('#sidebar').classList.remove('open');
}

function render() {
  $('#content').innerHTML = VIEWS[currentView].render();
  bindView();
}

// ═══════════════ VISTA: PANEL ═══════════════
function viewPanel() {
  if (!connected()) return setupGuide('Conecta el dashboard para ver tu ecosistema en vivo');
  if (!ST) return emptyState('El ecosistema aún no ha reportado estado.', 'La VM empuja state.json cada ~4 minutos. Arranca el motor en tu VM (ver Configuración) y vuelve en unos minutos.');

  const q = ST.quota || {};
  const k = ST.kpi || {};
  const bs = k.byStage || {};
  const eng = ST.engine || {};
  const cap = q.campaignCap || 0, sent = q.campaignSentToday || 0;
  const pct = cap ? Math.round((sent / cap) * 100) : 0;

  return `
  <div class="grid grid-kpi">
    <div class="card kpi hero-quota" style="grid-column: span 2;">
      <h3>Correos que puedes enviar hoy</h3>
      <div class="big">${esc(sent)} <small>/ ${esc(cap)}</small></div>
      <div class="bar" style="margin-top:10px"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="sub">Campaña: ${esc(q.campaignRemaining ?? '—')} disponibles · Warmup: ${esc(q.warmupToday ?? 0)} · Total enviado hoy: ${esc(q.totalToday ?? 0)}</div>
    </div>
    <div class="card kpi"><div class="num num-red">${esc(bs.CALIENTE ?? 0)}</div><div class="lbl">Leads calientes</div><div class="sub">${esc(((k.byTemp || {}).HOT ?? 0))} calificados HOT por la IA</div></div>
    <div class="card kpi"><div class="num num-blue">${esc(bs.FRIO ?? 0)}</div><div class="lbl">Leads fríos</div><div class="sub">${esc(k.leadsTotal ?? 0)} leads en total</div></div>
    <div class="card kpi"><div class="num">${esc(bs.RECHAZADO ?? 0)}</div><div class="lbl">Rechazados</div><div class="sub">suprimidos automáticamente</div></div>
    <div class="card kpi"><div class="num num-violet">${esc(k.opensToday ?? 0)}</div><div class="lbl">Aperturas hoy</div><div class="sub">${esc(k.repliesToday ?? 0)} respuestas · ${esc(k.bouncesToday ?? 0)} rebotes</div></div>
  </div>

  <div class="grid grid-2" style="margin-top:14px">
    <div class="card">
      <h3>Motor y agente</h3>
      <div class="mb-row"><div>
        <div class="mb-email">⚙️ Motor de envío ${eng.workerEnabled ? '<span class="badge badge-green">ACTIVO</span>' : '<span class="badge badge-red">PAUSADO</span>'}</div>
        <div class="mb-meta">Ventana humana ${esc(eng.window || '—')} · Tope global ${esc(eng.dailyCapGlobal ?? '—')}/día</div>
      </div></div>
      <div class="mb-row"><div>
        <div class="mb-email">🤖 Agente IA ${eng.agentEnabled ? '<span class="badge badge-green">ENCENDIDO</span>' : '<span class="badge badge-amber">APAGADO</span>'}</div>
        <div class="mb-meta">Autonomía: <b>${esc(eng.agentAutonomy || '—')}</b> · bandeja pendiente de clasificar: ${esc(k.inboxPending ?? 0)}</div>
      </div></div>
      ${ST.sync ? `<div class="mb-row"><div>
        <div class="mb-email">🛰️ Puente GitHub ↔ VM</div>
        <div class="mb-meta">Último push: ${timeAgo(ST.sync.lastPush)} · comandos procesados: ${esc(ST.sync.commandsProcessed ?? 0)} · imports: ${esc(ST.sync.importsProcessed ?? 0)}${ST.sync.lastError ? ` · <span style="color:var(--red)">${esc(ST.sync.lastError)}</span>` : ''}</div>
      </div></div>` : ''}
    </div>
    <div class="card">
      <h3>Actividad reciente del CRM</h3>
      <div class="feed">
        ${(((ST.crm || {}).recentMoves || []).slice(0, 10)).map((ev) => `
          <div class="feed-item">
            <span class="t">${timeAgo(ev.at)}</span>
            <span class="msg">${eventIcon(ev.type)} <b>${esc(ev.lead || '')}</b> — ${esc(ev.title)}${ev.detail ? ` <span class="muted">· ${esc(ev.detail)}</span>` : ''}</span>
          </div>`).join('') || '<div class="kb-empty">Sin movimientos todavía</div>'}
      </div>
    </div>
  </div>

  <div class="grid grid-2" style="margin-top:14px">
    <div class="card">
      <h3>Cuota por buzón</h3>
      ${((q.byMailbox || []).length ? (q.byMailbox).map((m) => `
        <div class="mb-row">
          <div style="min-width:150px"><div class="mb-email">${esc(m.email)}</div><div class="mb-meta">${esc(m.displayName || '')}</div></div>
          <div class="mb-progress">
            <div class="bar"><div class="bar-fill" style="width:${m.campaignLimit ? Math.min(100, Math.round((m.campaignSent / m.campaignLimit) * 100)) : 0}%"></div></div>
            <span>campaña ${m.campaignSent}/${m.campaignLimit} · warmup ${m.warmupSent}/${m.warmupTarget}</span>
          </div>
        </div>`).join('') : '<div class="kb-empty">Aún no hay buzones verificados. Dalos de alta en Buzones.</div>')}
    </div>
    <div class="card">
      <h3>Últimas notificaciones (Telegram/WhatsApp)</h3>
      <div class="feed">
        ${((ST.notifications || []).slice(0, 8)).map((n) => `
          <div class="feed-item">
            <span class="t">${timeAgo(n.at)}</span>
            <span class="msg">${n.status === 'SENT' ? '✅' : n.status === 'SKIPPED' ? '⏭️' : '⚠️'} <b>${esc(n.title)}</b></span>
          </div>`).join('') || '<div class="kb-empty">Sin notificaciones. Configura Telegram en el panel de la VM.</div>'}
      </div>
    </div>
  </div>`;
}

function eventIcon(type) {
  return { STAGE: '🔀', REENGAGE: '🔁', ANGLE: '🎯', REPLY: '💬', BOUNCE: '↩️', SENT: '📤', OPEN: '👀', IMPORT: '📥' }[type] || '•';
}

// ═══════════════ VISTA: CRM ═══════════════
function viewCrm() {
  if (!connected()) return setupGuide('El pipeline CRM vive en tu VM — conéctate para verlo');
  if (!ST) return emptyState('Sin estado del CRM todavía.', 'Cuando la VM reporte, verás aquí las columnas calientes / fríos / rechazados y cada movimiento.');

  const bs = (ST.kpi || {}).byStage || {};
  const cols = [
    { key: 'CALIENTE', cls: 'caliente', label: '🔥 Calientes' },
    { key: 'TIBIO', cls: 'tibio', label: '🌤 Tibios' },
    { key: 'FRIO', cls: 'frio', label: '❄️ Fríos' },
    { key: 'RECHAZADO', cls: 'rechazado', label: '🚫 Rechazados' },
  ];
  const extra = ['NUEVO', 'CONTACTADO', 'RECUPERADO'];

  return `
  <div class="section-title">
    <h2>Pipeline — catalogación automática del agente</h2>
    <span class="badge badge-dark">${esc((ST.kpi || {}).leadsTotal ?? 0)} leads</span>
  </div>
  <div class="kanban">
    ${cols.map((c) => `
      <div class="kb-col ${c.cls}">
        <div class="kb-head"><span class="name">${c.label}</span><span class="count">${esc(bs[c.key] ?? 0)}</span></div>
        <div class="kb-items">
          ${(((ST.crm || {}).recentMoves || []).filter((ev) => ev.title && ev.title.toLowerCase().includes(c.key.toLowerCase())).slice(0, 6)).map((ev) => `
            <div class="kb-item"><div class="email">${esc(ev.lead || '')}</div><div class="meta">${esc(ev.title)} · ${timeAgo(ev.at)}</div></div>`).join('') || '<div class="kb-empty">sin actividad reciente</div>'}
        </div>
      </div>`).join('')}
  </div>

  <div class="section-title"><h2>Otras etapas</h2></div>
  <div class="grid grid-3">
    ${extra.map((st) => `
      <div class="card kpi">
        <div class="num ${st === 'RECUPERADO' ? 'num-green' : ''}">${esc(bs[st] ?? 0)}</div>
        <div class="lbl">${st.charAt(0) + st.slice(1).toLowerCase()}</div>
      </div>`).join('')}
  </div>

  <div class="section-title"><h2>Timeline completo (últimos movimientos)</h2></div>
  <div class="card">
    <div class="feed">
      ${(((ST.crm || {}).recentMoves || [])).map((ev) => `
        <div class="feed-item">
          <span class="t">${timeAgo(ev.at)}</span>
          <span class="msg">${eventIcon(ev.type)} <b>${esc(ev.lead || '')}</b> — ${esc(ev.title)}${ev.detail ? ` <span class="muted">· ${esc(ev.detail)}</span>` : ''}</span>
        </div>`).join('') || '<div class="kb-empty">Sin movimientos todavía</div>'}
    </div>
  </div>

  <p class="muted" style="margin-top:14px;font-size:12.5px">🤖 El agente cataloga cada respuesta: interés → <b>CALIENTE</b>, sin interés → <b>RECHAZADO</b> (suprimido ${'90'} días), aperturas repetidas → reenvío con <b>otro enfoque</b> o <b>otra promoción</b>.</p>`;
}

// ═══════════════ VISTA: AGENTES ═══════════════
function viewAgentes() {
  if (!connected()) return setupGuide('El agente vive en la VM — conéctate para ver sus decisiones');
  if (!ST) return emptyState('Sin telemetría del agente todavía.', 'El agente se ejecuta cada ~90 s dentro de la VM: clasifica respuestas, cataloga leads y guarda el ecosistema.');

  const a = ST.agent || {};
  return `
  <div class="grid grid-kpi">
    <div class="card kpi">
      <h3>Estado</h3>
      <div class="num ${a.enabled ? 'num-green' : 'num-red'}">${a.enabled ? 'ACTIVO' : 'APAGADO'}</div>
      <div class="lbl">Autonomía: ${esc(a.autonomy || '—')}</div>
      <div class="sub">OBSERVE = solo observa · ASSIST = sugiere · AUTO = actúa y reporta</div>
    </div>
    <div class="card kpi">
      <h3>Clasificación IA</h3>
      <div class="num num-red">${esc(((ST.kpi || {}).byTemp || {}).HOT ?? 0)}</div>
      <div class="lbl">leads calientes detectados</div>
      <div class="sub">🌬️ ${esc(((ST.kpi || {}).byTemp || {}).WARM ?? 0)} tibios · ❄️ ${esc(((ST.kpi || {}).byTemp || {}).COLD ?? 0)} fríos</div>
    </div>
    <div class="card kpi">
      <h3>Bandeja por clasificar</h3>
      <div class="num num-amber">${esc(((ST.kpi || {}).inboxPending ?? 0))}</div>
      <div class="lbl">mensajes en cola</div>
      <div class="sub">el agente los revisa automáticamente</div>
    </div>
  </div>

  <div class="section-title"><h2>Diario de decisiones del agente</h2></div>
  <div class="card">
    <div class="feed">
      ${((a.events || [])).map((ev) => `
        <div class="feed-item">
          <span class="t">${timeAgo(ev.at)}</span>
          <span class="msg"><span class="lvl lvl-${esc(ev.level)}">${esc(ev.level)}</span>${esc(ev.message)}</span>
        </div>`).join('') || '<div class="kb-empty">Sin eventos todavía — el agente escribirá aquí cada decisión</div>'}
    </div>
  </div>`;
}

// ═══════════════ VISTA: BUZONES ═══════════════
function viewBuzones() {
  if (!connected()) return setupGuide('Da de alta tus buzones desde aquí o desde el panel de la VM');
  const mbs = ST ? ST.mailboxes || [] : [];
  return `
  <div class="section-title"><h2>Buzones de envío (en la VM)</h2><span class="badge badge-dark">${mbs.length} buzones</span></div>
  <div class="card">
    ${mbs.length ? mbs.map((m) => `
      <div class="mb-row">
        <div style="min-width:170px">
          <div class="mb-email">${esc(m.email)}</div>
          <div class="mb-meta">${esc(m.displayName || '')} · ${esc(m.provider)}</div>
        </div>
        <span class="badge ${m.status === 'ACTIVE' ? 'badge-green' : m.status === 'ERROR' ? 'badge-red' : 'badge-amber'}">${esc(m.status)}</span>
        ${m.verified ? '' : '<span class="badge badge-red">sin verificar</span>'}
        ${m.penaltyUntil ? '<span class="badge badge-amber">penalizado 48h</span>' : ''}
        <div class="mb-progress">
          <div class="bar"><div class="bar-fill" style="width:${m.campaignDailyLimit ? Math.min(100, Math.round((m.sentCampaignToday / m.campaignDailyLimit) * 100)) : 0}%"></div></div>
          <span>campaña ${m.sentCampaignToday}/${m.campaignDailyLimit} · warmup ${m.sentWarmupToday}/${m.warmupTarget}</span>
        </div>
      </div>
      ${m.lastError ? `<div class="mb-meta" style="padding:0 6px 8px;color:var(--red)">⚠️ ${esc(m.lastError)}</div>` : ''}
    `).join('') : '<div class="kb-empty">Aún no hay buzones. Usa el editor de abajo para darlos de alta sin tocar la VM.</div>'}
  </div>

  <div class="section-title"><h2>Alta de buzones vía mailboxes.json</h2></div>
  <div class="card">
    <p class="muted" style="margin-bottom:12px;font-size:12.5px">Pega un array JSON con tus buzones. La VM los detectará y los dará de alta automáticamente. Ejemplo:
    <span class="mono">[{"email":"tu@dominio.com","displayName":"Eddy","smtpHost":"smtp.gmail.com","smtpPort":465,"smtpUser":"tu@dominio.com","smtpPass":"app-password","imapHost":"imap.gmail.com","imapPort":993,"imapUser":"tu@dominio.com","imapPass":"app-password","campaignDailyLimit":20,"verified":true}]</span></p>
    <textarea id="mbxJson" placeholder='[{"email":"…", "smtpHost":"…", …}]'></textarea>
    <div style="display:flex;gap:10px;margin-top:12px;align-items:center">
      <button class="btn btn-primary" id="btnSaveMbx">Publicar en la VM</button>
      <span class="muted" style="font-size:12px">Se escribe en <span class="mono">mailboxes.json</span> del repo de datos</span>
    </div>
  </div>`;
}

async function bindBuzones() {
  const btn = $('#btnSaveMbx');
  if (!btn) return;
  try {
    const raw = await ghFetch('mailboxes.json', true);
    if (raw.status === 200 && $('#mbxJson') && !$('#mbxJson').value) $('#mbxJson').value = raw.data;
  } catch (e) { /* sin archivo */ }
  btn.addEventListener('click', async () => {
    const val = $('#mbxJson').value.trim();
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) throw new Error('Debe ser un array JSON');
      await ghPut('mailboxes.json', JSON.stringify(parsed, null, 2), 'web: alta/actualización de buzones');
      toast('mailboxes.json publicado — la VM lo procesará en ~3 min');
    } catch (err) {
      toast('JSON inválido: ' + err.message, true);
    }
  });
}

// ═══════════════ VISTA: PROMOCIONES ═══════════════
function viewPromos() {
  if (!connected()) return setupGuide('Las promociones se gestionan en el panel de la VM — conéctate para verlas');
  const cs = ST ? ST.campaigns || [] : [];
  return `
  <div class="section-title"><h2>Catálogo de promociones</h2><span class="badge badge-dark">${cs.length} campañas</span></div>
  ${cs.length ? `<div class="grid grid-3">
    ${cs.map((c) => `
      <div class="card">
        <h3>${esc(c.name)}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <span class="badge ${c.status === 'RUNNING' ? 'badge-green' : c.status === 'PAUSED' ? 'badge-amber' : 'badge-dark'}">${esc(c.status)}</span>
          <span class="badge badge-dark">${esc(c.steps)} pasos</span>
        </div>
        <div class="mb-meta">Firma: <b>${esc(c.fromName)}</b></div>
        <div class="mb-meta">Objetivo: ${esc(c.dailyTarget)}/día · Leads inscritos: <b>${esc(c.enrollments)}</b></div>
      </div>`).join('')}
  </div>` : '<div class="card"><div class="kb-empty">Sin campañas todavía. Crea promociones desde el panel de la VM (Campañas → Nueva) con varios enfoques para que el agente rote.</div></div>'}
  <p class="muted" style="margin-top:14px;font-size:12.5px">💡 El agente de re-engagement usa el catálogo: si un lead <b>abre</b> sin responder, cambia el <b>enfoque</b>; si interacciona dos veces, le mete <b>otra promoción</b> del catálogo.</p>`;
}

// ═══════════════ VISTA: CONSOLA ═══════════════
function viewComandos() {
  if (!connected()) return setupGuide('La consola envía órdenes a la VM a través del repo de datos');
  const quick = ['estado', 'cuota', 'agente', 'crm', 'importar', 'pausar', 'reanudar', 'ayuda'];
  return `
  <div class="section-title"><h2>Consola remota — ejecuta comandos en la VM</h2>
    <button class="btn btn-ghost btn-sm" id="btnReloadLog">⟳ leer respuestas</button>
  </div>
  <div class="card">
    <p class="muted" style="font-size:12.5px;margin-bottom:4px">La VM sondea <span class="mono">commands/pending.json</span> cada ~3 minutos, ejecuta y responde en el log de hoy.</p>
    <div class="chips">
      ${quick.map((c) => `<button class="btn btn-sm chip-cmd" data-cmd="${c}">${c}</button>`).join('')}
    </div>
    <div class="cmd-input-row">
      <input id="cmdInput" placeholder="comando [argumento…] — p.ej. lead juan@empresa.com">
      <button class="btn btn-primary" id="btnSendCmd">Enviar</button>
    </div>
  </div>
  <div class="section-title"><h2>Respuestas de hoy</h2></div>
  <div class="console" id="consoleBox"><div class="line out">— pulsa «leer respuestas» para ver el log —</div></div>`;
}

async function readCmdLog() {
  const box = $('#consoleBox');
  if (!box) return;
  try {
    const r = await ghFetch(`commands/log-${todayKey()}.json`, true);
    if (r.status !== 200) { box.innerHTML = '<div class="line out">sin respuestas hoy todavía</div>'; return; }
    const entries = JSON.parse(r.data);
    if (!Array.isArray(entries) || !entries.length) { box.innerHTML = '<div class="line out">sin respuestas hoy todavía</div>'; return; }
    box.innerHTML = entries.map((e) => `
      <div class="line cmd-line">$ ${esc(e.cmd)} ${esc((e.args || []).join(' '))} <span class="muted">· ${esc(e.source || 'web')} · ${timeAgo(e.at)}</span></div>
      <div class="line ${e.ok ? 'out' : 'err'}">${esc(e.output)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    box.innerHTML = `<div class="line err">error leyendo log: ${esc(err.message)}</div>`;
  }
}

async function bindComandos() {
  const send = async (cmdStr) => {
    const parts = cmdStr.trim().split(/\s+/);
    if (!parts[0]) return;
    const cmd = { id: Date.now().toString(36), cmd: parts[0], args: parts.slice(1), source: 'web', ts: new Date().toISOString() };
    try {
      let pending = { commands: [] };
      const cur = await ghFetch('commands/pending.json', true);
      if (cur.status === 200) {
        try { pending = JSON.parse(cur.data); } catch { pending = { commands: [] }; }
      }
      pending.commands = (pending.commands || []).concat([cmd]);
      await ghPut('commands/pending.json', JSON.stringify(pending, null, 2), `web: comando ${cmd.cmd}`);
      toast(`Comando «${cmd.cmd}» enviado — la VM responderá en ~3 min`);
      setTimeout(readCmdLog, 1500);
    } catch (err) {
      toast('Error enviando comando: ' + err.message, true);
    }
  };
  document.querySelectorAll('.chip-cmd').forEach((b) => b.addEventListener('click', () => send(b.dataset.cmd)));
  const btn = $('#btnSendCmd');
  const inp = $('#cmdInput');
  if (btn && inp) {
    btn.addEventListener('click', () => send(inp.value));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(inp.value); });
  }
  const reload = $('#btnReloadLog');
  if (reload) reload.addEventListener('click', readCmdLog);
}

// ═══════════════ VISTA: IMPORTAR ═══════════════
function viewImportar() {
  if (!connected()) return setupGuide('Sube tu CSV de leads y la VM los incorporará al CRM');
  return `
  <div class="section-title"><h2>Importar leads desde CSV</h2></div>
  <div class="card">
    <div class="dropzone" id="dropzone">
      <div class="icon">📥</div>
      <b>Arrastra tu CSV aquí o haz clic para elegirlo</b>
      <p style="margin-top:6px;font-size:12.5px">Columna <span class="mono">email</span> obligatoria; opcionales: <span class="mono">nombre, empresa, cargo</span>. Detecta separadores , ; y tab.</p>
      <input type="file" id="fileInput" accept=".csv,text/csv" class="hidden">
    </div>
    <div id="csvPreview" style="margin-top:14px"></div>
  </div>
  <div class="card" style="margin-top:14px">
    <h3>Formato de ejemplo</h3>
    <div class="code-box">email,nombre,empresa,cargo
ana@startup.io,Ana Ríos,StartupLab,CEO
luis@corp.com,Luis Vega,Corp SAS,CTO</div>
  </div>`;
}

function parseCsvClient(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const seps = [',', ';', '\t'];
  let sep = ',';
  let best = 0;
  for (const s of seps) {
    const n = lines[0].split(s).length;
    if (n > best) { best = n; sep = s; }
  }
  const split = (line) => {
    const out = []; let cur = ''; let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === sep && !inQ) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    email: header.findIndex((h) => ['email', 'correo', 'e-mail', 'mail'].includes(h)),
    name: header.findIndex((h) => ['nombre', 'name'].includes(h)),
    company: header.findIndex((h) => ['empresa', 'company'].includes(h)),
    position: header.findIndex((h) => ['cargo', 'position', 'titulo', 'title'].includes(h)),
  };
  const rows = [];
  for (let i = idx.email >= 0 ? 1 : 0; i < lines.length; i++) {
    const cols = split(lines[i]);
    const email = (idx.email >= 0 ? cols[idx.email] : cols.find((c) => /@/.test(c)) || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    rows.push({
      email,
      ...(idx.name >= 0 && cols[idx.name] ? { name: cols[idx.name] } : {}),
      ...(idx.company >= 0 && cols[idx.company] ? { company: cols[idx.company] } : {}),
      ...(idx.position >= 0 && cols[idx.position] ? { position: cols[idx.position] } : {}),
    });
  }
  return rows;
}

function bindImportar() {
  const dz = $('#dropzone'), fi = $('#fileInput');
  if (!dz) return;
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0]); });

  async function handleFile(file) {
    const text = await file.text();
    const rows = parseCsvClient(text);
    const prev = $('#csvPreview');
    if (!rows.length) { prev.innerHTML = '<p class="hint bad">No se encontraron emails válidos en el archivo.</p>'; return; }
    prev.innerHTML = `
      <div class="card" style="padding:14px">
        <b>${rows.length} leads detectados</b> <span class="muted">· muestra:</span>
        <div class="feed" style="margin-top:8px">
          ${rows.slice(0, 5).map((r) => `<div class="feed-item"><span class="msg">${esc(r.email)}${r.name ? ` — ${esc(r.name)}` : ''}${r.company ? ` <span class="muted">· ${esc(r.company)}</span>` : ''}</span></div>`).join('')}
        </div>
        <button class="btn btn-primary" id="btnPushCsv" style="margin-top:12px">📤 Enviar ${rows.length} leads a la VM</button>
      </div>`;
    $('#btnPushCsv').addEventListener('click', async () => {
      try {
        const name = `leads-${Date.now()}.csv`;
        const header = 'email,nombre,empresa,cargo';
        const body = rows.map((r) => [r.email, r.name || '', r.company || '', r.position || ''].map((v) => (String(v).includes(',') ? `"${v}"` : v)).join(',')).join('\n');
        await ghPut(`imports/${name}`, header + '\n' + body, `web: importación ${name} (${rows.length} leads)`);
        toast(`${rows.length} leads enviados — la VM los importará en ~3 min y te avisará por Telegram`);
        prev.innerHTML = '<p class="hint ok">✅ Archivo entregado a la VM. Verás los resultados en la consola y en Telegram.</p>';
      } catch (err) {
        toast('Error subiendo CSV: ' + err.message, true);
      }
    });
  }
}

// ═══════════════ VISTA: CONFIGURACIÓN ═══════════════
function viewConfig() {
  const INSTALL_CMD = `ssh alicelabs-free 'curl -fsSL https://raw.githubusercontent.com/eddyflores100-lang/alicemail/main/deploy/install.sh | bash'`;
  return `
  <div class="section-title"><h2>Conexión del dashboard</h2>
    <button class="btn btn-sm" id="btnOpenConn">Editar conexión</button>
  </div>
  <div class="grid grid-3">
    <div class="card kpi"><h3>Repositorio de datos</h3><div class="num mono" style="font-size:15px">${esc(LS.repo || '—')}</div><div class="sub">bus de estado, comandos e importaciones</div></div>
    <div class="card kpi"><h3>Token</h3><div class="num" style="font-size:16px">${LS.token ? '✅ configurado' : '❌ falta'}</div><div class="sub">se guarda solo en tu navegador</div></div>
    <div class="card kpi"><h3>Refresco</h3><div class="num" style="font-size:16px">${LS.interval}s</div><div class="sub">polling de state.json</div></div>
  </div>
  ${ST && ST.sync ? `<div class="card" style="margin-top:14px"><h3>Telemetría del puente</h3>
    <div class="mb-meta">Último push: <b>${timeAgo(ST.sync.lastPush)}</b> · Último sondeo: <b>${timeAgo(ST.sync.lastPoll)}</b></div>
    <div class="mb-meta">Comandos ejecutados: ${esc(ST.sync.commandsProcessed ?? 0)} · Importaciones: ${esc(ST.sync.importsProcessed ?? 0)} · Emails enmascarados: ${ST.sync.maskEmails ? 'sí' : 'no'}</div>
    ${ST.sync.lastError ? `<div class="mb-meta" style="color:var(--red)">⚠️ ${esc(ST.sync.lastError)}</div>` : ''}
  </div>` : ''}

  <div class="section-title"><h2>Puesta en marcha del ecosistema</h2></div>
  <div class="card">
    <div class="steps">
      <div class="step"><div class="n">1</div><div class="body">
        <b>Instalar el cerebro en la VM Oracle</b>
        <p>Dentro de tu VM (ssh alicelabs-free), una sola línea instala Docker, clona el repo y levanta el motor:</p>
        <div class="code-box"><button class="copy" data-copy="ssh alicelabs-free">copiar prefijo</button>ssh alicelabs-free
curl -fsSL https://raw.githubusercontent.com/eddyflores100-lang/alicemail/main/deploy/install.sh | bash</div>
      </div></div>
      <div class="step"><div class="n">2</div><div class="body">
        <b>Token GitHub para la VM</b>
        <p>Crea un token fine-grained (Settings → Developer settings → Fine-grained tokens) con acceso <b>solo a <span class="mono">alice-data</span></b> y permiso <b>Contents: Read and write</b>. Edita <span class="mono">~/alicemail/.env</span> en la VM:</p>
        <div class="code-box">GH_SYNC_TOKEN=github_pat_xxxx
GH_DATA_REPO=eddyflores100-lang/alice-data</div>
        <p>Reinicia: <span class="mono">cd ~/alicemail &amp;&amp; sudo docker compose up -d</span></p>
      </div></div>
      <div class="step"><div class="n">3</div><div class="body">
        <b>Telegram (avisos en tu móvil)</b>
        <p>1) Habla con <span class="mono">@BotFather</span> → <span class="mono">/newbot</span> → guarda el token. 2) Manda un mensaje a tu bot y consulta tu chat id con <span class="mono">@userinfobot</span>. 3) En el panel de la VM (Ajustes → Notificaciones) pega token y chat, y pulsa prueba.</p>
      </div></div>
      <div class="step"><div class="n">4</div><div class="body">
        <b>Buzones</b>
        <p>Dalos de alta desde <b>📮 Buzones</b> aquí mismo (mailboxes.json) o en el panel de la VM. Para Gmail/Workspace usa una <b>contraseña de aplicación</b> (no la normal). 10 buzones × 20/día = 200 correos/día.</p>
      </div></div>
      <div class="step"><div class="n">5</div><div class="body">
        <b>Alimentar el ecosistema</b>
        <p>Desde <b>📥 Importar</b> sube tus CSV (TechDigital u otras fuentes). El agente clasifica, cataloga, calienta y decide. Tú solo miras el dashboard y recibes Telegram.</p>
      </div></div>
    </div>
  </div>

  <div class="section-title"><h2>Seguridad</h2></div>
  <div class="card">
    <p class="muted" style="font-size:13px">• La VM <b>no abre ningún puerto</b>: todo el tráfico hacia GitHub es saliente (HTTPS).<br>
    • El token del dashboard vive solo en tu navegador (localStorage) y debería tener permisos <b>solo</b> sobre <span class="mono">alice-data</span>.<br>
    • Los emails aparecen <b>enmascarados</b> (a***@dominio.com) en el estado publicado.<br>
    • Si el token de este chat se ha compartido, rotaciónalo: GitHub → Settings → Developer settings → regenera, y actualiza .env en la VM.</p>
  </div>`;
}

function bindConfig() {
  const btn = $('#btnOpenConn');
  if (btn) btn.addEventListener('click', () => openConnModal());
  document.querySelectorAll('.code-box .copy').forEach((c) => {
    c.addEventListener('click', () => {
      const txt = c.parentElement.textContent.replace(/^copiar prefijo/, '').replace(/copiar prefijo/, '').trim();
      navigator.clipboard.writeText(txt).then(() => toast('Copiado al portapapeles'));
    });
  });
}

// ═══════════════ Estados vacíos ═══════════════
function setupGuide(msg) {
  return `
  <div class="empty-state">
    <div class="big">🛰️</div>
    <h2 style="margin-bottom:8px">${esc(msg)}</h2>
    <p style="max-width:520px;margin:0 auto 18px">Configura el repositorio de datos (<span class="mono">eddyflores100-lang/alice-data</span>) y un token de GitHub. Todo se guarda únicamente en tu navegador.</p>
    <button class="btn btn-primary" id="btnWizard">Conectar ahora</button>
  </div>`;
}

function emptyState(title, sub) {
  return `<div class="empty-state"><div class="big">📡</div><h2 style="margin-bottom:8px">${esc(title)}</h2><p style="max-width:480px;margin:0 auto">${esc(sub)}</p>
  <p style="margin-top:16px"><a class="btn" href="#/config">Ir a Configuración</a></p></div>`;
}

function bindEmptyWizard() {
  const b = $('#btnWizard');
  if (b) b.addEventListener('click', () => openConnModal());
}

// ═══════════════ Modal conexión ═══════════════
function openConnModal() {
  $('#cfgRepo').value = LS.repo || 'eddyflores100-lang/alice-data';
  $('#cfgToken').value = LS.token || '';
  $('#cfgInterval').value = String(LS.interval || 45);
  $('#cfgTestResult').textContent = '';
  $('#cfgTestResult').className = 'hint';
  $('#modalConn').classList.remove('hidden');
}

async function saveConn() {
  const repo = $('#cfgRepo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  const token = $('#cfgToken').value.trim();
  if (!repo.includes('/')) { $('#cfgTestResult').textContent = 'El repo debe tener formato owner/name'; $('#cfgTestResult').className = 'hint bad'; return; }
  if (!token) { $('#cfgTestResult').textContent = 'Pega un token de GitHub'; $('#cfgTestResult').className = 'hint bad'; return; }
  const btn = $('#cfgSave');
  btn.disabled = true;
  btn.textContent = 'Probando…';
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/state.json?ref=main&t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.status === 200 || res.status === 404) {
      LS.repo = repo;
      LS.token = token;
      LS.interval = parseInt($('#cfgInterval').value, 10) || 45;
      $('#modalConn').classList.add('hidden');
      setConnOk(true);
      startPolling();
      refreshState(true);
      toast(res.status === 200 ? 'Conectado — estado encontrado' : 'Conectado — la VM aún no ha publicado estado');
    } else if (res.status === 401) {
      $('#cfgTestResult').textContent = 'Token inválido o expirado'; $('#cfgTestResult').className = 'hint bad';
    } else if (res.status === 403 || res.status === 404) {
      $('#cfgTestResult').textContent = 'El token no tiene acceso a ese repo (permite Contents: Read/Write en alice-data)'; $('#cfgTestResult').className = 'hint bad';
    }
  } catch (err) {
    $('#cfgTestResult').textContent = 'Error de red: ' + err.message;
    $('#cfgTestResult').className = 'hint bad';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Conectar';
  }
}

// ═══════════════ Bind por vista ═══════════════
function bindView() {
  if (currentView === 'buzones') bindBuzones();
  if (currentView === 'comandos') bindComandos();
  if (currentView === 'importar') bindImportar();
  if (currentView === 'config') bindConfig();
  const w = $('#btnWizard');
  if (w) bindEmptyWizard();
}

// ═══════════════ Boot ═══════════════
function boot() {
  window.addEventListener('hashchange', route);
  $('#hamburger').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#btnRefresh').addEventListener('click', () => refreshState(true));
  $('#connPill').addEventListener('click', () => openConnModal());
  $('#cfgSave').addEventListener('click', saveConn);
  $('#cfgCancel').addEventListener('click', () => $('#modalConn').classList.add('hidden'));
  $('#modalConn').addEventListener('click', (e) => { if (e.target === $('#modalConn')) $('#modalConn').classList.add('hidden'); });
  route();
  if (connected()) {
    setConnOk(true);
    refreshState(false);
  } else {
    render();
  }
  startPolling();
}

boot();
