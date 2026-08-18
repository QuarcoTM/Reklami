
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
  const SCREENS_KEY = 'ks_screens_v1';

  const fallbackScreens = {
    funeral:'Траурна агенция',
    pharmacy:'Аптека',
    restaurant:'Заведение'
  };

  function loadClientScreens(){
    try{
      const screens = JSON.parse(localStorage.getItem(SCREENS_KEY) || '[]');
      if (Array.isArray(screens) && screens.length) return screens;
    }catch(e){}
    return Object.entries(fallbackScreens).map(([id,name]) => ({id,name,active:true}));
  }

  function assignedNames(r){
    const map = new Map(loadClientScreens().map(s => [s.id,s.name]));
    return (r.assignedScreens || []).map(id => map.get(id) || fallbackScreens[id]).filter(Boolean);
  }

  function esc(v=''){
    return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  }

  function loadRequests(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function ownRequests(){
    clientSyncLifecycle();
    const email = (sessionStorage.getItem(SESSION_KEY) || '').trim().toLowerCase();
    return loadRequests()
      .filter(r => String(r.email || '').trim().toLowerCase() === email)
      .sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  }

  function formatDate(v){
    return new Intl.DateTimeFormat('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v));
  }

  function clientSyncLifecycle(){
    const requests = loadRequests();
    let changed = false;
    const now = Date.now();

    requests.forEach(r => {
      if (r.status === 'active' && r.expiresAt && new Date(r.expiresAt).getTime() <= now) {
        r.status = 'done';
        r.completedAt = new Date().toISOString();
        r.completionReason = 'expired';
        changed = true;
      }
    });

    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  }

  function clientTimeLeft(r){
    if (!r?.expiresAt || r.status !== 'active') return '';
    const ms = new Date(r.expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Кампанията е изтекла.';
    const hours = Math.ceil(ms / 3600000);
    if (hours <= 24) return hours === 1 ? 'Остава 1 час' : `Остават ${hours} часа`;
    const days = Math.ceil(ms / 86400000);
    return days === 1 ? 'Остава 1 ден' : `Остават ${days} дни`;
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

  async function getStoredFile(key){
    if(!key) return null;
    try{
      const db=await openDB();
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(FILE_STORE,'readonly');
        const req=tx.objectStore(FILE_STORE).get(key);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
    }catch(e){ return null; }
  }

  async function downloadFile(key,name){
    if(!key){ toast('Този demo файл няма локално съдържание.'); return; }
    try{
      const record=await getStoredFile(key);
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
        ? (r.designType !== 'ready' && r.creativeApprovalStatus !== 'approved'
          ? `<div class="payment-alert creative-client-alert"><div><strong>● ${r.finalCreative ? 'Визията чака твоето решение' : 'Подготвяме рекламната визия'}</strong><span>${r.finalCreative ? 'Отвори заявката, прегледай файла и го одобри или поискай корекция.' : 'Когато е готова, ще се появи тук за преглед.'}</span></div></div>`
          : `<div class="payment-alert">● Заявката е готова за плащане. След свързване на платежния оператор тук ще се появи бутон „Плати €${Number(r.total||0)}“.</div>`)
        : r.status==='changes'
        ? `<div class="payment-alert change-alert"><div><strong>● Нужна е промяна</strong><span>${esc(r.changeRequestText || 'Отвори детайлите на заявката, за да видиш какво е необходимо.')}</span></div></div>`
        : r.status==='active' && r.expiresAt
        ? `<div class="payment-alert active-period-alert"><div><strong>● Кампанията се излъчва</strong><span>Активна до ${formatDate(r.expiresAt)} · ${clientTimeLeft(r)}</span></div></div>`
        : '';
      return `
        <article class="request-card">
          <div class="request-top">
            <div class="request-main">
              <span class="request-id">${esc(r.id)}</span>
              <h3>${esc(r.company || 'Рекламна кампания')}</h3>
              <p>${esc(pkg)} · ${esc(r.designLabel || '')}${(r.assignedScreens||[]).length ? ` · ${(r.assignedScreens||[]).length} ${(r.assignedScreens||[]).length===1?'екран':'екрана'}` : ''}</p>
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
      if(r.designType !== 'ready' && r.creativeApprovalStatus !== 'approved'){
        return '';
      }
      return `<div class="action-box"><h3>Плащане: €${Number(r.total||0)}</h3><p>Заявката и рекламната визия са готови. След като свържем платежния оператор, тук ще имаш директен бутон за плащане.</p><button class="btn btn-blue payment-btn" disabled>Плати €${Number(r.total||0)}</button></div>`;
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
      ${r.status==='changes' && r.changeRequestText ? `
      <div class="detail-section">
        <h4>Какво трябва да промениш</h4>
        <div class="client-change-message">
          <strong>${esc(r.changeRequestText)}</strong>
          ${r.changeRequestedAt ? `<small>Поискано на ${formatDate(r.changeRequestedAt)}</small>` : ''}
        </div>
      </div>` : ''}
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
      ${(r.activeAt || r.expiresAt) ? `
      <div class="detail-section">
        <h4>Период на кампанията</h4>
        <div class="detail-grid">
          <div class="detail-box"><span>Начало</span><strong>${r.activeAt ? formatDate(r.activeAt) : '—'}</strong></div>
          <div class="detail-box"><span>Край</span><strong>${r.expiresAt ? formatDate(r.expiresAt) : '—'}</strong></div>
        </div>
        ${r.status==='active' ? `<div class="client-period-note"><strong>${clientTimeLeft(r)}</strong><span>Ако кампанията бъде подновена, крайният срок ще се удължи автоматично.</span></div>` : ''}
        ${r.status==='done' && r.completionReason==='expired' ? `<div class="client-period-note expired"><strong>Кампанията е приключила</strong><span>Срокът е изтекъл на ${formatDate(r.expiresAt)}.</span></div>` : ''}
      </div>` : ''}
      <div class="detail-section">
        <h4>Информация</h4>
        <div class="detail-grid">
          <div class="detail-box"><span>Фирма / бранд</span><strong>${esc(r.company||'—')}</strong></div>
          <div class="detail-box"><span>Предпочитани локации</span><strong>${esc(r.locations||'Не са посочени')}</strong></div>
          <div class="detail-box"><span>Подадена</span><strong>${formatDate(r.createdAt)}</strong></div>
          <div class="detail-box"><span>Контакт</span><strong>${esc(r.email||'—')}</strong></div>
        </div>
      </div>
      ${(r.assignedScreens||[]).length ? `
      <div class="detail-section">
        <h4>${r.status==='active' ? 'Къде се излъчва рекламата' : 'Планирани екрани'}</h4>
        <div class="client-screen-chips">${assignedNames(r).map(name => `<span>${esc(name)}</span>`).join('')}</div>
      </div>` : ''}
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
        ${r.designType==='ready' ? `
          <div class="detail-box">
            <span>Готова реклама</span>
            <strong>Използва се файлът, който си изпратил.</strong>
          </div>` :
          r.finalCreative ? `
          <div class="final-creative-client">
            <div id="clientFinalCreativePreview" class="creative-preview-box">
              <div class="creative-preview-loading">Зареждане на визията…</div>
            </div>
            <div class="file-chip">
              <span>${String(r.finalCreative.type||'').startsWith('video/')?'▶':'▧'}</span>
              <div><strong>${esc(r.finalCreative.name)}</strong><small>${esc(r.finalCreative.type||'файл')}</small></div>
              <button class="file-download" data-client-download="${esc(r.finalCreative.key)}" data-client-download-name="${esc(r.finalCreative.name)}">Свали</button>
            </div>

            ${r.creativeApprovalStatus === 'approved' ? `
              <div class="creative-decision approved"><strong>✓ Визията е одобрена</strong><span>Можем да продължим към плащане.</span></div>
            ` : r.creativeApprovalStatus === 'correction' ? `
              <div class="creative-decision correction"><strong>Поискал си корекция</strong><span>${esc(r.creativeCorrectionText || '')}</span></div>
            ` : `
              <div class="creative-decision-actions">
                <button class="btn btn-blue" data-creative-approve="${esc(r.id)}">Одобрявам визията</button>
                <button class="btn client-correction-btn" data-creative-correction="${esc(r.id)}">Искам корекция</button>
              </div>
            `}
          </div>` :
          `<div class="detail-box">
            <span>Подготовка</span>
            <strong>Визията още се подготвя. Когато бъде качена, ще я видиш тук.</strong>
          </div>`}
      </div>`;
  }

  let finalCreativeObjectUrl = null;

  async function renderFinalCreativePreview(r){
    const box=document.getElementById('clientFinalCreativePreview');
    if(!box || !r?.finalCreative?.key) return;

    if(finalCreativeObjectUrl){
      URL.revokeObjectURL(finalCreativeObjectUrl);
      finalCreativeObjectUrl=null;
    }

    const record=await getStoredFile(r.finalCreative.key);
    if(!record?.blob){
      box.innerHTML='<div class="creative-preview-missing">Файлът е наличен само на устройството, от което е качен в demo режима.</div>';
      return;
    }

    finalCreativeObjectUrl=URL.createObjectURL(record.blob);
    if(String(record.type||'').startsWith('video/')){
      box.innerHTML=`<video src="${finalCreativeObjectUrl}" controls muted playsinline></video>`;
    }else{
      box.innerHTML=`<img src="${finalCreativeObjectUrl}" alt="Рекламна визия за одобрение">`;
    }
  }

  function approveCreative(id){
    const requests=loadRequests();
    const r=requests.find(x=>x.id===id);
    if(!r || !r.finalCreative) return;

    r.creativeApprovalStatus='approved';
    r.creativeApprovedAt=new Date().toISOString();
    r.creativeCorrectionText=null;
    r.creativeCorrectionRequestedAt=null;
    localStorage.setItem(STORAGE_KEY,JSON.stringify(requests));
    render();
    openModal(id);
    toast('Визията е одобрена.');
  }

  function openCreativeCorrectionDialog(id){
    let dialog=document.getElementById('clientCreativeCorrectionDialog');
    if(!dialog){
      dialog=document.createElement('div');
      dialog.id='clientCreativeCorrectionDialog';
      dialog.className='client-dialog-backdrop';
      dialog.innerHTML=`
        <section class="client-dialog" role="dialog" aria-modal="true">
          <div class="client-dialog-head">
            <div>
              <span class="eyebrow">КОРЕКЦИЯ</span>
              <h3>Какво искаш да променим?</h3>
            </div>
            <button class="close-btn" type="button" data-client-dialog-close>×</button>
          </div>
          <p>Напиши свободно каква корекция искаш по визията.</p>
          <textarea id="clientCreativeCorrectionText" rows="5" placeholder="Например: Увеличете телефона и сменете текста на промоцията."></textarea>
          <div class="client-dialog-error" id="clientCreativeCorrectionError" hidden>Напиши каква корекция искаш.</div>
          <div class="client-dialog-actions">
            <button class="btn client-correction-btn" type="button" data-client-dialog-close>Отказ</button>
            <button class="btn btn-blue" type="button" data-client-correction-send>Изпрати корекцията</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      const close=()=>{
        dialog.classList.remove('show');
        dialog.dataset.requestId='';
      };
      dialog.querySelectorAll('[data-client-dialog-close]').forEach(b=>b.addEventListener('click',close));
      dialog.addEventListener('click',e=>{if(e.target===dialog)close();});

      dialog.querySelector('[data-client-correction-send]').addEventListener('click',()=>{
        const text=dialog.querySelector('#clientCreativeCorrectionText').value.trim();
        const error=dialog.querySelector('#clientCreativeCorrectionError');
        if(!text){
          error.hidden=false;
          return;
        }
        const requestId=dialog.dataset.requestId;
        const requests=loadRequests();
        const r=requests.find(x=>x.id===requestId);
        if(!r) return;

        r.creativeApprovalStatus='correction';
        r.creativeCorrectionText=text;
        r.creativeCorrectionRequestedAt=new Date().toISOString();
        r.creativeApprovedAt=null;
        if(!Array.isArray(r.creativeCorrectionHistory)) r.creativeCorrectionHistory=[];
        r.creativeCorrectionHistory.push({text,createdAt:r.creativeCorrectionRequestedAt});

        localStorage.setItem(STORAGE_KEY,JSON.stringify(requests));
        close();
        render();
        openModal(requestId);
        toast('Корекцията е изпратена.');
      });
    }

    dialog.dataset.requestId=id;
    dialog.querySelector('#clientCreativeCorrectionText').value='';
    dialog.querySelector('#clientCreativeCorrectionError').hidden=true;
    dialog.classList.add('show');
    setTimeout(()=>dialog.querySelector('#clientCreativeCorrectionText').focus(),50);
  }

  function openModal(id){
    const r=ownRequests().find(x=>x.id===id);
    if(!r) return;
    document.getElementById('clientModalId').textContent=r.id;
    document.getElementById('clientModalBody').innerHTML=modalHTML(r);
    backdrop.hidden=false;
    requestAnimationFrame(()=>modal.classList.add('open'));
    modal.setAttribute('aria-hidden','false');
    renderFinalCreativePreview(r);
  }

  function closeModal(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    if(finalCreativeObjectUrl){
      URL.revokeObjectURL(finalCreativeObjectUrl);
      finalCreativeObjectUrl=null;
    }
    setTimeout(()=>backdrop.hidden=true,220);
  }

  document.addEventListener('click',async(e)=>{
    const req=e.target.closest('[data-client-request]');
    if(req) openModal(req.dataset.clientRequest);
    const dl=e.target.closest('[data-client-download]');
    if(dl) await downloadFile(dl.dataset.clientDownload,dl.dataset.clientDownloadName);

    const approve=e.target.closest('[data-creative-approve]');
    if(approve) approveCreative(approve.dataset.creativeApprove);

    const correction=e.target.closest('[data-creative-correction]');
    if(correction) openCreativeCorrectionDialog(correction.dataset.creativeCorrection);
  });

  document.getElementById('closeClientModal').addEventListener('click',closeModal);
  backdrop.addEventListener('click',closeModal);

  window.addEventListener('storage',(e)=>{
    if(e.key===STORAGE_KEY&&sessionStorage.getItem(SESSION_KEY)) render();
  });
})();
