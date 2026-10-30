export const operatorInboxHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Central Life</title>
<style>
:root {
  --navy: #082335;
  --blue: #1574df;
  --ink: #112331;
  --muted: #5d6d78;
  --line: #dce3e8;
  --pale: #f3f6f8;
  --bad: #a7352f;
  --warn: #9a6513;
  --ok: #178468;
  --surface: #ffffff;
  --shadow: 0 12px 30px rgba(8, 35, 53, .07);
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: #edf2f5;
  color: var(--ink);
  font:
    14px/1.45 Inter,
    system-ui,
    sans-serif;
}
.hidden {
  display: none !important;
}
button,
input,
textarea,
select {
  font: inherit;
}
button {
  cursor: pointer;
}
.btn {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 14px;
  background: var(--blue);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  transition: transform .15s ease, box-shadow .15s ease;
}
.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(21, 116, 223, .18);
}
.btn.alt {
  border-color: #cbd6dd;
  background: #fff;
  color: #26485d;
}
.btn.danger {
  border-color: #e3b6b3;
  background: #fff;
  color: #a3342d;
}
.logo {
  object-fit: contain;
}
.login {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
  background: linear-gradient(135deg, #061b2a, #114a73);
}
.login-card {
  width: min(460px, 100%);
  padding: 36px;
  background: #fff;
  box-shadow: 0 26px 70px #0008;
}
.login-logo {
  display: block;
  width: 130px;
  height: 100px;
  margin: 0 auto 22px;
}
.eyebrow {
  margin: 0;
  color: #477898;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.login h1 {
  margin: 8px 0;
  font-size: 30px;
}
.muted {
  color: var(--muted);
}
.field {
  display: block;
  margin-top: 15px;
  font-size: 12px;
  font-weight: 800;
}
.field input,
.field textarea,
.field select {
  width: 100%;
  margin-top: 6px;
  padding: 11px;
  border: 1px solid #cbd6dd;
}
.notice {
  min-height: 19px;
  margin: 10px 0;
  color: var(--bad);
  font-size: 12px;
}
.notice.ok {
  color: var(--ok);
}
.app {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 208px 344px minmax(560px, 1fr);
}
.rail {
  display: flex;
  flex-direction: column;
  padding: 24px 14px;
  background: linear-gradient(180deg, #071f31 0%, #0b2e46 100%);
  color: #fff;
}
.rail-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 7px;
}
.rail-brand img {
  width: 44px;
  height: 44px;
  object-fit: contain;
}
.rail-brand strong {
  display: block;
}
.rail-brand small {
  color: #b7cedd;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.nav {
  display: grid;
  gap: 4px;
  margin-top: 34px;
}
.nav button {
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 12px 13px;
  background: transparent;
  color: #d8e6ed;
  text-align: left;
  font-weight: 750;
}
.nav button.active {
  border-color: #ffffff22;
  background: #ffffff15;
  color: #fff;
}
.account {
  margin-top: auto;
  padding: 12px;
  border: 1px solid #ffffff25;
  background: #ffffff0b;
}
.account b {
  display: block;
}
.account span {
  display: block;
  margin-top: 2px;
  color: #bad0de;
  font-size: 11px;
}
.account button {
  margin-top: 9px;
  border: 0;
  background: transparent;
  color: #a9cbe2;
  font-size: 11px;
  text-decoration: underline;
}
.queue {
  min-width: 0;
  background: #f8fafb;
  border-right: 1px solid var(--line);
}
.queue-head {
  padding: 22px 18px 16px;
  border-bottom: 1px solid var(--line);
  background: #fff;
  box-shadow: 0 4px 16px rgba(8,35,53,.05);
}
.queue-head h1 {
  margin: 3px 0 0;
  font-size: 22px;
}
.tabs {
  display: flex;
  gap: 6px;
  margin-top: 14px;
}
.tabs button {
  flex: 1;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 9px 4px;
  background: #f8fafb;
  color: #506575;
  font-size: 10px;
  font-weight: 800;
}
.tabs button.active {
  border-color: #bad8f4;
  background: #eef6fd;
  color: #0d5c9e;
  box-shadow: inset 0 0 0 1px rgba(21,116,223,.08);
}
.tools {
  display: grid;
  gap: 7px;
  margin-top: 13px;
}
.alert-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 11px;
  color: #526a7a;
  font-size: 11px;
}
.alert-control button {
  white-space: nowrap;
}
.tools input,
.tools select {
  width: 100%;
  padding: 9px;
  border: 1px solid #cbd6dd;
  font-size: 12px;
}
.list {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 12px;
  max-height: calc(100vh - 235px);
  margin: 0;
  padding: 14px;
  overflow: auto;
}
.board-column {
  min-width: 0;
  min-height: 170px;
  border: 1px solid #dfe8ec;
  border-radius: 12px;
  background: #f4f7f9;
  overflow: hidden;
  transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease;
}
.board-column.is-drop-target { background: #eaf4fc; border-color: #7db8e8; box-shadow: inset 0 0 0 2px #b9dcf5; }
.board-column:nth-child(1) { border-top: 3px solid #8064e8; }
.board-column:nth-child(2) { border-top: 3px solid #16a6c9; }
.board-column:nth-child(3) { border-top: 3px solid #efa43f; }
.board-column .item { margin: 8px; }
.item { cursor: grab; }
.item:active { cursor: grabbing; }
.board-column .item:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(8, 34, 52, .12);
}
.board-column .item.is-dragging { opacity: .45; }
.board-column-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 13px;
  border-bottom: 1px solid #e1e9ed;
  color: #27475a;
  font-size: 11px;
  font-weight: 850;
}
.board-column-head span {
  display: inline-grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  background: #dceef8;
  color: #126a84;
}
.item {
  border-left: 3px solid transparent;
  margin: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 13px 12px;
  cursor: pointer;
}
.board-empty {
  padding: 22px 12px;
  color: #82939d;
  font-size: 11px;
  text-align: center;
  margin: 10px;
  border: 1px dashed #ccd8de;
  border-radius: 10px;
  background: rgba(255,255,255,.5);
}
.item:hover {
  background: #f5f8fa;
}
.item.active {
  border-color: #b9d9f3;
  background: #eaf3fb;
}
.move-control { display: block; margin-top: 9px; }
.board-hint { margin: 8px 14px 0; color: #647c8a; font-size: 11px; }
.move-control select {
  width: 100%;
  border: 1px solid #d3e0e8;
  border-radius: 7px;
  background: #fff;
  color: #31556a;
  padding: 6px 8px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.item strong {
  display: block;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
  color: #607583;
  font-size: 11px;
}
.tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 5px;
  font-size: 10px;
  font-weight: 900;
}
.p1,
.p2,
.late {
  background: #fde9e7;
  color: var(--bad);
}
.p3,
.due {
  background: #fff1d8;
  color: var(--warn);
}
.workspace {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background: #f8fafb;
}
.overview {
  padding: 15px 26px;
  border-bottom: 1px solid var(--line);
  background: #fff;
  box-shadow: 0 4px 16px rgba(8,35,53,.05);
}
.overview h1 {
  margin: 3px 0;
  font-size: 23px;
}
.stats {
  display: flex;
  gap: 13px;
  color: #4f6574;
  font-size: 12px;
}
.stats b {
  color: var(--ink);
}
.empty {
  display: grid;
  flex: 1;
  place-items: center;
  padding: 30px;
  text-align: center;
}
.focus {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 19px 26px 15px;
  border-bottom: 1px solid var(--line);
  background: #fff;
  box-shadow: 0 4px 16px rgba(8,35,53,.05);
}
.who {
  display: flex;
  gap: 10px;
  align-items: center;
}
.avatar {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  border-radius: 12px;
  background: linear-gradient(135deg, #d9edf9, #c4e5f2);
  color: #15547c;
  font-weight: 850;
}
.who h2 {
  margin: 0;
  font-size: 17px;
}
.who p {
  margin: 2px 0;
  color: var(--muted);
  font-size: 12px;
}
#state {
  display: inline-flex;
  align-items: center;
  margin-top: 6px;
  border-radius: 999px;
  padding: 4px 9px;
  background: #edf7f2;
  color: #16724f;
  font-size: 11px;
  font-weight: 800;
}
.actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.context {
  display: flex;
  gap: 15px;
  overflow: auto;
  padding: 12px 26px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}
.context div {
  min-width: max-content;
}
.context span {
  display: block;
  color: #647784;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.context b {
  display: block;
  font-size: 11px;
}
.context div {
  padding-right: 14px;
  border-right: 1px solid #e7edf0;
}
.thread {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: auto;
  padding: 22px 30px;
  background: #eef3f5;
}
.message {
  align-self: flex-start;
  width: max-content;
  max-width: 78%;
  margin: 9px 0;
  padding: 12px 14px;
  border: 1px solid #e0e8ed;
  border-radius: 3px 11px 11px 11px;
  background: #fff;
  white-space: pre-wrap;
  line-height: 1.5;
  box-shadow: 0 1px 2px #0823350b;
}
.message-author {
  display: block;
  margin-bottom: 5px;
  color: #477898;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .04em;
  text-transform: uppercase;
}
.message.out .message-author {
  color: #16724f;
}
.message.out {
  align-self: flex-end;
  margin-left: 22%;
  border-color: #cbe6da;
  border-radius: 11px 3px 11px 11px;
  background: #dff5e9;
  border-color: #b8e2cc;
}
.message small {
  display: block;
  margin-top: 4px;
  color: #71818d;
  font-size: 10px;
}
.composer {
  display: flex;
  gap: 8px;
  padding: 14px 26px 18px;
  background: #fff;
  box-shadow: 0 -4px 18px rgba(8,35,53,.05);
  border-top: 1px solid var(--line);
}
.composer textarea {
  flex: 1;
  min-height: 52px;
  padding: 9px;
  border: 1px solid #cbd6dd;
  resize: vertical;
}
.commercial {
  display: none;
  flex: 1;
  overflow: auto;
  padding: 25px;
  background: #f7fafb;
}
.commercial.active {
  display: block;
}
.commercial-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}
.commercial h1 {
  margin: 4px 0;
  font-size: 27px;
}
.crm-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 18px;
  border: 1px solid var(--line);
  background: #fff;
}
.metric {
  padding: 17px;
  border-left: 1px solid var(--line);
}
.metric:first-child {
  border: 0;
}
.metric span {
  display: block;
  color: #627685;
  font-size: 10px;
  font-weight: 850;
  text-transform: uppercase;
}
.metric b {
  display: block;
  margin-top: 7px;
  font-size: 25px;
}
.crm-layout {
  display: grid;
  grid-template-columns: 1.45fr 0.9fr;
  gap: 18px;
  margin-top: 18px;
}
.panel {
  border: 1px solid var(--line);
  background: #fff;
}
.panel h2 {
  margin: 0;
  padding: 15px 16px;
  border-bottom: 1px solid var(--line);
  font-size: 16px;
}
.record {
  display: block;
  width: 100%;
  border: 0;
  border-bottom: 1px solid #edf1f3;
  padding: 12px 16px;
  background: #fff;
  text-align: left;
}
.record:hover {
  background: #f6faff;
}
.record b,
.record span {
  display: block;
}
.record span {
  margin-top: 3px;
  color: #607583;
  font-size: 11px;
}
.modal {
  position: fixed;
  z-index: 5;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #061b2a9c;
}
.modal-card {
  width: min(540px, 100%);
  padding: 24px;
  background: #fff;
  box-shadow: 0 28px 80px #0008;
}
.modal-card h2 {
  margin: 4px 0 10px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
@media (max-width: 960px) {
  .app {
    grid-template-columns: 74px 300px minmax(0, 1fr);
  }
  .rail-brand strong,
  .rail-brand small,
  .account {
    display: none;
  }
  .rail-brand {
    justify-content: center;
  }
  .nav button {
    text-align: center;
  }
  .nav button span {
    display: none;
  }
  .crm-layout {
    grid-template-columns: 1fr;
  }
  .list {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .app {
    display: block;
  }
  .rail {
    display: none;
  }
  .queue {
    border-bottom: 1px solid var(--line);
  }
  .list {
    max-height: 230px;
  }
  .overview,
  .head,
  .thread,
  .composer,
  .context {
    padding-right: 16px;
    padding-left: 16px;
  }
  .head {
    flex-direction: column;
  }
  .actions .btn {
    flex: 1;
  }
  .composer {
    flex-direction: column;
  }
  .composer .btn {
    width: 100%;
  }
  .commercial {
    padding: 16px;
  }
  .crm-summary {
    grid-template-columns: 1fr;
  }
  .metric {
    border-top: 1px solid var(--line);
    border-left: 0;
  }
}
</style>
</head>
<body>
<section id="login" class="login">
<form id="loginForm" class="login-card">
<img class="login-logo logo" src="/assets/life-logo.png" alt="Life Engenharia">
<p class="eyebrow">Central de atendimento</p>
<h1>Bem-vindo de volta</h1>
<p id="lastAccount" class="muted">Use seu e-mail corporativo para entrar.</p>
<label class="field">E-mail corporativo<input id="email" type="email" autocomplete="email" required>
</label>
<label class="field">Senha<input id="password" type="password" autocomplete="current-password" required>
</label>
<button class="btn" style="width:100%;margin-top:20px">Entrar</button>
<p class="muted" style="font-size:11px">Pressione Enter para entrar. A senha nunca é salva neste dispositivo.</p>
<p id="loginNotice" class="notice">
</p>
</form>
</section>
<section id="app" class="app hidden">
<aside class="rail">
<div class="rail-brand">
<img src="/assets/life-logo.png" alt="Life Engenharia">
<div>
<strong>Life Engenharia</strong>
<small>Central de atendimento</small>
</div>
</div>
<nav class="nav">
<button class="active" data-view="queue">
<span>Fila humana</span>
</button>
<button id="commercialNav" class="hidden" data-view="commercial">
<span>Comercial</span>
</button>
</nav>
<div class="account">
<b id="accountName">Atendente</b>
<span id="accountRole">Disponível para atender</span>
<button id="logout" type="button">Sair da conta</button>
</div>
</aside>
<aside id="queuePanel" class="queue">
<div class="queue-head">
<p class="eyebrow">Minha operação</p>
<h1>Fila humana <span id="count">
</span>
</h1>
<div class="tabs">
<button data-filter="action" class="active">Para agir<br>
<b id="actionN">0</b>
</button>
<button data-filter="mine">Minha fila<br>
<b id="mineN">0</b>
</button>
<button data-filter="all">Todas<br>
<b id="allN">0</b>
</button>
</div>
<div class="tools">
<input id="search" type="search" placeholder="Buscar cliente ou telefone">
<select id="priority">
<option value="">Todas as prioridades</option>
<option value="urgent">P1 e P2</option>
<option value="late">SLA vencido</option>
<option value="due">Retorno para agora</option>
</select>
<button id="refresh" type="button" class="btn alt">Atualizar fila</button>
</div>
<div class="alert-control">
<span id="alertStatus" aria-live="polite">Alertas sonoros desativados</span>
<button id="alerts" type="button" class="btn alt">Ativar som</button>
</div>
</div>
<p class="board-hint">Arraste os cartões entre as etapas ou use “Mover para…” no cartão.</p>
<div id="list" class="list"></div>
</aside>
<main id="queueView" class="workspace">
<section class="overview">
<p class="eyebrow">Próximo passo</p>
<h1 id="orientation">Escolha o próximo atendimento</h1>
<div class="stats">
<span>
<b id="criticalN">0</b> críticos</span>
<span>
<b id="lateN">0</b> com SLA vencido</span>
<span>
<b id="dueN">0</b> retornos para agora</span>
</div>
</section>
<section id="empty" class="empty">
<div>
<p class="eyebrow">Fila organizada</p>
<h2>Nenhum atendimento selecionado</h2>
<p class="muted">Comece pelo primeiro caso em “Para agir”.</p>
</div>
</section>
<section id="detail" class="focus hidden">
<header class="head">
<div class="who">
<div id="avatar" class="avatar">C</div>
<div>
<h2 id="name">
</h2>
<p id="state">
</p>
</div>
</div>
<div class="actions">
<button id="registerCustomer" type="button" class="btn hidden">Cadastrar cliente</button>
<button id="claim" type="button" class="btn">Assumir atendimento</button>
<button id="more" type="button" class="btn alt">Mais ações</button>
</div>
</header>
<p id="notice" class="notice" style="margin:8px 24px">
</p>
<div id="context" class="context">
</div>
<div id="messages" class="thread">
</div>
<form id="composer" class="composer">
<textarea id="text" required placeholder="Digite sua mensagem ao cliente">
</textarea>
<button class="btn">Enviar</button>
</form>
</section>
</main>
<main id="commercialView" class="commercial">
<div class="commercial-head">
<div>
<p class="eyebrow">Ploomes CRM</p>
<h1>Comercial</h1>
<p class="muted">Recentes, oportunidades e detalhes de contato.</p>
</div>
<button id="crmRefresh" class="btn alt">Atualizar</button>
</div>
<div id="crmContent" class="muted" style="margin-top:20px">Carregando dados comerciais…</div>
</main>
</section>
<div id="modal" class="modal hidden">
<form id="modalForm" class="modal-card">
<p class="eyebrow">Ação do atendimento</p>
<h2 id="modalTitle">
</h2>
<div id="modalBody">
</div>
<div class="modal-actions">
<button id="cancel" type="button" class="btn alt">Cancelar</button>
<button class="btn">Confirmar</button>
</div>
</form>
</div><script>
let items = [],
  selected = null,
  queueMode = "action",
  query = "",
  priority = "",
  modalAction = null,
  crmLoaded = false,
  alertsEnabled = false,
  lastInboxCheckAt = Date.now(),
  knownUpdates = new Map(),
  eventController = null,
  loadTimer = null,
  queueLoadInProgress = false;
const roles = ["admin", "coordination", "commercial", "technical", "on_call"];
const auth = () => ({
  Authorization: "Bearer " + sessionStorage.getItem("operatorToken"),
});
const api = async (p, i = {}) => {
  const r = await fetch(p, {
    ...i,
    headers: { ...auth(), ...(i.headers || {}) },
  });
  if (!r.ok)
    throw Error(
      (await r.json().catch(() => ({}))).error ||
        "Não foi possível concluir a ação.",
    );
  return r.status === 204 ? null : r.json();
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[x],
  );
const mins = (v) => (Date.now() - new Date(v)) / 60000;
const sla = (c) => (["P1", "P2"].includes(c.suggestedPriority) ? 30 : 120);
const late = (c) => mins(c.updatedAt) > sla(c);
const due = (c) => c.followUpAt && new Date(c.followUpAt) <= new Date();
const scheduled = (c) => Boolean(c.followUpAt);
const conversationStateLabel = (state, route) =>
  ({
    started: "Novo contato",
    consent: "Aguardando autorização",
    route: "Escolhendo atendimento",
    collecting: "Triagem pelo bot",
    review: "Aguardando confirmação",
    queued: route === "technical" ? "Em análise técnica" : route === "commercial" ? "Comercial acionado" : "Aguardando equipe",
    human: "Atendimento humano",
    closed: "Concluído",
  })[state] || "Atendimento";
const age = (v) => {
  const n = Math.floor(mins(v));
  return n < 60 ? n + " min" : Math.floor(n / 60) + " h";
};
const fmt = (v) =>
  new Date(v).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const money = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);
const action = (c) =>
  !c.assignedOperator || due(c) || late(c) || ["P1", "P2"].includes(c.suggestedPriority);
function note(t, ok = false) {
  const e = document.getElementById("notice");
  e.textContent = t;
  e.className = "notice " + (ok ? "ok" : "");
}
function updateAlertControl() {
  const enabled = alertsEnabled;
  document.getElementById("alertStatus").textContent = enabled
    ? "Tempo real e som ativos"
    : "Tempo real ativo · som desativado";
  document.getElementById("alerts").textContent = enabled
    ? "Desativar som"
    : "Ativar som";
}
function playAlert() {
  if (!alertsEnabled) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.16);
    volume.gain.setValueAtTime(0.06, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.38);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
    oscillator.onended = () => context.close();
  } catch (_) {}
}
function notifyIncoming(conversation, message) {
  playAlert();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Nova mensagem · Central Life", {
      body: (conversation.contactName || conversation.contactPhone) + ": " + (message.content || "Mensagem recebida"),
      tag: "life-incoming-" + message.id,
    });
  }
}
async function checkForIncoming(nextItems) {
  const changed = nextItems.filter((conversation) =>
    knownUpdates.has(conversation.id) && knownUpdates.get(conversation.id) !== conversation.updatedAt,
  );
  const previousCheck = lastInboxCheckAt;
  lastInboxCheckAt = Date.now();
  knownUpdates = new Map(nextItems.map((conversation) => [conversation.id, conversation.updatedAt]));
  if (!alertsEnabled || !changed.length) return;
  const details = await Promise.all(
    changed.map((conversation) => api("/api/operator/conversations/" + conversation.id).catch(() => null)),
  );
  details.forEach((detail) => {
    if (!detail) return;
    const inbound = detail.messages.filter((message) =>
      message.direction === "inbound" && new Date(message.receivedAt).getTime() > previousCheck,
    );
    inbound.forEach((message) => notifyIncoming(detail, message));
  });
}
function renderQueue() {
  const me = sessionStorage.getItem("operatorName");
  const rows = items
    .filter((c) => {
      const h = (c.contactName + " " + c.contactPhone).toLowerCase();
      return (
        (!query || h.includes(query)) &&
        (!priority ||
          (priority === "urgent"
            ? ["P1", "P2"].includes(c.suggestedPriority)
            : priority === "late"
              ? late(c)
              : due(c))) &&
        (queueMode === "all" || queueMode === "mine"
          ? queueMode !== "mine" || c.assignedOperator === me
          : action(c))
      );
    })
    .sort(
      (a, b) =>
        Number(due(b)) - Number(due(a)) ||
        Number(late(b)) - Number(late(a)) ||
        new Date(a.updatedAt) - new Date(b.updatedAt),
    );
  document.getElementById("actionN").textContent = items.filter(action).length;
  document.getElementById("mineN").textContent = items.filter(
    (c) => c.assignedOperator === me,
  ).length;
  document.getElementById("allN").textContent = items.length;
  document.getElementById("criticalN").textContent = items.filter((c) =>
    ["P1", "P2"].includes(c.suggestedPriority),
  ).length;
  document.getElementById("lateN").textContent = items.filter(late).length;
  document.getElementById("dueN").textContent = items.filter(due).length;
  document.getElementById("count").textContent = "(" + rows.length + ")";
  const list = document.getElementById("list");
  list.innerHTML = "";
  const groups = [
    { key: "new", title: "Novos", items: rows.filter((c) => !c.assignedOperator && !scheduled(c)) },
    { key: "mine", title: "Em atendimento", items: rows.filter((c) => Boolean(c.assignedOperator) && !scheduled(c)) },
    { key: "followup", title: "Retorno / atenção", items: rows.filter(scheduled) },
  ];
  groups.forEach((group) => {
    const column = document.createElement("section");
    column.className = "board-column";
    column.dataset.dropTarget = group.key;
    column.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("text/plain")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      column.classList.add("is-drop-target");
    });
    column.addEventListener("dragleave", (event) => {
      if (!column.contains(event.relatedTarget)) column.classList.remove("is-drop-target");
    });
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("is-drop-target");
      const conversationId = event.dataTransfer?.getData("text/plain");
      if (conversationId) moveConversation(conversationId, group.key);
    });
    column.innerHTML = '<div class="board-column-head"><span>' + group.items.length + '</span><strong>' + group.title + '</strong></div>';
    group.items.forEach((c) => {
    const e = document.createElement("article");
    e.className = "item" + (selected?.id === c.id ? " active" : "");
    e.draggable = true;
    e.dataset.conversationId = c.id;
    e.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", c.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => e.classList.add("is-dragging"));
    });
    e.addEventListener("dragend", () => {
      e.classList.remove("is-dragging");
      document.querySelectorAll(".board-column.is-drop-target").forEach((target) => target.classList.remove("is-drop-target"));
    });
    const p = c.suggestedPriority
      ? '<span class="tag ' +
        c.suggestedPriority.toLowerCase() +
        '">' +
        c.suggestedPriority +
        "</span>"
      : "";
    e.innerHTML =
      "<strong>" +
      esc(c.contactName || c.contactPhone) +
      '</strong><div class="meta">' +
      p +
      (late(c) ? '<span class="tag late">SLA vencido</span>' : "") +
      (scheduled(c) ? '<span class="tag due">' + (due(c) ? 'Retorno atrasado' : 'Retorno agendado') + '</span>' : "") +
      '</div><div class="meta">' +
      esc(conversationStateLabel(c.state, c.route)) +
      (c.protocolId ? " · " + esc(c.protocolId) : "") +
      " · há " +
      age(c.updatedAt) +
      '</div><label class="move-control"><span class="sr-only">Mover atendimento de ' + esc(c.contactName || c.contactPhone) + '</span><select data-move-id="' + esc(c.id) + '" aria-label="Mover atendimento de ' + esc(c.contactName || c.contactPhone) + '"><option value="">Mover para…</option><option value="new">Novos</option><option value="mine">Em atendimento</option><option value="followup">Retorno / atenção</option></select></label>';
    e.onclick = () => open(c.id);
    e.querySelector("select").addEventListener("click", (event) => event.stopPropagation());
    e.querySelector("select").addEventListener("change", (event) => {
      event.stopPropagation();
      const target = event.currentTarget.value;
      event.currentTarget.value = "";
      if (target) moveConversation(c.id, target);
    });
    column.append(e);
  });
    if (!group.items.length) column.insertAdjacentHTML("beforeend", '<div class="board-empty">Nenhum atendimento nesta etapa</div>');
    list.append(column);
  });
}
async function moveConversation(id, target) {
  const conversation = items.find((item) => item.id === id);
  if (!conversation) return;
  const me = sessionStorage.getItem("operatorName");
  try {
    if (target === "mine") {
      if (conversation.assignedOperator === me) return;
      if (conversation.assignedOperator) throw Error("Este atendimento já está com outra pessoa.");
      await api("/api/operator/conversations/" + id + "/claim", { method: "POST" });
      await load();
      note("Atendimento assumido. O cliente foi avisado.", true);
      return;
    }
    if (target === "new") {
      if (conversation.assignedOperator && conversation.assignedOperator !== me)
        throw Error("Só quem está atendendo pode devolver este caso à fila.");
      if (conversation.assignedOperator) {
        await api("/api/operator/conversations/" + id + "/release", { method: "POST" });
      } else if (scheduled(conversation)) {
        await api("/api/operator/conversations/" + id + "/follow-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ followUpAt: null }),
        });
      } else return;
      await load();
      note("Atendimento movido para Novos; o retorno anterior foi cancelado.", true);
      return;
    }
    if (target === "followup") {
      const minimum = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      modal(
        "Agendar retorno",
        '<p class="muted">Escolha quando este atendimento deve aparecer em “Retorno / atenção”.</p><label class="field">Data e horário<input name="followUpAt" type="datetime-local" min="' + minimum + '" required></label>',
        async (form) => {
          const value = form.get("followUpAt");
          if (!value) throw Error("Escolha a data e o horário do retorno.");
          await api("/api/operator/conversations/" + id + "/follow-up", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ followUpAt: new Date(value).toISOString() }),
          });
          await load();
          note("Retorno agendado.", true);
        },
      );
    }
  } catch (error) {
    note(error.message || "Não foi possível mover o atendimento.");
    load().catch(() => {});
  }
}
async function load() {
  if (queueLoadInProgress) return;
  queueLoadInProgress = true;
  try {
    const nextItems = await api("/api/operator/conversations");
    if (!knownUpdates.size) knownUpdates = new Map(nextItems.map((conversation) => [conversation.id, conversation.updatedAt]));
    else await checkForIncoming(nextItems);
    items = nextItems;
    renderQueue();
    if (selected && items.some((i) => i.id === selected.id))
      await open(selected.id);
  } finally {
    queueLoadInProgress = false;
  }
}
async function connectLiveUpdates() {
  eventController?.abort();
  eventController = new AbortController();
  try {
    const response = await fetch("/api/operator/events", {
      headers: auth(),
      signal: eventController.signal,
    });
    if (!response.ok || !response.body) throw Error("Canal em tempo real indisponível");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw Error("Canal em tempo real encerrado");
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split("\\n\\n");
      buffer = events.pop();
      events.forEach((event) => {
        if (event.includes("event: inbox")) {
          clearTimeout(loadTimer);
          loadTimer = setTimeout(() => load().catch(() => {}), 150);
        }
      });
    }
  } catch (_) {
    if (!eventController?.signal.aborted && sessionStorage.getItem("operatorToken"))
      setTimeout(connectLiveUpdates, 2_000);
  }
}
function humanMessage(content) {
  const m = String(content || "").match(/^([^:]{2,80}):\\s([\\s\\S]*)$/);
  return m
    ? "<strong>" + esc(m[1]) + ":</strong> " + esc(m[2])
    : esc(content || "[mensagem sem texto]");
}
function messageAuthor(message) {
  if (!isOutboundMessage(message)) return "Cliente";
  const operator = sessionStorage.getItem("operatorName");
  return operator && String(message.content || "").startsWith(operator + ":")
    ? "Você"
    : "Bot Life";
}
function isOutboundMessage(message) {
  const direction = String(message.direction || "").toLowerCase();
  const content = String(message.content || "");
  const operator = sessionStorage.getItem("operatorName");
  return ["outbound", "out", "sent", "bot", "operator"].includes(direction) ||
    Boolean((operator && content.startsWith(operator + ":")) || /^[^:\\n]{2,80}:\\s/.test(content));
}
async function open(id) {
  selected = await api("/api/operator/conversations/" + id);
  const commercialLead = selected.destinationArea === "commercial" && !selected.assignedOperator;
  document.getElementById("empty").classList.add("hidden");
  document.getElementById("detail").classList.remove("hidden");
  document.getElementById("name").textContent =
    selected.contactName || selected.contactPhone;
  document.getElementById("avatar").textContent = (selected.contactName || "C")
    .slice(0, 2)
    .toUpperCase();
  document.getElementById("state").textContent = commercialLead
    ? "Lead recebido pelo comercial"
    : selected.assignedOperator
    ? "Em atendimento humanizado por " + selected.assignedOperator
    : "Aguardando alguém assumir";
  document.getElementById("orientation").textContent = commercialLead
    ? "Acompanhe o retorno do comercial"
    : selected.assignedOperator
    ? "Resolva este atendimento"
    : "Assuma ou encaminhe este atendimento";
  const c = selected.context || {},
    fields = [
      ["Empresa", c.company],
      ["Serviço", c.service || c.equipment],
      ["Local", c.location],
      ["Impacto", c.operationalImpact],
      ["Retorno", selected.followUpAt ? fmt(selected.followUpAt) : null],
    ].filter((x) => x[1]);
  document.getElementById("context").innerHTML =
    fields
      .map(
        (x) =>
          "<div><span>" + esc(x[0]) + "</span><b>" + esc(x[1]) + "</b></div>",
      )
      .join("") || '<span class="muted">Sem contexto adicional.</span>';
  const attachments = selected.attachments || [];
  if (attachments.length) {
    document.getElementById("context").insertAdjacentHTML(
      "beforeend",
      '<div class="attachment-row"><span>Anexos</span>' +
        attachments.map((attachment) =>
          '<button type="button" class="attachment-link" data-attachment-id="' + esc(attachment.id) + '" ' +
          (attachment.status === "stored" ? "" : "disabled") + '>' +
          esc(attachment.fileName) + " · " + esc(attachment.status) + "</button>",
        ).join("") + "</div>",
    );
    document.querySelectorAll("[data-attachment-id]").forEach((button) => {
      button.onclick = async () => {
        const attachment = await api("/api/operator/conversations/" + selected.id + "/attachments/" + button.dataset.attachmentId + "/url");
        window.open(attachment.url, "_blank", "noopener");
      };
    });
  }
  document.getElementById("messages").innerHTML = selected.messages
    .map(
      (m) =>
        '<div class="message ' +
        (isOutboundMessage(m) ? "out" : "") +
        ">" +
        '<span class="message-author">' + messageAuthor(m) + '</span>' + humanMessage(m.content) +
        "<small>" +
        fmt(m.receivedAt) +
        (isOutboundMessage(m) ? " · Life Engenharia" : " · Cliente") +
        "</small></div>",
    )
    .join("");
  const mine =
    selected.assignedOperator === sessionStorage.getItem("operatorName");
  document.getElementById("claim").textContent = mine
    ? "Em atendimento por você"
    : commercialLead
    ? "Lead comercial — sem assumir"
    : "Assumir atendimento";
  document.getElementById("claim").disabled = mine || commercialLead;
  const registerCustomer = document.getElementById("registerCustomer");
  registerCustomer.classList.toggle("hidden", !commercialLead);
  registerCustomer.disabled = !commercialLead;
  document.getElementById("more").disabled = commercialLead;
  document.getElementById("text").disabled = commercialLead;
  document.getElementById("text").placeholder = commercialLead
    ? "Este lead é tratado pelo comercial."
    : "Digite sua mensagem ao cliente";
  document.querySelector("#composer button").disabled = commercialLead;
  renderQueue();
}
function modal(title, body, fn) {
  modalAction = fn;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = body;
  document.getElementById("modal").classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  modalAction = null;
}
document.getElementById("cancel").onclick = closeModal;
document.getElementById("modalForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await modalAction(new FormData(e.currentTarget));
    closeModal();
  } catch (err) {
    window.alert(err.message);
  }
};
function activate(view) {
  const commercial = view === "commercial";
  document.getElementById("queuePanel").classList.toggle("hidden", commercial);
  document.getElementById("queueView").classList.toggle("hidden", commercial);
  document
    .getElementById("commercialView")
    .classList.toggle("active", commercial);
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (commercial && !crmLoaded) loadCrm();
}
async function loadCrm() {
  const root = document.getElementById("crmContent");
  root.textContent = "Carregando dados comerciais…";
  try {
    const r = await api("/api/operator/crm/overview");
    if (!r.connected) {
      root.textContent = r.reason;
      return;
    }
    const o = r.overview,
      m = o.metrics,
      name = (x) =>
        x.Name ||
        x.CompanyName ||
        x.LegalName ||
        x.TradeName ||
        "Contato sem nome";
    const contact = (x) =>
      x.Email || x.Phone || x.MobilePhone || "Sem contato informado";
    const rows = (list, type) =>
      list
        .slice(0, 30)
        .map(
          (x, i) =>
            '<button class="record" data-type="' +
            type +
            '" data-index="' +
            i +
            '"><b>' +
            esc(
              type === "deal"
                ? x.Title || x.Name || "Oportunidade sem título"
                : name(x),
            ) +
            "</b><span>" +
            esc(
              type === "deal"
                ? (x.Stage?.Name || x.StageName || "Etapa não informada") +
                    " · " +
                    money(x.Amount)
                : contact(x),
            ) +
            "</span></button>",
        )
        .join("") ||
      '<p class="muted" style="padding:16px">Nenhum registro recente.</p>';
    root.innerHTML =
      '<div class="crm-summary"><div class="metric"><span>Oportunidades recentes</span><b>' +
      m.totalDeals +
      '</b></div><div class="metric"><span>Valor da amostra</span><b>' +
      money(m.totalAmount) +
      '</b></div><div class="metric"><span>Contatos recentes</span><b>' +
      o.contacts.length +
      '</b></div></div><div class="crm-layout"><section class="panel"><h2>Recentes no Ploomes</h2>' +
      rows(o.contacts, "contact") +
      '</section><section class="panel"><h2>Oportunidades</h2>' +
      rows(o.deals, "deal") +
      "</section></div>";
    root.querySelectorAll(".record").forEach(
      (b) =>
        (b.onclick = () => {
          const item = (b.dataset.type === "deal" ? o.deals : o.contacts)[
              Number(b.dataset.index)
            ],
            entries =
              Object.entries(item)
                .filter(
                  ([k, v]) =>
                    !k.startsWith("@") &&
                    v !== null &&
                    v !== undefined &&
                    typeof v !== "object",
                )
                .map(([k, v]) => "<p><b>" + esc(k) + ":</b> " + esc(v) + "</p>")
                .join("") || '<p class="muted">Sem detalhes adicionais.</p>';
          modal(
            b.dataset.type === "deal"
              ? "Detalhes da oportunidade"
              : "Detalhes do contato",
            entries,
            async () => {},
          );
        }),
    );
    crmLoaded = true;
  } catch (e) {
    root.textContent = "Não foi possível carregar o Ploomes agora.";
  }
}
document.getElementById("crmRefresh").onclick = () => {
  crmLoaded = false;
  loadCrm();
};
document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await fetch("/api/operator/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
      }),
    });
    if (!r.ok)
      throw Error((await r.json()).error || "Não foi possível entrar.");
    const s = await r.json();
    sessionStorage.setItem("operatorToken", s.token);
    sessionStorage.setItem("operatorName", s.user.name);
    sessionStorage.setItem("operatorRole", s.user.role);
    localStorage.setItem("lifeLastAccount", s.user.email);
    document.getElementById("accountName").textContent = s.user.name;
    document.getElementById("accountRole").textContent =
      s.user.role + " · disponível para atender";
    document
      .getElementById("commercialNav")
      .classList.toggle("hidden", !roles.includes(s.user.role));
    await load();
    connectLiveUpdates();
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  } catch (err) {
    document.getElementById("loginNotice").textContent = err.message;
  }
};
const last = localStorage.getItem("lifeLastAccount");
if (last) {
  document.getElementById("email").value = last;
  document.getElementById("lastAccount").textContent =
    "Última conta usada: " + last + ". Informe sua senha para continuar.";
}
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      queueMode = b.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((x) => x.classList.toggle("active", x === b));
      renderQueue();
    }),
);
document
  .querySelectorAll("[data-view]")
  .forEach((b) => (b.onclick = () => activate(b.dataset.view)));
document.getElementById("search").oninput = (e) => {
  query = e.target.value.trim().toLowerCase();
  renderQueue();
};
document.getElementById("priority").onchange = (e) => {
  priority = e.target.value;
  renderQueue();
};
document.getElementById("refresh").onclick = () =>
  load().catch((e) => note(e.message));
document.getElementById("alerts").onclick = async () => {
  alertsEnabled = !alertsEnabled;
  if (alertsEnabled) {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
      await context.close();
    } catch (_) {}
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }
  localStorage.setItem("lifeIncomingAlerts", String(alertsEnabled));
  updateAlertControl();
};
document.getElementById("claim").onclick = async () => {
  try {
    await api("/api/operator/conversations/" + selected.id + "/claim", {
      method: "POST",
    });
    await load();
    note(
      "Atendimento assumido. O cliente foi avisado que " +
        sessionStorage.getItem("operatorName") +
        " assume a conversa.",
      true,
    );
  } catch (e) {
    note(e.message);
  }
};
document.getElementById("registerCustomer").onclick = async () => {
  if (!selected) return;
  const button = document.getElementById("registerCustomer");
  button.disabled = true;
  try {
    await api("/api/operator/conversations/" + selected.id + "/commercial/sync-ploomes", { method: "POST" });
    await load();
    note("Cliente e oportunidade cadastrados no Ploomes.", true);
  } catch (e) {
    button.disabled = false;
    note(e.message);
  }
};
document.getElementById("more").onclick = () =>
  modal(
    "Mais ações",
    '<label class="field">Ação<select name="action"><option value="note">Adicionar nota interna</option><option value="followup">Agendar retorno</option>' +
      (selected.destinationArea === "commercial" ? '<option value="syncPloomes">Incluir automaticamente no Ploomes</option><option value="manualPloomes">Confirmar inclusão manual no Ploomes</option>' : '') +
      (["technical", "on_call"].includes(selected.destinationArea) ? '<option value="manualOs">Confirmar abertura manual da OS</option>' : '') +
      '<option value="release">Devolver à fila</option><option value="close">Encerrar atendimento</option></select></label><label class="field">Detalhe / resolução<textarea name="text" maxlength="2000" placeholder="Nota, resolução ou número da OS/Ploomes"></textarea></label><label class="field">Retorno<input name="followUpAt" type="datetime-local"></label>',
    async (f) => {
      const a = f.get("action"),
        t = f.get("text").trim();
      if (a === "note") {
        if (!t) throw Error("Escreva a nota.");
        await api("/api/operator/conversations/" + selected.id + "/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t }),
        });
      }
      if (a === "followup") {
        const v = f.get("followUpAt");
        if (!v) throw Error("Escolha data e horário.");
        await api("/api/operator/conversations/" + selected.id + "/follow-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ followUpAt: new Date(v).toISOString() }),
        });
      }
      if (a === "release")
        await api("/api/operator/conversations/" + selected.id + "/release", {
          method: "POST",
        });
      if (a === "manualPloomes") {
        if (!t) throw Error("Informe o ID da oportunidade criada no Ploomes.");
        await api("/api/operator/conversations/" + selected.id + "/commercial/manual-ploomes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ploomesId: t }),
        });
      }
      if (a === "syncPloomes") {
        await api("/api/operator/conversations/" + selected.id + "/commercial/sync-ploomes", { method: "POST" });
      }
      if (a === "manualOs") {
        if (!t) throw Error("Informe o número da OS aberta.");
        await api("/api/operator/conversations/" + selected.id + "/technical/manual-service-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceOrderNumber: t }),
        });
      }
      if (a === "close") {
        if (t.length < 3) throw Error("Registre a resolução do atendimento.");
        await api("/api/operator/conversations/" + selected.id + "/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolutionNote: t }),
        });
        selected = null;
        document.getElementById("detail").classList.add("hidden");
        document.getElementById("empty").classList.remove("hidden");
      }
      await load();
      note("Alteração salva.", true);
    },
  );
document.getElementById("composer").onsubmit = async (e) => {
  e.preventDefault();
  const text = document.getElementById("text").value.trim();
  if (!text) return;
  try {
    await api("/api/operator/conversations/" + selected.id + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    document.getElementById("text").value = "";
    await open(selected.id);
  } catch (err) {
    note(err.message);
  }
};
document.getElementById("logout").onclick = () => {
  eventController?.abort();
  sessionStorage.clear();
  location.reload();
};
alertsEnabled = localStorage.getItem("lifeIncomingAlerts") === "true";
updateAlertControl();
// SSE acelera a atualização na mesma instância; polling curto também cobre
// reconexões e múltiplas instâncias (ex.: Cloud Run), onde eventos não são compartilhados.
setInterval(() => {
  if (sessionStorage.getItem("operatorToken") && !document.getElementById("app").classList.contains("hidden"))
    load().catch(() => {});
}, 5_000);
</script></body></html>`;
