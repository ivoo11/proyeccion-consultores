'use strict';
const editor = document.querySelector('#draft-editor');
const campaignPanel = document.querySelector('[data-campaign]');
for (const button of document.querySelectorAll('[data-toggle]')) {
  button.addEventListener('click', () => {
    const panel = document.getElementById(button.dataset.toggle);
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  });
}
if (editor) {
  const status = document.querySelector('#save-status');
  const frame = document.querySelector('.preview iframe');
  const subject = editor.elements.subject;
  const body = editor.elements.body;
  let template;
  let dirty = false;
  let saving = false;
  let generation = 0;
  let emailGeneration = 0;
  let timer;
  const sendButtons = [...document.querySelectorAll('.send-form button')];
  let sendingEnabled = !sendButtons[0].disabled;
  let pending = Number(document.querySelector('.recipient-total strong').textContent);
  const updateButtons = () => sendButtons.forEach((button, i) => {
    button.disabled = dirty || saving || !sendingEnabled || (i === 1 && pending === 0);
  });
  const save = async () => {
    clearTimeout(timer);
    if (saving || !dirty) return;
    if (!editor.reportValidity()) { status.textContent = 'Completá los campos para guardar.'; return; }
    saving = true;
    const revision = generation;
    const emailRevision = emailGeneration;
    const selectedPdf = editor.elements.pdf.files[0];
    const selectedContacts = editor.elements.contacts.files[0];
    const data = new FormData(editor);
    data.set('autosave', '1');
    status.textContent = 'Guardando…';
    updateButtons();
    let success = false;
    try {
      const response = await fetch(window.location.href, {method: 'POST', body: data});
      let result;
      try { result = await response.json(); } catch (_) { throw Error('No se pudo guardar. Revisá la conexión o recargá la página si venció la sesión.'); }
      if (!response.ok) throw Error(result.error || 'No se pudo guardar.');
      document.querySelectorAll('input[name="version"]').forEach(input => { input.value = result.version; });
      if (editor.elements.pdf.files[0] === selectedPdf) editor.elements.pdf.value = '';
      if (editor.elements.contacts.files[0] === selectedContacts) editor.elements.contacts.value = '';
      editor.elements.emails.disabled = editor.elements.contacts.files.length > 0;
      if (emailGeneration === emailRevision) {
        editor.elements.emails.value = result.emails.join('\n');
        editor.elements.contacts_mode.value = '';
      }
      document.querySelectorAll('.history a').forEach(link => {
        if (new URL(link.href).searchParams.get('id') === campaignPanel.dataset.campaign) link.textContent = result.subject;
      });
      pending = result.pending;
      sendingEnabled = result.enabled;
      document.querySelector('.recipient-total strong').textContent = pending;
      const stats = document.querySelector('.recipient-summary .import-stats');
      stats.replaceChildren();
      const report = result.report;
      const labels = [`${report.duplicates || 0} duplicados`, `${(report.invalid || []).length} inválidos`, `${report.blank || 0} celdas vacías`];
      if (report.suppressed) labels.push(`${report.suppressed} dados de baja`);
      labels.forEach(label => { const span = document.createElement('span'); span.textContent = label; stats.append(span); });
      const errors = document.querySelector('#import-errors');
      errors.replaceChildren();
      if (report.invalid?.length) {
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = 'Ver correos inválidos';
        const list = document.createElement('ul');
        report.invalid.slice(0,100).forEach(item => { const li = document.createElement('li'); li.textContent = `Fila ${item.row}: ${item.value}`; list.append(li); });
        details.append(summary,list); errors.append(details);
      }
      sendButtons[1].textContent = `Enviar a ${pending} contactos`;
      dirty = generation !== revision;
      status.textContent = dirty ? 'Guardando…' : 'Guardado';
      success = true;
    } catch (error) {
      status.textContent = error.message + ' Los cambios siguen en pantalla.';
    } finally {
      saving = false;
      updateButtons();
      if (success && dirty) timer = setTimeout(save, 250);
    }
  };
  const render = () => {
    if (!template) return;
    const doc = new DOMParser().parseFromString(template, 'text/html');
    doc.querySelector('[data-preview-subject]').textContent = subject.value;
    const text = doc.querySelector('[data-preview-body]');
    text.replaceChildren();
    body.value.split('\n').forEach((line, i) => {
      if (i) text.append(doc.createElement('br'));
      text.append(doc.createTextNode(line));
    });
    doc.title = subject.value;
    frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
  };
  fetch(frame.src).then(r => { if (!r.ok) throw Error(); return r.text(); }).then(html => {
    if (!html.includes('data-preview-subject')) throw Error();
    template = html; render();
  }).catch(() => { status.textContent = 'No se pudo cargar la vista previa en vivo. Recargá la página.'; });
  const changed = event => {
    dirty = true;
    generation++;
    status.textContent = 'Guardando…';
    updateButtons();
    if (event.target.name === 'emails') {
      emailGeneration++;
      editor.elements.contacts_mode.value = 'text';
    }
    if (event.target === subject || event.target === body) render();
    clearTimeout(timer);
    timer = setTimeout(save, event.target.type === 'file' ? 0 : 800);
  };
  editor.addEventListener('input', event => { if (event.target.type !== 'file') changed(event); });
  editor.addEventListener('change', event => {
    if (event.target.type === 'file') {
      editor.elements.emails.disabled = editor.elements.contacts.files.length > 0;
      changed(event);
    }
  });
  editor.addEventListener('focusout', () => { if (dirty && !saving) { clearTimeout(timer); timer = setTimeout(save, 0); } });
  editor.addEventListener('submit', event => { event.preventDefault(); save(); });
  document.querySelectorAll('.send-form').forEach(form => form.addEventListener('submit', event => {
    if (dirty || saving) { event.preventDefault(); save(); }
  }));
  window.addEventListener('online', () => { if (dirty) save(); });
  window.addEventListener('beforeunload', event => {
    if (dirty || saving) { event.preventDefault(); event.returnValue = ''; }
  });

}
if (campaignPanel && !editor) {
  let snapshot = campaignPanel.dataset.status;
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch('status.php?id=' + encodeURIComponent(campaignPanel.dataset.campaign));
      if (!response.ok) return;
      const next = JSON.stringify(await response.json());
      if (snapshot !== undefined && snapshot !== next) location.reload();
      snapshot = next;
    } catch (_) { /* Retry on the next interval. */ }
  }, 10000);
}
