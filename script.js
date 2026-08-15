document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.mobile-toggle');
  const nav = document.querySelector('.nav-links');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
  }

  document.querySelectorAll('[data-page-link]').forEach((link) => {
    if (document.body.dataset.page === link.dataset.pageLink) {
      link.classList.add('active');
    }
  });

  const requestForm = document.querySelector('#requestForm');
  if (requestForm) {
    requestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(requestForm);
      const body = [
        `Фирма: ${data.get('company') || ''}`,
        `Лице за контакт: ${data.get('name') || ''}`,
        `Телефон: ${data.get('phone') || ''}`,
        `Email: ${data.get('email') || ''}`,
        `Пакет: ${data.get('package') || ''}`,
        `Период: ${data.get('period') || ''}`,
        `Предпочитани локации: ${data.get('screens') || ''}`,
        `Готова реклама: ${data.get('creative') || ''}`,
        `Бележка: ${data.get('message') || ''}`
      ].join('\n');
      const subject = encodeURIComponent('Запитване за реклама — Kyustendil Screen');
      window.location.href = `mailto:info@kyustendilscreen.bg?subject=${subject}&body=${encodeURIComponent(body)}`;
    });
  }

  const partnerForm = document.querySelector('#partnerForm');
  if (partnerForm) {
    partnerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(partnerForm);
      const body = [
        `Обект: ${data.get('business') || ''}`,
        `Лице за контакт: ${data.get('name') || ''}`,
        `Телефон: ${data.get('phone') || ''}`,
        `Адрес: ${data.get('address') || ''}`,
        `Тип локация: ${data.get('type') || ''}`,
        `Бележка: ${data.get('message') || ''}`
      ].join('\n');
      const subject = encodeURIComponent('Нова партньорска локация — Kyustendil Screen');
      window.location.href = `mailto:info@kyustendilscreen.bg?subject=${subject}&body=${encodeURIComponent(body)}`;
    });
  }
});
