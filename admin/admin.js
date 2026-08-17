
(() => {
  const STORAGE_KEY = 'ks_demo_requests_v1';
  const SESSION_KEY = 'ks_admin_demo_session';
  const DB_NAME = 'KyustendilScreenDemo';
  const DB_VERSION = 1;
  const FILE_STORE = 'files';

  const statusLabels = {
    new: 'Нова',
    changes: 'Искана промяна',
    waiting: 'Чака плащане',
    paid: 'Платена',
    active: 'Активна',
    done: 'Приключена',
    rejected: 'Отказана'
  };

  const statusClasses = {
    new: 'status-new',
    changes: 'status-changes',
    waiting: 'status-waiting',
    paid: 'status-paid',
    active: 'status-active',
    done: 'status-done',
    rejected: 'status-rejected'
  };

  const packageLabels = {
    single: 'SINGLE',
    local: 'LOCAL',
    city: 'CITY'
  };

  function esc(v=''){
    return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function loadRequests(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveRequests(requests){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    renderAll();
  }

  function nextId(requests){
    const nums = requests.map(r => Number(String(r.id || '').replace(/\D/g,''))).filter(Boolean);
    return `KS-${String((nums.length ? Math.max(...nums) : 1000) + 1).padStart(4,'0')}`;
  }

  function formatDate(value){
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('bg-BG', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}).format(date);
  }

  function formatDateOnly(value){
    if (!value) return '—';
    const date = new Date(value);
    return new Intl.DateTimeFormat('bg-BG', {day:'2-digit', month:'2-digit', year:'numeric'}).format(date);
  }

  function addCalendarMonth(value){
    const source = value instanceof Date ? new Date(value) : new Date(value);
    const year = source.getFullYear();
    const month = source.getMonth();
    const day = source.getDate();
    const hour = source.getHours();
    const minute = source.getMinutes();
    const second = source.getSeconds();
    const ms = source.getMilliseconds();

    const targetMonthStart = new Date(year, month + 1, 1, hour, minute, second, ms);
    const lastDayTargetMonth = new Date(
      targetMonthStart.getFullYear(),
      targetMonthStart.getMonth() + 1,
      0
    ).getDate();

    targetMonthStart.setDate(Math.min(day, lastDayTargetMonth));
    return targetMonthStart;
  }

  function campaignMsLeft(r){
    if (!r?.expiresAt) return null;
    return new Date(r.expiresAt).getTime() - Date.now();
  }

  function campaignTimeLeftText(r){
    const ms = campaignMsLeft(r);
    if (ms === null) return '';
    if (ms <= 0) return 'изтекла';

    const hours = Math.ceil(ms / (60 * 60 * 1000));
    if (hours <= 24) return hours === 1 ? 'остава 1 час' : `остават ${hours} часа`;

    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    return days === 1 ? 'остава 1 ден' : `остават ${days} дни`;
  }

  function campaignUrgency(r){
    const ms = campaignMsLeft(r);
    if (ms === null || ms <= 0) return null;
    const hours = ms / (60 * 60 * 1000);
    if (hours <= 24) return 'one-day';
    if (hours <= 72) return 'three-days';
    return null;
  }

  function syncCampaignLifecycle(){
    const requests = loadRequests();
    let changed = false;
    const now = new Date();

    requests.forEach(r => {
      if (r.status !== 'active') return;

      // Migrate older demo active records that were created before v1.6.
      if (!r.activeAt) {
        r.activeAt = now.toISOString();
        changed = true;
      }

      if (!r.expiresAt) {
        r.expiresAt = addCalendarMonth(new Date(r.activeAt)).toISOString();
        changed = true;
      }

      if (new Date(r.expiresAt).getTime() <= now.getTime()) {
        r.status = 'done';
        r.completedAt = now.toISOString();
        r.completionReason = 'expired';
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    }
    return requests;
  }

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath:'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putStoredFile(record){
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getStoredFile(key){
    if (!key) return null;
    try{
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, 'readonly');
        const req = tx.objectStore(FILE_STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }catch{ return null; }
  }

  async function downloadFile(key, filename){
    const record = await getStoredFile(key);
    if (!record?.blob) {
      toast('Файлът не е наличен в този браузър.');
      return;
    }
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || record.name || 'file';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message){
    const el = document.getElementById('adminToast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(window.__ksToast);
    window.__ksToast = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // Login / demo session
  const demoLogin = document.getElementById('demoLogin');
  const adminShell = document.getElementById('adminShell');
  function enterAdmin(){
    sessionStorage.setItem(SESSION_KEY, '1');
    demoLogin.hidden = true;
    adminShell.hidden = false;
    renderAll();

    // Initialize deterministic in-admin navigation after the script is ready.
    setTimeout(() => {
      initAdminNavigation();
    }, 0);
  }
  if (sessionStorage.getItem(SESSION_KEY) === '1') enterAdmin();
  document.getElementById('enterDemo').addEventListener('click', enterAdmin);
  document.getElementById('exitDemo').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  // Deterministic Admin navigation.
  // We keep our own trail instead of relying on the browser's mixed page history.
  const titles = {dashboard:'Табло',requests:'Заявки',clients:'Клиенти',screens:'Екрани',creatives:'Материали'};
  let adminTrail = [];
  let currentAdminState = {view:'dashboard', statusFilter:'all', requestId:null};
  let browserBackArmed = false;

  function normalizeAdminState(state={}){
    return {
      view: state.view || 'dashboard',
      statusFilter: state.view === 'requests' ? (state.statusFilter || 'all') : 'all',
      requestId: state.requestId || null
    };
  }

  function sameAdminState(a,b){
    return a.view === b.view &&
      (a.statusFilter || 'all') === (b.statusFilter || 'all') &&
      (a.requestId || null) === (b.requestId || null);
  }

  function currentViewName(){
    return currentAdminState.view || 'dashboard';
  }

  function currentFilterValue(){
    return currentAdminState.view === 'requests'
      ? (currentAdminState.statusFilter || 'all')
      : 'all';
  }

  function updateAdminBackButton(){
    const btn = document.getElementById('adminBack');
    if (!btn) return;
    btn.hidden = adminTrail.length === 0;
  }

  function setView(name){
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.viewPanel === name));
    document.querySelectorAll('.nav-item[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    document.getElementById('viewTitle').textContent = titles[name] || 'Admin';
    document.querySelector('.sidebar').classList.remove('open');
    if (name === 'requests') renderRequests();
    if (name === 'clients') renderClients();
    if (name === 'creatives') renderCreatives();
  }

  function applyAdminState(state){
    const next = normalizeAdminState(state);
    currentAdminState = next;

    const filter = document.getElementById('statusFilter');
    const search = document.getElementById('requestSearch');

    if (filter) filter.value = next.statusFilter || 'all';
    if (search && next.view === 'requests') search.value = '';

    setView(next.view);

    if (next.requestId) {
      openRequestDirect(next.requestId);
    } else {
      closeRequestDirect();
    }

    updateAdminBackButton();
  }

  function navigateAdmin(state){
    const next = normalizeAdminState(state);
    if (sameAdminState(currentAdminState, next)) return;

    adminTrail.push({...currentAdminState});
    applyAdminState(next);
  }

  function goAdminBack(){
    if (!adminTrail.length) {
      // At the Admin root there is nowhere internal to go back to.
      // Stay on Dashboard; leaving Admin is explicit via the logo/site link.
      if (!sameAdminState(currentAdminState, {view:'dashboard',statusFilter:'all',requestId:null})) {
        applyAdminState({view:'dashboard',statusFilter:'all',requestId:null});
      }
      return;
    }

    const previous = adminTrail.pop();
    applyAdminState(previous);
  }

  function initAdminNavigation(){
    adminTrail = [];
    currentAdminState = {view:'dashboard', statusFilter:'all', requestId:null};
    applyAdminState(currentAdminState);

    // Browser Back trap:
    // two same-document entries let us receive popstate before the browser
    // can jump back to the public website. Each Back is then mapped to our
    // own exact Admin trail.
    const baseUrl = location.href.split('#')[0];
    history.replaceState({ksAdminBase:true}, '', `${baseUrl}#admin-base`);
    history.pushState({ksAdminTrap:true}, '', `${baseUrl}#admin`);
    browserBackArmed = true;
  }

  function showView(name){
    navigateAdmin({
      view:name,
      statusFilter:name === 'requests' ? 'all' : 'all',
      requestId:null
    });
  }

  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.querySelectorAll('[data-go-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.goView)));

  function openRequestsByStatus(status){
    navigateAdmin({view:'requests', statusFilter:status, requestId:null});
  }

  document.querySelectorAll('[data-status-shortcut]').forEach(card => {
    card.addEventListener('click', () => openRequestsByStatus(card.dataset.statusShortcut));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRequestsByStatus(card.dataset.statusShortcut);
      }
    });
  });

  document.getElementById('adminBack').addEventListener('click', goAdminBack);
  document.getElementById('mobileMenu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

  window.addEventListener('popstate', () => {
    if (sessionStorage.getItem(SESSION_KEY) !== '1' || !browserBackArmed) return;

    // Map the browser's Back gesture/button to one exact Admin step,
    // then re-arm the same-document trap.
    goAdminBack();
    const baseUrl = location.href.split('#')[0];
    history.pushState({ksAdminTrap:true}, '', `${baseUrl}#admin`);
  });

  // Seed demo data
  document.getElementById('seedDemo').addEventListener('click', () => {
    let requests = loadRequests();
    if (requests.some(r => r.demoSeed)) {
      toast('Примерните заявки вече са заредени.');
      return;
    }
    const now = Date.now();
    const sample = [
      {
        id:'KS-1001', createdAt:new Date(now-1000*60*38).toISOString(), status:'new', demoSeed:true,
        company:'Ресторант Център', name:'Мария Петрова', phone:'0888 111 222', email:'maria@example.com',
        package:'local', packageLabel:'LOCAL — €49 / месец', packagePrice:49,
        designType:'static', designLabel:'Статична визия — +€3 еднократно', designPrice:3, total:52,
        locations:'Заведение + Аптека', message:'Обедно меню за септември.',
        creativeText:'Обедно меню от €7.90', creativeContact:'0888 111 222', files:[]
      },
      {
        id:'KS-1002', createdAt:new Date(now-1000*60*60*5).toISOString(), status:'waiting', demoSeed:true,
        company:'Studio Glow', name:'Ива Георгиева', phone:'0899 222 333', email:'iva@example.com',
        package:'single', packageLabel:'SINGLE — €25 / месец', packagePrice:25,
        designType:'ready', designLabel:'Готова реклама — €0', designPrice:0, total:25,
        locations:'Аптека', message:'', files:[{name:'glow-promo.png', type:'image/png', size:482000, key:null}]
      },
      {
        id:'KS-1003', createdAt:new Date(now-1000*60*60*26).toISOString(), status:'paid', demoSeed:true,
        company:'Auto Pro', name:'Николай Димитров', phone:'0877 333 444', email:'n.dimitrov@example.com',
        package:'city', packageLabel:'CITY — 4–5 екрана — €69 / месец', packagePrice:69,
        designType:'video', designLabel:'Анимирана рекламна визия — +€10 еднократно', designPrice:10, total:79,
        locations:'Всички активни', message:'Промоция на гуми.', creativeText:'-15% на монтаж до края на месеца', creativeContact:'0877 333 444',
        files:[{name:'logo-autopro.png', type:'image/png', size:128000, key:null},{name:'tires.jpg', type:'image/jpeg', size:893000, key:null}]
      }
    ];
    requests = [...sample, ...requests];
    saveRequests(requests);
    toast('Заредени са 3 примерни заявки.');
  });

  function calcStats(requests){
    const paidStatuses = ['paid','active','done'];
    return {
      new: requests.filter(r => r.status === 'new').length,
      waiting: requests.filter(r => r.status === 'waiting').length,
      paid: requests.filter(r => r.status === 'paid').length,
      active: requests.filter(r => r.status === 'active').length,
      revenue: requests.filter(r => paidStatuses.includes(r.status)).reduce((s,r) => s + Number(r.total || 0), 0)
    };
  }

  function renderDashboard(){
    const requests = syncCampaignLifecycle();
    const stats = calcStats(requests);
    Object.entries(stats).forEach(([k,v]) => {
      const el = document.querySelector(`[data-stat="${k}"]`);
      if (el) el.textContent = k === 'revenue' ? `€${v}` : v;
    });
    document.querySelectorAll('[data-new-count]').forEach(el => {
      el.textContent = stats.new;
      el.hidden = stats.new === 0;
    });
    const recent = requests
      .filter(r => r.status === 'new')
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt))
      .slice(0,5);

    const box = document.getElementById('recentRequests');
    if (!recent.length){
      box.className = 'compact-list empty-state';
      box.innerHTML = '<p>Няма нови заявки за преглед.</p>';
    } else {
      box.className = 'compact-list';
      box.innerHTML = recent.map(r => `
        <div class="compact-row">
          <div>
            <strong>${esc(r.id)} · ${esc(r.company)}</strong>
            <small>${esc(packageLabels[r.package] || r.package)} · €${Number(r.total || 0)} · ${formatDate(r.createdAt)}</small>
          </div>
          <span class="status-pill ${statusClasses[r.status] || ''}">${esc(statusLabels[r.status] || r.status)}</span>
          <button class="row-open" data-open-request="${esc(r.id)}">Отвори</button>
        </div>`).join('');
    }

    const expiring = requests
      .filter(r => r.status === 'active' && campaignUrgency(r))
      .sort((a,b) => new Date(a.expiresAt) - new Date(b.expiresAt));

    const alertBox = document.getElementById('campaignAlerts');
    const count = document.getElementById('expiryCount');

    count.textContent = expiring.length;
    count.hidden = expiring.length === 0;

    if (!expiring.length){
      alertBox.className = 'campaign-alerts empty-state';
      alertBox.innerHTML = '<p>Няма кампании, които изтичат през следващите 3 дни.</p>';
    } else {
      alertBox.className = 'campaign-alerts';
      alertBox.innerHTML = expiring.map(r => {
        const urgency = campaignUrgency(r);
        const label = urgency === 'one-day' ? 'ИЗТИЧА ДО 24 ЧАСА' : 'ИЗТИЧА ДО 3 ДНИ';
        return `
          <button class="campaign-alert ${urgency}" data-open-request="${esc(r.id)}">
            <span class="alert-icon">!</span>
            <span class="alert-copy">
              <strong>${esc(r.id)} · ${esc(r.company || r.name)}</strong>
              <small>${label} · край ${formatDateOnly(r.expiresAt)} · ${campaignTimeLeftText(r)}</small>
            </span>
            <span class="alert-arrow">Отвори →</span>
          </button>`;
      }).join('');
    }
  }

  function renderRequests(){
    const requests = syncCampaignLifecycle();
    const search = document.getElementById('requestSearch').value.trim().toLowerCase();
    const filter = document.getElementById('statusFilter').value;
    const rows = requests
      .filter(r => filter === 'all' || r.status === filter)
      .filter(r => !search || [r.id,r.company,r.name,r.email,r.phone].some(v => String(v||'').toLowerCase().includes(search)))
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
    const tbody = document.getElementById('requestsTable');
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><span class="request-id">${esc(r.id)}</span></td>
        <td class="client-cell"><strong>${esc(r.company || r.name)}</strong><small>${esc(r.name)} · ${esc(r.email)}</small></td>
        <td>${esc(packageLabels[r.package] || r.package || '—')}</td>
        <td><strong>€${Number(r.total || 0)}</strong></td>
        <td><span class="status-pill ${statusClasses[r.status] || ''}">${esc(statusLabels[r.status] || r.status)}</span></td>
        <td>${formatDate(r.createdAt)}</td>
        <td><button class="row-open" data-open-request="${esc(r.id)}">Отвори</button></td>
      </tr>`).join('');
    document.getElementById('requestsEmpty').hidden = rows.length > 0;
  }

  function renderClients(){
    const requests = loadRequests();
    const map = new Map();
    requests.forEach(r => {
      const key = (r.email || r.phone || r.name || '').toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, {name:r.name, company:r.company, email:r.email, phone:r.phone, count:0, value:0, last:r.createdAt});
      const c = map.get(key);
      c.count += 1;
      if (['paid','active','done'].includes(r.status)) c.value += Number(r.total || 0);
      if (new Date(r.createdAt) > new Date(c.last)) c.last = r.createdAt;
    });
    const grid = document.getElementById('clientsGrid');
    const clients = [...map.values()].sort((a,b) => new Date(b.last)-new Date(a.last));
    if (!clients.length){
      grid.innerHTML = '<div class="panel client-card"><h3>Все още няма клиенти</h3><p>Ще се появят автоматично след първата заявка.</p></div>';
      return;
    }
    grid.innerHTML = clients.map(c => `
      <article class="panel client-card">
        <span class="section-kicker">КЛИЕНТ</span>
        <h3>${esc(c.company || c.name)}</h3>
        <p>${esc(c.name)}</p>
        <div class="client-meta">
          <span>✉ ${esc(c.email || '—')}</span>
          <span>☎ ${esc(c.phone || '—')}</span>
          <span>▤ ${c.count} заявк${c.count===1?'а':'и'}</span>
          <span>€ Платено общо: <strong>€${c.value}</strong></span>
        </div>
      </article>`).join('');
  }

  function renderCreatives(){
    const requests = loadRequests().filter(r => (r.files || []).length);
    const grid = document.getElementById('creativeGrid');
    if (!requests.length){
      grid.innerHTML = '<div class="panel creative-card"><h3>Няма качени материали</h3><p>Когато клиент качи файл от публичната форма, ще се появи тук.</p></div>';
      return;
    }
    grid.innerHTML = requests.map(r => `
      <article class="panel creative-card">
        <div class="file-icon">${(r.files||[]).some(f=>String(f.type).startsWith('video/'))?'▶':'▧'}</div>
        <h3>${esc(r.id)} · ${esc(r.company)}</h3>
        <p>${esc(r.designLabel || '')}</p>
        <div class="file-list">
          ${(r.files||[]).map(f => `
            <div class="file-row">
              <div><strong>${esc(f.name)}</strong><small>${formatBytes(f.size)}</small></div>
              ${f.key ? `<button class="download-link" data-download-key="${esc(f.key)}" data-download-name="${esc(f.name)}">Свали</button>` : '<small>demo файл</small>'}
            </div>`).join('')}
        </div>
      </article>`).join('');
  }

  function formatBytes(bytes){
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(1)} MB`;
  }

  const drawer = document.getElementById('requestDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  let activeRequestId = null;

  function openRequestDirect(id){
    const r = loadRequests().find(x => x.id === id);
    if (!r) return;
    activeRequestId = id;
    document.getElementById('drawerRequestId').textContent = r.id;
    document.getElementById('drawerContent').innerHTML = requestDetailsHTML(r);
    document.getElementById('drawerActions').innerHTML = requestActionsHTML(r);
    backdrop.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    drawer.setAttribute('aria-hidden','false');
  }

  function openRequest(id, addToTrail=true){
    if (!addToTrail) {
      openRequestDirect(id);
      return;
    }

    navigateAdmin({
      view:currentAdminState.view,
      statusFilter:currentAdminState.statusFilter,
      requestId:id
    });
  }

  function closeRequestDirect(){
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    setTimeout(() => {
      if (!drawer.classList.contains('open')) backdrop.hidden = true;
    }, 210);
    activeRequestId = null;
  }

  function closeRequest(){
    if (currentAdminState.requestId) {
      goAdminBack();
    } else {
      closeRequestDirect();
    }
  }

  function requestDetailsHTML(r){
    const files = r.files || [];
    return `
      <div class="drawer-section">
        <span class="status-pill ${statusClasses[r.status]||''}">${esc(statusLabels[r.status]||r.status)}</span>
      </div>
      <div class="drawer-section">
        <h4>Клиент</h4>
        <div class="info-grid">
          <div class="info-box"><span>Фирма / бранд</span><strong>${esc(r.company || '—')}</strong></div>
          <div class="info-box"><span>Лице за контакт</span><strong>${esc(r.name || '—')}</strong></div>
          <div class="info-box"><span>Email</span><strong>${esc(r.email || '—')}</strong></div>
          <div class="info-box"><span>Телефон</span><strong>${esc(r.phone || '—')}</strong></div>
        </div>
      </div>
      <div class="drawer-section">
        <h4>Поръчка</h4>
        <div class="order-box">
          <div class="order-line"><span>${esc(r.packageLabel || packageLabels[r.package] || 'Пакет')}</span><strong>€${Number(r.packagePrice || 0)}</strong></div>
          <div class="order-line"><span>${esc(r.designLabel || 'Рекламна визия')}</span><strong>+€${Number(r.designPrice || 0)}</strong></div>
          <div class="order-line order-total"><span>Общо</span><strong>€${Number(r.total || 0)}</strong></div>
        </div>
      </div>
      ${(r.activeAt || r.expiresAt) ? `
      <div class="drawer-section">
        <h4>Период на кампанията</h4>
        <div class="campaign-period-box">
          <div>
            <span>Начало</span>
            <strong>${formatDateOnly(r.activeAt)}</strong>
          </div>
          <div>
            <span>Автоматичен край</span>
            <strong>${formatDateOnly(r.expiresAt)}</strong>
          </div>
        </div>
        ${r.status === 'active' ? `
          <div class="campaign-countdown ${campaignUrgency(r) || ''}">
            <strong>${campaignTimeLeftText(r)}</strong>
            <span>След тази дата рекламата трябва да спре, ако няма ново плащане.</span>
          </div>` : ''}
        ${r.status === 'done' && r.completionReason === 'expired' ? `
          <div class="campaign-countdown expired">
            <strong>Приключена автоматично</strong>
            <span>Срокът е изтекъл на ${formatDateOnly(r.expiresAt)}.</span>
          </div>` : ''}
      </div>` : ''}
      <div class="drawer-section">
        <h4>Локации</h4>
        <div class="note-box">${esc(r.locations || 'Не са посочени предпочитани локации.')}</div>
      </div>
      ${(r.creativeText || r.creativeContact) ? `
        <div class="drawer-section">
          <h4>Съдържание за визията</h4>
          <div class="info-grid">
            ${r.creativeText ? `<div class="info-box"><span>Послание / текст</span><strong>${esc(r.creativeText)}</strong></div>`:''}
            ${r.creativeContact ? `<div class="info-box"><span>Контакт за рекламата</span><strong>${esc(r.creativeContact)}</strong></div>`:''}
          </div>
        </div>` : ''}
      ${r.designType !== 'ready' ? `
      <div class="drawer-section">
        <h4>Готова визия за клиента</h4>
        ${r.finalCreative ? `
          <div class="final-creative-admin">
            <div class="file-chip">
              <span>${String(r.finalCreative.type||'').startsWith('video/')?'▶':'▧'}</span>
              <div>
                <strong>${esc(r.finalCreative.name)}</strong>
                <small>${esc(r.finalCreative.type||'файл')} · ${formatBytes(r.finalCreative.size||0)}</small>
              </div>
              <button class="download-link" data-download-key="${esc(r.finalCreative.key)}" data-download-name="${esc(r.finalCreative.name)}">Свали</button>
            </div>
            <div class="creative-review-status ${esc(r.creativeApprovalStatus || 'pending')}">
              <strong>${
                r.creativeApprovalStatus === 'approved' ? '✓ Одобрена от клиента' :
                r.creativeApprovalStatus === 'correction' ? '⚠ Клиентът иска корекция' :
                '● Чака одобрение от клиента'
              }</strong>
              ${r.creativeApprovalStatus === 'approved' && r.creativeApprovedAt ? `<span>${formatDate(r.creativeApprovedAt)}</span>` : ''}
              ${r.creativeApprovalStatus === 'correction' && r.creativeCorrectionText ? `<span>${esc(r.creativeCorrectionText)}</span>` : ''}
            </div>
          </div>
        ` : `<div class="creative-review-empty"><strong>Все още няма качена готова визия.</strong><span>Качи JPG, PNG или MP4, за да я изпратиш за клиентско одобрение.</span></div>`}
      </div>` : ''}
      <div class="drawer-section">
        <h4>Материали</h4>
        ${files.length ? files.map(f => `
          <div class="file-chip">
            <span>${String(f.type||'').startsWith('video/')?'▶':'▧'}</span>
            <div><strong>${esc(f.name)}</strong><small>${esc(f.type||'файл')} · ${formatBytes(f.size)}</small></div>
            ${f.key ? `<button class="download-link" data-download-key="${esc(f.key)}" data-download-name="${esc(f.name)}">Свали</button>` : ''}
          </div>`).join('') : '<p class="small-muted">Няма качени файлове.</p>'}
      </div>
      ${r.message ? `<div class="drawer-section"><h4>Бележка</h4><div class="note-box">${esc(r.message)}</div></div>` : ''}
      ${r.changeRequestText ? `
        <div class="drawer-section">
          <h4>Последно поискана промяна</h4>
          <div class="change-request-note">
            <strong>${esc(r.changeRequestText)}</strong>
            ${r.changeRequestedAt ? `<small>${formatDate(r.changeRequestedAt)}</small>` : ''}
          </div>
        </div>` : ''}
      <div class="drawer-section"><h4>Подадена</h4><p>${formatDate(r.createdAt)}</p></div>
    `;
  }

  function requestActionsHTML(r){
    if (r.status === 'new') return `
      <button class="btn btn-success" data-action="approve">Одобри</button>
      <button class="btn btn-warning" data-action="changes">Поискай промяна</button>
      <button class="btn btn-danger" data-action="reject">Откажи</button>`;
    if (r.status === 'changes') return `
      <button class="btn btn-success" data-action="approve">Одобри</button>
      <button class="btn btn-danger" data-action="reject">Откажи</button>`;
    if (r.status === 'waiting') {
      if (r.designType !== 'ready' && r.creativeApprovalStatus !== 'approved') {
        return `
          <button class="btn btn-primary" data-action="upload-creative">${r.finalCreative ? 'Качи коригирана визия' : 'Качи визия за одобрение'}</button>
          ${r.finalCreative && r.creativeApprovalStatus === 'pending' ? '<button class="btn btn-light" disabled>Чака клиентско одобрение</button>' : ''}
          ${r.finalCreative && r.creativeApprovalStatus === 'correction' ? '<button class="btn btn-warning" disabled>Искана е корекция</button>' : ''}`;
      }
      return `
        <button class="btn btn-primary" data-action="copy-payment">Копирай платежен текст</button>
        <button class="btn btn-success" data-action="mark-paid">Маркирай платено</button>`;
    }
    if (r.status === 'paid') return `
      <button class="btn btn-primary" data-action="activate">Активирай рекламата</button>`;
    if (r.status === 'active') return `
      <button class="btn btn-success" data-action="renew">Платено → удължи +1 месец</button>
      <button class="btn btn-light" data-action="done">Приключи ръчно</button>`;
    if (r.status === 'done' && r.completionReason === 'expired') return `
      <button class="btn btn-success" data-action="restart">Ново плащане → пусни за 1 месец</button>
      <button class="btn btn-light" data-action="reopen">Върни като нова</button>`;
    return `<button class="btn btn-light" data-action="reopen">Върни като нова</button>`;
  }

  function updateStatus(id, status){
    const requests = loadRequests();
    const r = requests.find(x => x.id === id);
    if (!r) return;

    const now = new Date();
    r.status = status;

    if (status === 'waiting') {
      r.approvedAt = now.toISOString();
    }

    if (status === 'paid') {
      r.paidAt = now.toISOString();
    }

    if (status === 'active') {
      r.activeAt = now.toISOString();
      r.expiresAt = addCalendarMonth(now).toISOString();
      r.completedAt = null;
      r.completionReason = null;
    }

    if (status === 'done') {
      r.completedAt = now.toISOString();
      r.completionReason = 'manual';
    }

    if (status === 'new') {
      r.activeAt = null;
      r.expiresAt = null;
      r.completedAt = null;
      r.completionReason = null;
    }

    saveRequests(requests);
    openRequest(id, false);
  }

  function renewCampaign(id){
    const requests = syncCampaignLifecycle();
    const r = requests.find(x => x.id === id);
    if (!r || r.status !== 'active') return;

    const now = new Date();
    const currentEnd = r.expiresAt ? new Date(r.expiresAt) : now;
    const base = currentEnd.getTime() > now.getTime() ? currentEnd : now;
    const newEnd = addCalendarMonth(base);

    r.expiresAt = newEnd.toISOString();
    r.lastRenewalPaidAt = now.toISOString();

    if (!Array.isArray(r.renewalHistory)) r.renewalHistory = [];
    r.renewalHistory.push({
      paidAt: now.toISOString(),
      previousEnd: currentEnd.toISOString(),
      newEnd: newEnd.toISOString()
    });

    saveRequests(requests);
    openRequest(id, false);
  }

  function restartExpiredCampaign(id){
    const requests = syncCampaignLifecycle();
    const r = requests.find(x => x.id === id);
    if (!r) return;

    const now = new Date();
    r.status = 'active';
    r.activeAt = now.toISOString();
    r.expiresAt = addCalendarMonth(now).toISOString();
    r.completedAt = null;
    r.completionReason = null;
    r.lastRenewalPaidAt = now.toISOString();

    if (!Array.isArray(r.renewalHistory)) r.renewalHistory = [];
    r.renewalHistory.push({
      paidAt: now.toISOString(),
      restart: true,
      newEnd: r.expiresAt
    });

    saveRequests(requests);
    openRequest(id, false);
  }

  function openCreativeUploadDialog(id){
    const r = loadRequests().find(x => x.id === id);
    if (!r) return;

    let dialog = document.getElementById('creativeUploadDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'creativeUploadDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog creative-upload-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">ГОТОВА ВИЗИЯ</span>
              <h3>Качи файла за одобрение</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>

          <p class="change-dialog-help">
            Клиентът ще види този файл в профила си и ще избере „Одобрявам визията“ или „Искам корекция“.
          </p>

          <label class="creative-upload-drop">
            <input id="creativeUploadFile" type="file" accept="image/jpeg,image/png,video/mp4">
            <span class="creative-upload-icon">⇧</span>
            <strong>Избери JPG, PNG или MP4</strong>
            <small>Максимум 25 MB</small>
          </label>

          <div class="selected-creative-file" id="selectedCreativeFile">Няма избран файл</div>
          <div class="change-dialog-error" id="creativeUploadError" hidden></div>

          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-creative-cancel>Отказ</button>
            <button type="button" class="btn btn-primary" data-creative-send>Изпрати за одобрение</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      const close = () => {
        dialog.classList.remove('show');
        dialog.dataset.requestId = '';
        dialog.querySelector('#creativeUploadFile').value = '';
        dialog.querySelector('#selectedCreativeFile').textContent = 'Няма избран файл';
        dialog.querySelector('#creativeUploadError').hidden = true;
      };

      dialog.querySelector('.change-dialog-close').addEventListener('click', close);
      dialog.querySelector('[data-creative-cancel]').addEventListener('click', close);
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

      dialog.querySelector('#creativeUploadFile').addEventListener('change', e => {
        const file = e.target.files?.[0];
        dialog.querySelector('#selectedCreativeFile').textContent =
          file ? `${file.name} · ${formatBytes(file.size)}` : 'Няма избран файл';
        dialog.querySelector('#creativeUploadError').hidden = true;
      });

      dialog.querySelector('[data-creative-send]').addEventListener('click', async () => {
        const file = dialog.querySelector('#creativeUploadFile').files?.[0];
        const error = dialog.querySelector('#creativeUploadError');
        const requestId = dialog.dataset.requestId;

        if (!file){
          error.textContent = 'Избери файл.';
          error.hidden = false;
          return;
        }
        if (!['image/jpeg','image/png','video/mp4'].includes(file.type)){
          error.textContent = 'Разрешени са само JPG, PNG и MP4.';
          error.hidden = false;
          return;
        }
        if (file.size > 25 * 1024 * 1024){
          error.textContent = 'Файлът е по-голям от 25 MB.';
          error.hidden = false;
          return;
        }

        const key = `final-${requestId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
        try{
          await putStoredFile({
            key,
            blob:file,
            name:file.name,
            type:file.type,
            size:file.size,
            createdAt:new Date().toISOString()
          });

          const requests = loadRequests();
          const req = requests.find(x => x.id === requestId);
          if (!req) return;

          if (!Array.isArray(req.finalCreativeHistory)) req.finalCreativeHistory = [];
          if (req.finalCreative) req.finalCreativeHistory.push({...req.finalCreative});

          req.finalCreative = {
            key,
            name:file.name,
            type:file.type,
            size:file.size,
            uploadedAt:new Date().toISOString()
          };
          req.creativeApprovalStatus = 'pending';
          req.creativeCorrectionText = null;
          req.creativeCorrectionRequestedAt = null;
          req.creativeApprovedAt = null;

          saveRequests(requests);
          close();
          openRequest(requestId, false);
          toast('Визията е изпратена за клиентско одобрение.');
        }catch(err){
          console.error(err);
          error.textContent = 'Файлът не можа да бъде записан в demo режима.';
          error.hidden = false;
        }
      });
    }

    dialog.dataset.requestId = id;
    dialog.classList.add('show');
  }

  function openChangeRequestDialog(id){
    const r = loadRequests().find(x => x.id === id);
    if (!r) return;

    let dialog = document.getElementById('changeRequestDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'changeRequestDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog" role="dialog" aria-modal="true" aria-labelledby="changeDialogTitle">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">ПОИСКАЙ ПРОМЯНА</span>
              <h3 id="changeDialogTitle">Какво трябва да промени клиентът?</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>

          <p class="change-dialog-help">
            Напиши го свободно с думи. Клиентът ще види точно този текст в профила си.
          </p>

          <textarea id="changeRequestText" rows="6"
            placeholder="Например: Моля, качете логото във висока резолюция и добавете телефон за контакт."></textarea>

          <div class="change-dialog-error" id="changeRequestError" hidden>
            Напиши каква промяна е необходима.
          </div>

          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-change-cancel>Отказ</button>
            <button type="button" class="btn btn-warning" data-change-send>Изпрати към клиента</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      const close = () => {
        dialog.classList.remove('show');
        dialog.dataset.requestId = '';
      };

      dialog.querySelector('.change-dialog-close').addEventListener('click', close);
      dialog.querySelector('[data-change-cancel]').addEventListener('click', close);
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) close();
      });

      dialog.querySelector('[data-change-send]').addEventListener('click', () => {
        const requestId = dialog.dataset.requestId;
        const textarea = dialog.querySelector('#changeRequestText');
        const error = dialog.querySelector('#changeRequestError');
        const text = textarea.value.trim();

        if (!text){
          error.hidden = false;
          textarea.focus();
          return;
        }

        const requests = loadRequests();
        const req = requests.find(x => x.id === requestId);
        if (!req) return;

        req.status = 'changes';
        req.changeRequestText = text;
        req.changeRequestedAt = new Date().toISOString();

        if (!Array.isArray(req.changeRequestHistory)) req.changeRequestHistory = [];
        req.changeRequestHistory.push({
          text,
          createdAt: req.changeRequestedAt
        });

        saveRequests(requests);
        close();
        openRequest(requestId, false);
        toast('Промяната е изпратена към клиента.');
      });
    }

    dialog.dataset.requestId = id;
    const textarea = dialog.querySelector('#changeRequestText');
    const error = dialog.querySelector('#changeRequestError');
    textarea.value = r.changeRequestText || '';
    error.hidden = true;
    dialog.classList.add('show');
    setTimeout(() => textarea.focus(), 50);
  }

  async function copyPaymentText(r){
    const text = `Здравейте,\n\nЗаявка ${r.id} е одобрена.\nПакет: ${r.packageLabel || packageLabels[r.package]}\nРекламна визия: ${r.designLabel}\nОбщо за плащане: €${r.total}\n\nПлатежният линк ще бъде добавен тук след свързване на платежния оператор.\n\nKyustendil Screen`;
    try{
      await navigator.clipboard.writeText(text);
      toast('Платежният текст е копиран.');
    }catch{
      toast('Неуспешно копиране.');
    }
  }

  // Delegated events
  document.addEventListener('click', async (e) => {
    const openBtn = e.target.closest('[data-open-request]');
    if (openBtn) openRequest(openBtn.dataset.openRequest);

    const dl = e.target.closest('[data-download-key]');
    if (dl) await downloadFile(dl.dataset.downloadKey, dl.dataset.downloadName);

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn && activeRequestId){
      const r = loadRequests().find(x => x.id === activeRequestId);
      switch(actionBtn.dataset.action){
        case 'approve': {
          updateStatus(activeRequestId,'waiting');
          const approved = loadRequests().find(x => x.id === activeRequestId);
          toast(approved?.designType === 'ready'
            ? 'Заявката е одобрена и чака плащане.'
            : 'Заявката е одобрена. Следва качване на визия за клиентско одобрение.');
          break;
        }
        case 'upload-creative': openCreativeUploadDialog(activeRequestId); break;
        case 'changes': openChangeRequestDialog(activeRequestId); break;
        case 'reject': updateStatus(activeRequestId,'rejected'); toast('Заявката е отказана.'); break;
        case 'mark-paid': updateStatus(activeRequestId,'paid'); toast('Маркирана е като платена.'); break;
        case 'activate': {
          updateStatus(activeRequestId,'active');
          const activated = loadRequests().find(x => x.id === activeRequestId);
          toast(`Активна до ${formatDateOnly(activated?.expiresAt)}.`);
          break;
        }
        case 'renew': {
          renewCampaign(activeRequestId);
          const renewed = loadRequests().find(x => x.id === activeRequestId);
          toast(`Удължена до ${formatDateOnly(renewed?.expiresAt)}.`);
          break;
        }
        case 'restart': {
          restartExpiredCampaign(activeRequestId);
          const restarted = loadRequests().find(x => x.id === activeRequestId);
          toast(`Кампанията е пусната отново до ${formatDateOnly(restarted?.expiresAt)}.`);
          break;
        }
        case 'done': updateStatus(activeRequestId,'done'); toast('Кампанията е приключена ръчно.'); break;
        case 'reopen': updateStatus(activeRequestId,'new'); toast('Заявката е върната като нова.'); break;
        case 'copy-payment': copyPaymentText(r); break;
      }
    }
  });

  document.getElementById('closeDrawer').addEventListener('click', closeRequest);
  backdrop.addEventListener('click', closeRequest);
  document.getElementById('requestSearch').addEventListener('input', renderRequests);
  document.getElementById('statusFilter').addEventListener('change', (e) => {
    navigateAdmin({
      view:'requests',
      statusFilter:e.target.value || 'all',
      requestId:null
    });
  });

  function renderAll(){
    syncCampaignLifecycle();
    renderDashboard();
    renderRequests();
    renderClients();
    renderCreatives();
  }

  // While the demo Admin is open, keep deadlines current automatically.
  setInterval(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') {
      const before = JSON.stringify(loadRequests());
      syncCampaignLifecycle();
      const after = JSON.stringify(loadRequests());
      if (before !== after) renderAll();
      else renderDashboard();
    }
  }, 60 * 1000);

  // Update admin if a public form in another tab adds a request.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) renderAll();
  });
})();
