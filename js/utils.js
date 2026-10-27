/* =====================================================================
   utils.js — utilidades compartidas, avisos emergentes (toast) y modal.
   Espacio de nombres global: window.App
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  App.byId = (id) => document.getElementById(id);

  App.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Fechas ---------- */
  App.isoLocal = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };
  App.today = () => App.isoLocal(new Date());
  App.addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return App.isoLocal(d);
  };
  App.fmtDate = (iso) =>
    /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : iso || '';
  App.fmtDateTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  };

  /* ---------- Etiquetas de importancia / riesgo ---------- */
  App.tagClass = (v) => {
    const s = String(v).toLowerCase();
    if (s.startsWith('cr')) return 'critica';
    if (s.startsWith('alt')) return 'alta';
    if (s.startsWith('med')) return 'media';
    if (s.startsWith('baj')) return 'baja';
    return '';
  };
  App.tag = (v) => '<span class="tag ' + App.tagClass(v) + '">' + App.esc(v) + '</span>';

  /* ---------- Fichas (resumen estructurado por secciones) ----------
     sections: [{ titulo, filas: [[etiqueta, valor, formato?]] }]
     formato: 'tag' | 'mono' | 'code' | 'long' */
  App.sectionsHTML = (sections, editable) =>
    sections
      .map((s, i) => {
        const fields = s.filas
          .map((r) => {
            const label = r[0];
            const rawVal = r[1];
            const fmt = r[2] || '';
            const isEmpty = rawVal == null || String(rawVal).trim() === '';
            const isLong = fmt === 'long' || fmt === 'code' || (!isEmpty && (String(rawVal).includes('\n') || String(rawVal).length > 70));

            let valHtml = '';
            if (isEmpty) {
              valHtml = '<span class="preview-empty">No especificado</span>';
            } else if (fmt === 'tag') {
              valHtml = App.tag(rawVal);
            } else if (fmt === 'code' || (fmt === 'mono' && String(rawVal).includes('\n'))) {
              valHtml = '<pre class="preview-code"><code>' + App.esc(rawVal) + '</code></pre>';
            } else if (fmt === 'mono') {
              valHtml = '<span class="preview-mono">' + App.esc(rawVal) + '</span>';
            } else if (isLong) {
              valHtml = '<div class="preview-box">' + App.esc(rawVal) + '</div>';
            } else {
              valHtml = '<span class="preview-val">' + App.esc(rawVal) + '</span>';
            }

            return (
              '<div class="preview-field' + (isLong ? ' full' : '') + (isEmpty ? ' empty' : '') + '">' +
                '<span class="preview-label">' + App.esc(label) + '</span>' +
                '<div class="preview-content">' + valHtml + '</div>' +
              '</div>'
            );
          })
          .join('');

        return (
          '<div class="sum">' +
            '<div class="sum-head">' +
              '<h3 class="sum-title">' + App.esc(s.titulo) + '</h3>' +
              (editable ? '<button type="button" class="btn-sum-edit" data-edit="' + i + '"><span aria-hidden="true">✏</span> Editar sección</button>' : '') +
            '</div>' +
            '<div class="sum-grid">' + fields + '</div>' +
          '</div>'
        );
      })
      .join('');

  /* ---------- Descarga de archivos ---------- */
  App.download = (name, text, mime) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  App.top = () => {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* sin scroll */ }
  };

  /* =====================================================================
     Hook: useToast
     Encapsula la lógica de notificación temporal arriba a la derecha.
     - Duración predeterminada: 4 segundos (4000 ms).
     - Estados:
         ok   (verde)     -> Acciones completadas / satisfacción
         warn (amarillo)  -> Pendiente de envío / cuando no se guarda todavía
         err  (rojo)      -> Error de validación / no se pudo registrar
         info (azul)      -> Informativo
     ===================================================================== */
  App.useToast = function (options) {
    const opts = options || {};
    const defaultDuration = opts.duration != null ? opts.duration : 4000;

    function notify(message, kind, durationMs) {
      const type = (kind || 'ok').toLowerCase();
      const ms = durationMs != null ? durationMs : defaultDuration;
      const box = App.byId('toasts');
      if (!box) return null;

      const t = document.createElement('div');
      t.className = 'toast ' + type;
      t.setAttribute('role', (type === 'err' || type === 'error') ? 'alert' : 'status');

      const iconChar =
        (type === 'ok' || type === 'success') ? '✓' :
        (type === 'warn' || type === 'warning') ? '!' :
        (type === 'err' || type === 'error') ? '✕' : 'i';

      t.innerHTML =
        '<span class="ticon" aria-hidden="true">' + iconChar + '</span>' +
        '<div class="tmsg"></div>' +
        '<button type="button" class="tclose" aria-label="Cerrar aviso">×</button>';

      t.querySelector('.tmsg').textContent = message;

      let timer = null;
      const dismiss = () => {
        if (timer) clearTimeout(timer);
        t.classList.add('out');
        setTimeout(() => { if (t.parentNode) t.remove(); }, 220);
      };

      t.querySelector('.tclose').addEventListener('click', dismiss);
      box.appendChild(t);

      if (ms > 0) {
        timer = setTimeout(dismiss, ms);
      }

      return { dismiss };
    }

    return {
      notify,
      success: (msg, ms) => notify(msg, 'ok', ms),
      warning: (msg, ms) => notify(msg, 'warn', ms),
      error:   (msg, ms) => notify(msg, 'err', ms),
      info:    (msg, ms) => notify(msg, 'info', ms),
    };
  };

  // Instancia activa conectada al hook:
  const globalToastHook = App.useToast({ duration: 4000 });
  App.toast = (msg, kind, ms) => globalToastHook.notify(msg, kind, ms);
  App.toastSuccess = (msg, ms) => globalToastHook.success(msg, ms);
  App.toastWarning = (msg, ms) => globalToastHook.warning(msg, ms);
  App.toastError = (msg, ms) => globalToastHook.error(msg, ms);

  /* ---------- Modal ----------
     App.modal.open({ title, text, actions: [{ label, kind: 'sec'|'primary', onClick }] }) */
  let lastFocus = null;
  App.modal = {
    open(o) {
      const m = App.byId('modal');
      App.byId('modalTitle').textContent = o.title;
      App.byId('modalText').textContent = o.text;
      const box = App.byId('modalActions');
      box.innerHTML = '';
      o.actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn' + (a.kind === 'sec' ? ' sec' : '');
        b.textContent = a.label;
        b.addEventListener('click', () => {
          App.modal.close();
          if (a.onClick) a.onClick();
        });
        box.appendChild(b);
      });
      lastFocus = document.activeElement;
      m.hidden = false;
      const primary = box.querySelector('.btn:not(.sec)') || box.firstChild;
      if (primary) primary.focus();
    },
    close() {
      App.byId('modal').hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    },
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !App.byId('modal').hidden) App.modal.close();
  });
})();
