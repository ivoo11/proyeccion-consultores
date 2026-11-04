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
  let submitting = false;
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
  editor.addEventListener('input', event => {
    dirty = true;
    status.textContent = 'Cambios sin guardar';
    document.querySelectorAll('.send-form button').forEach(button => { button.disabled = true; });
    if (event.target.name === 'emails') editor.elements.contacts_mode.value = 'text';
    if (event.target === subject || event.target === body) render();
  });
  editor.elements.contacts.addEventListener('change', () => {
    editor.elements.emails.disabled = editor.elements.contacts.files.length > 0;
  });
  editor.addEventListener('submit', () => { submitting = true; });
  window.addEventListener('beforeunload', event => {
    if (dirty && !submitting) { event.preventDefault(); event.returnValue = ''; }
  });
  if (document.querySelector('.alert.error')) {
    status.textContent = 'Revisá los cambios. Si elegiste archivos, volvé a seleccionarlos.';
    document.querySelectorAll('.send-form button').forEach(button => { button.disabled = true; });
  }
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
