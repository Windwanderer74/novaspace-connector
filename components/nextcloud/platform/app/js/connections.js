(() => {
  'use strict';
  const refresh = (form) => {
    for (const area of form.querySelectorAll('.ns-app-access[data-app]')) {
      const mode = area.querySelector('[data-area-mode]').value;
      const parent = form.querySelector(`select[name="apps[${area.dataset.app}]"]`);
      const main = form.querySelector('select[name="enabled"]').value;
      const restricted = [...area.querySelectorAll('input[type="checkbox"]')]
        .some(input => !input.checked && (mode === 'write' || (mode === 'read' && input.dataset.write === '0')));
      const inactive = main === '0' || mode === 'off' || parent?.value === 'off';
      area.dataset.inactive = String(inactive);
      area.querySelector('.ns-selection-state').textContent = inactive
        ? 'Bereich gesperrt · Detailauswahl bleibt gespeichert'
        : restricted ? 'Individuell eingeschränkt' : 'Alle Funktionen innerhalb der gewählten Zugriffsstufe ausgewählt';
    }
  };
  const start = () => {
    for (const form of document.querySelectorAll('form.ns-access')) {
      form.addEventListener('change', () => refresh(form));
      refresh(form);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
