import { adminDashboardHtml } from './admin-dashboard.js';

// Mantém a tela estática enxuta e acrescenta o resumo vivo da operação após o app iniciar.
export function enhancedAdminDashboardHtml(): string {
  const enhancement = `<script>
(() => {
  const sideNavigation = document.querySelector('.side');
  if (sideNavigation && window.matchMedia('(min-width: 801px)').matches) {
    sideNavigation.style.position = 'sticky';
    sideNavigation.style.top = '0';
    sideNavigation.style.height = '100vh';
    sideNavigation.style.overflowY = 'auto';
    sideNavigation.style.alignSelf = 'start';
  }
  const operation = document.querySelector('[data-page="operation"]');
  if (!operation) return;
  const customersButton = document.createElement('button');
  customersButton.type = 'button'; customersButton.textContent = 'Clientes e empresas';
  customersButton.className = 'customer-nav';
  document.querySelector('.nav')?.append(customersButton);
  const customers = document.createElement('section');
  customers.className = 'view hidden'; customers.dataset.page = 'customers'; customers.innerHTML = '<div class="head"><div><h2>Clientes e empresas</h2><p class="muted">Consulte o Ploomes por nome, CPF ou CNPJ antes de cadastrar novamente.</p></div><span id="customerFieldStatus" class="muted">Campos sincronizados do Ploomes</span></div><section class="panel" style="margin-top:16px"><label>Buscar cadastro<input id="customerSearch" type="search" placeholder="Nome, CPF ou CNPJ" autocomplete="off"></label><p id="customerSearchStatus" class="muted">Digite pelo menos 2 caracteres.</p><div id="customerResults" class="items"></div></section>';
  document.querySelector('.content')?.append(customers);
  const showCustomers = () => { document.querySelectorAll('[data-page]').forEach((item) => item.classList.add('hidden')); customers.classList.remove('hidden'); document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active')); customersButton.classList.add('active'); document.querySelector('#title').textContent = 'Clientes e empresas'; document.querySelector('#subtitle').textContent = 'Confira o cadastro no Ploomes antes de criar uma nova oportunidade.'; };
  customersButton.onclick = showCustomers;
  document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => customersButton.classList.remove('active')));
  const customerSearch = customers.querySelector('#customerSearch');
  const customerResults = customers.querySelector('#customerResults');
  const customerStatus = customers.querySelector('#customerSearchStatus');
  let customerTimer;
  customerSearch?.addEventListener('input', () => { clearTimeout(customerTimer); const query = customerSearch.value.trim(); customerResults.innerHTML = ''; if (query.length < 2) { customerStatus.textContent = 'Digite pelo menos 2 caracteres.'; return; } customerStatus.textContent = 'Consultando o Ploomes…'; customerTimer = setTimeout(async () => { try { const response = await originalFetch('/api/admin/ploomes/contacts?q=' + encodeURIComponent(query), {headers: auth()}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o Ploomes.'); customerStatus.textContent = data.contacts.length ? data.contacts.length + ' cadastro(s) encontrado(s).' : 'Nenhum cadastro encontrado. Confirme os dados antes de criar um novo.'; data.contacts.forEach((contact) => { const row = document.createElement('li'); const text = document.createElement('span'); const documentValue = contact.CNPJ || contact.Register || contact.CPF || 'Documento não informado'; text.innerHTML = '<strong>' + esc(contact.Name || contact.LegalName || 'Cadastro sem nome') + '</strong><br><span class="meta">' + esc(String(documentValue)) + (contact.Email ? ' · ' + esc(String(contact.Email)) : '') + '</span>'; row.append(text); customerResults.append(row); }); } catch (error) { customerStatus.textContent = error.message || 'Não foi possível consultar o Ploomes.'; } }, 350); });
  const dashboard = document.createElement('div');
  dashboard.className = 'operation-live';
  dashboard.innerHTML = '<div class="head"><div><h2>Operação do dia</h2><p class="muted">Acompanhe os atendimentos, a equipe e o plantão antes de alterar regras.</p></div><p id="opsHealth" class="muted">Verificando sistema…</p></div><label style="margin-top:16px">Buscar na operação<input id="opsSearch" type="search" placeholder="Membro, área, arquivo ou plantonista"></label><div class="grid" style="margin-top:16px"><section class="panel"><p class="eyebrow">Novos</p><p class="metric" id="opsNew">—</p><p class="muted">aguardando início</p></section><section class="panel"><p class="eyebrow">Em atendimento</p><p class="metric" id="opsInProgress">—</p><p class="muted">casos assumidos</p></section><section class="panel"><p class="eyebrow">Retornos</p><p class="metric" id="opsFollowUps">—</p><p class="muted">agendados</p></section><section class="panel"><p class="eyebrow">Resolvidos</p><p class="metric" id="opsResolved">—</p><p class="muted">encerrados no sistema</p></section><section class="panel"><p class="eyebrow">SLA vencido</p><p class="metric" id="opsSlaBreaches">—</p><p class="muted">casos que pedem ação</p></section><section class="panel"><p class="eyebrow">Tempo médio</p><p class="metric" id="opsResolutionTime">—</p><p class="muted">até a resolução</p></section></div><div class="grid" style="margin-top:16px"><section class="panel"><h2>Equipe</h2><ul id="opsMembers" class="items"></ul></section><section class="panel"><h2>Plantões publicados</h2><p class="muted">Escalas enviadas por documento, com período e equipe responsável.</p><div id="opsSchedules" class="docs"></div></section></div><div class="grid" style="margin-top:16px"><section class="panel"><h2>Atividade recente</h2><ul id="opsActivity" class="items"></ul></section></div>';
  const alertPanel = document.createElement('section'); alertPanel.className = 'panel'; alertPanel.innerHTML = '<h2>Alertas</h2><ul id="opsAlerts" class="items"></ul>'; dashboard.querySelectorAll('.grid')[1].append(alertPanel);
  const failedPanel = document.createElement('section'); failedPanel.className = 'panel'; failedPanel.innerHTML = '<h2>Eventos para reprocessar</h2><p class="muted">Mensagens que falharam cinco vezes ficam aqui para revisão segura.</p><ul id="opsFailedJobs" class="items"></ul>'; dashboard.querySelectorAll('.grid')[2].append(failedPanel);
  const panels = [...dashboard.querySelectorAll('.panel')];
  const tabNames = ['Atendimentos', 'Equipe', 'Plantões', 'Atividade', 'Alertas'];
  const groups = [panels.slice(0, 6), panels.slice(6, 7), panels.slice(7, 8), panels.slice(8, 9), panels.slice(9, 10)];
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.style.cssText = 'display:flex;gap:6px;margin:16px 0';
  groups.forEach((group, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = tabNames[index]; button.style.cssText = 'border:1px solid #dce3e8;background:#fff;color:#506575;padding:9px 12px';
    button.className = index === 0 ? 'active' : '';
    button.onclick = () => { groups.forEach((items, itemIndex) => items.forEach(item => item.classList.toggle('hidden', itemIndex !== index))); tabs.querySelectorAll('button').forEach((tab, itemIndex) => { tab.classList.toggle('active', itemIndex === index); tab.style.background = itemIndex === index ? '#eef6fd' : '#fff'; tab.style.color = itemIndex === index ? '#0d5c9e' : '#506575'; }); };
    tabs.append(button);
    if (index === 0) { button.style.background = '#eef6fd'; button.style.color = '#0d5c9e'; }
    group.forEach(item => item.classList.toggle('hidden', index !== 0));
  });
  dashboard.querySelector('.head').after(tabs);
  operation.prepend(dashboard);
  const form = document.querySelector('#documentForm');
  const summary = document.querySelector('#documentSummary');
  if (form && summary) {
    const fields = document.createElement('div'); fields.className = 'formgrid';
    fields.innerHTML = '<label>Data ou período do plantão<input id="onCallDate" placeholder="Ex.: 16 a 20/10/2026"></label><label>Plantonistas e apoio<input id="onCallMembers" placeholder="Ex.: Ana, João (backup)"></label>';
    summary.parentElement.before(fields);
    document.querySelector('#fileInput')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file || !/\.csv$/i.test(file.name)) return;
      const text = await file.text();
      const dates = text.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g) ?? [];
      const rows = text.split(/\r?\n/).slice(1).map(row => row.split(/[;,]/)[0]?.trim()).filter(value => value && value.length > 2 && !/data|dia|nome/i.test(value));
      const dateField = document.querySelector('#onCallDate'), membersField = document.querySelector('#onCallMembers');
      if (dateField && dates.length) dateField.value = [...new Set(dates)].slice(0, 4).join(' · ');
      if (membersField && rows.length) membersField.value = [...new Set(rows)].slice(0, 12).join(', ');
    });
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, init) => {
    if (String(url).includes('/api/admin/documents') && init && init.method === 'POST' && typeof init.body === 'string') {
      try { const body = JSON.parse(init.body); body.onCallDate = document.querySelector('#onCallDate')?.value || undefined; body.onCallMembers = document.querySelector('#onCallMembers')?.value || undefined; init = {...init, body: JSON.stringify(body)}; } catch {}
    }
    return originalFetch(url, init);
  };
  const auth = () => ({ Authorization: 'Bearer ' + sessionStorage.getItem('adminToken') });
  const put = (id, value) => { const el = document.querySelector(id); if (el) el.textContent = value; };
  const activityLabel = (event, actor) => ({
    'on_call_schedule.published': actor + ' publicou uma escala de plantão.',
    'operational.alert_created': 'O sistema criou um alerta operacional.',
    'operational.alert_resolved': actor + ' resolveu um alerta operacional.',
    'operational_document.uploaded': actor + ' enviou um documento operacional.',
    'configuration.updated': actor + ' atualizou uma configuração.',
    'user.created': actor + ' cadastrou um membro da equipe.',
  }[event] || actor + ' registrou uma atualização na operação.');
  const render = async () => {
    if (!sessionStorage.getItem('adminToken')) return;
    try {
      await originalFetch('/api/admin/jobs/alerts', { method: 'POST', headers: auth() });
      const [overviewResponse, documentsResponse, alertsResponse, healthResponse, failedResponse] = await Promise.all([originalFetch('/api/admin/overview', {headers: auth()}), originalFetch('/api/admin/documents', {headers: auth()}), originalFetch('/api/admin/alerts', {headers: auth()}), originalFetch('/api/admin/health', {headers: auth()}), originalFetch('/api/admin/jobs/webhooks/failed', {headers: auth()})]);
      if (healthResponse.ok) { const health = await healthResponse.json(); put('#opsHealth', health.openAlerts ? health.openAlerts + ' alerta(s) em aberto' : 'Sistema operacional'); } else put('#opsHealth', 'Sistema precisa de atenção');
      if (overviewResponse.ok) { const data = await overviewResponse.json(); put('#opsNew', data.newCases); put('#opsInProgress', data.inProgress); put('#opsFollowUps', data.followUps); put('#opsResolved', data.resolved); put('#opsSlaBreaches', data.slaBreaches); put('#opsResolutionTime', data.averageResolutionMinutes == null ? '—' : data.averageResolutionMinutes + ' min'); const members = document.querySelector('#opsMembers'); members.innerHTML = ''; const active = data.members.filter(member => member.active); if (!active.length) members.innerHTML = '<li><span>Nenhum membro ativo cadastrado.</span></li>'; active.forEach(member => { const row = document.createElement('li'), text = document.createElement('span'); text.dataset.search = (member.name + ' ' + member.area).toLowerCase(); text.textContent = member.name + ' · ' + member.area; row.append(text); members.append(row); }); const activity = document.querySelector('#opsActivity'); activity.innerHTML = ''; data.recentActivity.forEach(event => { const row = document.createElement('li'), text = document.createElement('span'); text.textContent = activityLabel(event.eventType, event.actor); row.append(text); activity.append(row); }); if (!data.recentActivity.length) activity.innerHTML = '<li><span>Nenhuma alteração recente.</span></li>'; }
      if (documentsResponse.ok) { const docs = await documentsResponse.json(); const schedules = document.querySelector('#opsSchedules'); schedules.innerHTML = ''; const rows = docs.filter(doc => doc.category === 'on_call_schedule'); if (!rows.length) schedules.innerHTML = '<div class="empty">Nenhuma escala publicada. Envie a planilha de plantão na aba Documentos.</div>'; rows.forEach(doc => { const row = document.createElement('article'); row.className = 'doc'; row.dataset.search = (doc.fileName + ' ' + (doc.onCallDate || '') + ' ' + (doc.onCallMembers || '')).toLowerCase(); const label = document.createElement('div'); label.className = 'file'; label.textContent = 'PL'; const text = document.createElement('div'); const name = document.createElement('div'); name.className = 'name'; name.textContent = doc.fileName; const details = document.createElement('div'); details.className = 'meta'; details.textContent = (doc.onCallDate || 'Período não informado') + ' · ' + (doc.onCallMembers || 'Equipe não informada'); text.append(name, details); const status = document.createElement('span'); status.className = 'tag ' + (doc.status === 'needs_review' ? 'review' : ''); status.textContent = doc.status === 'needs_review' ? 'Revisar' : 'Publicado'; row.append(label, text, status); schedules.append(row); }); const search = document.querySelector('#opsSearch'); search.oninput = () => { const term = search.value.toLowerCase(); dashboard.querySelectorAll('[data-search]').forEach(item => item.closest('li,article').classList.toggle('hidden', !item.dataset.search.includes(term))); }; }
      if (alertsResponse.ok) { const alerts = await alertsResponse.json(), list = document.querySelector('#opsAlerts'); list.innerHTML = ''; if (!alerts.length) list.innerHTML = '<li><span>Nenhum alerta aberto.</span></li>'; alerts.filter(alert => alert.status === 'open').forEach(alert => { const row = document.createElement('li'), text = document.createElement('span'), button = document.createElement('button'); text.textContent = alert.title + ' · ' + alert.detail; button.textContent = 'Resolver'; button.onclick = async () => { await originalFetch('/api/admin/alerts/' + alert.id + '/resolve', { method: 'POST', headers: auth() }); render(); }; row.append(text, button); list.append(row); }); }
      if (failedResponse.ok) { const jobs = await failedResponse.json(), list = document.querySelector('#opsFailedJobs'); list.innerHTML = ''; if (!jobs.length) list.innerHTML = '<li><span>Nenhum evento aguardando reprocessamento.</span></li>'; jobs.forEach(job => { const row = document.createElement('li'), text = document.createElement('span'), button = document.createElement('button'); text.textContent = job.metaMessageId + ' · ' + (job.lastError || 'Falha sem detalhe'); button.textContent = 'Reprocessar'; button.onclick = async () => { button.disabled = true; await originalFetch('/api/admin/jobs/webhooks/' + job.id + '/retry', { method: 'POST', headers: auth() }); render(); }; row.append(text, button); list.append(row); }); }
    } catch {}
  };
  const addScheduleActions = async () => {
    const response = await originalFetch('/api/admin/documents', { headers: auth() });
    if (!response.ok) return;
    const schedules = (await response.json()).filter(doc => doc.category === 'on_call_schedule');
    document.querySelectorAll('#opsSchedules .doc').forEach((row, index) => {
      const schedule = schedules[index]; if (!schedule) return;
      const action = window.document.createElement('button');
      action.type = 'button'; action.textContent = schedule.isCurrent ? 'Escala vigente' : 'Tornar vigente';
      action.disabled = Boolean(schedule.isCurrent);
      action.onclick = async () => { if (!confirm('Tornar esta a escala vigente? A escala atual será substituída.')) return; await originalFetch('/api/admin/documents/' + schedule.id + '/publish-on-call', { method: 'POST', headers: auth() }); await render(); await addScheduleActions(); };
      row.append(action);
    });
  };
  setTimeout(async () => { await render(); await addScheduleActions(); }, 350);
})();
</script>`;
  return adminDashboardHtml.replace('</body>', `${enhancement}</body>`);
}
