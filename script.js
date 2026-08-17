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
  if (packageSelect && ['single', 'local', 'city'].includes(packageParam)) {
    packageSelect.value = packageParam;
    packageSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

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

  document.querySelectorAll('form[data-demo-form]').forEach(form => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      showToast('Формата е готова за свързване с реален email/бекенд преди публичния старт.');
    });
  });
});
