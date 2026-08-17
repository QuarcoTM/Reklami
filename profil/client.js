
(() => {
  const STORAGE_KEY = 'ks_demo_requests_v1';
  const SESSION_KEY = 'ks_client_demo_email';
  const DB_NAME = 'KyustendilScreenDemo';
  const DB_VERSION = 1;
  const FILE_STORE = 'files';

  const clientStatus = {
    new:      { label:'Получена', cls:'status-new' },
    changes:  { label:'Нужна корекция', cls:'status-changes' },
    waiting:  { label:'Одобрена · чака плащане', cls:'status-waiting' },
    paid:     { label:'Платена', cls:'status-paid' },
    active:   { label:'Излъчва се', cls:'status-active' },
    done:     { label:'Приключена', cls:'status-done' },
    rejected: { label:'Отказана', cls:'status-rejected' }
  };

  const packageNames = { single:'SINGLE', local:'LOCAL', city:'CITY' };

  function esc(v=''){
    return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function loadRequests(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function ownRequests(){
    const email = (sessionStorage.getItem(SESSION_KEY) || '').trim().toLowerCase();
    return loadRequests()
      .filter(r => String(r.email || '').trim().toLowerCase() === email)
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  }

  function formatDate(v){
    return new Intl.DateTimeFormat('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v));
  }

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE,{keyPath:'key'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  async function downloadFile(key,name){
    if(!key){ toast('Този demo файл няма локално съдържание.'); return; }
    try{
      const db=await openDB();
      const record=await new Promise((resolve,reject)=>{
        const tx=db.transaction(FILE_STORE,'readonly');
        const req=tx.objectStore(FILE_STORE).get(key);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
      if(!record?.blob){ toast('Файлът не е наличен на това устройство.'); return; }
      const url=URL.createObjectURL(record.blob);
      const a=document.createElement('a');
      a.href=url;a.download=name||record.name||'file';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){ console.error(e); toast('Файлът не може да бъде отворен.'); }
  }

  function toast(msg){
    const el=document.getElementById('clientToast');
    el.textContent=msg;el.classList.add('show');
    clearTimeout(window.__clientToast);
    window.__clientToast=setTimeout(()=>el.classList.remove('show'),2600);
  }

  const login=document.getElementById('clientLogin');
  const app=document.getElementById('clientApp');
  const form=document.getElementById('clientLoginForm');

  function enter(email){
    sessionStorage.setItem(SESSION_KEY,email.trim().toLowerCase());
    login.hidden=true;app.hidden=false;
    document.getElementById('headerEmail').textContent=email;
    document.getElementById('menuEmail').textContent=email;
    render();
  }

  const savedEmail=sessionStorage.getItem(SESSION_KEY);
  if(savedEmail) enter(savedEmail);

  form.addEventListener('submit',(e)=>{
    e.preventDefault();
    const email=document.getElementById('clientEmail').value.trim().toLowerCase();
    if(!email) return;
    enter(email);
  });

  document.getElementById('clientLogout').addEventListener('click',()=>{
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  const profileButton=document.getElementById('profileButton');
  const profileMenu=document.getElementById('profileMenu');
  profileButton.addEventListener('click',()=> profileMenu.hidden=!profileMenu.hidden);
  document.addEventListener('click',(e)=>{
    if(!profileButton.contains(e.target)&&!profileMenu.contains(e.target)) profileMenu.hidden=true;
  });

  function render(){
    const requests=ownRequests();
    const first=requests[0];
    const greeting = first?.name ? `, ${first.name.split(' ')[0]}` : '';
    document.getElementById('clientGreeting').textContent=greeting;

    const paidStatuses=['paid','active','done'];
    const stats={
      all:requests.length,
      action:requests.filter(r=>['changes','waiting'].includes(r.status)).length,
      active:requests.filter(r=>r.status==='active').length,
      paid:requests.filter(r=>paidStatuses.includes(r.status)).reduce((sum,r)=>sum+Number(r.total||0),0)
    };
    document.querySelector('[data-client-stat="all"]').textContent=stats.all;
    document.querySelector('[data-client-stat="action"]').textContent=stats.action;
    document.querySelector('[data-client-stat="active"]').textContent=stats.active;
    document.querySelector('[data-client-stat="paid"]').textContent=`€${stats.paid}`;

    renderRequests();
  }

  function passesFilter(r,filter){
    if(filter==='all') return true;
    if(filter==='current') return !['done','rejected'].includes(r.status);
    return r.status===filter;
  }

  function renderRequests(){
    const filter=document.getElementById('clientStatusFilter').value;
    const requests=ownRequests().filter(r=>passesFilter(r,filter));
    const list=document.getElementById('clientRequests');
    const empty=document.getElementById('clientEmpty');

    if(!requests.length){
      list.innerHTML='';
      empty.hidden=false;
      return;
    }
    empty.hidden=true;
    list.innerHTML=requests.map(r=>{
      const st=clientStatus[r.status]||{label:r.status,cls:''};
      const pkg=packageNames[r.package]||r.package||'—';
      const action = r.status==='waiting'
        ? `<div class="payment-alert">● Заявката е одобрена. След свързване на плащанията тук ще се появи бутон „Плати €${Number(r.total||0)}“.</div>`
        : r.status==='changes'
        ? `<div class="payment-alert">● Има поискана промяна по заявката. Детайлите ще се добавят след Supabase версията.</div>`
        : '';
      return `
        <article class="request-card">
          <div class="request-top">
            <div class="request-main">
              <span class="request-id">${esc(r.id)}</span>
              <h3>${esc(r.company || 'Рекламна кампания')}</h3>
              <p>${esc(pkg)} · ${esc(r.designLabel || '')}</p>
            </div>
            <span class="status-pill ${st.cls}">${esc(st.label)}</span>
          </div>
          ${action}
          <div class="request-bottom">
            <div class="request-metric"><span>Сума</span><strong>€${Number(r.total||0)}</strong></div>
            <div class="request-metric"><span>Подадена</span><strong>${formatDate(r.createdAt)}</strong></div>
            <button class="open-request" data-client-request="${esc(r.id)}">Виж детайли</button>
          </div>
        </article>`;
    }).join('');
  }

  document.getElementById('clientStatusFilter').addEventListener('change',renderRequests);

  const modal=document.getElementById('clientRequestModal');
  const backdrop=document.getElementById('clientModalBackdrop');

  function statusTimeline(r){
    const stages=['new','waiting','paid','active','done'];
    let currentIndex=stages.indexOf(r.status);
    if(r.status==='changes') currentIndex=0;
    if(r.status==='rejected') currentIndex=-1;
    const labels=[
      ['Получена','Заявката е изпратена за преглед.'],
      ['Одобрена','Крайната сума е потвърдена.'],
      ['Платена','Плащането е получено.'],
      ['Излъчва се','Рекламата е активна на избраните екрани.'],
      ['Приключена','Кампанията е завършена.']
    ];
    if(r.status==='rejected'){
      return `<div class="action-box"><h3>Заявката е отказана</h3><p>За подробности се свържи с нас и посочи номер ${esc(r.id)}.</p></div>`;
    }
    return `<div class="timeline">${labels.map((l,i)=>{
      const cls=i<currentIndex?'done':i===currentIndex?'current':'';
      return `<div class="timeline-step ${cls}"><span class="timeline-dot">${i<currentIndex?'✓':i+1}</span><div><strong>${l[0]}</strong><small>${l[1]}</small></div></div>`;
    }).join('')}</div>`;
  }

  function paymentBox(r){
    if(r.status==='waiting'){
      return `<div class="action-box"><h3>Плащане: €${Number(r.total||0)}</h3><p>Заявката е одобрена. След като свържем платежния оператор, тук ще имаш директен бутон за плащане.</p><button class="btn btn-blue payment-btn" disabled>Плати €${Number(r.total||0)}</button></div>`;
    }
    if(r.status==='paid') return `<div class="action-box"><h3>Плащането е получено ✓</h3><p>Подготвяме рекламата за планиране и излъчване.</p></div>`;
    if(r.status==='active') return `<div class="action-box"><h3>Рекламата се излъчва</h3><p>След реалното свързване на екраните тук ще показваме и конкретните локации и период.</p></div>`;
    return '';
  }

  function modalHTML(r){
    const st=clientStatus[r.status]||{label:r.status,cls:''};
    const files=r.files||[];
    return `
      <div class="detail-section"><span class="status-pill ${st.cls}">${esc(st.label)}</span></div>
      <div class="detail-section">
        <h4>Статус на кампанията</h4>
        ${statusTimeline(r)}
      </div>
      <div class="detail-section">
        <h4>Поръчка</h4>
        <div class="order-summary">
          <div class="order-line"><span>${esc(r.packageLabel || packageNames[r.package] || 'Пакет')}</span><strong>€${Number(r.packagePrice||0)}</strong></div>
          <div class="order-line"><span>${esc(r.designLabel||'Рекламна визия')}</span><strong>+€${Number(r.designPrice||0)}</strong></div>
          <div class="order-line total"><span>Общо</span><strong>€${Number(r.total||0)}</strong></div>
        </div>
      </div>
      <div class="detail-section">
        <h4>Информация</h4>
        <div class="detail-grid">
          <div class="detail-box"><span>Фирма / бранд</span><strong>${esc(r.company||'—')}</strong></div>
          <div class="detail-box"><span>Локации</span><strong>${esc(r.locations||'Не са посочени')}</strong></div>
          <div class="detail-box"><span>Подадена</span><strong>${formatDate(r.createdAt)}</strong></div>
          <div class="detail-box"><span>Контакт</span><strong>${esc(r.email||'—')}</strong></div>
        </div>
      </div>
      ${(r.creativeText||r.creativeContact)?`
      <div class="detail-section">
        <h4>Подадено съдържание</h4>
        <div class="detail-grid">
          ${r.creativeText?`<div class="detail-box"><span>Текст / послание</span><strong>${esc(r.creativeText)}</strong></div>`:''}
          ${r.creativeContact?`<div class="detail-box"><span>Контакт за рекламата</span><strong>${esc(r.creativeContact)}</strong></div>`:''}
        </div>
      </div>`:''}
      <div class="detail-section">
        <h4>Твоите материали</h4>
        ${files.length ? files.map(f=>`
          <div class="file-chip">
            <span>${String(f.type||'').startsWith('video/')?'▶':'▧'}</span>
            <div><strong>${esc(f.name)}</strong><small>${esc(f.type||'файл')}</small></div>
            ${f.key?`<button class="file-download" data-client-download="${esc(f.key)}" data-client-download-name="${esc(f.name)}">Свали</button>`:''}
          </div>`).join('') : '<p style="color:var(--muted)">Няма качени файлове.</p>'}
      </div>
      ${r.note?`<div class="detail-section"><h4>Бележка</h4><div class="detail-box"><strong>${esc(r.note)}</strong></div></div>`:''}
      ${paymentBox(r)}
      <div class="detail-section" style="margin-top:24px">
        <h4>Визия за одобрение</h4>
        <div class="detail-box">
          <span>Следващ етап</span>
          <strong>${r.designType==='ready' ? 'Използва се готовият файл, който си изпратил.' : 'Когато подготвим визията, тук ще я виждаш и ще можеш да я одобриш или да поискаш корекция.'}</strong>
        </div>
      </div>`;
  }

  function openModal(id){
    const r=ownRequests().find(x=>x.id===id);
    if(!r) return;
    document.getElementById('clientModalId').textContent=r.id;
    document.getElementById('clientModalBody').innerHTML=modalHTML(r);
    backdrop.hidden=false;
    requestAnimationFrame(()=>modal.classList.add('open'));
    modal.setAttribute('aria-hidden','false');
  }

  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    setTimeout(()=>backdrop.hidden=true,220);
  }

  document.addEventListener('click',async(e)=>{
    const req=e.target.closest('[data-client-request]');
    if(req) openModal(req.dataset.clientRequest);
    const dl=e.target.closest('[data-client-download]');
    if(dl) await downloadFile(dl.dataset.clientDownload,dl.dataset.clientDownloadName);
  });

  document.getElementById('closeClientModal').addEventListener('click',closeModal);
  backdrop.addEventListener('click',closeModal);

  window.addEventListener('storage',(e)=>{
    if(e.key===STORAGE_KEY&&sessionStorage.getItem(SESSION_KEY)) render();
  });
})();
