
(() => {
  const STORAGE_KEY = 'ks_demo_requests_v1';
  const INTERNAL_ADS_KEY = 'ks_internal_ads_v1';
  const SCREENS_KEY = 'ks_screens_v1';

  let adminModalScrollY = 0;

  function lockAdminPageScroll(){
    if (document.body.classList.contains('admin-modal-open')) return;
    adminModalScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.classList.add('admin-modal-open');
    document.body.style.top = `-${adminModalScrollY}px`;
  }

  function unlockAdminPageScroll(){
    if (!document.body.classList.contains('admin-modal-open')) return;
    document.body.classList.remove('admin-modal-open');
    document.body.style.top = '';
    window.scrollTo(0, adminModalScrollY);
  }

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

  const DEFAULT_SCREEN_CATALOG = [
    {id:'funeral', name:'Траурна агенция', description:'Пилотен екран · адресът ще се добави по-късно.', active:true, yodeckPlayerId:''},
    {id:'pharmacy', name:'Аптека', description:'Планирана локация.', active:true, yodeckPlayerId:''},
    {id:'restaurant', name:'Заведение', description:'Планирана локация.', active:true, yodeckPlayerId:''}
  ];

  function normalizeScreen(screen){
    let status = String(screen?.status || '').trim();
    if (!['hidden','published','stopped'].includes(status)){
      status = screen?.active === false ? 'stopped' : 'published';
    }
    return {
      id:String(screen?.id || '').trim(),
      name:String(screen?.name || 'Екран').trim(),
      description:String(screen?.description || '').trim(),
      status,
      active:status === 'published',
      yodeckPlayerId:String(screen?.yodeckPlayerId || '').trim(),
      broadcastHoursPerDay:Number.isFinite(Number(screen?.broadcastHoursPerDay))
        ? Math.min(24, Math.max(1, Number(screen.broadcastHoursPerDay)))
        : null,
      photo:screen?.photo && screen.photo.key ? {
        key:String(screen.photo.key),
        name:String(screen.photo.name || 'screen-photo'),
        type:String(screen.photo.type || 'image/jpeg'),
        size:Number(screen.photo.size || 0)
      } : null,
      createdAt:screen?.createdAt || null,
      updatedAt:screen?.updatedAt || null
    };
  }

  function loadScreenCatalog(){
    try{
      const raw = JSON.parse(localStorage.getItem(SCREENS_KEY) || 'null');
      if (Array.isArray(raw) && raw.length){
        return raw.map(normalizeScreen).filter(s => s.id && s.name);
      }
    }catch(e){}
    const defaults = DEFAULT_SCREEN_CATALOG.map(s => ({...s}));
    localStorage.setItem(SCREENS_KEY, JSON.stringify(defaults));
    return defaults;
  }

  function saveScreenCatalog(screens){
    SCREEN_CATALOG = screens.map(normalizeScreen).filter(s => s.id && s.name);
    localStorage.setItem(SCREENS_KEY, JSON.stringify(SCREEN_CATALOG));
  }

  let SCREEN_CATALOG = loadScreenCatalog();

  function screenById(id){
    return SCREEN_CATALOG.find(s => s.id === id) || null;
  }

  function isScreenPublished(screen){
    return screen?.status === 'published';
  }

  function formatApprox(value){
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value >= 1000) return `~${Math.round(value).toLocaleString('bg-BG')}`;
    if (value >= 10) return `~${Math.round(value)}`;
    return `~${value.toFixed(1)}`;
  }

  function screenRotationStats(screenId){
    const screen = screenById(screenId);
    const items = allPlaylistItems(screenId)
      .filter(item => !getScreenSetting(item, screenId).paused);

    const cycleSeconds = items.reduce(
      (sum,item) => sum + Number(getScreenSetting(item, screenId).duration || 0),
      0
    );

    const hoursPerDay = screen?.broadcastHoursPerDay ?? null;

    if (!items.length || cycleSeconds <= 0){
      return {
        items,
        cycleSeconds:0,
        rotationsPerHour:0,
        rotationsPerDay:null,
        hoursPerDay
      };
    }

    const rotationsPerHour = 3600 / cycleSeconds;
    const rotationsPerDay = hoursPerDay ? rotationsPerHour * hoursPerDay : null;

    return {
      items,
      cycleSeconds,
      rotationsPerHour,
      rotationsPerDay,
      hoursPerDay
    };
  }

  function screenStatusLabel(screen){
    if (screen?.status === 'hidden') return 'СКРИТ / ПОДГОТОВКА';
    if (screen?.status === 'stopped') return 'ВРЕМЕННО СПРЯН';
    return 'ПУБЛИКУВАН';
  }

  function selectableScreens(currentIds=[]){
    const current = new Set(currentIds || []);
    return SCREEN_CATALOG.filter(screen => isScreenPublished(screen) || current.has(screen.id));
  }

  function screenLabelHTML(screen){
    return esc(screen?.name || 'Екран').replace(/\s+/g,'<br>');
  }

  function makeScreenId(){
    return `screen-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  }

  function screenUsage(screenId){
    const requests = loadRequests().filter(r => (r.assignedScreens || []).includes(screenId));
    const internalAds = loadInternalAds().filter(ad => (ad.assignedScreens || []).includes(screenId));
    return {requests, internalAds, total:requests.length + internalAds.length};
  }

  function assignedScreenNames(r){
    return (r.assignedScreens || []).map(id => screenById(id)?.name).filter(Boolean);
  }

  function screenLimitText(r){
    if (r.package === 'single') return 'SINGLE: избери точно 1 публикуван екран.';
    if (r.package === 'local') return 'LOCAL: избери от 1 до 3 публикувани екрана.';
    const activeCount = SCREEN_CATALOG.filter(isScreenPublished).length;
    return activeCount >= 4
      ? 'CITY: избери 4 или 5 публикувани екрана.'
      : 'CITY: стандартно е 4–5 екрана. Докато мрежата е по-малка, demo режимът допуска наличните публикувани екрани.';
  }

  function screenSelectionValidForActivation(r){
    const valid = (r.assignedScreens || []).filter(id => isScreenPublished(screenById(id)));
    const count = valid.length;
    if (r.package === 'single') return count === 1;
    if (r.package === 'local') return count >= 1 && count <= 3;
    const activeCount = SCREEN_CATALOG.filter(isScreenPublished).length;
    return activeCount >= 4 ? count >= 4 && count <= 5 : count >= 1;
  }


  function getScreenSetting(r, screenId){
    const saved = r?.screenSettings?.[screenId] || {};
    return {
      duration: [8,9,10].includes(Number(saved.duration)) ? Number(saved.duration) : 10,
      paused: Boolean(saved.paused),
      order: (saved.order === null || saved.order === undefined || saved.order === '') ? null : (Number.isFinite(Number(saved.order)) ? Number(saved.order) : null)
    };
  }

  function ensureScreenSettings(requests, screenId){
    const assigned = requests.filter(r => (r.assignedScreens || []).includes(screenId));
    let changed = false;

    const usedOrders = assigned
      .map(r => getScreenSetting(r, screenId).order)
      .filter(v => v !== null);

    let nextOrder = usedOrders.length ? Math.max(...usedOrders) + 1 : 1;

    assigned
      .sort((a,b) => new Date(a.activeAt || a.createdAt || 0) - new Date(b.activeAt || b.createdAt || 0))
      .forEach(r => {
        if (!r.screenSettings) {
          r.screenSettings = {};
          changed = true;
        }
        if (!r.screenSettings[screenId]) {
          r.screenSettings[screenId] = {duration:10, paused:false, order:nextOrder++};
          changed = true;
          return;
        }
        const current = r.screenSettings[screenId];
        if (![8,9,10].includes(Number(current.duration))) {
          current.duration = 10;
          changed = true;
        }
        if (typeof current.paused !== 'boolean') {
          current.paused = false;
          changed = true;
        }
        if (!Number.isFinite(Number(current.order))) {
          current.order = nextOrder++;
          changed = true;
        }
      });

    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    return requests;
  }

  function screenPlaylistRequests(screenId, includeInactive=false){
    let requests = syncCampaignLifecycle();
    requests = ensureScreenSettings(requests, screenId);

    return requests
      .filter(r =>
        (r.assignedScreens || []).includes(screenId) &&
        (includeInactive || r.status === 'active')
      )
      .sort((a,b) => {
        const ao = getScreenSetting(a, screenId).order ?? 999999;
        const bo = getScreenSetting(b, screenId).order ?? 999999;
        if (ao !== bo) return ao - bo;
        return new Date(a.activeAt || a.createdAt || 0) - new Date(b.activeAt || b.createdAt || 0);
      });
  }

  function playlistCycleSeconds(screenId){
    return allPlaylistItems(screenId)
      .filter(r => !getScreenSetting(r, screenId).paused)
      .reduce((sum,r) => sum + getScreenSetting(r, screenId).duration, 0);
  }

  function campaignCreative(r){
    if (r?.internalAd && r.file?.key) return r.file;
    if (r?.finalCreative?.key) return r.finalCreative;
    const files = r?.files || [];
    const media = files.find(f => f.key && ['image/jpeg','image/png','video/mp4'].includes(String(f.type || '')));
    return media || null;
  }

  function loadInternalAds(){
    try {
      const value = JSON.parse(localStorage.getItem(INTERNAL_ADS_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveInternalAds(ads){
    localStorage.setItem(INTERNAL_ADS_KEY, JSON.stringify(ads));
  }

  function isInternalAd(item){
    return Boolean(item?.internalAd);
  }

  function makeInternalAdId(){
    return `KS-HOUSE-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
  }

  function savePlaylistItem(item){
    if (isInternalAd(item)){
      const ads = loadInternalAds();
      const index = ads.findIndex(x => x.id === item.id);
      if (index >= 0) ads[index] = item;
      saveInternalAds(ads);
      return;
    }
    const requests = loadRequests();
    const index = requests.findIndex(x => x.id === item.id);
    if (index >= 0) requests[index] = item;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  }

  function findPlaylistItem(id){
    return loadRequests().find(x => x.id === id) || loadInternalAds().find(x => x.id === id) || null;
  }

  function allPlaylistItems(screenId){
    const requests = screenPlaylistRequests(screenId);
    const ads = loadInternalAds().filter(ad => ad.active !== false && (ad.assignedScreens || []).includes(screenId));
    const combined = [...requests, ...ads];

    const used = combined.map(x => getScreenSetting(x,screenId).order).filter(v => v !== null);
    let next = used.length ? Math.max(...used) + 1 : 1;

    combined
      .sort((a,b) => new Date(a.activeAt || a.createdAt || 0) - new Date(b.activeAt || b.createdAt || 0))
      .forEach(item => {
        if (!item.screenSettings) item.screenSettings = {};
        const current = item.screenSettings[screenId];
        if (!current){
          item.screenSettings[screenId] = {duration:Number(item.duration)||10, paused:false, order:next++};
          savePlaylistItem(item);
        } else {
          let changed = false;
          if (![8,9,10].includes(Number(current.duration))){ current.duration = Number(item.duration)||10; changed = true; }
          if (typeof current.paused !== 'boolean'){ current.paused = false; changed = true; }
          if (!Number.isFinite(Number(current.order))){ current.order = next++; changed = true; }
          if (changed) savePlaylistItem(item);
        }
      });

    return combined.sort((a,b) => {
      const ao = getScreenSetting(a,screenId).order ?? 999999;
      const bo = getScreenSetting(b,screenId).order ?? 999999;
      if (ao !== bo) return ao - bo;
      return new Date(a.activeAt || a.createdAt || 0) - new Date(b.activeAt || b.createdAt || 0);
    });
  }

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

  async function deleteStoredFile(key){
    if (!key) return true;
    try{
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, 'readwrite');
        tx.objectStore(FILE_STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    }catch{
      return false;
    }
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
    sessionStorage.removeItem('ks_admin_state_v1');
    sessionStorage.removeItem('ks_admin_trail_v1');
    sessionStorage.removeItem('ks_admin_overlay_v1');
    sessionStorage.removeItem('ks_admin_request_search_v1');
    location.reload();
  });

  // Deterministic Admin navigation.
  // We keep our own trail instead of relying on the browser's mixed page history.
  const ADMIN_STATE_KEY = 'ks_admin_state_v1';
  const ADMIN_TRAIL_KEY = 'ks_admin_trail_v1';
  const ADMIN_OVERLAY_KEY = 'ks_admin_overlay_v1';
  const ADMIN_SEARCH_KEY = 'ks_admin_request_search_v1';
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

  function saveAdminNavigationState(){
    try{
      sessionStorage.setItem(ADMIN_STATE_KEY, JSON.stringify(normalizeAdminState(currentAdminState)));
      sessionStorage.setItem(ADMIN_TRAIL_KEY, JSON.stringify(
        adminTrail.slice(-40).map(normalizeAdminState)
      ));
    }catch(e){}
  }

  function loadSavedAdminState(){
    try{
      const raw = JSON.parse(sessionStorage.getItem(ADMIN_STATE_KEY) || 'null');
      if (!raw) return null;
      const state = normalizeAdminState(raw);
      if (!['dashboard','requests','clients','screens','creatives'].includes(state.view)) return null;
      return state;
    }catch(e){
      return null;
    }
  }

  function loadSavedAdminTrail(){
    try{
      const raw = JSON.parse(sessionStorage.getItem(ADMIN_TRAIL_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .map(normalizeAdminState)
        .filter(s => ['dashboard','requests','clients','screens','creatives'].includes(s.view))
        .slice(-40);
    }catch(e){
      return [];
    }
  }

  function saveAdminOverlay(type=null, id=null){
    try{
      if (!type){
        sessionStorage.removeItem(ADMIN_OVERLAY_KEY);
        return;
      }
      sessionStorage.setItem(ADMIN_OVERLAY_KEY, JSON.stringify({
        type,
        id:id ?? null
      }));
    }catch(e){}
  }

  function loadAdminOverlay(){
    try{
      const raw = JSON.parse(sessionStorage.getItem(ADMIN_OVERLAY_KEY) || 'null');
      if (!raw?.type) return null;
      return {type:String(raw.type), id:raw.id ?? null};
    }catch(e){
      return null;
    }
  }

  function clearAdminOverlay(type=null){
    try{
      if (!type){
        sessionStorage.removeItem(ADMIN_OVERLAY_KEY);
        return;
      }
      const current = loadAdminOverlay();
      if (current?.type === type) sessionStorage.removeItem(ADMIN_OVERLAY_KEY);
    }catch(e){}
  }

  function restoreSavedAdminOverlay(){
    const saved = loadAdminOverlay();
    if (!saved) return;

    // Re-open only the place the user was on. Unsaved file selections
    // cannot be restored by browsers after a hard refresh.
    switch(saved.type){
      case 'broadcast-preview':
        if (saved.id && screenById(saved.id)){
          renderScreenPlaylist(saved.id, true);
          setTimeout(() => openBroadcastPreview(saved.id, true), 0);
        }else clearAdminOverlay();
        break;
      case 'screen-playlist':
        if (saved.id && screenById(saved.id)) renderScreenPlaylist(saved.id, true);
        else clearAdminOverlay();
        break;
      case 'screen-manage':
        if (!saved.id || screenById(saved.id)) openScreenDialog(saved.id || null, true);
        else clearAdminOverlay();
        break;
      case 'screen-delete':
        if (saved.id && screenById(saved.id)) openDeleteScreenDialog(saved.id, true);
        else clearAdminOverlay();
        break;
      case 'internal-ad':
        if (!saved.id || loadInternalAds().some(ad => ad.id === saved.id)) openInternalAdDialog(saved.id || null, true);
        else clearAdminOverlay();
        break;
      case 'screen-assignment':
        if (saved.id && loadRequests().some(r => r.id === saved.id)) openScreenAssignmentDialog(saved.id, true);
        else clearAdminOverlay();
        break;
      case 'creative-upload':
        if (saved.id && loadRequests().some(r => r.id === saved.id)) openCreativeUploadDialog(saved.id, true);
        else clearAdminOverlay();
        break;
      case 'change-request':
        if (saved.id && loadRequests().some(r => r.id === saved.id)) openChangeRequestDialog(saved.id, true);
        else clearAdminOverlay();
        break;
      default:
        clearAdminOverlay();
    }
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

  let screenReturnScrollY = 0;

  function rememberScreenReturnPosition(){
    screenReturnScrollY = window.scrollY || window.pageYOffset || 0;
  }

  function restoreScreenReturnPosition(){
    const y = screenReturnScrollY;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo(0, y));
    });
  }

  function ensureScreensView(){
    if (currentAdminState.view !== 'screens'){
      navigateAdmin({view:'screens', statusFilter:'all', requestId:null});
    }
  }

  function screenOverlayIsOpen(){
    return Boolean(
      document.getElementById('broadcastPreviewDialog')?.classList.contains('show') ||
      document.getElementById('screenPlaylistDialog')?.classList.contains('show') ||
      document.getElementById('screenManageDialog')?.classList.contains('show') ||
      document.getElementById('deleteScreenDialog')?.classList.contains('show')
    );
  }

  function closeTopAdminOverlayForBack(){
    const broadcast = document.getElementById('broadcastPreviewDialog');
    if (broadcast?.classList.contains('show')){
      closeBroadcastPreview();
      return true;
    }

    const playlist = document.getElementById('screenPlaylistDialog');
    if (playlist?.classList.contains('show')){
      closeScreenPlaylist();
      return true;
    }

    const manage = document.getElementById('screenManageDialog');
    if (manage?.classList.contains('show')){
      closeScreenManageDialog();
      return true;
    }

    const del = document.getElementById('deleteScreenDialog');
    if (del?.classList.contains('show')){
      closeDeleteScreenDialog();
      return true;
    }

    const modalIds = [
      'internalAdDialog',
      'screenAssignmentDialog',
      'creativeUploadDialog',
      'changeRequestDialog'
    ];

    for (const id of modalIds){
      const dialog = document.getElementById(id);
      if (!dialog?.classList.contains('show')) continue;
      const closeButton = dialog.querySelector('.change-dialog-close');
      if (closeButton) closeButton.click();
      else dialog.classList.remove('show');
      return true;
    }

    return false;
  }

  function updateAdminBackButton(){
    const btn = document.getElementById('adminBack');
    if (!btn) return;
    const atRoot = sameAdminState(currentAdminState, {view:'dashboard',statusFilter:'all',requestId:null});
    btn.hidden = adminTrail.length === 0 && atRoot && !screenOverlayIsOpen();
  }

  function setView(name){
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.viewPanel === name));
    document.querySelectorAll('.nav-item[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    document.getElementById('viewTitle').textContent = titles[name] || 'Admin';
    document.querySelector('.sidebar').classList.remove('open');
    if (name === 'requests') renderRequests();
    if (name === 'clients') renderClients();
    if (name === 'screens') { renderInternalAds(); renderScreens(); }
    if (name === 'creatives') renderCreatives();
  }

  function applyAdminState(state){
    const next = normalizeAdminState(state);
    currentAdminState = next;

    const filter = document.getElementById('statusFilter');
    const search = document.getElementById('requestSearch');

    if (filter) filter.value = next.statusFilter || 'all';
    if (search && next.view === 'requests') {
      search.value = sessionStorage.getItem(ADMIN_SEARCH_KEY) || '';
    }

    setView(next.view);

    if (next.requestId) {
      openRequestDirect(next.requestId);
    } else {
      closeRequestDirect();
    }

    updateAdminBackButton();
    saveAdminNavigationState();
  }

  function navigateAdmin(state){
    const next = normalizeAdminState(state);
    if (sameAdminState(currentAdminState, next)) return;

    adminTrail.push({...currentAdminState});
    applyAdminState(next);
    saveAdminNavigationState();
  }

  function goAdminBack(){
    if (closeTopAdminOverlayForBack()) {
      updateAdminBackButton();
      return;
    }

    if (!adminTrail.length) {
      if (!sameAdminState(currentAdminState, {view:'dashboard',statusFilter:'all',requestId:null})) {
        applyAdminState({view:'dashboard',statusFilter:'all',requestId:null});
      }
      updateAdminBackButton();
      return;
    }

    const previous = adminTrail.pop();
    applyAdminState(previous);
    saveAdminNavigationState();
  }

  function initAdminNavigation(){
    const savedState = loadSavedAdminState();
    adminTrail = loadSavedAdminTrail();
    currentAdminState = savedState || {view:'dashboard', statusFilter:'all', requestId:null};

    // If a request was removed since the saved session, restore its parent view instead.
    if (currentAdminState.requestId && !loadRequests().some(r => r.id === currentAdminState.requestId)){
      currentAdminState.requestId = null;
    }

    applyAdminState(currentAdminState);

    // Restore the exact open Admin layer (playlist/editor/dialog) after
    // the underlying view/request has been rebuilt.
    setTimeout(() => restoreSavedAdminOverlay(), 0);

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

    // On iPhone/browser Back, an open overlay is closed first.
    // Only the next Back moves through the Admin trail.
    if (!closeTopAdminOverlayForBack()) goAdminBack();

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

  let screenEditorPreviewUrl = null;

  function clearScreenEditorPreviewUrl(){
    if (screenEditorPreviewUrl){
      URL.revokeObjectURL(screenEditorPreviewUrl);
      screenEditorPreviewUrl = null;
    }
  }

  function setScreenEditorPreviewEmpty(){
    const dialog = document.getElementById('screenManageDialog');
    if (!dialog) return;
    clearScreenEditorPreviewUrl();
    dialog.querySelector('#screenPhotoPreview').innerHTML = `
      <div class="screen-photo-empty">
        <span>▧</span>
        <strong>Няма снимка</strong>
        <small>Качи снимка на реалната локация или на монтирания екран.</small>
      </div>`;
    dialog.querySelector('#screenPhotoRemove').hidden = true;
  }

  async function loadExistingScreenPhotoPreview(screen){
    const dialog = document.getElementById('screenManageDialog');
    if (!dialog) return;

    clearScreenEditorPreviewUrl();

    if (!screen?.photo?.key){
      setScreenEditorPreviewEmpty();
      return;
    }

    dialog.querySelector('#screenPhotoPreview').innerHTML =
      '<div class="screen-photo-loading">Зареждане на снимката…</div>';
    dialog.querySelector('#screenPhotoRemove').hidden = false;

    const record = await getStoredFile(screen.photo.key);
    if (!dialog.classList.contains('show')) return;

    if (!record?.blob){
      dialog.querySelector('#screenPhotoPreview').innerHTML = `
        <div class="screen-photo-empty">
          <span>▧</span>
          <strong>${esc(screen.photo.name || 'Снимка')}</strong>
          <small>Файлът не е наличен в този demo браузър.</small>
        </div>`;
      return;
    }

    screenEditorPreviewUrl = URL.createObjectURL(record.blob);
    dialog.querySelector('#screenPhotoPreview').innerHTML =
      `<img src="${screenEditorPreviewUrl}" alt="Снимка на локацията">`;
  }

  function previewSelectedScreenPhoto(file){
    const dialog = document.getElementById('screenManageDialog');
    if (!dialog || !file) return;

    clearScreenEditorPreviewUrl();
    screenEditorPreviewUrl = URL.createObjectURL(file);
    dialog.querySelector('#screenPhotoPreview').innerHTML =
      `<img src="${screenEditorPreviewUrl}" alt="Нова снимка на локацията">`;
    dialog.querySelector('#screenPhotoRemove').hidden = false;
    dialog.querySelector('#screenPhotoChoose').textContent = 'Смени снимката';
  }

  function closeScreenManageDialog(){
    const dialog = document.getElementById('screenManageDialog');
    if (!dialog || !dialog.classList.contains('show')) return;

    dialog.classList.remove('show');
    dialog.dataset.screenId = '';
    dialog.dataset.removePhoto = '0';
    dialog.querySelector('#screenManagePhoto').value = '';
    clearScreenEditorPreviewUrl();
    unlockAdminPageScroll();
    clearAdminOverlay('screen-manage');
    restoreScreenReturnPosition();
    updateAdminBackButton();
  }

  function openScreenDialog(id=null, restoring=false){
    ensureScreensView();
    if (!restoring) rememberScreenReturnPosition();
    saveAdminOverlay('screen-manage', id || null);

    const existing = id ? screenById(id) : null;

    let dialog = document.getElementById('screenManageDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'screenManageDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog screen-manage-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">ЕКРАН / ЛОКАЦИЯ</span>
              <h3 id="screenManageTitle">Добави екран</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>

          <p class="change-dialog-help">Новият екран се създава като „Скрит / Подготовка“. Подготвяш го спокойно и натискаш „Покажи екрана“, когато е готов.</p>

          <div class="internal-ad-form">
            <label>
              <span>Име на екрана / локацията</span>
              <input id="screenManageName" type="text" placeholder="Напр. Фризьорски салон">
            </label>

            <label>
              <span>Описание / адрес <small>(по желание)</small></span>
              <input id="screenManageDescription" type="text" placeholder="Напр. бул. България 12 · витрина">
            </label>

            <div class="screen-photo-field">
              <div class="screen-photo-field-head">
                <div>
                  <span class="internal-ad-label">Снимка на локацията / екрана <small>(по желание)</small></span>
                  <small>JPG или PNG · до 12 MB</small>
                </div>
              </div>

              <input id="screenManagePhoto" type="file" accept="image/jpeg,image/png" hidden>

              <div id="screenPhotoPreview" class="screen-photo-editor-preview"></div>

              <div class="screen-photo-actions">
                <button type="button" class="btn btn-light" id="screenPhotoChoose">Качи снимка</button>
                <button type="button" class="btn btn-danger" id="screenPhotoRemove" hidden>Премахни снимката</button>
              </div>
            </div>

            <label>
              <span>Часове излъчване на ден <small>(по желание)</small></span>
              <input id="screenManageHours" type="number" min="1" max="24" step="0.5" inputmode="decimal" placeholder="Напр. 12">
              <small class="field-help">Само за прогнозата на излъчванията на ден. Ако е празно, ще показваме само излъчвания на час.</small>
            </label>

            <label>
              <span>Yodeck Player ID <small>(по желание, за по-късно)</small></span>
              <input id="screenManageYodeck" type="text" placeholder="Ще го добавим след свързване с Yodeck">
            </label>

            <div class="change-dialog-error" id="screenManageError" hidden></div>
          </div>

          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-screen-manage-cancel>← Назад към екраните</button>
            <button type="button" class="btn btn-primary" data-screen-manage-save>Запази екрана</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      dialog.querySelector('.change-dialog-close').addEventListener('click', closeScreenManageDialog);
      dialog.querySelector('[data-screen-manage-cancel]').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeScreenManageDialog();
      });
      dialog.addEventListener('click', e => {
        if (e.target === dialog) closeScreenManageDialog();
      });

      dialog.querySelector('#screenPhotoChoose').addEventListener('click', () => {
        dialog.querySelector('#screenManagePhoto').click();
      });

      dialog.querySelector('#screenManagePhoto').addEventListener('change', e => {
        const file = e.target.files?.[0];
        const error = dialog.querySelector('#screenManageError');
        error.hidden = true;
        if (!file) return;

        if (!['image/jpeg','image/png'].includes(file.type)){
          e.target.value = '';
          error.textContent = 'Снимката трябва да е JPG или PNG.';
          error.hidden = false;
          return;
        }
        if (file.size > 12 * 1024 * 1024){
          e.target.value = '';
          error.textContent = 'Снимката е по-голяма от 12 MB.';
          error.hidden = false;
          return;
        }

        dialog.dataset.removePhoto = '0';
        previewSelectedScreenPhoto(file);
      });

      dialog.querySelector('#screenPhotoRemove').addEventListener('click', () => {
        dialog.dataset.removePhoto = '1';
        dialog.querySelector('#screenManagePhoto').value = '';
        dialog.querySelector('#screenPhotoChoose').textContent = 'Качи снимка';
        setScreenEditorPreviewEmpty();
      });

      dialog.querySelector('[data-screen-manage-save]').addEventListener('click', async () => {
        const screenId = dialog.dataset.screenId || '';
        const name = dialog.querySelector('#screenManageName').value.trim();
        const description = dialog.querySelector('#screenManageDescription').value.trim();
        const yodeckPlayerId = dialog.querySelector('#screenManageYodeck').value.trim();
        const hoursRaw = dialog.querySelector('#screenManageHours').value.trim();
        const broadcastHoursPerDay = hoursRaw === '' ? null : Number(hoursRaw);
        const photoFile = dialog.querySelector('#screenManagePhoto').files?.[0] || null;
        const removePhoto = dialog.dataset.removePhoto === '1';
        const error = dialog.querySelector('#screenManageError');
        const saveBtn = dialog.querySelector('[data-screen-manage-save]');

        error.hidden = true;

        if (!name){
          error.textContent = 'Напиши име на екрана.';
          error.hidden = false;
          return;
        }

        if (broadcastHoursPerDay !== null && (!Number.isFinite(broadcastHoursPerDay) || broadcastHoursPerDay < 1 || broadcastHoursPerDay > 24)){
          error.textContent = 'Часовете излъчване на ден трябва да са между 1 и 24.';
          error.hidden = false;
          return;
        }

        const screens = loadScreenCatalog();
        const duplicate = screens.find(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== screenId);
        if (duplicate){
          error.textContent = 'Вече има екран с това име.';
          error.hidden = false;
          return;
        }

        saveBtn.disabled = true;
        const oldLabel = saveBtn.textContent;
        saveBtn.textContent = 'Запазване…';

        try{
          let oldPhoto = null;
          let newPhoto = null;

          if (screenId){
            const current = screens.find(s => s.id === screenId);
            oldPhoto = current?.photo || null;
            newPhoto = oldPhoto;
          }

          if (removePhoto){
            if (oldPhoto?.key) await deleteStoredFile(oldPhoto.key);
            newPhoto = null;
          }

          if (photoFile){
            const key = `screen-photo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
            await putStoredFile({
              key,
              blob:photoFile,
              name:photoFile.name,
              type:photoFile.type,
              size:photoFile.size,
              createdAt:new Date().toISOString()
            });
            if (oldPhoto?.key && oldPhoto.key !== key) await deleteStoredFile(oldPhoto.key);
            newPhoto = {
              key,
              name:photoFile.name,
              type:photoFile.type,
              size:photoFile.size
            };
          }

          if (screenId){
            const target = screens.find(s => s.id === screenId);
            if (!target) throw new Error('Screen not found');
            target.name = name;
            target.description = description;
            target.yodeckPlayerId = yodeckPlayerId;
            target.broadcastHoursPerDay = broadcastHoursPerDay;
            target.photo = newPhoto;
            target.updatedAt = new Date().toISOString();
          }else{
            const now = new Date().toISOString();
            screens.push({
              id:makeScreenId(),
              name,
              description,
              status:'hidden',
              active:false,
              yodeckPlayerId,
              broadcastHoursPerDay,
              photo:newPhoto,
              createdAt:now,
              updatedAt:now
            });
          }

          saveScreenCatalog(screens);
          renderInternalAds();
          renderScreens();
          closeScreenManageDialog();
          toast(screenId ? 'Екранът е обновен.' : 'Новият екран е добавен.');
        }catch(err){
          console.error(err);
          error.textContent = 'Екранът не можа да бъде запазен. Опитай отново.';
          error.hidden = false;
        }finally{
          saveBtn.disabled = false;
          saveBtn.textContent = oldLabel;
        }
      });
    }

    dialog.dataset.screenId = existing?.id || '';
    dialog.dataset.removePhoto = '0';
    dialog.querySelector('#screenManageTitle').textContent = existing ? 'Редактирай екран' : 'Добави екран';
    dialog.querySelector('#screenManageName').value = existing?.name || '';
    dialog.querySelector('#screenManageDescription').value = existing?.description || '';
    dialog.querySelector('#screenManageHours').value = existing?.broadcastHoursPerDay ?? '';
    dialog.querySelector('#screenManageYodeck').value = existing?.yodeckPlayerId || '';
    dialog.querySelector('#screenManagePhoto').value = '';
    dialog.querySelector('#screenManageError').hidden = true;
    dialog.querySelector('#screenPhotoChoose').textContent = existing?.photo ? 'Смени снимката' : 'Качи снимка';

    lockAdminPageScroll();
    dialog.classList.add('show');
    updateAdminBackButton();

    if (existing?.photo) loadExistingScreenPhotoPreview(existing);
    else setScreenEditorPreviewEmpty();

    requestAnimationFrame(() => dialog.querySelector('#screenManageName')?.focus());
  }

  function setScreenStatus(id, status){
    if (!['hidden','published','stopped'].includes(status)) return;

    const screens = loadScreenCatalog();
    const screen = screens.find(s => s.id === id);
    if (!screen) return;

    screen.status = status;
    screen.active = status === 'published';
    screen.updatedAt = new Date().toISOString();
    saveScreenCatalog(screens);
    renderAll();

    if (activePlaylistScreenId === id) renderScreenPlaylist(id);

    if (status === 'published') toast('Екранът вече е публикуван и може да се използва в кампании.');
    if (status === 'hidden') toast('Екранът е скрит и остава видим само в Admin.');
    if (status === 'stopped') toast('Екранът е временно спрян. Настройките и playlist-ът са запазени.');
  }

  function closeDeleteScreenDialog(){
    const dialog = document.getElementById('deleteScreenDialog');
    if (!dialog || !dialog.classList.contains('show')) return;
    dialog.classList.remove('show');
    dialog.dataset.screenId = '';
    unlockAdminPageScroll();
    clearAdminOverlay('screen-delete');
    restoreScreenReturnPosition();
    updateAdminBackButton();
  }

  function openDeleteScreenDialog(id, restoring=false){
    ensureScreensView();
    if (!restoring) rememberScreenReturnPosition();
    saveAdminOverlay('screen-delete', id);

    const screen = screenById(id);
    if (!screen) return;

    const usage = screenUsage(id);

    let dialog = document.getElementById('deleteScreenDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'deleteScreenDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog delete-screen-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">ИЗТРИВАНЕ НА ЕКРАН</span>
              <h3 id="deleteScreenTitle">Изтрий екран</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>

          <div id="deleteScreenBody" class="delete-screen-body"></div>

          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-delete-screen-cancel>← Назад към екраните</button>
            <button type="button" class="btn btn-danger" data-delete-screen-confirm>Да, изтрий екрана</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      dialog.querySelector('.change-dialog-close').addEventListener('click', closeDeleteScreenDialog);
      dialog.querySelector('[data-delete-screen-cancel]').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeDeleteScreenDialog();
      });
      dialog.addEventListener('click', e => {
        if (e.target === dialog) closeDeleteScreenDialog();
      });

      dialog.querySelector('[data-delete-screen-confirm]').addEventListener('click', async () => {
        const screenId = dialog.dataset.screenId;
        const current = screenById(screenId);
        if (!current) {
          closeDeleteScreenDialog();
          return;
        }

        const currentUsage = screenUsage(screenId);
        if (currentUsage.total){
          dialog.querySelector('#deleteScreenBody').innerHTML = `
            <div class="delete-screen-warning">
              <strong>Този екран не може да бъде изтрит.</strong>
              <span>Използва се в ${currentUsage.requests.length} клиентски запис(а) и ${currentUsage.internalAds.length} собствен(и) реклам(и). Първо махни тези връзки или го остави „Скрит“.</span>
            </div>`;
          dialog.querySelector('[data-delete-screen-confirm]').hidden = true;
          return;
        }

        if (current.photo?.key) await deleteStoredFile(current.photo.key);
        saveScreenCatalog(loadScreenCatalog().filter(s => s.id !== screenId));
        renderInternalAds();
        renderScreens();
        closeDeleteScreenDialog();
        toast('Екранът е изтрит.');
      });
    }

    dialog.dataset.screenId = id;
    dialog.querySelector('#deleteScreenTitle').textContent = `Изтрий „${screen.name}“?`;

    const confirmBtn = dialog.querySelector('[data-delete-screen-confirm]');
    confirmBtn.hidden = usage.total > 0;

    dialog.querySelector('#deleteScreenBody').innerHTML = usage.total
      ? `<div class="delete-screen-warning">
          <strong>Този екран не може да бъде изтрит в момента.</strong>
          <span>Използва се в ${usage.requests.length} клиентски запис(а) и ${usage.internalAds.length} собствен(и) реклам(и). Можеш да го скриеш или временно да го спреш.</span>
        </div>`
      : `<div class="delete-screen-confirmation">
          <strong>Това действие е окончателно.</strong>
          <span>Екранът няма активни връзки. За да продължиш, натисни червения бутон „Да, изтрий екрана“.</span>
        </div>`;

    lockAdminPageScroll();
    dialog.classList.add('show');
    updateAdminBackButton();
  }

  function renderInternalAds(){
    const box = document.getElementById('internalAdsPanel');
    if (!box) return;
    const ads = loadInternalAds().sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));

    if (!ads.length){
      box.innerHTML = `<div class="internal-ads-empty"><strong>Собствени реклами</strong><span>Добави „Рекламирай тук“, служебна визия или друга реклама без клиентска заявка.</span></div>`;
      return;
    }

    box.innerHTML = `
      <div class="internal-ads-head"><strong>Собствени реклами</strong><span>${ads.length} общо</span></div>
      <div class="internal-ad-list">
        ${ads.map(ad => {
          const names = (ad.assignedScreens||[]).map(id => screenById(id)?.name).filter(Boolean);
          return `<article class="internal-ad-row ${ad.active===false?'is-disabled':''}">
            <div class="internal-ad-icon">KS</div>
            <div class="internal-ad-copy">
              <div class="internal-ad-title-line"><strong>${esc(ad.title||'Собствена реклама')}</strong><span class="internal-ad-badge">СОБСТВЕНА</span>${ad.active===false?'<span class="internal-ad-off">СПРЯНА</span>':''}</div>
              <span>${names.length?esc(names.join(' · ')):'Няма избрани екрани'} · ${Number(ad.duration)||10} сек.</span>
            </div>
            <div class="internal-ad-actions">
              <button class="btn btn-light" data-edit-internal-ad="${esc(ad.id)}">Редактирай</button>
              <button class="btn ${ad.active===false?'btn-success':'btn-warning'}" data-toggle-internal-ad="${esc(ad.id)}">${ad.active===false?'Включи':'Спри'}</button>
              <button class="btn btn-danger" data-delete-internal-ad="${esc(ad.id)}">Изтрий</button>
            </div>
          </article>`;
        }).join('')}
      </div>`;
  }

  function openInternalAdDialog(id=null, restoring=false){
    ensureScreensView();
    saveAdminOverlay('internal-ad', id || null);
    const existing = id ? loadInternalAds().find(ad => ad.id === id) : null;
    let dialog = document.getElementById('internalAdDialog');

    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'internalAdDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog internal-ad-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div><span class="section-kicker">СОБСТВЕНА РЕКЛАМА</span><h3 id="internalAdDialogTitle">Добави собствена реклама</h3></div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>
          <p class="change-dialog-help">За „Рекламирай тук“, служебни съобщения и други реклами, които не минават през клиентска заявка.</p>

          <div class="internal-ad-form">
            <label><span>Име на рекламата</span><input id="internalAdTitle" type="text" placeholder="Напр. Рекламирай тук"></label>
            <div><span class="internal-ad-label">Екрани</span><div id="internalAdScreens" class="screen-assignment-options"></div></div>
            <label><span>Времетраене</span><select id="internalAdDuration"><option value="8">8 сек.</option><option value="9">9 сек.</option><option value="10">10 сек.</option></select></label>
            <label class="creative-upload-drop">
              <input id="internalAdFile" type="file" accept="image/jpeg,image/png,video/mp4">
              <span class="creative-upload-icon">⇧</span><strong id="internalAdFileLabel">Избери JPG, PNG или MP4</strong><small>Максимум 25 MB</small>
            </label>
            <div id="internalAdExistingFile" class="selected-creative-file" hidden></div>
            <div id="internalAdFileCheck" class="admin-ad-file-check" hidden></div>
            <div class="change-dialog-error" id="internalAdError" hidden></div>
          </div>
          <div class="change-dialog-actions"><button type="button" class="btn btn-light" data-internal-cancel>Отказ</button><button type="button" class="btn btn-primary" data-internal-save>Запази рекламата</button></div>
        </section>`;
      document.body.appendChild(dialog);

      const close = () => {
        if (!dialog.classList.contains('show')) return;
        dialog.classList.remove('show');
        dialog.dataset.adId='';
        dialog.querySelector('#internalAdFile').value='';
        dialog._internalAdValidation=null;
        const check=dialog.querySelector('#internalAdFileCheck');
        check.hidden=true;
        check.innerHTML='';
        unlockAdminPageScroll();
        clearAdminOverlay('internal-ad');
      };
      dialog.querySelector('.change-dialog-close').addEventListener('click', close);
      dialog.querySelector('[data-internal-cancel]').addEventListener('click', close);
      dialog.addEventListener('click', e => { if (e.target===dialog) close(); });
      dialog.querySelector('#internalAdFile').addEventListener('change', async e => {
        const file=e.target.files?.[0];
        const check=dialog.querySelector('#internalAdFileCheck');
        dialog.querySelector('#internalAdFileLabel').textContent=file?`${file.name} · ${formatBytes(file.size)}`:'Избери JPG, PNG или MP4';
        dialog.querySelector('#internalAdError').hidden=true;
        dialog._internalAdValidation=null;

        if(!file){
          check.hidden=true;
          check.innerHTML='';
          return;
        }

        check.hidden=false;
        check.className='admin-ad-file-check checking';
        check.innerHTML='<strong>Проверяваме файла…</strong>';
        const result=await inspectAdFile(file);
        if(dialog.querySelector('#internalAdFile').files?.[0]!==file)return;
        dialog._internalAdValidation=result;
        renderAdFileCheck(check,result);
      });

      dialog.querySelector('[data-internal-save]').addEventListener('click', async () => {
        const adId=dialog.dataset.adId||null;
        const ads=loadInternalAds();
        const current=adId?ads.find(ad=>ad.id===adId):null;
        const title=dialog.querySelector('#internalAdTitle').value.trim();
        const screens=[...dialog.querySelectorAll('input[name="internalAdScreen"]:checked')].map(i=>i.value);
        const duration=Number(dialog.querySelector('#internalAdDuration').value);
        const file=dialog.querySelector('#internalAdFile').files?.[0];
        const error=dialog.querySelector('#internalAdError');

        if(!title){ error.textContent='Напиши име на рекламата.'; error.hidden=false; return; }
        if(!screens.length){ error.textContent='Избери поне един екран.'; error.hidden=false; return; }
        if(!current&&!file){ error.textContent='Избери JPG, PNG или MP4.'; error.hidden=false; return; }
        if(file&&!dialog._internalAdValidation){
          error.textContent='Изчакай проверката на файла.';
          error.hidden=false;
          return;
        }
        if(file&&dialog._internalAdValidation&&!dialog._internalAdValidation.valid){
          error.textContent='Файлът има технически проблем. Провери съобщението под него.';
          error.hidden=false;
          return;
        }

        let storedFile=current?.file||null;
        if(file){
          const key=`internal-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          try{
            await putStoredFile({key,blob:file,name:file.name,type:file.type,size:file.size,createdAt:new Date().toISOString()});
            storedFile={
              key,
              name:file.name,
              type:file.type,
              size:file.size,
              width:dialog._internalAdValidation?.width || null,
              height:dialog._internalAdValidation?.height || null,
              duration:dialog._internalAdValidation?.duration || null
            };
          }catch(err){ console.error(err); error.textContent='Файлът не можа да бъде записан в demo режима.'; error.hidden=false; return; }
        }

        if(current){
          current.title=title; current.assignedScreens=screens; current.duration=duration; current.file=storedFile; current.updatedAt=new Date().toISOString();
          if(!current.screenSettings) current.screenSettings={};
          Object.keys(current.screenSettings).forEach(screenId=>{ if(!screens.includes(screenId)) delete current.screenSettings[screenId]; });
          screens.forEach(screenId=>{
            const setting=getScreenSetting(current,screenId);
            current.screenSettings[screenId]={...setting,duration};
          });
        }else{
          const now=new Date().toISOString();
          const ad={id:makeInternalAdId(),internalAd:true,title,assignedScreens:screens,duration,file:storedFile,active:true,createdAt:now,updatedAt:now,screenSettings:{}};
          screens.forEach(screenId=>{ ad.screenSettings[screenId]={duration,paused:false,order:null}; });
          ads.unshift(ad);
        }
        saveInternalAds(ads);
        close(); renderInternalAds(); renderScreens();
        if(activePlaylistScreenId) renderScreenPlaylist(activePlaylistScreenId);
        toast(current?'Собствената реклама е обновена.':'Собствената реклама е добавена.');
      });
    }

    dialog.dataset.adId=existing?.id||'';
    dialog.querySelector('#internalAdDialogTitle').textContent=existing?'Редактирай собствена реклама':'Добави собствена реклама';
    dialog.querySelector('#internalAdTitle').value=existing?.title||'';
    dialog.querySelector('#internalAdDuration').value=String(existing?.duration||10);
    dialog.querySelector('#internalAdFile').value='';
    dialog._internalAdValidation=null;
    dialog.querySelector('#internalAdFileLabel').textContent=existing?'Смени файла (по желание)':'Избери JPG, PNG или MP4';
    dialog.querySelector('#internalAdError').hidden=true;
    dialog.querySelector('#internalAdFileCheck').hidden=true;
    dialog.querySelector('#internalAdFileCheck').innerHTML='';
    const existingFile=dialog.querySelector('#internalAdExistingFile');
    existingFile.hidden=!existing?.file;
    existingFile.textContent=existing?.file?`Текущ файл: ${existing.file.name}`:'';
    const selected=new Set(existing?.assignedScreens||[]);
    dialog.querySelector('#internalAdScreens').innerHTML=selectableScreens(existing?.assignedScreens||[]).map(screen=>`
      <label class="screen-option ${!isScreenPublished(screen)?'is-screen-off':''}"><input type="checkbox" name="internalAdScreen" value="${esc(screen.id)}" ${selected.has(screen.id)?'checked':''} ${!isScreenPublished(screen)?'disabled':''}><span class="screen-option-check">✓</span><span class="screen-option-copy"><strong>${esc(screen.name)}${!isScreenPublished(screen)?` · ${screenStatusLabel(screen)}`:''}</strong><small>${esc(screen.description||'Без описание')}</small></span></label>`).join('');
    lockAdminPageScroll();
    dialog.classList.add('show');
    requestAnimationFrame(() => {
      const panel = dialog.querySelector('.internal-ad-dialog');
      if (panel) panel.scrollTop = 0;
    });
  }

  function toggleInternalAd(id){
    const ads=loadInternalAds(); const ad=ads.find(x=>x.id===id); if(!ad)return;
    ad.active=ad.active===false; ad.updatedAt=new Date().toISOString(); saveInternalAds(ads);
    renderInternalAds(); renderScreens(); if(activePlaylistScreenId) renderScreenPlaylist(activePlaylistScreenId);
    toast(ad.active?'Собствената реклама е включена.':'Собствената реклама е спряна.');
  }

  function deleteInternalAd(id){
    const ads=loadInternalAds(); const ad=ads.find(x=>x.id===id); if(!ad)return;
    if(!confirm(`Изтрий „${ad.title||'Собствена реклама'}“?`))return;
    saveInternalAds(ads.filter(x=>x.id!==id)); renderInternalAds(); renderScreens(); if(activePlaylistScreenId) renderScreenPlaylist(activePlaylistScreenId); toast('Собствената реклама е изтрита.');
  }

  function renderScreens(){
    const box = document.getElementById('screensGrid');
    if (!box) return;

    const requests = syncCampaignLifecycle();

    box.innerHTML = SCREEN_CATALOG.map(screen => {
      ensureScreenSettings(requests, screen.id);

      const active = allPlaylistItems(screen.id);
      const configuredPlaying = active.filter(r => !getScreenSetting(r, screen.id).paused);
      const playing = isScreenPublished(screen) ? configuredPlaying : [];
      const paused = active.length - configuredPlaying.length;
      const cycle = playing.reduce((sum,r) => sum + getScreenSetting(r, screen.id).duration, 0);
      const rotationStats = screenRotationStats(screen.id);

      const cardClass = screen.status === 'hidden' ? 'screen-is-hidden' : (screen.status === 'stopped' ? 'screen-is-disabled' : '');
      const statusClass = screen.status === 'hidden' ? 'status-waiting' : (screen.status === 'stopped' ? 'status-done' : 'status-active');

      return `
        <article class="screen-card panel ${cardClass}">
          <div class="screen-preview ${screen.photo?.key ? 'has-location-photo' : ''}" ${screen.photo?.key ? `data-screen-photo="${esc(screen.id)}"` : ''}>
            ${screen.photo?.key
              ? `<div class="screen-location-photo-loading"><span>▧</span><small>${esc(screen.photo.name || 'Снимка')}</small></div>`
              : `<div class="fake-tv"><span>${screenLabelHTML(screen)}</span></div>`}
          </div>
          <div class="screen-meta">
            <div class="screen-card-top">
              <span class="status-pill ${statusClass}">
                ${screenStatusLabel(screen)}
              </span>
            </div>
            <h3>${esc(screen.name)}</h3>
            <p>${esc(screen.description || 'Без добавено описание.')}</p>
            ${screen.yodeckPlayerId ? `<div class="screen-yodeck-id">Yodeck ID: <strong>${esc(screen.yodeckPlayerId)}</strong></div>` : ''}

            <div class="screen-summary-grid">
              <div><span>Цикъл</span><strong>${cycle ? `${cycle} сек.` : '—'}</strong></div>
              <div><span>Пауза</span><strong>${paused}</strong></div>
            </div>

            <div class="screen-rotation-mini">
              <div>
                <span>≈ излъчвания / час</span>
                <strong>${rotationStats.cycleSeconds ? formatApprox(rotationStats.rotationsPerHour) : '—'}</strong>
              </div>
              <div>
                <span>≈ излъчвания / ден</span>
                <strong>${rotationStats.rotationsPerDay ? formatApprox(rotationStats.rotationsPerDay) : '—'}</strong>
              </div>
              ${rotationStats.hoursPerDay
                ? `<small>При ${rotationStats.hoursPerDay} ч. излъчване дневно.</small>`
                : `<small>За дневна прогноза задай часове/ден от „Редактирай“.</small>`}
            </div>

            <div class="screen-campaign-list">
              ${active.length ? active.slice(0,3).map(r => {
                const setting = getScreenSetting(r, screen.id);
                return `
                <button class="screen-campaign-row ${setting.paused ? 'is-paused' : ''}" ${isInternalAd(r)?`data-edit-internal-ad="${esc(r.id)}"`:`data-open-request="${esc(r.id)}"`}>
                  <span>
                    <strong>${isInternalAd(r)?`KS · ${esc(r.title||'Собствена реклама')}`:`${esc(r.id)} · ${esc(r.company || 'Кампания')}`}</strong>
                    <small>${setting.paused ? 'Пауза · ' : ''}${setting.duration} сек.${isInternalAd(r)?'':` · до ${formatDateOnly(r.expiresAt)}`}</small>
                  </span>
                  <b>${isInternalAd(r)?'Редактирай →':'Отвори →'}</b>
                </button>`;
              }).join('') : '<div class="screen-campaign-empty">Този екран е свободен.</div>'}
              ${active.length > 3 ? `<div class="screen-more-count">+ още ${active.length - 3}</div>` : ''}
            </div>

            <button class="btn btn-primary screen-playlist-open" data-open-playlist="${esc(screen.id)}">
              Отвори плейлиста
            </button>

            <div class="screen-manage-actions">
              <button class="btn btn-light" data-edit-screen="${esc(screen.id)}">Редактирай</button>

              ${screen.status === 'hidden' ? `
                <button class="btn btn-success" data-set-screen-status="published" data-screen-id="${esc(screen.id)}">Покажи екрана</button>
              ` : screen.status === 'stopped' ? `
                <button class="btn btn-success" data-set-screen-status="published" data-screen-id="${esc(screen.id)}">Пусни отново</button>
                <button class="btn btn-light" data-set-screen-status="hidden" data-screen-id="${esc(screen.id)}">Скрий</button>
              ` : `
                <button class="btn btn-warning" data-set-screen-status="stopped" data-screen-id="${esc(screen.id)}">Спри временно</button>
                <button class="btn btn-light" data-set-screen-status="hidden" data-screen-id="${esc(screen.id)}">Скрий</button>
              `}

              <button class="btn btn-danger" data-delete-screen="${esc(screen.id)}">Изтрий</button>
            </div>
          </div>
        </article>`;
    }).join('');
    renderScreenCardPhotos();
  }

  let screenCardPhotoUrls = [];

  async function renderScreenCardPhotos(){
    screenCardPhotoUrls.forEach(url => URL.revokeObjectURL(url));
    screenCardPhotoUrls = [];

    const boxes = [...document.querySelectorAll('[data-screen-photo]')];
    for (const box of boxes){
      const screen = screenById(box.dataset.screenPhoto);
      if (!screen?.photo?.key) continue;

      const record = await getStoredFile(screen.photo.key);
      if (!box.isConnected) continue;

      if (!record?.blob){
        box.innerHTML = `
          <div class="screen-location-photo-loading missing">
            <span>▧</span>
            <small>Снимката не е на това устройство</small>
          </div>`;
        continue;
      }

      const url = URL.createObjectURL(record.blob);
      screenCardPhotoUrls.push(url);
      box.innerHTML = `<img src="${url}" alt="Снимка на ${esc(screen.name)}">`;
    }
  }

  let activePlaylistScreenId = null;
  let playlistPreviewUrls = [];

  function closeScreenPlaylist(){
    const dialog = document.getElementById('screenPlaylistDialog');
    if (!dialog || !dialog.classList.contains('show')) return;
    dialog.classList.remove('show');
    activePlaylistScreenId = null;
    playlistPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    playlistPreviewUrls = [];
    unlockAdminPageScroll();
    clearAdminOverlay('screen-playlist');
    restoreScreenReturnPosition();
    updateAdminBackButton();
  }

  function ensurePlaylistDialog(){
    let dialog = document.getElementById('screenPlaylistDialog');
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.id = 'screenPlaylistDialog';
    dialog.className = 'playlist-dialog-backdrop';
    dialog.innerHTML = `
      <section class="playlist-dialog" role="dialog" aria-modal="true">
        <div class="playlist-dialog-head">
          <div>
            <button type="button" class="playlist-back-link" data-playlist-close>← Назад към екраните</button>
            <span class="section-kicker">ЕКРАН / ПЛЕЙЛИСТ</span>
            <h2 id="playlistDialogTitle">Плейлист</h2>
            <p id="playlistDialogSubtitle"></p>
          </div>
          <button type="button" class="playlist-dialog-close" aria-label="Затвори">×</button>
        </div>

        <div id="playlistSummary" class="playlist-summary"></div>

        <div class="playlist-broadcast-actions">
          <button type="button" class="btn btn-primary" id="broadcastPreviewBtn">
            ▶ Преглед на излъчването
          </button>
          <span id="broadcastPreviewHint">Виж playlist-а така, както би се въртял на екрана.</span>
        </div>

        <div id="playlistItems" class="playlist-items"></div>

        <div class="playlist-dialog-foot">
          <span>Demo управление. След Yodeck тези настройки ще управляват реалния екран.</span>
          <button type="button" class="btn btn-light" data-playlist-close>Затвори</button>
        </div>
      </section>`;

    document.body.appendChild(dialog);

    dialog.querySelector('#broadcastPreviewBtn').addEventListener('click', () => {
      if (activePlaylistScreenId) openBroadcastPreview(activePlaylistScreenId);
    });

    dialog.querySelector('.playlist-dialog-close').addEventListener('click', closeScreenPlaylist);
    dialog.querySelectorAll('[data-playlist-close]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeScreenPlaylist();
      });
    });
    dialog.addEventListener('click', e => {
      if (e.target === dialog) closeScreenPlaylist();
    });

    return dialog;
  }

  async function renderPlaylistPreviews(screenId){
    const rows = [...document.querySelectorAll('[data-playlist-preview]')];

    for (const box of rows){
      const requestId = box.dataset.playlistPreview;
      const r = findPlaylistItem(requestId);
      const creative = campaignCreative(r);

      if (!creative?.key){
        box.innerHTML = '<div class="playlist-preview-placeholder"><span>KS</span><small>Няма локален preview</small></div>';
        continue;
      }

      const record = await getStoredFile(creative.key);
      if (!record?.blob){
        box.innerHTML = '<div class="playlist-preview-placeholder"><span>KS</span><small>Файлът не е на това устройство</small></div>';
        continue;
      }

      const url = URL.createObjectURL(record.blob);
      playlistPreviewUrls.push(url);

      if (String(record.type || creative.type || '').startsWith('video/')){
        box.innerHTML = `<video src="${url}" muted playsinline preload="metadata"></video><span class="playlist-media-badge">VIDEO</span>`;
      }else{
        box.innerHTML = `<img src="${url}" alt="Preview на рекламата"><span class="playlist-media-badge">IMAGE</span>`;
      }
    }
  }

  function renderScreenPlaylist(screenId, restoring=false){
    ensureScreensView();
    if (!restoring) rememberScreenReturnPosition();
    saveAdminOverlay('screen-playlist', screenId);

    const screen = screenById(screenId);
    if (!screen) return;

    activePlaylistScreenId = screenId;
    const dialog = ensurePlaylistDialog();

    playlistPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    playlistPreviewUrls = [];

    const items = allPlaylistItems(screenId);
    const configuredPlaying = items.filter(r => !getScreenSetting(r, screenId).paused);
    const playing = isScreenPublished(screen) ? configuredPlaying : [];
    const pausedCount = items.length - configuredPlaying.length;
    const cycle = playing.reduce((sum,r) => sum + getScreenSetting(r, screenId).duration, 0);

    dialog.querySelector('#playlistDialogTitle').textContent = `${screen.name} — Playlist`;
    dialog.querySelector('#playlistDialogSubtitle').textContent =
      screen.status === 'hidden'
        ? 'Екранът е „Скрит / Подготовка“. Playlist-ът може да се подготвя, но екранът още не е публикуван.'
        : screen.status === 'stopped'
          ? 'Екранът е временно спрян. Playlist-ът е запазен, но нищо не се счита за излъчвано.'
          : (items.length
            ? 'Подреди рекламите, избери 8–10 сек. и при нужда спри само една реклама на този екран.'
            : 'Няма активни кампании, разпределени към този екран.');

    const stats = screenRotationStats(screenId);

    dialog.querySelector('#playlistSummary').innerHTML = `
      <div><span>Активни кампании</span><strong>${items.length}</strong></div>
      <div><span>В момента се излъчват</span><strong>${playing.length}</strong></div>
      <div><span>На пауза</span><strong>${pausedCount}</strong></div>
      <div><span>Общ цикъл</span><strong>${cycle ? `${cycle} сек.` : '—'}</strong></div>
      <div class="playlist-stat-highlight">
        <span>≈ излъчвания / час</span>
        <strong>${stats.cycleSeconds ? formatApprox(stats.rotationsPerHour) : '—'}</strong>
      </div>
      <div class="playlist-stat-highlight">
        <span>≈ излъчвания / ден</span>
        <strong>${stats.rotationsPerDay ? formatApprox(stats.rotationsPerDay) : '—'}</strong>
      </div>
    `;

    const oldEstimateNote = dialog.querySelector('#playlistEstimateNote');
    if (oldEstimateNote) oldEstimateNote.remove();

    const estimateNote = document.createElement('div');
    estimateNote.id = 'playlistEstimateNote';
    estimateNote.className = 'playlist-estimate-note';
    estimateNote.innerHTML = stats.cycleSeconds
      ? `При текущ цикъл от <strong>${stats.cycleSeconds} сек.</strong> всяка непаузирана реклама се появява приблизително <strong>${formatApprox(stats.rotationsPerHour)}</strong> пъти на час.${stats.rotationsPerDay ? ` При <strong>${stats.hoursPerDay} ч.</strong> работа това са около <strong>${formatApprox(stats.rotationsPerDay)}</strong> излъчвания на ден.` : ' Задай часовете работа от „Редактирай екран“, за да получиш и дневна прогноза.'}<span>Това са излъчвания на playlist-а, не измерени гледания от хора.</span>`
      : 'Добави поне една непаузирана реклама, за да изчислим честотата на излъчване.';
    dialog.querySelector('#playlistSummary').after(estimateNote);

    const previewable = configuredPlaying.length;
    const previewCycle = configuredPlaying.reduce((sum,r) => sum + getScreenSetting(r, screenId).duration, 0);
    const previewBtn = dialog.querySelector('#broadcastPreviewBtn');
    const previewHint = dialog.querySelector('#broadcastPreviewHint');
    previewBtn.disabled = previewable === 0;
    previewHint.textContent = previewable
      ? `${previewable} ${previewable === 1 ? 'реклама' : 'реклами'} · цикъл ${previewCycle} сек. · паузираните не участват`
      : 'Няма непаузирани реклами за преглед.';

    const itemsBox = dialog.querySelector('#playlistItems');

    if (!items.length){
      itemsBox.innerHTML = `
        <div class="playlist-empty">
          <strong>Няма активни реклами.</strong>
          <span>Когато активираш кампания, разпределена към този екран, тя ще се появи тук автоматично.</span>
        </div>`;
    }else{
      itemsBox.innerHTML = items.map((r,index) => {
        const setting = getScreenSetting(r, screenId);
        return `
          <article class="playlist-item ${setting.paused ? 'is-paused' : ''}" data-playlist-request="${esc(r.id)}">
            <div class="playlist-order">
              <strong>${index + 1}</strong>
              <div>
                <button type="button" aria-label="Премести нагоре" data-playlist-move="up" data-request-id="${esc(r.id)}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" aria-label="Премести надолу" data-playlist-move="down" data-request-id="${esc(r.id)}" ${index === items.length - 1 ? 'disabled' : ''}>↓</button>
              </div>
            </div>

            <div class="playlist-preview" data-playlist-preview="${esc(r.id)}">
              <div class="playlist-preview-placeholder"><span>KS</span><small>Зареждане…</small></div>
            </div>

            <div class="playlist-copy">
              <div class="playlist-title-row">
                <div>
                  <span class="section-kicker">${isInternalAd(r)?'СОБСТВЕНА РЕКЛАМА':esc(r.id)}</span>
                  <h3>${esc(isInternalAd(r)?(r.title||'Собствена реклама'):(r.company || r.name || 'Кампания'))}</h3>
                </div>
                <span class="playlist-state ${setting.paused ? 'paused' : 'playing'}">${setting.paused ? 'ПАУЗА' : 'ИЗЛЪЧВА СЕ'}</span>
              </div>

              <div class="playlist-meta">
                ${isInternalAd(r)?'<span>Без клиентска заявка</span><span>Без крайна дата</span>':`<span>До ${formatDateOnly(r.expiresAt)}</span><span>${campaignTimeLeftText(r)}</span>`}
              </div>

              ${setting.paused ? `
                <div class="playlist-row-frequency is-paused-estimate">
                  <span>На пауза — не участва в прогнозата</span>
                </div>
              ` : `
                <div class="playlist-row-frequency">
                  <span>${stats.cycleSeconds ? `${formatApprox(stats.rotationsPerHour)} / час` : '— / час'}</span>
                  ${stats.rotationsPerDay ? `<span>${formatApprox(stats.rotationsPerDay)} / ден</span>` : ''}
                </div>
              `}

              <div class="playlist-controls">
                <label>
                  <span>Времетраене</span>
                  <select data-playlist-duration="${esc(r.id)}">
                    <option value="8" ${setting.duration===8?'selected':''}>8 сек.</option>
                    <option value="9" ${setting.duration===9?'selected':''}>9 сек.</option>
                    <option value="10" ${setting.duration===10?'selected':''}>10 сек.</option>
                  </select>
                </label>

                <button type="button"
                  class="btn ${setting.paused ? 'btn-success' : 'btn-warning'}"
                  data-playlist-pause="${esc(r.id)}">
                  ${setting.paused ? 'Пусни отново' : 'Пауза само тук'}
                </button>

                ${isInternalAd(r)?`<button type="button" class="btn btn-light" data-edit-internal-ad="${esc(r.id)}">Редактирай</button>`:`<button type="button" class="btn btn-light" data-open-request="${esc(r.id)}">Заявка</button>`}
              </div>
            </div>
          </article>`;
      }).join('');
    }

    lockAdminPageScroll();
    dialog.classList.add('show');
    updateAdminBackButton();
    renderPlaylistPreviews(screenId);
  }

  let broadcastPreviewTimer = null;
  let broadcastPreviewUrls = [];
  let broadcastPreviewItems = [];
  let broadcastPreviewIndex = 0;
  let broadcastPreviewPaused = false;
  let broadcastPreviewScreenId = null;
  let broadcastPreviewStartedAt = 0;
  let broadcastPreviewRemainingMs = 0;

  function clearBroadcastPreviewTimer(){
    if (broadcastPreviewTimer){
      clearTimeout(broadcastPreviewTimer);
      broadcastPreviewTimer = null;
    }
  }

  function clearBroadcastPreviewUrls(){
    broadcastPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    broadcastPreviewUrls = [];
  }

  function broadcastItemTitle(item){
    return isInternalAd(item)
      ? (item.title || 'Собствена реклама')
      : (item.company || item.name || item.id || 'Кампания');
  }

  function ensureBroadcastPreviewDialog(){
    let dialog = document.getElementById('broadcastPreviewDialog');
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.id = 'broadcastPreviewDialog';
    dialog.className = 'broadcast-preview-backdrop';
    dialog.innerHTML = `
      <section class="broadcast-preview-shell" role="dialog" aria-modal="true" aria-label="Преглед на излъчването">
        <div class="broadcast-preview-topbar">
          <div class="broadcast-preview-heading">
            <span class="section-kicker">ПРЕГЛЕД НА ИЗЛЪЧВАНЕТО</span>
            <strong id="broadcastScreenName">Екран</strong>
            <small id="broadcastCycleInfo"></small>
          </div>

          <div class="broadcast-preview-top-actions">
            <button type="button" class="broadcast-icon-btn" id="broadcastFullscreenBtn">⛶ <span>Цял екран</span></button>
            <button type="button" class="broadcast-close-btn" id="broadcastCloseBtn" aria-label="Затвори">×</button>
          </div>
        </div>

        <div class="broadcast-preview-main">
          <button type="button" class="broadcast-nav-btn prev" id="broadcastPrevBtn" aria-label="Предишна реклама">‹</button>

          <div class="broadcast-screen-wrap">
            <div class="broadcast-screen-stage" id="broadcastStage">
              <div class="broadcast-loading">Зареждане…</div>
            </div>
          </div>

          <button type="button" class="broadcast-nav-btn next" id="broadcastNextBtn" aria-label="Следваща реклама">›</button>
        </div>

        <div class="broadcast-preview-controls">
          <div class="broadcast-current-copy">
            <strong id="broadcastCurrentTitle">—</strong>
            <span id="broadcastCurrentMeta">—</span>
          </div>

          <div class="broadcast-progress-track" aria-hidden="true">
            <span id="broadcastProgressBar"></span>
          </div>

          <div class="broadcast-control-buttons">
            <button type="button" class="broadcast-control-btn" id="broadcastPlayPauseBtn">Ⅱ Пауза</button>
            <button type="button" class="broadcast-control-btn" id="broadcastRestartBtn">↺ Отначало</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(dialog);

    dialog.querySelector('#broadcastCloseBtn').addEventListener('click', closeBroadcastPreview);
    dialog.querySelector('#broadcastPrevBtn').addEventListener('click', () => broadcastPreviewStep(-1));
    dialog.querySelector('#broadcastNextBtn').addEventListener('click', () => broadcastPreviewStep(1));
    dialog.querySelector('#broadcastRestartBtn').addEventListener('click', () => {
      broadcastPreviewIndex = 0;
      broadcastPreviewPaused = false;
      renderBroadcastPreviewItem();
    });
    dialog.querySelector('#broadcastPlayPauseBtn').addEventListener('click', toggleBroadcastPreviewPause);
    dialog.querySelector('#broadcastFullscreenBtn').addEventListener('click', async () => {
      const shell = dialog.querySelector('.broadcast-preview-shell');
      try{
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (shell.requestFullscreen) await shell.requestFullscreen();
      }catch(e){}
    });

    return dialog;
  }

  function updateBroadcastProgress(durationMs){
    const bar = document.getElementById('broadcastProgressBar');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.transition = `width ${Math.max(0, durationMs)}ms linear`;
        bar.style.width = '100%';
      });
    });
  }

  function freezeBroadcastProgress(){
    const bar = document.getElementById('broadcastProgressBar');
    if (!bar) return;
    const computed = getComputedStyle(bar).width;
    const parentWidth = bar.parentElement?.getBoundingClientRect().width || 1;
    const percent = Math.max(0, Math.min(100, (parseFloat(computed) / parentWidth) * 100));
    bar.style.transition = 'none';
    bar.style.width = `${percent}%`;
  }

  async function renderBroadcastPreviewItem(){
    clearBroadcastPreviewTimer();

    const dialog = ensureBroadcastPreviewDialog();
    const stage = dialog.querySelector('#broadcastStage');

    if (!broadcastPreviewItems.length){
      stage.innerHTML = `
        <div class="broadcast-empty">
          <strong>Няма реклами за преглед.</strong>
          <span>Паузираните реклами не участват в preview режима.</span>
        </div>`;
      return;
    }

    if (broadcastPreviewIndex < 0) broadcastPreviewIndex = broadcastPreviewItems.length - 1;
    if (broadcastPreviewIndex >= broadcastPreviewItems.length) broadcastPreviewIndex = 0;

    const item = broadcastPreviewItems[broadcastPreviewIndex];
    const setting = getScreenSetting(item, broadcastPreviewScreenId);
    const durationMs = setting.duration * 1000;
    broadcastPreviewRemainingMs = durationMs;
    broadcastPreviewPaused = false;

    dialog.querySelector('#broadcastCurrentTitle').textContent = broadcastItemTitle(item);
    dialog.querySelector('#broadcastCurrentMeta').textContent =
      `${broadcastPreviewIndex + 1} / ${broadcastPreviewItems.length} · ${setting.duration} сек.${isInternalAd(item) ? ' · собствена реклама' : ` · ${item.id}`}`;
    dialog.querySelector('#broadcastPlayPauseBtn').textContent = 'Ⅱ Пауза';

    const creative = campaignCreative(item);
    stage.innerHTML = '<div class="broadcast-loading">Зареждане…</div>';

    let record = null;
    if (creative?.key) record = await getStoredFile(creative.key);

    // Item may have changed while IndexedDB was loading.
    if (!document.getElementById('broadcastPreviewDialog')?.classList.contains('show')) return;
    if (broadcastPreviewItems[broadcastPreviewIndex]?.id !== item.id) return;

    if (!record?.blob){
      stage.innerHTML = `
        <div class="broadcast-empty">
          <span class="broadcast-empty-mark">KS</span>
          <strong>${esc(broadcastItemTitle(item))}</strong>
          <span>Файлът не е наличен в този demo браузър.</span>
        </div>`;
    }else{
      const url = URL.createObjectURL(record.blob);
      broadcastPreviewUrls.push(url);
      const type = String(record.type || creative?.type || '');

      if (type.startsWith('video/')){
        stage.innerHTML = `<video src="${url}" muted playsinline autoplay loop preload="auto"></video>`;
        const video = stage.querySelector('video');
        video?.play().catch(() => {});
      }else{
        stage.innerHTML = `<img src="${url}" alt="Рекламна визия">`;
      }
    }

    broadcastPreviewStartedAt = Date.now();
    updateBroadcastProgress(durationMs);
    broadcastPreviewTimer = setTimeout(() => broadcastPreviewStep(1), durationMs);
  }

  function broadcastPreviewStep(direction){
    if (!broadcastPreviewItems.length) return;
    broadcastPreviewIndex += direction;
    if (broadcastPreviewIndex < 0) broadcastPreviewIndex = broadcastPreviewItems.length - 1;
    if (broadcastPreviewIndex >= broadcastPreviewItems.length) broadcastPreviewIndex = 0;
    renderBroadcastPreviewItem();
  }

  function toggleBroadcastPreviewPause(){
    if (!broadcastPreviewItems.length) return;

    const dialog = document.getElementById('broadcastPreviewDialog');
    const btn = dialog?.querySelector('#broadcastPlayPauseBtn');
    const video = dialog?.querySelector('#broadcastStage video');

    if (!broadcastPreviewPaused){
      broadcastPreviewPaused = true;
      const elapsed = Date.now() - broadcastPreviewStartedAt;
      broadcastPreviewRemainingMs = Math.max(0, broadcastPreviewRemainingMs - elapsed);
      clearBroadcastPreviewTimer();
      freezeBroadcastProgress();
      video?.pause();
      if (btn) btn.textContent = '▶ Продължи';
      return;
    }

    broadcastPreviewPaused = false;
    broadcastPreviewStartedAt = Date.now();
    if (btn) btn.textContent = 'Ⅱ Пауза';
    video?.play().catch(() => {});

    const bar = dialog?.querySelector('#broadcastProgressBar');
    if (bar){
      requestAnimationFrame(() => {
        bar.style.transition = `width ${Math.max(0, broadcastPreviewRemainingMs)}ms linear`;
        bar.style.width = '100%';
      });
    }
    broadcastPreviewTimer = setTimeout(() => broadcastPreviewStep(1), broadcastPreviewRemainingMs);
  }

  function closeBroadcastPreview(){
    const dialog = document.getElementById('broadcastPreviewDialog');
    if (!dialog || !dialog.classList.contains('show')) return;

    clearBroadcastPreviewTimer();
    clearBroadcastPreviewUrls();
    broadcastPreviewItems = [];
    broadcastPreviewIndex = 0;
    broadcastPreviewPaused = false;
    broadcastPreviewScreenId = null;

    dialog.classList.remove('show');

    // Playlist remains open underneath, so keep its exact refresh state.
    if (activePlaylistScreenId) saveAdminOverlay('screen-playlist', activePlaylistScreenId);
    else clearAdminOverlay('broadcast-preview');

    updateAdminBackButton();
  }

  function openBroadcastPreview(screenId, restoring=false){
    const screen = screenById(screenId);
    if (!screen) return;

    const items = allPlaylistItems(screenId)
      .filter(item => !getScreenSetting(item, screenId).paused);

    if (!items.length){
      toast('Няма непаузирани реклами за преглед.');
      return;
    }

    broadcastPreviewScreenId = screenId;
    broadcastPreviewItems = items;
    broadcastPreviewIndex = 0;
    broadcastPreviewPaused = false;

    const dialog = ensureBroadcastPreviewDialog();
    dialog.querySelector('#broadcastScreenName').textContent = screen.name;
    dialog.querySelector('#broadcastCycleInfo').textContent =
      `${items.length} ${items.length === 1 ? 'реклама' : 'реклами'} · общ цикъл ${items.reduce((sum,item) => sum + getScreenSetting(item, screenId).duration, 0)} сек.`;

    saveAdminOverlay('broadcast-preview', screenId);
    dialog.classList.add('show');
    updateAdminBackButton();
    renderBroadcastPreviewItem();
  }

  function updateScreenSetting(requestId, screenId, patch){
    const item=findPlaylistItem(requestId); if(!item)return;
    if(!item.screenSettings)item.screenSettings={};
    item.screenSettings[screenId]={...getScreenSetting(item,screenId),...patch};
    savePlaylistItem(item);
    renderAll(); renderScreenPlaylist(screenId);
  }

  function movePlaylistItem(requestId, screenId, direction){
    const items=allPlaylistItems(screenId);
    const index=items.findIndex(x=>x.id===requestId); if(index<0)return;
    const swapIndex=direction==='up'?index-1:index+1; if(swapIndex<0||swapIndex>=items.length)return;
    const a=items[index], b=items[swapIndex];
    const ao=getScreenSetting(a,screenId).order, bo=getScreenSetting(b,screenId).order;
    if(!a.screenSettings)a.screenSettings={}; if(!b.screenSettings)b.screenSettings={};
    a.screenSettings[screenId]={...getScreenSetting(a,screenId),order:bo};
    b.screenSettings[screenId]={...getScreenSetting(b,screenId),order:ao};
    savePlaylistItem(a); savePlaylistItem(b); renderAll(); renderScreenPlaylist(screenId);
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

  const AD_FILE_MAX_BYTES = 25 * 1024 * 1024;
  const AD_FILE_TYPES = new Set(['image/jpeg','image/png','video/mp4']);

  function adRatioLabel(width, height){
    if (!width || !height) return '—';
    const r = width / height;
    const near = (a,b,t=.035) => Math.abs(a-b) / b <= t;
    if (near(r,16/9)) return '16:9';
    if (near(r,9/16)) return '9:16';
    if (near(r,4/3)) return '4:3';
    if (near(r,1)) return '1:1';
    return `${(r >= 1 ? r : 1/r).toFixed(2)}:${r >= 1 ? '1' : (1/r).toFixed(2)}`;
  }

  function adStandardRatio(width, height){
    if (!width || !height) return false;
    const r = width / height;
    const near = (a,b,t=.035) => Math.abs(a-b) / b <= t;
    return near(r,16/9) || near(r,9/16);
  }

  function adImageMeta(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const meta = {width:img.naturalWidth,height:img.naturalHeight,duration:null};
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image-meta')); };
      img.src = url;
    });
  }

  function adVideoMeta(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload='metadata';
      video.muted=true;
      video.playsInline=true;
      video.onloadedmetadata = () => {
        const meta = {
          width:video.videoWidth,
          height:video.videoHeight,
          duration:Number.isFinite(video.duration) ? video.duration : null
        };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video-meta')); };
      video.src=url;
    });
  }

  async function inspectAdFile(file){
    const result={file,valid:true,errors:[],warnings:[],details:[],width:null,height:null,duration:null};

    if(!file){
      result.valid=false;
      result.errors.push('Няма избран файл.');
      return result;
    }
    if(!AD_FILE_TYPES.has(file.type)){
      result.valid=false;
      result.errors.push('Разрешени са само JPG, PNG и MP4.');
      return result;
    }
    if(file.size>AD_FILE_MAX_BYTES){
      result.valid=false;
      result.errors.push('Файлът е по-голям от 25 MB.');
    }

    let meta;
    try{
      meta=file.type==='video/mp4' ? await adVideoMeta(file) : await adImageMeta(file);
    }catch(e){
      result.valid=false;
      result.errors.push('Файлът не може да бъде прочетен коректно.');
      return result;
    }

    result.width=meta.width;
    result.height=meta.height;
    result.duration=meta.duration;

    const ratio=adRatioLabel(meta.width,meta.height);
    result.details.push(file.type==='video/mp4'?'MP4':(file.type==='image/png'?'PNG':'JPG'));
    result.details.push(`${meta.width}×${meta.height}`);
    result.details.push(ratio);
    result.details.push(formatBytes(file.size));

    const landscape=meta.width>=meta.height;
    const fullHD=landscape
      ? meta.width>=1920 && meta.height>=1080
      : meta.width>=1080 && meta.height>=1920;
    const HD=landscape
      ? meta.width>=1280 && meta.height>=720
      : meta.width>=720 && meta.height>=1280;

    if(!adStandardRatio(meta.width,meta.height)){
      result.warnings.push(`Съотношението е ${ratio}. За телевизионен екран е най-добре 16:9 или 9:16.`);
    }
    if(!HD){
      result.warnings.push(`Резолюцията ${meta.width}×${meta.height} е ниска и може да изглежда неясно на телевизор.`);
    }else if(!fullHD){
      result.warnings.push('Файлът е използваем, но Full HD (1920×1080 или 1080×1920) е по-добрият вариант.');
    }
    if(file.type==='video/mp4' && meta.duration!=null){
      result.details.push(`${meta.duration.toFixed(1)} сек.`);
      if(meta.duration<8 || meta.duration>10){
        result.warnings.push(`Видеото е ${meta.duration.toFixed(1)} сек. Препоръчителната дължина е 8–10 сек.`);
      }
    }

    return result;
  }

  function renderAdFileCheck(box,result){
    if(!box)return;
    box.hidden=false;
    const state=!result.valid?'error':(result.warnings.length?'warning':'ok');
    const title=state==='ok'?'✓ Подходящо за излъчване':state==='warning'?'⚠ Нужна е проверка':'✕ Файлът не е подходящ';
    box.className=`admin-ad-file-check ${state}`;
    box.innerHTML=`
      <div class="admin-ad-file-check-head">
        <strong>${title}</strong>
        ${result.details?.length?`<span>${result.details.map(esc).join(' · ')}</span>`:''}
      </div>
      ${result.errors?.length?`<div class="admin-ad-file-check-list">${result.errors.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
      ${result.warnings?.length?`<div class="admin-ad-file-check-list">${result.warnings.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
    `;
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
        <h4>Предпочитани локации от клиента</h4>
        <div class="note-box">${esc(r.locations || 'Клиентът не е посочил предпочитани локации.')}</div>
      </div>
      <div class="drawer-section">
        <h4>Реално разпределение по екрани</h4>
        ${(r.assignedScreens || []).length ? `
          <div class="assigned-screen-chips">
            ${assignedScreenNames(r).map(name => `<span>${esc(name)}</span>`).join('')}
          </div>
        ` : `<div class="screen-assignment-empty">Все още не са избрани екрани за тази кампания.</div>`}
        <div class="screen-rule-note">${esc(screenLimitText(r))}</div>
        ${!['done','rejected'].includes(r.status) ? `
          <button class="btn btn-light screen-assign-button" data-assign-screens="${esc(r.id)}">
            ${(r.assignedScreens || []).length ? 'Промени екраните' : 'Избери екрани'}
          </button>` : ''}
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
    if (r.status === 'paid') {
      if (!screenSelectionValidForActivation(r)) return `
        <button class="btn btn-primary" data-assign-screens="${esc(r.id)}">Избери екрани</button>
        <button class="btn btn-light" disabled>Избери екрани преди активиране</button>`;
      return `<button class="btn btn-primary" data-action="activate">Активирай рекламата</button>`;
    }
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

  function openScreenAssignmentDialog(id, restoring=false){
    saveAdminOverlay('screen-assignment', id);
    const r = loadRequests().find(x => x.id === id);
    if (!r) return;

    let dialog = document.getElementById('screenAssignmentDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'screenAssignmentDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog screen-assignment-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">РАЗПРЕДЕЛЕНИЕ</span>
              <h3>На кои екрани ще се излъчва?</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>
          <p class="change-dialog-help" id="screenAssignmentRule"></p>
          <div id="screenAssignmentOptions" class="screen-assignment-options"></div>
          <div class="change-dialog-error" id="screenAssignmentError" hidden></div>
          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-screen-cancel>Отказ</button>
            <button type="button" class="btn btn-primary" data-screen-save>Запази екраните</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      const close = () => {
        dialog.classList.remove('show');
        dialog.dataset.requestId = '';
        clearAdminOverlay('screen-assignment');
      };

      dialog.querySelector('.change-dialog-close').addEventListener('click', close);
      dialog.querySelector('[data-screen-cancel]').addEventListener('click', close);
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

      dialog.querySelector('[data-screen-save]').addEventListener('click', () => {
        const requestId = dialog.dataset.requestId;
        const requests = loadRequests();
        const req = requests.find(x => x.id === requestId);
        if (!req) return;

        const selected = [...dialog.querySelectorAll('input[name="assignedScreen"]:checked')].map(i => i.value);
        const error = dialog.querySelector('#screenAssignmentError');

        if (!selected.length){
          error.textContent = 'Избери поне един екран.';
          error.hidden = false;
          return;
        }
        if (req.package === 'single' && selected.length !== 1){
          error.textContent = 'Пакет SINGLE може да бъде разпределен само на 1 екран.';
          error.hidden = false;
          return;
        }
        if (req.package === 'local' && selected.length > 3){
          error.textContent = 'Пакет LOCAL може да бъде разпределен на максимум 3 екрана.';
          error.hidden = false;
          return;
        }

        const activeNetworkCount = SCREEN_CATALOG.filter(isScreenPublished).length;
        if (req.package === 'city' && activeNetworkCount >= 4 && (selected.length < 4 || selected.length > 5)){
          error.textContent = 'Пакет CITY трябва да бъде на 4 или 5 активни екрана.';
          error.hidden = false;
          return;
        }

        req.assignedScreens = selected;
        req.screensAssignedAt = new Date().toISOString();

        if (!Array.isArray(req.screenAssignmentHistory)) req.screenAssignmentHistory = [];
        req.screenAssignmentHistory.push({screens:[...selected], createdAt:req.screensAssignedAt});

        saveRequests(requests);
        close();
        openRequest(requestId, false);
        toast(`Запазени ${selected.length} ${selected.length === 1 ? 'екран' : 'екрана'}.`);
      });
    }

    dialog.dataset.requestId = id;
    dialog.querySelector('#screenAssignmentRule').textContent = screenLimitText(r);
    dialog.querySelector('#screenAssignmentError').hidden = true;

    const selected = new Set(r.assignedScreens || []);
    const inputType = r.package === 'single' ? 'radio' : 'checkbox';
    const options = dialog.querySelector('#screenAssignmentOptions');

    options.innerHTML = selectableScreens(r.assignedScreens||[]).map(screen => `
      <label class="screen-option ${!isScreenPublished(screen)?'is-screen-off':''}">
        <input type="${inputType}" name="assignedScreen" value="${esc(screen.id)}" ${selected.has(screen.id) ? 'checked' : ''} ${!isScreenPublished(screen)?'disabled':''}>
        <span class="screen-option-check">✓</span>
        <span class="screen-option-copy">
          <strong>${esc(screen.name)}${!isScreenPublished(screen)?` · ${screenStatusLabel(screen)}`:''}</strong>
          <small>${esc(screen.description || 'Без описание')}</small>
        </span>
      </label>`).join('');

    if (r.package === 'local'){
      options.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', () => {
          const checked = [...options.querySelectorAll('input:checked')];
          if (checked.length > 3){
            input.checked = false;
            dialog.querySelector('#screenAssignmentError').textContent = 'LOCAL допуска максимум 3 екрана.';
            dialog.querySelector('#screenAssignmentError').hidden = false;
          }else{
            dialog.querySelector('#screenAssignmentError').hidden = true;
          }
        });
      });
    }

    if (r.package === 'city'){
      options.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', () => {
          const checked = [...options.querySelectorAll('input:checked')];
          if (checked.length > 5){
            input.checked = false;
            dialog.querySelector('#screenAssignmentError').textContent = 'CITY допуска максимум 5 екрана.';
            dialog.querySelector('#screenAssignmentError').hidden = false;
          }else{
            dialog.querySelector('#screenAssignmentError').hidden = true;
          }
        });
      });
    }

    dialog.classList.add('show');
  }

  function openCreativeUploadDialog(id, restoring=false){
    saveAdminOverlay('creative-upload', id);
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
          <div id="creativeUploadFileCheck" class="admin-ad-file-check" hidden></div>
          <div class="change-dialog-error" id="creativeUploadError" hidden></div>

          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-creative-cancel>Отказ</button>
            <button type="button" class="btn btn-primary" data-creative-send>Изпрати за одобрение</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      const close = () => {
        dialog.classList.remove('show');
        clearAdminOverlay('creative-upload');
        dialog.dataset.requestId = '';
        dialog.querySelector('#creativeUploadFile').value = '';
        dialog.querySelector('#selectedCreativeFile').textContent = 'Няма избран файл';
        dialog.querySelector('#creativeUploadError').hidden = true;
        dialog._creativeValidation = null;
        const check = dialog.querySelector('#creativeUploadFileCheck');
        check.hidden = true;
        check.innerHTML = '';
      };

      dialog.querySelector('.change-dialog-close').addEventListener('click', close);
      dialog.querySelector('[data-creative-cancel]').addEventListener('click', close);
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

      dialog.querySelector('#creativeUploadFile').addEventListener('change', async e => {
        const file = e.target.files?.[0];
        const check = dialog.querySelector('#creativeUploadFileCheck');
        dialog.querySelector('#selectedCreativeFile').textContent =
          file ? `${file.name} · ${formatBytes(file.size)}` : 'Няма избран файл';
        dialog.querySelector('#creativeUploadError').hidden = true;
        dialog._creativeValidation = null;

        if(!file){
          check.hidden=true;
          check.innerHTML='';
          return;
        }

        check.hidden=false;
        check.className='admin-ad-file-check checking';
        check.innerHTML='<strong>Проверяваме файла…</strong>';
        const result=await inspectAdFile(file);
        if(dialog.querySelector('#creativeUploadFile').files?.[0]!==file)return;
        dialog._creativeValidation=result;
        renderAdFileCheck(check,result);
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
        if (!dialog._creativeValidation){
          error.textContent = 'Изчакай проверката на файла.';
          error.hidden = false;
          return;
        }
        if (!dialog._creativeValidation.valid){
          error.textContent = 'Файлът има технически проблем. Провери съобщението под него.';
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
            width:dialog._creativeValidation?.width || null,
            height:dialog._creativeValidation?.height || null,
            duration:dialog._creativeValidation?.duration || null,
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
    dialog._creativeValidation = null;
    dialog.querySelector('#creativeUploadFile').value = '';
    dialog.querySelector('#selectedCreativeFile').textContent = 'Няма избран файл';
    dialog.querySelector('#creativeUploadFileCheck').hidden = true;
    dialog.querySelector('#creativeUploadFileCheck').innerHTML = '';
    dialog.querySelector('#creativeUploadError').hidden = true;
    dialog.classList.add('show');
  }

  function openChangeRequestDialog(id, restoring=false){
    saveAdminOverlay('change-request', id);
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
        clearAdminOverlay('change-request');
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

    const assignScreens = e.target.closest('[data-assign-screens]');
    if (assignScreens) openScreenAssignmentDialog(assignScreens.dataset.assignScreens);

    const openPlaylist = e.target.closest('[data-open-playlist]');
    if (openPlaylist) renderScreenPlaylist(openPlaylist.dataset.openPlaylist);

    const editScreen = e.target.closest('[data-edit-screen]');
    if (editScreen) openScreenDialog(editScreen.dataset.editScreen);

    const statusScreenBtn = e.target.closest('[data-set-screen-status]');
    if (statusScreenBtn) setScreenStatus(statusScreenBtn.dataset.screenId, statusScreenBtn.dataset.setScreenStatus);

    const deleteScreenBtn = e.target.closest('[data-delete-screen]');
    if (deleteScreenBtn) openDeleteScreenDialog(deleteScreenBtn.dataset.deleteScreen);

    const editInternal = e.target.closest('[data-edit-internal-ad]');
    if (editInternal) openInternalAdDialog(editInternal.dataset.editInternalAd);

    const toggleInternal = e.target.closest('[data-toggle-internal-ad]');
    if (toggleInternal) toggleInternalAd(toggleInternal.dataset.toggleInternalAd);

    const deleteInternal = e.target.closest('[data-delete-internal-ad]');
    if (deleteInternal) deleteInternalAd(deleteInternal.dataset.deleteInternalAd);

    const movePlaylist = e.target.closest('[data-playlist-move]');
    if (movePlaylist && activePlaylistScreenId) {
      movePlaylistItem(movePlaylist.dataset.requestId, activePlaylistScreenId, movePlaylist.dataset.playlistMove);
    }

    const pausePlaylist = e.target.closest('[data-playlist-pause]');
    if (pausePlaylist && activePlaylistScreenId) {
      const r = findPlaylistItem(pausePlaylist.dataset.playlistPause);
      if (r) {
        const setting = getScreenSetting(r, activePlaylistScreenId);
        updateScreenSetting(r.id, activePlaylistScreenId, {paused:!setting.paused});
        toast(setting.paused ? 'Рекламата е пусната отново на този екран.' : 'Рекламата е спряна само на този екран.');
      }
    }

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
          const beforeActivate = loadRequests().find(x => x.id === activeRequestId);
          if (!beforeActivate || !screenSelectionValidForActivation(beforeActivate)){
            toast('Първо избери екраните за кампанията.');
            openScreenAssignmentDialog(activeRequestId);
            break;
          }
          updateStatus(activeRequestId,'active');
          const activated = loadRequests().find(x => x.id === activeRequestId);
          toast(`Активна до ${formatDateOnly(activated?.expiresAt)} на ${activated?.assignedScreens?.length || 0} екрана.`);
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

  document.addEventListener('change', e => {
    const duration = e.target.closest('[data-playlist-duration]');
    if (duration && activePlaylistScreenId){
      const seconds = Number(duration.value);
      if ([8,9,10].includes(seconds)){
        updateScreenSetting(duration.dataset.playlistDuration, activePlaylistScreenId, {duration:seconds});
        toast(`Времетраене: ${seconds} сек.`);
      }
    }
  });

  document.getElementById('addScreenBtn')?.addEventListener('click', () => openScreenDialog());
  document.getElementById('addInternalAdBtn')?.addEventListener('click', () => openInternalAdDialog());
  document.getElementById('closeDrawer').addEventListener('click', closeRequest);
  backdrop.addEventListener('click', closeRequest);
  document.getElementById('requestSearch').addEventListener('input', (e) => {
    sessionStorage.setItem(ADMIN_SEARCH_KEY, e.target.value || '');
    renderRequests();
  });
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
    renderInternalAds();
    renderScreens();
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
    if (e.key === STORAGE_KEY || e.key === INTERNAL_ADS_KEY) renderAll();
  });
})();
