document.addEventListener('DOMContentLoaded', () => {
  const menuButton = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav-links');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => nav.classList.toggle('open'));
  }

  const current = document.body.dataset.page;
  document.querySelectorAll('[data-page-link]').forEach(link => {
    if (link.dataset.pageLink === current) link.classList.add('active');
  });

  document.querySelectorAll('.faq-question').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(openItem => {
        openItem.classList.remove('open');
        openItem.querySelector('.faq-answer').style.maxHeight = null;
      });
      if (!wasOpen) {
        item.classList.add('open');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });


  const params = new URLSearchParams(window.location.search);
  const locationParam = params.get('location');
  const locationsInput = document.querySelector('input[name="locations"]');
  if (locationParam && locationsInput && !locationsInput.value) {
    locationsInput.value = locationParam;
  }

  const packageParam = (params.get('package') || '').toLowerCase();
  const packageSelect = document.querySelector('select[name="package"]');

  // v4.7: reveal the right upload/details panel for the selected creative option.
  const designRadios = document.querySelectorAll('input[name="design"][data-design-type]');
  const designPanels = document.querySelectorAll('[data-design-panel]');

  function setPanelEnabled(panel, enabled){
    panel.hidden = !enabled;
    panel.querySelectorAll('input, textarea, select').forEach(control => {
      control.disabled = !enabled;
      control.required = false;
    });
    if (!enabled) return;
    const type = panel.dataset.designPanel;
    if (type === 'ready') {
      const file = panel.querySelector('input[name="ready_creative_file"]');
      if (file) file.required = true;
    }
    if (type === 'static') {
      const text = panel.querySelector('[name="static_text"]');
      const contact = panel.querySelector('[name="static_contact"]');
      if (text) text.required = true;
      if (contact) contact.required = true;
    }
    if (type === 'video') {
      const text = panel.querySelector('[name="video_text"]');
      const contact = panel.querySelector('[name="video_contact"]');
      if (text) text.required = true;
      if (contact) contact.required = true;
    }
  }

  function updateDesignPanel(){
    const checked = document.querySelector('input[name="design"][data-design-type]:checked');
    designPanels.forEach(panel => setPanelEnabled(panel, !!checked && panel.dataset.designPanel === checked.dataset.designType));
  }

  designRadios.forEach(radio => radio.addEventListener('change', updateDesignPanel));
  updateDesignPanel();


  // v4.8: live price summary. Payment happens only after manual approval.
  const summaryPackage = document.querySelector('[data-summary-package]');
  const summaryDesign = document.querySelector('[data-summary-design]');
  const summaryTotal = document.querySelector('[data-summary-total]');
  const summaryNote = document.querySelector('[data-summary-note]');

  const packageData = {
    single: { label: 'SINGLE — €25 / месец', price: 25, from: false },
    local: { label: 'LOCAL — €49 / месец', price: 49, from: false },
    city: { label: 'CITY — 4–5 екрана — €69 / месец', price: 69, from: false }
  };
  const designData = {
    ready: { label: 'Готова реклама — €0', price: 0 },
    static: { label: 'Статична визия — +€3 еднократно', price: 3 },
    video: { label: 'Анимирана рекламна визия — +€10 еднократно', price: 10 }
  };

  function updateOrderSummary(){
    if (!summaryPackage || !summaryDesign || !summaryTotal) return;
    const packageValue = packageSelect ? packageSelect.value : '';
    const checkedDesign = document.querySelector('input[name="design"][data-design-type]:checked');
    const pkg = packageData[packageValue];
    const design = checkedDesign ? designData[checkedDesign.dataset.designType] : null;

    summaryPackage.textContent = pkg ? pkg.label : 'Не е избран';
    summaryDesign.textContent = design ? design.label : 'Не е избрана';

    if (!pkg || !design) {
      summaryTotal.textContent = '—';
      if (summaryNote) summaryNote.textContent = 'Избери пакет и рекламна визия, за да видиш точната сума.';
      return;
    }

    const total = pkg.price + design.price;
    summaryTotal.textContent = `€${total}`;
    if (summaryNote) {
      summaryNote.textContent = 'Това е крайната сума за избрания пакет и рекламна визия. Плащането е след одобрение.';
    }
  }

  const requestForm = document.querySelector('form[data-ad-request-form]');
  if (requestForm) {
    // Event delegation makes the summary react reliably on mobile Safari as well.
    requestForm.addEventListener('change', (event) => {
      if (event.target.matches('select[name="package"], input[name="design"]')) {
        updateOrderSummary();
      }
    });
    requestForm.addEventListener('input', (event) => {
      if (event.target.matches('select[name="package"], input[name="design"]')) {
        updateOrderSummary();
      }
    });
    requestForm.addEventListener('click', (event) => {
      if (event.target.closest('.creative-option')) {
        requestAnimationFrame(updateOrderSummary);
      }
    });
  }
  if (packageSelect) packageSelect.addEventListener('change', updateOrderSummary);
  designRadios.forEach(radio => radio.addEventListener('change', updateOrderSummary));

  // Apply package coming from SINGLE / LOCAL / CITY buttons only after listeners exist.
  if (packageSelect && ['single', 'local', 'city'].includes(packageParam)) {
    packageSelect.value = packageParam;
    packageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  updateOrderSummary();
  setTimeout(updateOrderSummary, 0);

  // v5.0 — technical check for final advertising files.
  // Hard errors block submission; warnings are allowed but clearly shown.
  const AD_FILE_MAX_BYTES = 25 * 1024 * 1024;
  const AD_FILE_TYPES = new Set(['image/jpeg','image/png','video/mp4']);

  function humanBytes(bytes){
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/(1024*1024)).toFixed(1)} MB`;
  }

  function ratioLabel(width, height){
    if (!width || !height) return '—';
    const r = width / height;
    const near = (a,b,t=.035) => Math.abs(a-b) / b <= t;
    if (near(r,16/9)) return '16:9';
    if (near(r,9/16)) return '9:16';
    if (near(r,4/3)) return '4:3';
    if (near(r,1)) return '1:1';
    return `${(r >= 1 ? r : 1/r).toFixed(2)}:${r >= 1 ? '1' : (1/r).toFixed(2)}`;
  }

  function isStandardScreenRatio(width, height){
    if (!width || !height) return false;
    const r = width / height;
    const near = (a,b,t=.035) => Math.abs(a-b) / b <= t;
    return near(r,16/9) || near(r,9/16);
  }

  function loadImageMeta(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const data = {width:img.naturalWidth, height:img.naturalHeight, duration:null};
        URL.revokeObjectURL(url);
        resolve(data);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image-meta'));
      };
      img.src = url;
    });
  }

  function loadVideoMeta(file){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        const data = {
          width:video.videoWidth,
          height:video.videoHeight,
          duration:Number.isFinite(video.duration) ? video.duration : null
        };
        URL.revokeObjectURL(url);
        resolve(data);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('video-meta'));
      };
      video.src = url;
    });
  }

  async function inspectAdvertisingFile(file){
    const result = {
      file,
      valid:true,
      errors:[],
      warnings:[],
      details:[],
      width:null,
      height:null,
      duration:null
    };

    if (!file){
      result.valid = false;
      result.errors.push('Няма избран файл.');
      return result;
    }

    if (!AD_FILE_TYPES.has(file.type)){
      result.valid = false;
      result.errors.push('Разрешени са само JPG, PNG и MP4.');
      return result;
    }

    if (file.size > AD_FILE_MAX_BYTES){
      result.valid = false;
      result.errors.push('Файлът е по-голям от 25 MB.');
    }

    let meta;
    try{
      meta = file.type === 'video/mp4'
        ? await loadVideoMeta(file)
        : await loadImageMeta(file);
    }catch(e){
      result.valid = false;
      result.errors.push('Файлът не може да бъде прочетен коректно.');
      return result;
    }

    result.width = meta.width;
    result.height = meta.height;
    result.duration = meta.duration;

    const ratio = ratioLabel(meta.width, meta.height);
    result.details.push(file.type === 'video/mp4' ? 'MP4' : (file.type === 'image/png' ? 'PNG' : 'JPG'));
    result.details.push(`${meta.width}×${meta.height}`);
    result.details.push(ratio);
    result.details.push(humanBytes(file.size));

    const landscape = meta.width >= meta.height;
    const fullHD = landscape
      ? meta.width >= 1920 && meta.height >= 1080
      : meta.width >= 1080 && meta.height >= 1920;
    const HD = landscape
      ? meta.width >= 1280 && meta.height >= 720
      : meta.width >= 720 && meta.height >= 1280;

    if (!isStandardScreenRatio(meta.width, meta.height)){
      result.warnings.push(`Съотношението е ${ratio}. За телевизионен екран е най-добре 16:9 или 9:16.`);
    }

    if (!HD){
      result.warnings.push(`Резолюцията ${meta.width}×${meta.height} е ниска и може да изглежда неясно на телевизор.`);
    }else if (!fullHD){
      result.warnings.push(`Резолюцията е използваема, но Full HD (1920×1080 или 1080×1920) е по-добрият вариант.`);
    }

    if (file.type === 'video/mp4' && meta.duration != null){
      result.details.push(`${meta.duration.toFixed(1)} сек.`);
      if (meta.duration < 9.5 || meta.duration > 10.5){
        result.warnings.push(`Видеото е ${meta.duration.toFixed(1)} сек. Рекламният слот е фиксиран на 10 сек.`);
      }
    }

    return result;
  }

  function renderAdvertisingFileCheck(box, result){
    if (!box) return;
    box.hidden = false;
    const state = !result.valid ? 'error' : (result.warnings.length ? 'warning' : 'ok');
    const title = state === 'ok'
      ? '✓ Подходящо за излъчване'
      : state === 'warning'
        ? '⚠ Нужна е проверка'
        : '✕ Файлът не е подходящ';

    box.className = `ad-file-check ${state}`;
    box.innerHTML = `
      <div class="ad-file-check-head">
        <strong>${title}</strong>
        ${result.details?.length ? `<span>${result.details.join(' · ')}</span>` : ''}
      </div>
      ${result.errors?.length ? `<div class="ad-file-check-list">${result.errors.map(x => `<span>${x}</span>`).join('')}</div>` : ''}
      ${result.warnings?.length ? `<div class="ad-file-check-list">${result.warnings.map(x => `<span>${x}</span>`).join('')}</div>` : ''}
    `;
  }

  const readyCreativeInput = document.getElementById('readyCreativeFile');
  const readyCreativeCheck = document.getElementById('readyCreativeCheck');

  if (readyCreativeInput && readyCreativeCheck){
    readyCreativeInput.addEventListener('change', async () => {
      const file = readyCreativeInput.files?.[0];
      if (!file){
        readyCreativeInput.dataset.adValidation = '';
        readyCreativeCheck.hidden = true;
        readyCreativeCheck.innerHTML = '';
        return;
      }

      readyCreativeInput.dataset.adValidation = 'checking';
      readyCreativeCheck.hidden = false;
      readyCreativeCheck.className = 'ad-file-check checking';
      readyCreativeCheck.innerHTML = '<strong>Проверяваме файла…</strong>';

      const result = await inspectAdvertisingFile(file);
      if (readyCreativeInput.files?.[0] !== file) return;

      readyCreativeInput.dataset.adValidation = result.valid
        ? (result.warnings.length ? 'warning' : 'ok')
        : 'error';
      renderAdvertisingFileCheck(readyCreativeCheck, result);
    });
  }

  document.querySelectorAll('.real-file-input').forEach(input => {
    input.addEventListener('change', () => {
      const output = document.querySelector(`[data-file-output="${input.id}"]`);
      if (!output) return;
      const files = Array.from(input.files || []);
      if (!files.length) {
        output.textContent = input.multiple ? 'Няма избрани файлове' : 'Няма избран файл';
        output.classList.remove('has-file');
        return;
      }
      output.textContent = files.map(file => file.name).join(', ');
      output.classList.add('has-file');
    });
  });

  const toast = document.querySelector('.toast');
  function showToast(message){
    if(!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4200);
  }

  document.querySelectorAll('form[data-partner-form]').forEach(form => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      showToast('Формата е попълнена коректно. В demo режима предложението още не се изпраща към сървър.');
    });
  });

  document.querySelectorAll('form[data-ad-request-form]').forEach(form => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const packageValue = packageSelect ? packageSelect.value : '';
      const checkedDesign = document.querySelector('input[name="design"][data-design-type]:checked');
      const pkg = packageData[packageValue];
      const design = checkedDesign ? designData[checkedDesign.dataset.designType] : null;
      if (!pkg || !design) {
        showToast('Избери пакет и рекламна визия.');
        return;
      }

      if (checkedDesign?.dataset.designType === 'ready' && readyCreativeInput){
        const validation = readyCreativeInput.dataset.adValidation || '';
        if (validation === 'checking'){
          showToast('Изчакай проверката на рекламния файл.');
          return;
        }
        if (validation === 'error'){
          showToast('Рекламният файл има технически проблем. Провери съобщението под файла.');
          readyCreativeCheck?.scrollIntoView({behavior:'smooth', block:'center'});
          return;
        }
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Изпращане...';
      }

      try {
        if (window.KSDemoBridge) {
          const request = await window.KSDemoBridge.submit(form, {
            packageLabel: pkg.label,
            packagePrice: pkg.price,
            designLabel: design.label,
            designPrice: design.price,
            total: pkg.price + design.price
          });
          sessionStorage.setItem('ks_last_submission_v1', JSON.stringify({
            id: request.id,
            email: request.email,
            total: request.total,
            packageLabel: request.packageLabel,
            designLabel: request.designLabel,
            createdAt: request.createdAt
          }));
          window.location.href = 'zayavka-poluchena.html';
        } else {
          showToast('Заявката е готова, но demo bridge не е зареден.');
        }
      } catch (error) {
        console.error(error);
        showToast('Възникна грешка при запазването на тестовата заявка.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  });
});
