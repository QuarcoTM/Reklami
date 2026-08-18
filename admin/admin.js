
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
    scheduled: 'Планирана',
    active: 'Активна',
    done: 'Приключена',
    rejected: 'Отказана'
  };

  const statusClasses = {
    new: 'status-new',
    changes: 'status-changes',
    waiting: 'status-waiting',
    paid: 'status-paid',
    scheduled: 'status-scheduled',
    active: 'status-active',
    done: 'status-done',
    rejected: 'status-rejected'
  };

  const packageLabels = {
    single: 'SINGLE',
    local: 'LOCAL',
    city: 'CITY'
  };

  const FIXED_SLOT_SECONDS = 10;
  const TOTAL_SCREEN_SLOT_LIMIT = 10;

  const WEEK_DAYS = [
    {key:'mon', label:'Понеделник', short:'Пн'},
    {key:'tue', label:'Вторник', short:'Вт'},
    {key:'wed', label:'Сряда', short:'Ср'},
    {key:'thu', label:'Четвъртък', short:'Чт'},
    {key:'fri', label:'Петък', short:'Пт'},
    {key:'sat', label:'Събота', short:'Сб'},
    {key:'sun', label:'Неделя', short:'Нд'}
  ];

  const JS_DAY_TO_KEY = ['sun','mon','tue','wed','thu','fri','sat'];

  function validTimeValue(value){
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
  }

  function emptyWorkSchedule(){
    return Object.fromEntries(
      WEEK_DAYS.map(day => [day.key,{enabled:false,start:'',end:''}])
    );
  }

  function normalizeWorkSchedule(schedule, legacyStart='', legacyEnd=''){
    const result = emptyWorkSchedule();
    const hasStructuredSchedule = schedule && typeof schedule === 'object';

    WEEK_DAYS.forEach(day => {
      const raw = hasStructuredSchedule ? schedule[day.key] : null;
      if (raw && typeof raw === 'object'){
        result[day.key] = {
          enabled:Boolean(raw.enabled),
          start:validTimeValue(raw.start) ? String(raw.start) : '',
          end:validTimeValue(raw.end) ? String(raw.end) : ''
        };
      }else if (validTimeValue(legacyStart) && validTimeValue(legacyEnd)){
        // v3.1–v3.4 migration: the old single daily interval becomes the
        // same schedule for every day, so no existing estimate is lost.
        result[day.key] = {
          enabled:true,
          start:String(legacyStart),
          end:String(legacyEnd)
        };
      }
    });

    return result;
  }

  const DEFAULT_SCREEN_CATALOG = [
    {id:'funeral', name:'Траурна агенция', description:'Пилотен екран · адресът ще се добави по-късно.', active:true, yodeckPlayerId:'', displayMode:'always'},
    {id:'pharmacy', name:'Аптека', description:'Планирана локация.', active:true, yodeckPlayerId:''},
    {id:'restaurant', name:'Заведение', description:'Планирана локация.', active:true, yodeckPlayerId:''}
  ];

  function normalizeScreen(screen){
    let status = String(screen?.status || '').trim();
    if (!['hidden','published','stopped'].includes(status)){
      status = screen?.active === false ? 'stopped' : 'published';
    }

    const id = String(screen?.id || '').trim();
    const legacyStart = validTimeValue(screen?.workStart) ? String(screen.workStart) : '';
    const legacyEnd = validTimeValue(screen?.workEnd) ? String(screen.workEnd) : '';
    const storedDisplayMode = String(screen?.displayMode || '').trim();
    const displayMode = ['always','schedule'].includes(storedDisplayMode)
      ? storedDisplayMode
      : (id === 'funeral' ? 'always' : 'schedule');
    const workSchedule = normalizeWorkSchedule(screen?.workSchedule, legacyStart, legacyEnd);

    return {
      id,
      name:String(screen?.name || 'Екран').trim(),
      address:String(screen?.address || '').trim(),
      description:String(screen?.description || '').trim(),
      displayMode,
      workSchedule,
      workStart:legacyStart,
      workEnd:legacyEnd,
      wifiAvailable:typeof screen?.wifiAvailable === 'boolean' ? screen.wifiAvailable : null,
      readiness:{
        mounted:Boolean(screen?.readiness?.mounted),
        internetTested:Boolean(screen?.readiness?.internetTested),
        onsiteTest:Boolean(screen?.readiness?.onsiteTest)
      },
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
    const defaults = DEFAULT_SCREEN_CATALOG.map(s => normalizeScreen({...s}));
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

  function timeToMinutes(value){
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  function workingHoursDuration(start, end){
    const from = timeToMinutes(start);
    const to = timeToMinutes(end);
    if (from === null || to === null) return null;
    let minutes = to - from;
    if (minutes <= 0) minutes += 24 * 60;
    return minutes / 60;
  }

  function scheduleDayHours(day){
    if (!day?.enabled) return 0;
    const hours = workingHoursDuration(day.start, day.end);
    return hours === null ? 0 : hours;
  }

  function screenTodaySchedule(screen){
    if (!screen) return null;
    if (screen.displayMode === 'always'){
      return {key:JS_DAY_TO_KEY[new Date().getDay()], enabled:true, start:'00:00', end:'00:00', hours:24};
    }

    const key = JS_DAY_TO_KEY[new Date().getDay()];
    const day = screen.workSchedule?.[key] || null;
    return day ? {...day,key,hours:scheduleDayHours(day)} : {key,enabled:false,start:'',end:'',hours:0};
  }

  function screenWeeklyHours(screen){
    if (!screen) return null;
    if (screen.displayMode === 'always') return 24 * 7;

    const schedule = screen.workSchedule || {};
    return WEEK_DAYS.reduce((sum,day) => sum + scheduleDayHours(schedule[day.key]), 0);
  }

  function workingTimeLabel(screen){
    if (!screen) return 'Не е зададено';
    if (screen.displayMode === 'always') return '24/7';
    return 'По график';
  }

  function todayWorkingTimeLabel(screen){
    if (!screen) return 'Не е зададено';
    if (screen.displayMode === 'always') return 'Днес: 24/7';

    const today = screenTodaySchedule(screen);
    if (!today?.enabled) return 'Днес: почивен ден';
    return `Днес: ${today.start}–${today.end}`;
  }

  function screenScheduleSummary(screen){
    if (!screen) return 'Не е зададено';
    if (screen.displayMode === 'always') return '24/7 · 168 ч./седмица';

    const weekly = screenWeeklyHours(screen);
    const openDays = WEEK_DAYS.filter(day => screen.workSchedule?.[day.key]?.enabled).length;
    if (!openDays) return 'По график · няма активни дни';
    return `По график · ${openDays} ${openDays === 1 ? 'ден' : 'дни'} · ${Number(weekly.toFixed(1))} ч./седмица`;
  }

  function screenRotationStats(screenId){
    const screen = screenById(screenId);
    const items = allPlaylistItems(screenId)
      .filter(item => !getScreenSetting(item, screenId).paused);

    const cycleSeconds = items.reduce(
      (sum,item) => sum + Number(getScreenSetting(item, screenId).duration || 0),
      0
    );

    const today = screenTodaySchedule(screen);
    const hoursToday = today?.hours ?? null;
    const hoursPerWeek = screenWeeklyHours(screen);

    if (!items.length || cycleSeconds <= 0){
      return {
        items,
        cycleSeconds:0,
        rotationsPerHour:0,
        rotationsPerDay:null,
        rotationsPerWeek:null,
        hoursToday,
        hoursPerWeek
      };
    }

    const rotationsPerHour = 3600 / cycleSeconds;
    const rotationsPerDay = hoursToday !== null ? rotationsPerHour * hoursToday : null;
    const rotationsPerWeek = hoursPerWeek !== null ? rotationsPerHour * hoursPerWeek : null;

    return {
      items,
      cycleSeconds,
      rotationsPerHour,
      rotationsPerDay,
      rotationsPerWeek,
      hoursToday,
      hoursPerWeek
    };
  }

  function screenReadiness(screenId){
    const screen = screenById(screenId);
    if (!screen) return {done:0,total:6,items:[]};

    const playlistReady = allPlaylistItems(screenId)
      .some(item => !getScreenSetting(item, screenId).paused);

    const items = [
      {
        key:'mounted',
        label:'Екранът е монтиран',
        help:'Телевизорът / дисплеят е физически поставен на локацията.',
        manual:true,
        done:Boolean(screen.readiness?.mounted)
      },
      {
        key:'internetTested',
        label:'Интернетът е осигурен и тестван',
        help:screen.wifiAvailable === false
          ? 'Локацията е отбелязана без Wi‑Fi — потвърди, че алтернативната интернет връзка е готова.'
          : 'Потвърди, че връзката на място е реално тествана.',
        manual:true,
        done:Boolean(screen.readiness?.internetTested)
      },
      {
        key:'yodeck',
        label:'Yodeck Player ID е добавен',
        help:'Отбелязва се автоматично от данните на екрана.',
        manual:false,
        done:Boolean(screen.yodeckPlayerId)
      },
      {
        key:'photo',
        label:'Снимка на локацията е качена',
        help:'Отбелязва се автоматично, когато има запазена снимка.',
        manual:false,
        done:Boolean(screen.photo?.key)
      },
      {
        key:'playlist',
        label:'Playlist има активна реклама',
        help:'Отбелязва се автоматично при поне една непаузирана реклама.',
        manual:false,
        done:playlistReady
      },
      {
        key:'onsiteTest',
        label:'Направен е реален тест на място',
        help:'Провери изображението, яркостта, връзката и реалното въртене на playlist-а.',
        manual:true,
        done:Boolean(screen.readiness?.onsiteTest)
      }
    ];

    return {
      done:items.filter(item => item.done).length,
      total:items.length,
      items
    };
  }

  function readinessClass(readiness){
    if (readiness.done === readiness.total) return 'is-ready';
    if (readiness.done >= 4) return 'is-almost-ready';
    return 'is-preparing';
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

  function finiteMs(value){
    if (value === Infinity || value === -Infinity) return value;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function requestReservationInterval(r, nowMs=Date.now()){
    if (!r) return null;
    const status = String(r.status || '');
    if (['done','rejected'].includes(status)) return null;

    if (status === 'scheduled') {
      const start = finiteMs(r.scheduledStartAt || r.activeAt);
      let end = finiteMs(r.scheduledEndAt || r.expiresAt);
      if (start === null) return null;
      if (end === null) end = addCalendarMonth(new Date(start)).getTime();
      if (end <= nowMs && nowMs >= start) return null;
      return {start,end,kind:'scheduled'};
    }

    if (status === 'active') {
      const start = finiteMs(r.activeAt) ?? nowMs;
      let end = finiteMs(r.expiresAt);
      if (end === null) end = addCalendarMonth(new Date(start)).getTime();
      if (end <= nowMs) return null;
      return {start,end,kind:'active'};
    }

    // Before a campaign has an actual start period, selected screens are
    // only a working choice. A sellable slot is reserved only by an active
    // or scheduled campaign, so future capacity can be calculated exactly.
    return null;
  }

  function houseReservationInterval(ad){
    if (!ad || ad.active === false) return null;
    return {start:-Infinity,end:Infinity,kind:'house'};
  }

  function intervalContains(interval, ms){
    return Boolean(interval) && interval.start <= ms && ms < interval.end;
  }

  function intervalOverlaps(aStart,aEnd,bStart,bEnd){
    return aStart < bEnd && bStart < aEnd;
  }

  function screenReservations(screenId, {excludeRequestId=null, excludeAdId=null} = {}){
    const nowMs = Date.now();
    const clients = loadRequests()
      .filter(r => r.id !== excludeRequestId && (r.assignedScreens || []).includes(screenId))
      .map(r => ({type:'client', item:r, interval:requestReservationInterval(r, nowMs)}))
      .filter(x => x.interval);
    const house = loadInternalAds()
      .filter(ad => ad.id !== excludeAdId && (ad.assignedScreens || []).includes(screenId))
      .map(ad => ({type:'house', item:ad, interval:houseReservationInterval(ad)}))
      .filter(x => x.interval);
    return [...clients, ...house];
  }

  function screenCapacityAt(screenId, when=Date.now(), opts={}){
    const ms = finiteMs(when);
    const reservations = screenReservations(screenId, opts);
    const active = reservations.filter(x => intervalContains(x.interval, ms));
    const clients = active.filter(x => x.type === 'client').length;
    const house = active.filter(x => x.type === 'house').length;
    const occupied = clients + house;
    return {
      clients, house, occupied,
      limit:TOTAL_SCREEN_SLOT_LIMIT,
      remaining:Math.max(0, TOTAL_SCREEN_SLOT_LIMIT - occupied),
      full:occupied >= TOTAL_SCREEN_SLOT_LIMIT,
      almostFull:occupied === TOTAL_SCREEN_SLOT_LIMIT - 1
    };
  }

  function screenTotalCapacity(screenId, opts={}){
    return screenCapacityAt(screenId, Date.now(), opts);
  }

  function screenPeriodCapacity(screenId, startValue, endValue, opts={}){
    const start = finiteMs(startValue);
    const end = finiteMs(endValue);
    if (start === null || end === null || start >= end) {
      return {valid:false, peak:0, remaining:0, full:false, conflict:false, conflictStart:null, conflictEnd:null};
    }

    const reservations = screenReservations(screenId, opts)
      .filter(x => intervalOverlaps(start,end,x.interval.start,x.interval.end));

    const boundaries = new Set([start]);
    reservations.forEach(x => {
      if (Number.isFinite(x.interval.start) && x.interval.start > start && x.interval.start < end) boundaries.add(x.interval.start);
      if (Number.isFinite(x.interval.end) && x.interval.end > start && x.interval.end < end) boundaries.add(x.interval.end);
    });
    const points = [...boundaries].sort((a,b) => a-b);

    let peak = 0;
    let conflictStart = null;
    let conflictEnd = null;
    for (let i=0;i<points.length;i++){
      const point = points[i];
      const occupied = reservations.filter(x => intervalContains(x.interval, point)).length;
      peak = Math.max(peak, occupied);
      if (occupied >= TOTAL_SCREEN_SLOT_LIMIT && conflictStart === null){
        conflictStart = point;
        let j=i+1;
        while(j<points.length){
          const nextPoint=points[j];
          const nextOccupied=reservations.filter(x=>intervalContains(x.interval,nextPoint)).length;
          if(nextOccupied<TOTAL_SCREEN_SLOT_LIMIT){ conflictEnd=nextPoint; break; }
          j++;
        }
        if(conflictEnd===null) conflictEnd=end;
      }
    }

    return {
      valid:true,
      peak,
      remaining:Math.max(0, TOTAL_SCREEN_SLOT_LIMIT - peak),
      full:peak >= TOTAL_SCREEN_SLOT_LIMIT,
      conflict:peak >= TOTAL_SCREEN_SLOT_LIMIT,
      conflictStart,
      conflictEnd
    };
  }

  function screenIndefiniteCapacity(screenId, opts={}){
    const start = Date.now();
    const reservations = screenReservations(screenId, opts);
    const boundaries = new Set([start]);
    reservations.forEach(x => {
      if (Number.isFinite(x.interval.start) && x.interval.start > start) boundaries.add(x.interval.start);
      if (Number.isFinite(x.interval.end) && x.interval.end > start) boundaries.add(x.interval.end);
    });
    const points = [...boundaries].sort((a,b)=>a-b);
    let peak=0, conflictStart=null, conflictEnd=null;
    for(let i=0;i<points.length;i++){
      const point=points[i];
      const occupied=reservations.filter(x=>intervalContains(x.interval,point)).length;
      peak=Math.max(peak,occupied);
      if(occupied>=TOTAL_SCREEN_SLOT_LIMIT && conflictStart===null){
        conflictStart=point;
        let j=i+1;
        while(j<points.length){
          const nextPoint=points[j];
          const nextOccupied=reservations.filter(x=>intervalContains(x.interval,nextPoint)).length;
          if(nextOccupied<TOTAL_SCREEN_SLOT_LIMIT){ conflictEnd=nextPoint; break; }
          j++;
        }
      }
    }
    return {
      valid:true,peak,remaining:Math.max(0,TOTAL_SCREEN_SLOT_LIMIT-peak),
      full:peak>=TOTAL_SCREEN_SLOT_LIMIT,conflict:peak>=TOTAL_SCREEN_SLOT_LIMIT,
      conflictStart,conflictEnd
    };
  }

  function screenFutureCapacitySummary(screenId){
    const now = Date.now();
    const reservations = screenReservations(screenId);
    const boundaries = new Set([now]);
    reservations.forEach(x => {
      if (Number.isFinite(x.interval.start) && x.interval.start > now) boundaries.add(x.interval.start);
      if (Number.isFinite(x.interval.end) && x.interval.end > now) boundaries.add(x.interval.end);
    });
    const points = [...boundaries].sort((a,b)=>a-b);
    let peak = 0;
    let fullStart = null;
    let fullEnd = null;
    for (let i=0;i<points.length;i++){
      const point = points[i];
      const occupied = reservations.filter(x => intervalContains(x.interval,point)).length;
      peak = Math.max(peak,occupied);
      if (point > now && occupied >= TOTAL_SCREEN_SLOT_LIMIT && fullStart === null){
        fullStart = point;
        let j=i+1;
        while(j<points.length){
          const nextPoint=points[j];
          const nextOccupied=reservations.filter(x=>intervalContains(x.interval,nextPoint)).length;
          if(nextOccupied<TOTAL_SCREEN_SLOT_LIMIT){ fullEnd=nextPoint; break; }
          j++;
        }
      }
    }
    return {peak,fullStart,fullEnd};
  }

  function screenCapacityLabel(capacity){
    if (capacity.full) return 'ПЪЛЕН';
    if (capacity.almostFull) return 'ПОЧТИ ПЪЛЕН';
    return 'СВОБОДЕН';
  }

  function screenCapacityClass(capacity){
    if (capacity.full) return 'is-full';
    if (capacity.almostFull) return 'is-almost-full';
    return 'is-available';
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
    const capacityNote = ` Всеки екран има максимум ${TOTAL_SCREEN_SLOT_LIMIT} едновременно активни/планирани реклами общо по ${FIXED_SLOT_SECONDS} сек.; системата проверява целия период и не допуска 11-та реклама.`;
    if (r.package === 'single') return 'SINGLE: избери точно 1 публикуван екран.' + capacityNote;
    if (r.package === 'local') return 'LOCAL: избери от 1 до 3 публикувани екрана.' + capacityNote;
    const activeCount = SCREEN_CATALOG.filter(isScreenPublished).length;
    return (activeCount >= 4
      ? 'CITY: избери 4 или 5 публикувани екрана.'
      : 'CITY: стандартно е 4–5 екрана. Докато мрежата е по-малка, demo режимът допуска наличните публикувани екрани.') + capacityNote;
  }

  function packageScreenCountValid(r, assigned){
    const count = assigned.length;
    if (r.package === 'single') return count === 1;
    if (r.package === 'local') return count >= 1 && count <= 3;
    const activeCount = SCREEN_CATALOG.filter(isScreenPublished).length;
    return activeCount >= 4 ? count >= 4 && count <= 5 : count >= 1;
  }

  function screenSelectionConflictForPeriod(r, start, end){
    const assigned = r.assignedScreens || [];
    const valid = assigned.filter(id => isScreenPublished(screenById(id)));
    if (valid.length !== assigned.length || !packageScreenCountValid(r, valid)) {
      return {type:'selection'};
    }
    for (const screenId of valid){
      const capacity = screenPeriodCapacity(screenId,start,end,{excludeRequestId:r.id});
      if (capacity.conflict) return {type:'capacity',screenId,capacity};
    }
    return null;
  }

  function screenSelectionValidForActivation(r){
    const now = new Date();
    const end = addCalendarMonth(now);
    return !screenSelectionConflictForPeriod(r, now, end);
  }


  function getScreenSetting(r, screenId){
    const saved = r?.screenSettings?.[screenId] || {};
    return {
      duration: FIXED_SLOT_SECONDS,
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
          r.screenSettings[screenId] = {duration:FIXED_SLOT_SECONDS, paused:false, order:nextOrder++};
          changed = true;
          return;
        }
        const current = r.screenSettings[screenId];
        if (Number(current.duration) !== FIXED_SLOT_SECONDS) {
          current.duration = FIXED_SLOT_SECONDS;
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
          item.screenSettings[screenId] = {duration:FIXED_SLOT_SECONDS, paused:false, order:next++};
          savePlaylistItem(item);
        } else {
          let changed = false;
          if (Number(current.duration) !== FIXED_SLOT_SECONDS){ current.duration = FIXED_SLOT_SECONDS; changed = true; }
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

  function localDateInputValue(dateValue){
    const d = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function parseLocalDateInput(value){
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const d = new Date(Number(match[1]), Number(match[2])-1, Number(match[3]), 0, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function tomorrowDate(){
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()+1);
    return d;
  }

  function conflictPeriodText(capacity){
    if (!capacity?.conflictStart) return 'за част от избрания период';
    const start = formatDateOnly(new Date(capacity.conflictStart));
    const end = capacity.conflictEnd ? formatDateOnly(new Date(capacity.conflictEnd)) : '';
    return end && end !== start ? `${start}–${end}` : start;
  }

  function plannedPeriod(r){
    const start = finiteMs(r?.scheduledStartAt || (r?.status === 'active' ? r?.activeAt : null));
    const end = finiteMs(r?.scheduledEndAt || (r?.status === 'active' ? r?.expiresAt : null));
    return start !== null && end !== null ? {start:new Date(start),end:new Date(end)} : null;
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
    const nowMs = now.getTime();

    requests.forEach(r => {
      if (r.status === 'scheduled') {
        const startMs = finiteMs(r.scheduledStartAt || r.activeAt);
        let endMs = finiteMs(r.scheduledEndAt || r.expiresAt);
        if (startMs === null) return;
        if (endMs === null) {
          endMs = addCalendarMonth(new Date(startMs)).getTime();
          r.scheduledEndAt = new Date(endMs).toISOString();
          r.expiresAt = r.scheduledEndAt;
          changed = true;
        }

        if (nowMs >= endMs) {
          r.status = 'done';
          r.activeAt = r.activeAt || new Date(startMs).toISOString();
          r.expiresAt = new Date(endMs).toISOString();
          r.completedAt = now.toISOString();
          r.completionReason = 'expired';
          changed = true;
          return;
        }

        if (nowMs >= startMs) {
          r.status = 'active';
          r.activeAt = new Date(startMs).toISOString();
          r.expiresAt = new Date(endMs).toISOString();
          r.activatedFromScheduleAt = now.toISOString();
          changed = true;
        }
        return;
      }

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

      if (new Date(r.expiresAt).getTime() <= nowMs) {
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

  function saveAdminOverlay(type=null, id=null, extra={}){
    try{
      if (!type){
        sessionStorage.removeItem(ADMIN_OVERLAY_KEY);
        return;
      }

      const previous = loadAdminOverlay();
      const sameOverlay = previous?.type === type && (previous?.id ?? null) === (id ?? null);
      const isScreenOverlay = ['screen-playlist','screen-manage','screen-delete','screen-checklist','broadcast-preview'].includes(type);

      sessionStorage.setItem(ADMIN_OVERLAY_KEY, JSON.stringify({
        type,
        id:id ?? null,
        returnScrollY:Number.isFinite(Number(extra.returnScrollY))
          ? Number(extra.returnScrollY)
          : (isScreenOverlay ? screenReturnScrollY : (sameOverlay ? previous?.returnScrollY ?? null : null)),
        dialogScrollTop:Number.isFinite(Number(extra.dialogScrollTop))
          ? Number(extra.dialogScrollTop)
          : (sameOverlay ? Number(previous?.dialogScrollTop || 0) : 0)
      }));
    }catch(e){}
  }

  function loadAdminOverlay(){
    try{
      const raw = JSON.parse(sessionStorage.getItem(ADMIN_OVERLAY_KEY) || 'null');
      if (!raw?.type) return null;
      return {
        type:String(raw.type),
        id:raw.id ?? null,
        returnScrollY:Number.isFinite(Number(raw.returnScrollY)) ? Number(raw.returnScrollY) : null,
        dialogScrollTop:Number.isFinite(Number(raw.dialogScrollTop)) ? Number(raw.dialogScrollTop) : 0
      };
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
      case 'screen-checklist':
        if (saved.id && screenById(saved.id)){
          if (Number.isFinite(saved.returnScrollY)){
            screenReturnScrollY = saved.returnScrollY;
            window.scrollTo(0, saved.returnScrollY);
          }

          openScreenChecklist(saved.id, true);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const checklistDialog = document.querySelector('#screenChecklistDialog .screen-checklist-dialog');
              if (checklistDialog){
                checklistDialog.scrollTop = Math.max(0, saved.dialogScrollTop || 0);
                saveAdminOverlay('screen-checklist', saved.id, {
                  returnScrollY:screenReturnScrollY,
                  dialogScrollTop:checklistDialog.scrollTop
                });
              }
            });
          });
        }else clearAdminOverlay();
        break;
      case 'internal-ad':
        if (!saved.id || loadInternalAds().some(ad => ad.id === saved.id)) openInternalAdDialog(saved.id || null, true);
        else clearAdminOverlay();
        break;
      case 'screen-assignment':
        if (saved.id && loadRequests().some(r => r.id === saved.id)) openScreenAssignmentDialog(saved.id, true);
        else clearAdminOverlay();
        break;
      case 'campaign-schedule':
        if (saved.id && loadRequests().some(r => r.id === saved.id)) openScheduleCampaignDialog(saved.id, true);
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
      document.getElementById('deleteScreenDialog')?.classList.contains('show') ||
      document.getElementById('screenChecklistDialog')?.classList.contains('show')
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

    const checklist = document.getElementById('screenChecklistDialog');
    if (checklist?.classList.contains('show')){
      closeScreenChecklist();
      return true;
    }

    const modalIds = [
      'internalAdDialog',
      'screenAssignmentDialog',
      'campaignScheduleDialog',
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
    closeMobileSidebar();
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

  function closeMobileSidebar(){
    const sidebar = document.querySelector('.sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const menuButton = document.getElementById('mobileMenu');
    if (!sidebar) return;

    sidebar.classList.remove('open');
    if (scrim) scrim.hidden = true;
    if (menuButton) menuButton.setAttribute('aria-expanded','false');
  }

  function openMobileSidebar(){
    const sidebar = document.querySelector('.sidebar');
    const scrim = document.getElementById('sidebarScrim');
    const menuButton = document.getElementById('mobileMenu');
    if (!sidebar) return;

    sidebar.classList.add('open');
    if (scrim) scrim.hidden = false;
    if (menuButton) menuButton.setAttribute('aria-expanded','true');
  }

  function toggleMobileSidebar(){
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    if (sidebar.classList.contains('open')) closeMobileSidebar();
    else openMobileSidebar();
  }

  document.getElementById('adminBack').addEventListener('click', goAdminBack);

  const mobileMenuButton = document.getElementById('mobileMenu');
  mobileMenuButton.setAttribute('aria-expanded','false');
  mobileMenuButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMobileSidebar();
  });

  document.getElementById('sidebarScrim')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMobileSidebar();
  });

  document.addEventListener('pointerdown', (e) => {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar?.classList.contains('open')) return;
    if (sidebar.contains(e.target) || mobileMenuButton.contains(e.target)) return;
    closeMobileSidebar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileSidebar();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMobileSidebar();
  });

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
    const paidStatuses = ['paid','scheduled','active','done'];
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
      if (['paid','scheduled','active','done'].includes(r.status)) c.value += Number(r.total || 0);
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

  function renderScreenScheduleEditor(dialog, schedule){
    const box = dialog?.querySelector('#screenScheduleRows');
    if (!box) return;

    const normalized = normalizeWorkSchedule(schedule);
    box.innerHTML = WEEK_DAYS.map(day => {
      const value = normalized[day.key];
      return `
        <div class="screen-schedule-row ${value.enabled ? 'is-enabled' : 'is-closed'}" data-schedule-day="${day.key}">
          <label class="screen-schedule-toggle">
            <input type="checkbox" data-schedule-enabled="${day.key}" ${value.enabled ? 'checked' : ''}>
            <span aria-hidden="true"></span>
            <b>${day.label}</b>
          </label>
          <div class="screen-schedule-times">
            <label>
              <span>От</span>
              <input type="time" data-schedule-start="${day.key}" value="${value.start}" ${value.enabled ? '' : 'disabled'}>
            </label>
            <label>
              <span>До</span>
              <input type="time" data-schedule-end="${day.key}" value="${value.end}" ${value.enabled ? '' : 'disabled'}>
            </label>
          </div>
          <small class="screen-schedule-closed">${value.enabled ? '' : 'Почивен ден'}</small>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-schedule-enabled]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.scheduleEnabled;
        const row = box.querySelector(`[data-schedule-day="${key}"]`);
        const start = box.querySelector(`[data-schedule-start="${key}"]`);
        const end = box.querySelector(`[data-schedule-end="${key}"]`);
        const closed = row?.querySelector('.screen-schedule-closed');
        const enabled = input.checked;

        row?.classList.toggle('is-enabled', enabled);
        row?.classList.toggle('is-closed', !enabled);
        if (start) start.disabled = !enabled;
        if (end) end.disabled = !enabled;
        if (closed) closed.textContent = enabled ? '' : 'Почивен ден';
      });
    });
  }

  function readScreenScheduleEditor(dialog){
    const schedule = emptyWorkSchedule();
    WEEK_DAYS.forEach(day => {
      const enabled = Boolean(dialog.querySelector(`[data-schedule-enabled="${day.key}"]`)?.checked);
      schedule[day.key] = {
        enabled,
        start:dialog.querySelector(`[data-schedule-start="${day.key}"]`)?.value || '',
        end:dialog.querySelector(`[data-schedule-end="${day.key}"]`)?.value || ''
      };
    });
    return schedule;
  }

  function syncScreenDisplayModeEditor(dialog){
    if (!dialog) return;
    const mode = dialog.querySelector('input[name="screenDisplayMode"]:checked')?.value || '';
    const scheduleBox = dialog.querySelector('#screenWeeklySchedule');
    if (scheduleBox) scheduleBox.hidden = mode !== 'schedule';
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
          <p class="admin-required-note"><span>*</span> – задължително поле</p>

          <div class="internal-ad-form">
            <label>
              <span>Име на екрана / локацията <b class="admin-required-star">*</b></span>
              <input id="screenManageName" type="text" placeholder="Напр. Фризьорски салон">
            </label>

            <label>
              <span>Адрес <b class="admin-required-star">*</b></span>
              <input id="screenManageAddress" type="text" placeholder="Напр. бул. България 12">
            </label>

            <label>
              <span>Кратко описание <small class="admin-optional-label">по желание</small></span>
              <input id="screenManageDescription" type="text" placeholder="Напр. витрина към главната улица">
            </label>

            <div class="screen-photo-field">
              <div class="screen-photo-field-head">
                <div>
                  <span class="internal-ad-label">Снимка на локацията / екрана <small class="admin-optional-label">по желание</small></span>
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

            <fieldset class="admin-choice-field screen-display-mode-field">
              <legend>Режим на излъчване <b class="admin-required-star">*</b></legend>
              <div class="admin-radio-row screen-display-mode-options">
                <label>
                  <input type="radio" name="screenDisplayMode" value="always">
                  <span>
                    <b>24/7</b>
                    <small>За витрина / екран, който се вижда постоянно</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="screenDisplayMode" value="schedule">
                  <span>
                    <b>По график</b>
                    <small>Различно работно време по дни</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <div class="admin-field-group screen-weekly-schedule" id="screenWeeklySchedule" hidden>
              <div class="screen-weekly-schedule-head">
                <div>
                  <span class="internal-ad-label">Седмичен график <b class="admin-required-star">*</b></span>
                  <small>Включи само дните, в които екранът реално се вижда.</small>
                </div>
              </div>
              <div id="screenScheduleRows" class="screen-schedule-rows"></div>
              <small class="field-help">Поддържа работа през полунощ — например 18:00 → 02:00. При 24/7 графикът не се използва.</small>
            </div>

            <fieldset class="admin-choice-field">
              <legend>Има ли Wi‑Fi? <b class="admin-required-star">*</b></legend>
              <div class="admin-radio-row">
                <label><input type="radio" name="screenWifi" value="yes"><span>✓ Да</span></label>
                <label><input type="radio" name="screenWifi" value="no"><span>✕ Не</span></label>
              </div>
            </fieldset>

            <label>
              <span>Yodeck Player ID <small class="admin-optional-label">по желание</small></span>
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

      dialog.querySelectorAll('input[name="screenDisplayMode"]').forEach(input => {
        input.addEventListener('change', () => syncScreenDisplayModeEditor(dialog));
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
        const address = dialog.querySelector('#screenManageAddress').value.trim();
        const description = dialog.querySelector('#screenManageDescription').value.trim();
        const displayMode = dialog.querySelector('input[name="screenDisplayMode"]:checked')?.value || '';
        const workSchedule = readScreenScheduleEditor(dialog);
        const wifiChoice = dialog.querySelector('input[name="screenWifi"]:checked')?.value || '';
        const wifiAvailable = wifiChoice === 'yes' ? true : (wifiChoice === 'no' ? false : null);
        const yodeckPlayerId = dialog.querySelector('#screenManageYodeck').value.trim();
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
        if (!address){
          error.textContent = 'Напиши адрес на локацията.';
          error.hidden = false;
          return;
        }
        if (!['always','schedule'].includes(displayMode)){
          error.textContent = 'Избери режим на излъчване — 24/7 или По график.';
          error.hidden = false;
          return;
        }

        if (displayMode === 'schedule'){
          const enabledDays = WEEK_DAYS.filter(day => workSchedule[day.key]?.enabled);
          if (!enabledDays.length){
            error.textContent = 'При режим „По график“ включи поне един работен ден.';
            error.hidden = false;
            return;
          }

          const invalidDay = enabledDays.find(day => {
            const value = workSchedule[day.key];
            return !validTimeValue(value.start) ||
              !validTimeValue(value.end) ||
              workingHoursDuration(value.start, value.end) === null;
          });

          if (invalidDay){
            error.textContent = `Въведи валидни часове „От“ и „До“ за ${invalidDay.label}.`;
            error.hidden = false;
            return;
          }
        }
        if (wifiAvailable === null){
          error.textContent = 'Избери дали локацията има Wi‑Fi.';
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
            target.address = address;
            target.description = description;
            target.displayMode = displayMode;
            target.workSchedule = workSchedule;
            // Legacy fields stay only for backward compatibility with older demos.
            const firstOpenDay = WEEK_DAYS.find(day => workSchedule[day.key]?.enabled);
            target.workStart = displayMode === 'schedule' && firstOpenDay ? workSchedule[firstOpenDay.key].start : '';
            target.workEnd = displayMode === 'schedule' && firstOpenDay ? workSchedule[firstOpenDay.key].end : '';
            target.wifiAvailable = wifiAvailable;
            target.yodeckPlayerId = yodeckPlayerId;
            target.broadcastHoursPerDay = null;
            target.photo = newPhoto;
            target.updatedAt = new Date().toISOString();
          }else{
            const now = new Date().toISOString();
            screens.push({
              id:makeScreenId(),
              name,
              address,
              description,
              displayMode,
              workSchedule,
              workStart:'',
              workEnd:'',
              wifiAvailable,
              status:'hidden',
              active:false,
              yodeckPlayerId,
              broadcastHoursPerDay:null,
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
    dialog.querySelector('#screenManageAddress').value = existing?.address || '';
    dialog.querySelector('#screenManageDescription').value = existing?.description || '';

    const initialDisplayMode = existing?.displayMode || 'schedule';
    dialog.querySelectorAll('input[name="screenDisplayMode"]').forEach(input => {
      input.checked = input.value === initialDisplayMode;
    });
    renderScreenScheduleEditor(dialog, existing?.workSchedule || emptyWorkSchedule());
    syncScreenDisplayModeEditor(dialog);

    dialog.querySelectorAll('input[name="screenWifi"]').forEach(input => {
      input.checked = existing?.wifiAvailable === true
        ? input.value === 'yes'
        : existing?.wifiAvailable === false
          ? input.value === 'no'
          : false;
    });
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

  function closeScreenChecklist(){
    const dialog = document.getElementById('screenChecklistDialog');
    if (!dialog || !dialog.classList.contains('show')) return;
    dialog.classList.remove('show');
    dialog.dataset.screenId = '';
    const returnY = screenReturnScrollY;
    unlockAdminPageScroll();
    clearAdminOverlay('screen-checklist');
    screenReturnScrollY = returnY;
    restoreScreenReturnPosition();
    updateAdminBackButton();
  }

  function renderScreenChecklistDialog(screenId){
    const dialog = document.getElementById('screenChecklistDialog');
    const screen = screenById(screenId);
    if (!dialog || !screen) return;

    const readiness = screenReadiness(screenId);
    dialog.querySelector('#screenChecklistTitle').textContent = `${screen.name} — Готовност`;
    dialog.querySelector('#screenChecklistScore').textContent = `${readiness.done}/${readiness.total}`;
    dialog.querySelector('#screenChecklistProgressBar').style.width = `${(readiness.done/readiness.total)*100}%`;

    const status = dialog.querySelector('#screenChecklistStatus');
    status.className = `screen-checklist-status ${readinessClass(readiness)}`;
    status.textContent = readiness.done === readiness.total
      ? '✓ Готов за публикуване'
      : readiness.done >= 4
        ? 'Почти готов'
        : 'В подготовка';

    dialog.querySelector('#screenChecklistItems').innerHTML = readiness.items.map(item => `
      <label class="screen-check-item ${item.done ? 'is-done' : ''} ${item.manual ? 'is-manual' : 'is-auto'}">
        <span class="screen-check-control">
          ${item.manual
            ? `<input type="checkbox" data-readiness-key="${esc(item.key)}" ${item.done ? 'checked' : ''}>`
            : `<span class="screen-auto-check">${item.done ? '✓' : '—'}</span>`}
        </span>
        <span class="screen-check-copy">
          <strong>${esc(item.label)}</strong>
          <small>${esc(item.help)}</small>
        </span>
        <span class="screen-check-type">${item.manual ? 'Ръчно' : 'Автоматично'}</span>
      </label>
    `).join('');

    dialog.querySelector('#screenChecklistSave').disabled = false;
  }

  function openScreenChecklist(screenId, restoring=false){
    ensureScreensView();
    if (!restoring) rememberScreenReturnPosition();

    const screen = screenById(screenId);
    if (!screen) return;

    let dialog = document.getElementById('screenChecklistDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'screenChecklistDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog screen-checklist-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">ЕКРАН / CHECKLIST</span>
              <h3 id="screenChecklistTitle">Готовност</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>

          <div class="screen-checklist-overview">
            <div>
              <span>Готовност</span>
              <strong id="screenChecklistScore">0/6</strong>
            </div>
            <span class="screen-checklist-status is-preparing" id="screenChecklistStatus">В подготовка</span>
          </div>

          <div class="screen-checklist-progress"><span id="screenChecklistProgressBar"></span></div>

          <p class="change-dialog-help">Ръчните проверки отбелязваш ти. Снимката, Yodeck ID и playlist-ът се следят автоматично.</p>

          <div id="screenChecklistItems" class="screen-checklist-items"></div>

          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-screen-checklist-cancel>← Назад към екраните</button>
            <button type="button" class="btn btn-primary" id="screenChecklistSave">Запази готовността</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      dialog.querySelector('.change-dialog-close').addEventListener('click', closeScreenChecklist);
      dialog.querySelector('[data-screen-checklist-cancel]').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeScreenChecklist();
      });
      dialog.addEventListener('click', e => {
        if (e.target === dialog) closeScreenChecklist();
      });

      dialog.querySelector('.screen-checklist-dialog').addEventListener('scroll', (e) => {
        if (!dialog.classList.contains('show')) return;
        const id = dialog.dataset.screenId;
        if (!id) return;
        saveAdminOverlay('screen-checklist', id, {
          returnScrollY:screenReturnScrollY,
          dialogScrollTop:e.currentTarget.scrollTop
        });
      }, {passive:true});

      dialog.querySelector('#screenChecklistSave').addEventListener('click', () => {
        const id = dialog.dataset.screenId;
        const screens = loadScreenCatalog();
        const target = screens.find(s => s.id === id);
        if (!target) return;

        target.readiness = {
          mounted:Boolean(dialog.querySelector('[data-readiness-key="mounted"]')?.checked),
          internetTested:Boolean(dialog.querySelector('[data-readiness-key="internetTested"]')?.checked),
          onsiteTest:Boolean(dialog.querySelector('[data-readiness-key="onsiteTest"]')?.checked)
        };
        target.updatedAt = new Date().toISOString();
        saveScreenCatalog(screens);
        renderScreens();
        renderScreenChecklistDialog(id);
        toast('Готовността на екрана е запазена.');
      });
    }

    dialog.dataset.screenId = screenId;
    const checklistScroller = dialog.querySelector('.screen-checklist-dialog');
    if (!restoring && checklistScroller) checklistScroller.scrollTop = 0;

    saveAdminOverlay('screen-checklist', screenId, {
      returnScrollY:screenReturnScrollY,
      dialogScrollTop:restoring ? checklistScroller?.scrollTop || 0 : 0
    });

    renderScreenChecklistDialog(screenId);
    lockAdminPageScroll();
    dialog.classList.add('show');
    updateAdminBackButton();
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
          <p class="admin-required-note"><span>*</span> – задължително поле</p>

          <div class="internal-ad-form">
            <label><span>Име на рекламата <b class="admin-required-star">*</b></span><input id="internalAdTitle" type="text" placeholder="Напр. Рекламирай тук"></label>
            <div><span class="internal-ad-label">Екрани <b class="admin-required-star">*</b></span><div id="internalAdScreens" class="screen-assignment-options"></div></div>
            <div class="fixed-slot-field">
              <span>Времетраене</span>
              <strong>10 сек. · фиксиран слот</strong>
            </div>
            <div>
              <span class="internal-ad-label" id="internalAdFileRequirement">Рекламен файл <b class="admin-required-star">*</b></span>
              <label class="creative-upload-drop">
                <input id="internalAdFile" type="file" accept="image/jpeg,image/png,video/mp4">
                <span class="creative-upload-icon">⇧</span><strong id="internalAdFileLabel">Избери JPG, PNG или MP4</strong><small>Максимум 25 MB</small>
              </label>
            </div>
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
        const duration=FIXED_SLOT_SECONDS;
        const file=dialog.querySelector('#internalAdFile').files?.[0];
        const error=dialog.querySelector('#internalAdError');

        if(!title){ error.textContent='Напиши име на рекламата.'; error.hidden=false; return; }
        if(!screens.length){ error.textContent='Избери поне един екран.'; error.hidden=false; return; }

        const shouldReserveHouseSlot = !current || current.active !== false;
        const blockedScreen = shouldReserveHouseSlot ? screens
          .map(screenId => ({
            screen:screenById(screenId),
            capacity:screenIndefiniteCapacity(screenId,{excludeAdId:current?.id || null})
          }))
          .find(x => x.capacity.conflict) : null;

        if(blockedScreen){
          error.textContent=`„${blockedScreen.screen?.name || 'Екран'}“ достига ${TOTAL_SCREEN_SLOT_LIMIT}/${TOTAL_SCREEN_SLOT_LIMIT}${blockedScreen.capacity.conflictStart ? ` за ${conflictPeriodText(blockedScreen.capacity)}` : ''}. Собствената реклама е постоянна и би надвишила капацитета в бъдещ период.`;
          error.hidden=false;
          return;
        }

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
          current.title=title; current.assignedScreens=screens; current.duration=FIXED_SLOT_SECONDS; current.file=storedFile; current.updatedAt=new Date().toISOString();
          if(!current.screenSettings) current.screenSettings={};
          Object.keys(current.screenSettings).forEach(screenId=>{ if(!screens.includes(screenId)) delete current.screenSettings[screenId]; });
          screens.forEach(screenId=>{
            const setting=getScreenSetting(current,screenId);
            current.screenSettings[screenId]={...setting,duration:FIXED_SLOT_SECONDS};
          });
        }else{
          const now=new Date().toISOString();
          const ad={id:makeInternalAdId(),internalAd:true,title,assignedScreens:screens,duration:FIXED_SLOT_SECONDS,file:storedFile,active:true,createdAt:now,updatedAt:now,screenSettings:{}};
          screens.forEach(screenId=>{ ad.screenSettings[screenId]={duration:FIXED_SLOT_SECONDS,paused:false,order:null}; });
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
    dialog.querySelector('#internalAdFile').value='';
    dialog._internalAdValidation=null;
    dialog.querySelector('#internalAdFileLabel').textContent=existing?'Смени файла (по желание)':'Избери JPG, PNG или MP4';
    dialog.querySelector('#internalAdFileRequirement').innerHTML=existing
      ? 'Рекламен файл <small class="admin-optional-label">по желание при редакция</small>'
      : 'Рекламен файл <b class="admin-required-star">*</b>';
    dialog.querySelector('#internalAdError').hidden=true;
    dialog.querySelector('#internalAdFileCheck').hidden=true;
    dialog.querySelector('#internalAdFileCheck').innerHTML='';
    const existingFile=dialog.querySelector('#internalAdExistingFile');
    existingFile.hidden=!existing?.file;
    existingFile.textContent=existing?.file?`Текущ файл: ${existing.file.name}`:'';
    const selected=new Set(existing?.assignedScreens||[]);
    dialog.querySelector('#internalAdScreens').innerHTML=selectableScreens(existing?.assignedScreens||[]).map(screen=>{
      const nowCapacity=screenTotalCapacity(screen.id,{excludeAdId:existing?.id || null});
      const capacity=screenIndefiniteCapacity(screen.id,{excludeAdId:existing?.id || null});
      const disabled=!isScreenPublished(screen) || (existing?.active !== false && capacity.conflict);
      return `
      <label class="screen-option ${!isScreenPublished(screen)?'is-screen-off':''} ${existing?.active !== false && capacity.conflict?'is-screen-full':''}">
        <input type="checkbox" name="internalAdScreen" value="${esc(screen.id)}" ${selected.has(screen.id)&&!disabled?'checked':''} ${disabled?'disabled':''}>
        <span class="screen-option-check">✓</span>
        <span class="screen-option-copy">
          <strong>${esc(screen.name)}${!isScreenPublished(screen)?` · ${screenStatusLabel(screen)}`:(existing?.active !== false && capacity.conflict)?' · ЗАЕТ В БЪДЕЩ ПЕРИОД':''}</strong>
          <small>${esc(screen.address || screen.description || 'Без адрес')} · сега ${nowCapacity.occupied}/${TOTAL_SCREEN_SLOT_LIMIT} · бъдещ максимум ${capacity.peak}/${TOTAL_SCREEN_SLOT_LIMIT}${capacity.conflict?` · ${conflictPeriodText(capacity)}`:''}</small>
        </span>
      </label>`;
    }).join('');
    lockAdminPageScroll();
    dialog.classList.add('show');
    requestAnimationFrame(() => {
      const panel = dialog.querySelector('.internal-ad-dialog');
      if (panel) panel.scrollTop = 0;
    });
  }

  function toggleInternalAd(id){
    const ads=loadInternalAds(); const ad=ads.find(x=>x.id===id); if(!ad)return;

    if(ad.active===false){
      const blocked=(ad.assignedScreens||[])
        .map(screenId=>({
          screen:screenById(screenId),
          capacity:screenIndefiniteCapacity(screenId,{excludeAdId:ad.id})
        }))
        .find(x=>x.capacity.conflict);
      if(blocked){
        toast(`„${blocked.screen?.name || 'Екран'}“ достига ${TOTAL_SCREEN_SLOT_LIMIT}/${TOTAL_SCREEN_SLOT_LIMIT} за ${conflictPeriodText(blocked.capacity)}. Включването е отказано.`);
        return;
      }
      ad.active=true;
    }else{
      ad.active=false;
    }

    ad.duration=FIXED_SLOT_SECONDS;
    ad.updatedAt=new Date().toISOString();
    saveInternalAds(ads);
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
      const readiness = screenReadiness(screen.id);
      const totalCapacity = screenTotalCapacity(screen.id);
      const futureCapacity = screenFutureCapacitySummary(screen.id);

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
            <p>${esc(screen.address || screen.description || 'Адресът още не е въведен.')}</p>
            ${screen.description && screen.address ? `<small class="screen-description-line">${esc(screen.description)}</small>` : ''}
            <div class="screen-location-facts">
              <span>◷ ${esc(workingTimeLabel(screen))}</span>
              <span>${esc(todayWorkingTimeLabel(screen))}</span>
              <span class="${screen.wifiAvailable === true ? 'wifi-yes' : screen.wifiAvailable === false ? 'wifi-no' : ''}">Wi‑Fi: ${screen.wifiAvailable === true ? 'Да' : screen.wifiAvailable === false ? 'Не' : 'Не е зададено'}</span>
            </div>
            ${screen.yodeckPlayerId ? `<div class="screen-yodeck-id">Yodeck ID: <strong>${esc(screen.yodeckPlayerId)}</strong></div>` : ''}

            <div class="screen-summary-grid">
              <div><span>Цикъл</span><strong>${cycle ? `${cycle} сек.` : '—'}</strong></div>
              <div><span>Пауза</span><strong>${paused}</strong></div>
            </div>

            <div class="screen-capacity-card ${screenCapacityClass(totalCapacity)}">
              <div class="screen-capacity-head">
                <span><small>Общо активни реклами</small><strong>${totalCapacity.occupied}/${TOTAL_SCREEN_SLOT_LIMIT}</strong></span>
                <b>${screenCapacityLabel(totalCapacity)}</b>
              </div>
              <div class="screen-capacity-progress"><i style="width:${Math.min(100,(totalCapacity.occupied/TOTAL_SCREEN_SLOT_LIMIT)*100)}%"></i></div>
              <div class="screen-capacity-foot">
                <span>Клиентски: ${totalCapacity.clients} · Наши: ${totalCapacity.house}</span>
                <span>Макс. цикъл: ${TOTAL_SCREEN_SLOT_LIMIT * FIXED_SLOT_SECONDS} сек.</span>
                <span class="screen-future-capacity ${futureCapacity.fullStart ? 'is-full' : ''}">${futureCapacity.fullStart
                  ? `Планирано запълване: ${formatDateOnly(futureCapacity.fullStart)}${futureCapacity.fullEnd ? `–${formatDateOnly(futureCapacity.fullEnd)}` : ''} · ${TOTAL_SCREEN_SLOT_LIMIT}/${TOTAL_SCREEN_SLOT_LIMIT}`
                  : `Бъдещ максимум: ${futureCapacity.peak}/${TOTAL_SCREEN_SLOT_LIMIT}`}</span>
              </div>
            </div>

            <div class="screen-rotation-mini screen-rotation-mini-three">
              <div>
                <span>≈ излъчвания / час</span>
                <strong>${rotationStats.cycleSeconds ? formatApprox(rotationStats.rotationsPerHour) : '—'}</strong>
              </div>
              <div>
                <span>≈ излъчвания / днес</span>
                <strong>${rotationStats.rotationsPerDay !== null ? formatApprox(rotationStats.rotationsPerDay) : '—'}</strong>
              </div>
              <div>
                <span>≈ излъчвания / седмица</span>
                <strong>${rotationStats.rotationsPerWeek !== null ? formatApprox(rotationStats.rotationsPerWeek) : '—'}</strong>
              </div>
              <small>${esc(screenScheduleSummary(screen))} · ${esc(todayWorkingTimeLabel(screen))}</small>
            </div>

            <button class="screen-readiness-card ${readinessClass(readiness)}" data-screen-checklist="${esc(screen.id)}">
              <span class="screen-readiness-top">
                <span>
                  <small>Готовност</small>
                  <strong>${readiness.done}/${readiness.total}</strong>
                </span>
                <b>${readiness.done === readiness.total ? '✓ Готов' : 'Отвори checklist →'}</b>
              </span>
              <span class="screen-readiness-progress"><i style="width:${(readiness.done/readiness.total)*100}%"></i></span>
            </button>

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
            ? 'Подреди рекламите и при нужда спри само една реклама на този екран. Всеки слот е фиксиран на 10 сек.'
            : 'Няма активни кампании, разпределени към този екран.');

    const stats = screenRotationStats(screenId);

    dialog.querySelector('#playlistSummary').innerHTML = `
      <div><span>Активни реклами</span><strong>${items.length}</strong></div>
      <div><span>В момента се излъчват</span><strong>${playing.length}</strong></div>
      <div><span>На пауза</span><strong>${pausedCount}</strong></div>
      <div><span>Общ цикъл</span><strong>${cycle ? `${cycle} сек.` : '—'}</strong></div>
      <div class="playlist-stat-highlight">
        <span>≈ излъчвания / час</span>
        <strong>${stats.cycleSeconds ? formatApprox(stats.rotationsPerHour) : '—'}</strong>
      </div>
      <div class="playlist-stat-highlight">
        <span>≈ излъчвания / днес</span>
        <strong>${stats.rotationsPerDay !== null ? formatApprox(stats.rotationsPerDay) : '—'}</strong>
      </div>
      <div class="playlist-stat-highlight">
        <span>≈ излъчвания / седмица</span>
        <strong>${stats.rotationsPerWeek !== null ? formatApprox(stats.rotationsPerWeek) : '—'}</strong>
      </div>
    `;

    const oldEstimateNote = dialog.querySelector('#playlistEstimateNote');
    if (oldEstimateNote) oldEstimateNote.remove();

    const estimateNote = document.createElement('div');
    estimateNote.id = 'playlistEstimateNote';
    estimateNote.className = 'playlist-estimate-note';
    estimateNote.innerHTML = stats.cycleSeconds
      ? `При текущ цикъл от <strong>${stats.cycleSeconds} сек.</strong> всяка непаузирана реклама се появява приблизително <strong>${formatApprox(stats.rotationsPerHour)}</strong> пъти на час. <strong>${esc(todayWorkingTimeLabel(screen))}</strong>${stats.rotationsPerDay !== null ? ` → около <strong>${formatApprox(stats.rotationsPerDay)}</strong> излъчвания днес.` : '.'} За целия зададен режим прогнозата е около <strong>${formatApprox(stats.rotationsPerWeek)}</strong> излъчвания седмично.<span>${esc(screenScheduleSummary(screen))}. Това са излъчвания на playlist-а, не измерени гледания от хора.</span>`
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
                  ${stats.rotationsPerDay !== null ? `<span>${formatApprox(stats.rotationsPerDay)} / днес</span>` : ''}
                  ${stats.rotationsPerWeek !== null ? `<span>${formatApprox(stats.rotationsPerWeek)} / седмица</span>` : ''}
                </div>
              `}

              <div class="playlist-controls">
                <div class="playlist-fixed-duration">
                  <span>Времетраене</span>
                  <strong>10 сек. · фиксирано</strong>
                </div>

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
      if(meta.duration < 9.5 || meta.duration > 10.5){
        result.warnings.push(`Видеото е ${meta.duration.toFixed(1)} сек. Рекламният слот е фиксиран на 10 сек.`);
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
      ${(r.activeAt || r.expiresAt || r.scheduledStartAt || r.scheduledEndAt) ? `
      <div class="drawer-section">
        <h4>Период на кампанията</h4>
        <div class="campaign-period-box">
          <div>
            <span>${r.status === 'scheduled' ? 'Планирано начало' : 'Начало'}</span>
            <strong>${formatDateOnly(r.status === 'scheduled' ? r.scheduledStartAt : r.activeAt)}</strong>
          </div>
          <div>
            <span>${r.status === 'scheduled' ? 'Планиран край' : 'Автоматичен край'}</span>
            <strong>${formatDateOnly(r.status === 'scheduled' ? (r.scheduledEndAt || r.expiresAt) : r.expiresAt)}</strong>
          </div>
        </div>
        ${r.status === 'active' ? `
          <div class="campaign-countdown ${campaignUrgency(r) || ''}">
            <strong>${campaignTimeLeftText(r)}</strong>
            <span>След тази дата рекламата трябва да спре, ако няма ново плащане.</span>
          </div>` : ''}
        ${r.status === 'scheduled' ? `
          <div class="campaign-countdown scheduled">
            <strong>Планирана за ${formatDateOnly(r.scheduledStartAt)}</strong>
            <span>Ще стане активна автоматично на началната дата и няма да влиза в playlist-а преди това.</span>
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
      const scheduleButton = `<button class="btn btn-success" data-action="schedule">Планирай за бъдеща дата</button>`;
      if (!screenSelectionValidForActivation(r)) return `
        ${scheduleButton}
        <button class="btn btn-primary" data-assign-screens="${esc(r.id)}">Избери екрани за старт сега</button>
        <button class="btn btn-light" disabled>За старт сега трябва да има свободен капацитет за целия месец</button>`;
      return `
        <button class="btn btn-primary" data-action="activate">Активирай сега</button>
        ${scheduleButton}`;
    }
    if (r.status === 'scheduled') return `
      <button class="btn btn-primary" data-action="schedule">Промени плана</button>
      <button class="btn btn-light" data-action="cancel-schedule">Отмени планирането</button>`;
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
      r.scheduledStartAt = null;
      r.scheduledEndAt = null;
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
      r.scheduledStartAt = null;
      r.scheduledEndAt = null;
      r.scheduledAt = null;
      r.completedAt = null;
      r.completionReason = null;
    }

    saveRequests(requests);
    openRequest(id, false);
  }

  function activateCampaignNow(id){
    const requests = syncCampaignLifecycle();
    const r = requests.find(x => x.id === id);
    if (!r) return {ok:false,type:'missing'};

    const now = new Date();
    const end = addCalendarMonth(now);
    const conflict = screenSelectionConflictForPeriod(r, now, end);
    if (conflict) return {ok:false,...conflict,start:now,end};

    r.status = 'active';
    r.activeAt = now.toISOString();
    r.expiresAt = end.toISOString();
    r.scheduledStartAt = null;
    r.scheduledEndAt = null;
    r.scheduledAt = null;
    r.completedAt = null;
    r.completionReason = null;

    saveRequests(requests);
    openRequest(id, false);
    return {ok:true,start:now,end};
  }

  function renewCampaign(id){
    const requests = syncCampaignLifecycle();
    const r = requests.find(x => x.id === id);
    if (!r || r.status !== 'active') return {ok:false,type:'status'};

    const now = new Date();
    const currentEnd = r.expiresAt ? new Date(r.expiresAt) : now;
    const base = currentEnd.getTime() > now.getTime() ? currentEnd : now;
    const newEnd = addCalendarMonth(base);

    for (const screenId of (r.assignedScreens || [])){
      if (!isScreenPublished(screenById(screenId))) return {ok:false,type:'selection',screenId};
      const capacity = screenPeriodCapacity(screenId, base, newEnd, {excludeRequestId:r.id});
      if (capacity.conflict) return {ok:false,type:'capacity',screenId,capacity,start:base,end:newEnd};
    }

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
    return {ok:true,newEnd};
  }

  function restartExpiredCampaign(id){
    const requests = syncCampaignLifecycle();
    const r = requests.find(x => x.id === id);
    if (!r) return {ok:false,type:'missing'};

    const now = new Date();
    const end = addCalendarMonth(now);
    const conflict = screenSelectionConflictForPeriod(r, now, end);
    if (conflict) return {ok:false,...conflict,start:now,end};

    r.status = 'active';
    r.activeAt = now.toISOString();
    r.expiresAt = end.toISOString();
    r.scheduledStartAt = null;
    r.scheduledEndAt = null;
    r.scheduledAt = null;
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
    return {ok:true,end};
  }

  function openScheduleCampaignDialog(id, restoring=false){
    saveAdminOverlay('campaign-schedule', id);
    const request = loadRequests().find(x => x.id === id);
    if (!request || !['paid','scheduled'].includes(request.status)) return;

    let dialog = document.getElementById('campaignScheduleDialog');
    if (!dialog){
      dialog = document.createElement('div');
      dialog.id = 'campaignScheduleDialog';
      dialog.className = 'change-dialog-backdrop';
      dialog.innerHTML = `
        <section class="change-dialog campaign-schedule-dialog" role="dialog" aria-modal="true">
          <div class="change-dialog-head">
            <div>
              <span class="section-kicker">ПЛАНИРАНЕ</span>
              <h3>Планирай рекламата</h3>
            </div>
            <button type="button" class="change-dialog-close" aria-label="Затвори">×</button>
          </div>
          <p class="change-dialog-help">Избери начална дата и екрани. Системата проверява целия едномесечен период и не допуска над 10 реклами на нито един екран.</p>
          <label class="admin-schedule-date-field">
            <span>Начална дата <b class="admin-required-star">*</b></span>
            <input type="date" id="campaignScheduleStart" required>
          </label>
          <div class="campaign-schedule-period" id="campaignSchedulePeriod"></div>
          <div class="admin-field-title">Екрани <b class="admin-required-star">*</b></div>
          <div id="campaignScheduleScreens" class="screen-assignment-options"></div>
          <div class="change-dialog-error" id="campaignScheduleError" hidden></div>
          <div class="change-dialog-actions">
            <button type="button" class="btn btn-light" data-schedule-cancel>Отказ</button>
            <button type="button" class="btn btn-primary" data-schedule-save>Запази плана</button>
          </div>
        </section>`;
      document.body.appendChild(dialog);

      const close = () => {
        dialog.classList.remove('show');
        dialog.dataset.requestId = '';
        clearAdminOverlay('campaign-schedule');
      };
      dialog.querySelector('.change-dialog-close').addEventListener('click', close);
      dialog.querySelector('[data-schedule-cancel]').addEventListener('click', close);
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

      const renderOptions = () => {
        const req = loadRequests().find(x => x.id === dialog.dataset.requestId);
        if (!req) return;
        const startInput = dialog.querySelector('#campaignScheduleStart');
        const start = parseLocalDateInput(startInput.value);
        const periodBox = dialog.querySelector('#campaignSchedulePeriod');
        const options = dialog.querySelector('#campaignScheduleScreens');
        const error = dialog.querySelector('#campaignScheduleError');
        error.hidden = true;

        if (!start){
          periodBox.innerHTML = '<span>Избери начална дата.</span>';
          options.innerHTML = '';
          return;
        }
        const end = addCalendarMonth(start);
        periodBox.innerHTML = `<span>Период</span><strong>${formatDateOnly(start)} → ${formatDateOnly(end)}</strong><small>1 календарен месец · крайният момент не се застъпва със следваща кампания, започваща на същата дата.</small>`;

        const selected = new Set(req.assignedScreens || []);
        const inputType = req.package === 'single' ? 'radio' : 'checkbox';
        options.innerHTML = selectableScreens(req.assignedScreens || []).map(screen => {
          const capacity = screenPeriodCapacity(screen.id,start,end,{excludeRequestId:req.id});
          const blocked = !isScreenPublished(screen) || capacity.conflict;
          const after = Math.min(TOTAL_SCREEN_SLOT_LIMIT + 1, capacity.peak + 1);
          const status = !isScreenPublished(screen)
            ? screenStatusLabel(screen)
            : capacity.conflict
              ? `ЗАЕТ · ${conflictPeriodText(capacity)}`
              : after === TOTAL_SCREEN_SLOT_LIMIT
                ? 'ПОСЛЕДНО МЯСТО'
                : 'СВОБОДЕН';
          return `
            <label class="screen-option ${!isScreenPublished(screen)?'is-screen-off':''} ${capacity.conflict?'is-screen-full':''}">
              <input type="${inputType}" name="scheduleScreen" value="${esc(screen.id)}" ${selected.has(screen.id) && !blocked?'checked':''} ${blocked?'disabled':''}>
              <span class="screen-option-check">✓</span>
              <span class="screen-option-copy">
                <strong>${esc(screen.name)} · ${esc(status)}</strong>
                <small>${esc(screen.address || screen.description || 'Без адрес')} · максимум за периода ${capacity.peak}/${TOTAL_SCREEN_SLOT_LIMIT} преди тази кампания · след нея до ${after}/${TOTAL_SCREEN_SLOT_LIMIT}</small>
              </span>
            </label>`;
        }).join('');

        const limitSelections = e => {
          const checked = [...options.querySelectorAll('input:checked')];
          const max = req.package === 'single' ? 1 : req.package === 'local' ? 3 : 5;
          if (checked.length > max){
            e.target.checked = false;
            error.textContent = req.package === 'local' ? 'LOCAL допуска максимум 3 екрана.' : req.package === 'city' ? 'CITY допуска максимум 5 екрана.' : 'SINGLE допуска точно 1 екран.';
            error.hidden = false;
          } else error.hidden = true;
        };
        options.querySelectorAll('input').forEach(input => input.addEventListener('change', limitSelections));
      };

      dialog.querySelector('#campaignScheduleStart').addEventListener('change', renderOptions);
      dialog.querySelector('[data-schedule-save]').addEventListener('click', () => {
        const requestId = dialog.dataset.requestId;
        const requests = syncCampaignLifecycle();
        const req = requests.find(x => x.id === requestId);
        const error = dialog.querySelector('#campaignScheduleError');
        if (!req || !['paid','scheduled'].includes(req.status)) return;

        const start = parseLocalDateInput(dialog.querySelector('#campaignScheduleStart').value);
        const min = tomorrowDate();
        if (!start || start.getTime() < min.getTime()){
          error.textContent = 'Планираната кампания трябва да започва най-рано утре. За днес използвай „Активирай сега“.';
          error.hidden = false;
          return;
        }
        const end = addCalendarMonth(start);
        const selected = [...dialog.querySelectorAll('input[name="scheduleScreen"]:checked')].map(i => i.value);
        if (!packageScreenCountValid(req, selected)){
          error.textContent = req.package === 'single'
            ? 'SINGLE изисква точно 1 екран.'
            : req.package === 'local'
              ? 'LOCAL изисква от 1 до 3 екрана.'
              : (SCREEN_CATALOG.filter(isScreenPublished).length >= 4
                  ? 'CITY изисква 4–5 публикувани екрана.'
                  : 'CITY в demo режим допуска наличните публикувани екрани. Избери поне 1.');
          error.hidden = false;
          return;
        }

        for (const screenId of selected){
          const screen = screenById(screenId);
          if (!isScreenPublished(screen)){
            error.textContent = `„${screen?.name || 'Екран'}“ вече не е публикуван. Избери друг екран.`;
            error.hidden = false;
            return;
          }
          const capacity = screenPeriodCapacity(screenId,start,end,{excludeRequestId:req.id});
          if (capacity.conflict){
            error.textContent = `„${screen?.name || 'Екран'}“ достига ${TOTAL_SCREEN_SLOT_LIMIT}/${TOTAL_SCREEN_SLOT_LIMIT} за ${conflictPeriodText(capacity)}. Тази кампания би станала №${TOTAL_SCREEN_SLOT_LIMIT + 1}, затова планирането е отказано.`;
            error.hidden = false;
            renderOptions();
            return;
          }
        }

        const now = new Date();
        req.status = 'scheduled';
        req.assignedScreens = selected;
        req.screensAssignedAt = now.toISOString();
        req.scheduledAt = now.toISOString();
        req.scheduledStartAt = start.toISOString();
        req.scheduledEndAt = end.toISOString();
        req.activeAt = null;
        req.expiresAt = end.toISOString();
        req.completedAt = null;
        req.completionReason = null;

        if (!Array.isArray(req.screenAssignmentHistory)) req.screenAssignmentHistory = [];
        req.screenAssignmentHistory.push({screens:[...selected], createdAt:now.toISOString(), reason:'schedule'});
        if (!Array.isArray(req.scheduleHistory)) req.scheduleHistory = [];
        req.scheduleHistory.push({createdAt:now.toISOString(), start:req.scheduledStartAt, end:req.scheduledEndAt, screens:[...selected]});

        localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
        renderAll();
        close();
        openRequest(requestId, false);
        toast(`Планирана за ${formatDateOnly(start)}–${formatDateOnly(end)} на ${selected.length} ${selected.length === 1 ? 'екран' : 'екрана'}.`);
      });

      dialog._renderScheduleOptions = renderOptions;
    }

    dialog.dataset.requestId = id;
    const minDate = tomorrowDate();
    const startInput = dialog.querySelector('#campaignScheduleStart');
    startInput.min = localDateInputValue(minDate);
    const existingStart = request.status === 'scheduled' ? parseLocalDateInput(localDateInputValue(request.scheduledStartAt)) : null;
    startInput.value = localDateInputValue(existingStart && existingStart >= minDate ? existingStart : minDate);
    dialog._renderScheduleOptions?.();
    dialog.classList.add('show');
    if (!restoring) requestAnimationFrame(() => startInput.focus());
  }

  function openScreenAssignmentDialog(id, restoring=false, periodOverride=null){
    saveAdminOverlay('screen-assignment', id);
    const r = loadRequests().find(x => x.id === id);
    if (!r) return;
    const automaticPeriod = r.status === 'scheduled'
      ? plannedPeriod(r)
      : (r.status === 'active' && r.expiresAt
          ? {start:new Date(),end:new Date(r.expiresAt)}
          : (r.status === 'paid' ? {start:new Date(),end:addCalendarMonth(new Date())} : null));
    const capacityPeriod = periodOverride || automaticPeriod;

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
          <p class="change-dialog-help" id="screenAssignmentRule"></p><p class="admin-required-note"><span>*</span> – задължително поле</p><div class="admin-field-title">Екрани <b class="admin-required-star">*</b></div>
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

        const periodStart = finiteMs(dialog.dataset.periodStart);
        const periodEnd = finiteMs(dialog.dataset.periodEnd);
        const blockedScreen = selected
          .map(screenId => ({
            screen:screenById(screenId),
            capacity:periodStart !== null && periodEnd !== null
              ? screenPeriodCapacity(screenId,periodStart,periodEnd,{excludeRequestId:req.id})
              : screenTotalCapacity(screenId,{excludeRequestId:req.id})
          }))
          .find(x => x.capacity.conflict || x.capacity.full);
        if(blockedScreen){
          const periodText = blockedScreen.capacity.conflict ? ` за ${conflictPeriodText(blockedScreen.capacity)}` : '';
          error.textContent = `„${blockedScreen.screen?.name || 'Екран'}“ е пълен${periodText} — няма свободен слот за тази кампания. Избери друг екран.`;
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
    dialog.dataset.periodStart = capacityPeriod ? String(new Date(capacityPeriod.start).getTime()) : '';
    dialog.dataset.periodEnd = capacityPeriod ? String(new Date(capacityPeriod.end).getTime()) : '';
    dialog.querySelector('#screenAssignmentRule').textContent = capacityPeriod
      ? `${screenLimitText(r)} Проверка за периода ${formatDateOnly(capacityPeriod.start)}–${formatDateOnly(capacityPeriod.end)}.`
      : screenLimitText(r);
    dialog.querySelector('#screenAssignmentError').hidden = true;

    const selected = new Set(r.assignedScreens || []);
    const inputType = r.package === 'single' ? 'radio' : 'checkbox';
    const options = dialog.querySelector('#screenAssignmentOptions');

    options.innerHTML = selectableScreens(r.assignedScreens||[]).map(screen => {
      const capacity=capacityPeriod
        ? screenPeriodCapacity(screen.id,capacityPeriod.start,capacityPeriod.end,{excludeRequestId:r.id})
        : screenTotalCapacity(screen.id,{excludeRequestId:r.id});
      const blocked=Boolean(capacity.conflict || capacity.full);
      const disabled=!isScreenPublished(screen) || blocked;
      const used = capacityPeriod ? capacity.peak : capacity.occupied;
      return `
      <label class="screen-option ${!isScreenPublished(screen)?'is-screen-off':''} ${blocked?'is-screen-full':''}">
        <input type="${inputType}" name="assignedScreen" value="${esc(screen.id)}" ${selected.has(screen.id) && !disabled?'checked':''} ${disabled?'disabled':''}>
        <span class="screen-option-check">✓</span>
        <span class="screen-option-copy">
          <strong>${esc(screen.name)}${!isScreenPublished(screen)?` · ${screenStatusLabel(screen)}`:blocked?' · ПЪЛЕН':''}</strong>
          <small>${esc(screen.address || screen.description || 'Без адрес')} · ${capacityPeriod?'Максимум за периода':'Общо реклами'} ${used}/${TOTAL_SCREEN_SLOT_LIMIT}${used===TOTAL_SCREEN_SLOT_LIMIT-1?' · последно свободно място':''}${capacity.conflict?` · зает ${conflictPeriodText(capacity)}`:''}</small>
        </span>
      </label>`;
    }).join('');

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
          <p class="admin-required-note"><span>*</span> – задължително поле</p>
          <div class="admin-field-title">Готова визия <b class="admin-required-star">*</b></div>

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
          <p class="admin-required-note"><span>*</span> – задължително поле</p>
          <div class="admin-field-title">Какво трябва да се промени? <b class="admin-required-star">*</b></div>

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

  function closeScreenLayersBeforeRequest(){
    const broadcast = document.getElementById('broadcastPreviewDialog');
    if (broadcast?.classList.contains('show')) closeBroadcastPreview();

    const playlist = document.getElementById('screenPlaylistDialog');
    if (playlist?.classList.contains('show')) closeScreenPlaylist();

    const manage = document.getElementById('screenManageDialog');
    if (manage?.classList.contains('show')) closeScreenManageDialog();

    const del = document.getElementById('deleteScreenDialog');
    if (del?.classList.contains('show')) closeDeleteScreenDialog();

    const checklist = document.getElementById('screenChecklistDialog');
    if (checklist?.classList.contains('show')) closeScreenChecklist();
  }

  // Delegated events
  document.addEventListener('click', async (e) => {
    const openBtn = e.target.closest('[data-open-request]');
    if (openBtn){
      e.preventDefault();
      e.stopPropagation();
      closeScreenLayersBeforeRequest();
      openRequest(openBtn.dataset.openRequest);
      return;
    }

    const assignScreens = e.target.closest('[data-assign-screens]');
    if (assignScreens) openScreenAssignmentDialog(assignScreens.dataset.assignScreens);

    const openPlaylist = e.target.closest('[data-open-playlist]');
    if (openPlaylist) renderScreenPlaylist(openPlaylist.dataset.openPlaylist);

    const editScreen = e.target.closest('[data-edit-screen]');
    if (editScreen) openScreenDialog(editScreen.dataset.editScreen);

    const checklistScreen = e.target.closest('[data-screen-checklist]');
    if (checklistScreen) openScreenChecklist(checklistScreen.dataset.screenChecklist);

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
          const result = activateCampaignNow(activeRequestId);
          if (!result.ok){
            if (result.type === 'capacity'){
              const screen = screenById(result.screenId);
              toast(`„${screen?.name || 'Екран'}“ ще е пълен за ${conflictPeriodText(result.capacity)}. Стартът е отказан.`);
            } else toast('Избери правилния брой публикувани екрани за кампанията.');
            openScreenAssignmentDialog(activeRequestId, false, {start:result.start || new Date(), end:result.end || addCalendarMonth(new Date())});
            break;
          }
          const activated = loadRequests().find(x => x.id === activeRequestId);
          toast(`Активна до ${formatDateOnly(activated?.expiresAt)} на ${activated?.assignedScreens?.length || 0} екрана.`);
          break;
        }
        case 'schedule':
          openScheduleCampaignDialog(activeRequestId);
          break;
        case 'cancel-schedule': {
          const requests = loadRequests();
          const req = requests.find(x => x.id === activeRequestId);
          if (req && req.status === 'scheduled'){
            req.status = 'paid';
            req.scheduledStartAt = null;
            req.scheduledEndAt = null;
            req.scheduledAt = null;
            req.activeAt = null;
            req.expiresAt = null;
            req.assignedScreens = [];
            req.screensAssignedAt = null;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
            renderAll();
            openRequest(activeRequestId, false);
            toast('Планирането е отменено. Заявката остава платена.');
          }
          break;
        }
        case 'renew': {
          const result = renewCampaign(activeRequestId);
          if (!result.ok){
            if (result.type === 'capacity'){
              const screen = screenById(result.screenId);
              toast(`Не може да се удължи: „${screen?.name || 'Екран'}“ е пълен за ${conflictPeriodText(result.capacity)}.`);
            } else toast('Кампанията не може да бъде удължена с текущите екрани.');
            break;
          }
          const renewed = loadRequests().find(x => x.id === activeRequestId);
          toast(`Удължена до ${formatDateOnly(renewed?.expiresAt)}.`);
          break;
        }
        case 'restart': {
          const result = restartExpiredCampaign(activeRequestId);
          if(!result.ok){
            if (result.type === 'capacity'){
              const screen = screenById(result.screenId);
              toast(`„${screen?.name || 'Екран'}“ ще е пълен за ${conflictPeriodText(result.capacity)}. Новият старт е отказан.`);
            } else toast('Някой от избраните екрани е недостъпен. Избери свободни екрани.');
            openScreenAssignmentDialog(activeRequestId, false, {start:result.start || new Date(),end:result.end || addCalendarMonth(new Date())});
            break;
          }
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
