 'use strict';
function showToast(message, error = false) {
  document.querySelectorAll('.toast').forEach(node => node.remove());
  const toast = document.createElement('div');
  toast.className = error ? 'toast toast-error' : 'toast';
  toast.setAttribute('role', error ? 'alert' : 'status');
  const text = document.createElement('span'); text.textContent = message;
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Cerrar notificación');
  close.addEventListener('click', () => toast.remove());
  toast.append(text, close); document.body.append(toast);
  setTimeout(() => toast.remove(), error ? 10000 : 5000);
}
const initialToast = document.querySelector('.toast');
if (initialToast) showToast(initialToast.textContent);
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.matches('.delete-draft')) return;
  event.preventDefault();
  const selected = document.querySelector('[data-campaign]')?.dataset.campaign === form.elements.id.value;
  if (selected && document.querySelector('#draft-editor')?.dataset.unsaved === 'true') {
    showToast('Esperá a que terminen de guardarse los cambios.', true); return;
  }
  if (!window.confirm('¿Eliminar este borrador?')) return;
  const button = form.querySelector('button'); button.disabled = true;
  const data = new FormData(form); data.set('ajax', '1');
  try {
    const response = await fetch(window.location.href, {method:'POST', body:data});
    let result;
    try { result = await response.json(); } catch (_) { throw Error('No se pudo confirmar la eliminación. Recargá la página para revisar el estado.'); }
    if (!response.ok) throw Error(result.error || 'No se pudo eliminar el borrador.');
    form.closest('tr').remove();
    if (selected) document.dispatchEvent(new Event('draft-deleted'));
    showToast(result.message);
  } catch (error) { showToast(error.message, true); button.disabled = false; }
});
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
  let sendingEnabled = campaignPanel.dataset.enabled === '1';
  let ready = campaignPanel.dataset.ready === '1';
  let pending = Number(document.querySelector('.recipient-total strong').textContent);
  const updateButtons = () => { editor.dataset.unsaved = String(dirty || saving); sendButtons.forEach((button, i) => {
    button.disabled = dirty || saving || !ready || !sendingEnabled || (i === 1 && pending === 0);
  }); };
  document.addEventListener('draft-deleted', () => {
    clearTimeout(timer); dirty = false; ready = false;
    editor.querySelectorAll('input,textarea,button').forEach(control => { control.disabled = true; });
    status.textContent = 'Borrador eliminado'; updateButtons();
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
      const history = document.querySelector('.history tbody');
      if (![...history.querySelectorAll('a')].some(link => new URL(link.href).searchParams.get('id') === result.id)) {
        const row = document.createElement('tr');
        const date = document.createElement('td'); date.textContent = result.created;
        const title = document.createElement('td'); const link = document.createElement('a'); link.href = '?id=' + result.id; title.append(link);
        const state = document.createElement('td'); state.textContent = 'Borrador';
        const actions = document.createElement('td');
        const remove = document.createElement('form'); remove.method = 'post'; remove.className = 'delete-draft';
        for (const [name,value] of Object.entries({action:'delete',id:result.id,csrf:editor.elements.csrf.value})) {
          const input=document.createElement('input'); input.type='hidden'; input.name=name; input.value=value; remove.append(input);
        }
        const button=document.createElement('button'); button.className='secondary compact'; button.textContent='Eliminar borrador'; remove.append(button); actions.append(remove);
        row.append(date, title, state, actions); history.prepend(row);
      }
      document.querySelectorAll('.history a').forEach(link => {
        if (new URL(link.href).searchParams.get('id') === campaignPanel.dataset.campaign) link.textContent = result.subject || 'Informe sin título';
      });
      ready = result.ready;
      window.history.replaceState(null, '', '?id=' + encodeURIComponent(result.id));
      document.querySelector('#loaded-pdf').hidden = !result.pdf;
      document.querySelector('[data-toggle="pdf-editor"]').textContent = result.pdf ? 'Cambiar PDF' : 'Cargar PDF';
      document.querySelector('[data-toggle="contacts-editor"]').textContent = result.emails.length ? 'Editar contactos' : 'Cargar contactos';
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
    doc.querySelector('[data-preview-subject]').textContent = subject.value || 'Asunto del informe';
    const text = doc.querySelector('[data-preview-body]');
    text.replaceChildren();
    (body.value || 'El mensaje de tu newsletter aparecerá acá.').split('\n').forEach((line, i) => {
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
