
// Kyustendil Screen Admin v1 — static demo bridge.
// In demo mode requests/files are stored only in this browser.
// Supabase will replace this storage layer before production.
(() => {
  const STORAGE_KEY = 'ks_demo_requests_v1';
  const DB_NAME = 'KyustendilScreenDemo';
  const DB_VERSION = 1;
  const FILE_STORE = 'files';

  function loadRequests(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveRequests(requests){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  }

  function nextId(requests){
    const nums = requests.map(r => Number(String(r.id || '').replace(/\D/g,''))).filter(Boolean);
    return `KS-${String((nums.length ? Math.max(...nums) : 1000) + 1).padStart(4,'0')}`;
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

  async function storeFiles(requestId, form){
    const db = await openDB();
    const fileInputs = [...form.querySelectorAll('input[type="file"]:not(:disabled)')];
    const meta = [];
    for (const input of fileInputs){
      const files = [...(input.files || [])];
      for (let i=0;i<files.length;i++){
        const file = files[i];
        const key = `${requestId}:${input.name}:${Date.now()}:${i}`;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(FILE_STORE, 'readwrite');
          tx.objectStore(FILE_STORE).put({
            key,
            requestId,
            field:input.name,
            name:file.name,
            type:file.type,
            size:file.size,
            blob:file
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        meta.push({key, field:input.name, name:file.name, type:file.type, size:file.size});
      }
    }
    return meta;
  }

  function value(form, name){ return form.elements[name]?.value?.trim?.() || ''; }

  window.KSDemoBridge = {
    async submit(form, orderData){
      const requests = loadRequests();
      const id = nextId(requests);
      const checked = form.querySelector('input[name="design"]:checked');
      const designType = checked?.dataset.designType || '';
      const files = await storeFiles(id, form);

      let creativeText = '';
      let creativeContact = '';
      if (designType === 'static'){
        creativeText = value(form,'static_text');
        creativeContact = value(form,'static_contact');
      }
      if (designType === 'video'){
        creativeText = value(form,'video_text');
        creativeContact = value(form,'video_contact');
      }

      const record = {
        id,
        createdAt:new Date().toISOString(),
        status:'new',
        company:value(form,'company'),
        name:value(form,'name'),
        phone:value(form,'phone'),
        email:value(form,'email'),
        package:value(form,'package'),
        packageLabel:orderData.packageLabel,
        packagePrice:orderData.packagePrice,
        designType,
        designLabel:orderData.designLabel,
        designPrice:orderData.designPrice,
        total:orderData.total,
        locations:value(form,'locations'),
        preferredScreenIds:value(form,'preferred_screen_ids')
          .split(',')
          .map(x => x.trim())
          .filter(Boolean),
        message:value(form,'message'),
        creativeText,
        creativeContact,
        files
      };
      requests.push(record);
      saveRequests(requests);
      return record;
    }
  };
})();
