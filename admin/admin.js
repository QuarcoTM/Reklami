
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
  }
  if (sessionStorage.getItem(SESSION_KEY) === '1') enterAdmin();
  document.getElementById('enterDemo').addEventListener('click', enterAdmin);
  document.getElementById('exitDemo').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  // Navigation
  const titles = {dashboard:'Табло',requests:'Заявки',clients:'Клиенти',screens:'Екрани',creatives:'Материали'};
  function showView(name){
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.viewPanel === name));
    document.querySelectorAll('.nav-item[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    document.getElementById('viewTitle').textContent = titles[name] || 'Admin';
    document.querySelector('.sidebar').classList.remove('open');
    if (name === 'requests') renderRequests();
    if (name === 'clients') renderClients();
    if (name === 'creatives') renderCreatives();
  }
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.querySelectorAll('[data-go-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.goView)));

  function openRequestsByStatus(status){
    const filter = document.getElementById('statusFilter');
    const search = document.getElementById('requestSearch');
    if (filter) filter.value = status;
    if (search) search.value = '';
    showView('requests');
    renderRequests();
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

  document.getElementById('mobileMenu').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));

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
    const requests = loadRequests();
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
  }

  function renderRequests(){
    const requests = loadRequests();
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

  function openRequest(id){
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

  function closeRequest(){
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    setTimeout(() => backdrop.hidden = true, 210);
    activeRequestId = null;
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
    if (r.status === 'waiting') return `
      <button class="btn btn-primary" data-action="copy-payment">Копирай платежен текст</button>
      <button class="btn btn-success" data-action="mark-paid">Маркирай платено</button>`;
    if (r.status === 'paid') return `
      <button class="btn btn-primary" data-action="activate">Активирай рекламата</button>`;
    if (r.status === 'active') return `
      <button class="btn btn-light" data-action="done">Приключи кампанията</button>`;
    return `<button class="btn btn-light" data-action="reopen">Върни като нова</button>`;
  }

  function updateStatus(id, status){
    const requests = loadRequests();
    const r = requests.find(x => x.id === id);
    if (!r) return;
    r.status = status;
    if (status === 'waiting') r.approvedAt = new Date().toISOString();
    if (status === 'paid') r.paidAt = new Date().toISOString();
    if (status === 'active') r.activeAt = new Date().toISOString();
    saveRequests(requests);
    openRequest(id);
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
        openRequest(requestId);
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
        case 'approve': updateStatus(activeRequestId,'waiting'); toast('Заявката е одобрена и чака плащане.'); break;
        case 'changes': openChangeRequestDialog(activeRequestId); break;
        case 'reject': updateStatus(activeRequestId,'rejected'); toast('Заявката е отказана.'); break;
        case 'mark-paid': updateStatus(activeRequestId,'paid'); toast('Маркирана е като платена.'); break;
        case 'activate': updateStatus(activeRequestId,'active'); toast('Рекламата е маркирана като активна.'); break;
        case 'done': updateStatus(activeRequestId,'done'); toast('Кампанията е приключена.'); break;
        case 'reopen': updateStatus(activeRequestId,'new'); toast('Заявката е върната като нова.'); break;
        case 'copy-payment': copyPaymentText(r); break;
      }
    }
  });

  document.getElementById('closeDrawer').addEventListener('click', closeRequest);
  backdrop.addEventListener('click', closeRequest);
  document.getElementById('requestSearch').addEventListener('input', renderRequests);
  document.getElementById('statusFilter').addEventListener('change', renderRequests);

  function renderAll(){
    renderDashboard();
    renderRequests();
    renderClients();
    renderCreatives();
  }

  // Update admin if a public form in another tab adds a request.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) renderAll();
  });
})();
