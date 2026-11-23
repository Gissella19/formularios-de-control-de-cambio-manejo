/* =====================================================================
   review.js — gestión de solicitudes por el Comité CCB (estilo Jira).

   - Tablero por estados (arrastrar tarjetas) con las transiciones del flujo.
   - Panel de gestión en el detalle: cambiar estado, asignarse la revisión,
     modificar la solicitud.
   - Bitácora de actividad (cambios de estado, ediciones, asignaciones y
     comentarios). Los comentarios los pueden escribir todos los roles;
     el resto de acciones son solo del comité.
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = App.byId;
  const W = () => App.Workflow;

  let curId = null;      // solicitud abierta en el detalle
  let dragId = null;     // tarjeta que se está arrastrando
  let editId = null;     // solicitud en edición
  let editFields = [];
  let editValidator = null;
  let decisionCb = null;
  let decisionRequired = false;
  let lastFocus = null;

  const isCommittee = (u) => !!u && u.role === 'comite';
  const initials = (name) =>
    String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

  /* ===================================================================
     TABLERO
     =================================================================== */
  function cardHTML(r) {
    const clase = W().claseOf(r);
    const urgent = String(clase).toLowerCase().startsWith('eme');
    const asg = r.asignado && r.asignado.nombre;
    const sol = App.History.getSolicitante(r);
    return (
      '<article class="board-card' + (urgent ? ' urgent' : '') + '" draggable="true" tabindex="0" ' +
        'data-id="' + App.esc(r.id) + '" aria-label="' + App.esc(r.id + ': ' + r.titulo) + '">' +
        '<div class="bc-top"><span class="mono hist-code">' + App.esc(r.id) + '</span>' + App.claseBadge(clase) + '</div>' +
        '<div class="bc-title">' + App.esc(r.titulo) + '</div>' +
        '<div class="bc-meta">' + (r.prioridad ? App.tag(r.prioridad) : '') +
          (r.fechaDeseada ? '<span class="bc-date">Para ' + App.esc(App.fmtDate(r.fechaDeseada)) + '</span>' : '') + '</div>' +
        '<div class="bc-foot"><span class="hist-type-badge ' + (r.tipo === 'tecnica' ? 'tecnica' : 'usuario') + '">' +
          (r.tipo === 'tecnica' ? 'Técnica' : 'Usuario') + '</span>' +
          '<span class="bc-sol">' + App.esc(sol) + '</span>' +
          (asg ? '<span class="avatar" title="Revisor asignado: ' + App.esc(asg) + '">' + App.esc(initials(asg)) + '</span>' : '') +
        '</div>' +
      '</article>'
    );
  }

  function renderBoard(box, list) {
    const urgentFirst = (a, b) =>
      (String(W().claseOf(b)).toLowerCase().startsWith('eme') ? 1 : 0) -
      (String(W().claseOf(a)).toLowerCase().startsWith('eme') ? 1 : 0);

    box.innerHTML = W().STATES.map((s) => {
      const items = list.filter((r) => W().normalize(r.estado) === s.id).sort(urgentFirst);
      return (
        '<section class="board-col st-' + s.cls + '" data-state="' + App.esc(s.id) + '" aria-label="' + App.esc(s.id) + '">' +
          '<header class="board-col-head" title="' + App.esc(s.desc) + '">' +
            '<span class="board-col-title">' + App.esc(s.id) + '</span>' +
            '<span class="board-col-count">' + items.length + '</span>' +
          '</header>' +
          '<div class="board-cards">' +
            (items.length ? items.map(cardHTML).join('') : '<p class="board-empty">Sin solicitudes</p>') +
          '</div>' +
        '</section>'
      );
    }).join('');
  }

  function openRecord(id) {
    const rec = App.store.get(id);
    if (rec) App.History.detail(rec);
  }

  function clearDrag(box) {
    box.querySelectorAll('.board-col').forEach((c) => c.classList.remove('drop-ok', 'drop-no', 'drop-over'));
    box.querySelectorAll('.board-card.dragging').forEach((c) => c.classList.remove('dragging'));
  }

  function initBoard() {
    const box = $('histBoard');
    if (!box) return;

    box.addEventListener('click', (e) => {
      const c = e.target.closest('.board-card');
      if (c) openRecord(c.getAttribute('data-id'));
    });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const c = e.target.closest('.board-card');
      if (c) { e.preventDefault(); openRecord(c.getAttribute('data-id')); }
    });

    box.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.board-card');
      if (!c) return;
      dragId = c.getAttribute('data-id');
      c.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* sin dataTransfer */ }
      const rec = App.store.get(dragId);
      const from = rec ? W().normalize(rec.estado) : '';
      const allowed = W().transitionsFrom(from).map((t) => t.to);
      box.querySelectorAll('.board-col').forEach((col) => {
        const st = col.getAttribute('data-state');
        if (allowed.indexOf(st) >= 0) col.classList.add('drop-ok');
        else if (st !== from) col.classList.add('drop-no');
      });
    });
    box.addEventListener('dragover', (e) => {
      const col = e.target.closest('.board-col');
      if (col && col.classList.contains('drop-ok')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drop-over');
      }
    });
    box.addEventListener('dragleave', (e) => {
      const col = e.target.closest('.board-col');
      if (col && !col.contains(e.relatedTarget)) col.classList.remove('drop-over');
    });
    box.addEventListener('drop', (e) => {
      const col = e.target.closest('.board-col');
      if (!col || !col.classList.contains('drop-ok')) return;
      e.preventDefault();
      const id = dragId;
      clearDrag(box);
      dragId = null;
      if (id) transition(id, col.getAttribute('data-state'));
    });
    box.addEventListener('dragend', () => { clearDrag(box); dragId = null; });
  }

  /* ===================================================================
     TRANSICIONES DE ESTADO
     =================================================================== */
  function transition(id, to) {
    const rec = App.store.get(id);
    if (!rec) return;
    const from = W().normalize(rec.estado);
    const t = W().transitionsFrom(from).find((x) => x.to === to);
    if (!t) {
      App.toastWarning('No se puede pasar de «' + from + '» a «' + to + '» directamente.');
      return;
    }
    const need = W().needsComment(to);
    openDecision({
      title: t.label,
      text: rec.id + ' · ' + rec.titulo + ' — ' + from + ' → ' + to,
      label: need ? 'Motivo (obligatorio; lo verá el solicitante)' : 'Comentario (opcional)',
      required: need,
      confirm: t.label,
      kind: t.kind,
      onConfirm(comment) {
        const upd = App.store.update(id, (r) => {
          r.estado = to;
          W().log(r, W().activity('estado', App.user, { de: from, a: to, comentario: comment }));
        });
        if (!upd) return;
        App.toastSuccess(rec.id + ': ' + from + ' → ' + to + '.');
        if (App.view === 'detail') App.History.detail(upd); else App.History.refresh();
      },
    });
  }

  /* ---------- Diálogo de decisión ---------- */
  function openDecision(o) {
    $('decTitle').textContent = o.title;
    $('decText').textContent = o.text;
    $('decLabel').textContent = o.label;
    $('decComment').value = '';
    $('decErr').hidden = true;
    $('decOk').textContent = o.confirm;
    $('decOk').className = 'btn tr-' + (o.kind || 'neutral');
    decisionCb = o.onConfirm;
    decisionRequired = !!o.required;
    lastFocus = document.activeElement;
    $('decisionModal').hidden = false;
    $('decComment').focus();
  }
  function closeDecision() {
    $('decisionModal').hidden = true;
    decisionCb = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function initDecision() {
    $('decisionForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const comment = $('decComment').value.trim();
      if (decisionRequired && comment.length < 5) {
        $('decErr').textContent = 'Escriba al menos 5 caracteres (' + comment.length + '/5).';
        $('decErr').hidden = false;
        $('decComment').focus();
        return;
      }
      const cb = decisionCb;
      closeDecision();
      if (cb) cb(comment);
    });
    $('decCancel').addEventListener('click', closeDecision);
    $('decComment').addEventListener('input', () => { $('decErr').hidden = true; });
  }

  /* ===================================================================
     EDICIÓN DE LA SOLICITUD
     =================================================================== */
  /* Opciones de un <select> tomadas de las plantillas de los formularios (sin duplicar listas). */
  function opts(tpl, id) {
    const sel = $(tpl).content.querySelector('#' + id);
    return sel ? [].slice.call(sel.options).filter((o) => o.value !== '').map((o) => o.value) : [];
  }

  function techFields() {
    const T = (key, label, kind, extra) => Object.assign({
      key, label, kind,
      get: (r) => (r.datos && r.datos[key]) || '',
      set: (r, v) => { r.datos[key] = v; },
    }, extra);
    const D = (id) => opts('tpl-dev-form', id);
    return [
      T('claseCambio', 'Tipo de cambio', 'select', { options: App.TIPOS_CAMBIO }),
      T('tipoCambio', 'Naturaleza del cambio', 'select', { options: D('tipoCambio') }),
      T('prioridad', 'Prioridad', 'select', { options: D('prioridad') }),
      T('origen', 'Origen de la solicitud', 'select', { options: D('origen') }),
      T('sistema', 'Sistema o módulo afectado', 'text', { min: 3 }),
      T('fechaRequerida', 'Fecha requerida de pase', 'date'),
      T('riesgo', 'Nivel de riesgo', 'select', { options: D('riesgo') }),
      T('ambiente', 'Ambiente de implementación', 'select', { options: D('ambiente') }),
      T('descripcion', 'Descripción del cambio', 'textarea', { min: 25, full: true }),
      T('justificacion', 'Justificación del cambio', 'textarea', { min: 25, full: true }),
      T('pruebas', 'Pruebas y cobertura', 'textarea', { min: 20, full: true }),
      T('rollback', 'Plan de reversión (rollback)', 'textarea', { min: 20, full: true, mono: true }),
    ];
  }

  function userFields() {
    const C = (key, label, kind, extra) => Object.assign({
      key, label, kind,
      get: (r) => (r.cambio && r.cambio[key]) || '',
      set: (r, v) => { r.cambio[key] = v; },
    }, extra);
    const U = (id) => opts('tpl-user-form', id);
    return [
      C('titulo', 'Título corto', 'text', { min: 5, full: true }),
      C('tipo', 'Tipo de cambio', 'select', { options: U('tipo') }),
      C('categoria', 'Categoría', 'select', { options: U('categoria') }),
      C('sistema', 'Sistema o aplicación', 'text', { min: 2 }),
      { key: 'prioridad', label: 'Importancia', kind: 'select', options: ['Alta', 'Media', 'Baja'],
        get: (r) => r.prioridad || '', set: (r, v) => { r.prioridad = v; } },
      { key: 'fechaDeseada', label: 'Fecha deseada', kind: 'date',
        get: (r) => r.fechaDeseada || '', set: (r, v) => { r.fechaDeseada = v; r.planificacion.fechaDeseada = v; } },
      C('descripcion', 'Descripción', 'textarea', { min: 20, full: true }),
      C('justificacion', 'Motivo / beneficio', 'textarea', { min: 15, full: true }),
      { key: 'aceptacion', label: 'Criterio de éxito', kind: 'textarea', optional: true, full: true,
        get: (r) => (r.planificacion && r.planificacion.criteriosAceptacion) || '',
        set: (r, v) => { r.planificacion.criteriosAceptacion = v; } },
      C('referencias', 'Referencia / enlace', 'text', { optional: true, full: true }),
    ];
  }

  /* Tras editar, se recalculan los campos derivados y la ficha impresa. */
  function finalize(r) {
    if (r.tipo === 'tecnica') {
      const d = r.datos;
      r.titulo = d.tipoCambio + ': ' + d.sistema;
      r.prioridad = d.prioridad;
      r.fechaDeseada = d.fechaRequerida;
      r.secciones = App.DevForm.buildSections(d);
    } else {
      r.titulo = r.cambio.titulo;
      r.secciones = App.UserForm.buildSections(r);
    }
  }

  function controlHTML(f, value) {
    const id = 'ed-' + f.key;
    if (f.kind === 'select') {
      const list = f.options.slice();
      if (value && list.indexOf(value) < 0) list.push(value);
      return '<select id="' + id + '"><option value="">Seleccione…</option>' +
        list.map((o) => '<option value="' + App.esc(o) + '"' + (o === value ? ' selected' : '') + '>' + App.esc(o) + '</option>').join('') +
        '</select>';
    }
    if (f.kind === 'textarea') {
      return '<textarea id="' + id + '"' + (f.mono ? ' class="mono"' : '') + '>' + App.esc(value) + '</textarea>';
    }
    return '<input id="' + id + '" type="' + (f.kind === 'date' ? 'date' : 'text') + '" value="' + App.esc(value) + '" />';
  }

  function openEdit(id) {
    const rec = App.store.get(id);
    if (!rec) return;
    if (W().isClosed(rec.estado)) {
      App.toastWarning('La solicitud está implementada (cerrada) y ya no se puede modificar.');
      return;
    }
    editId = id;
    editFields = rec.tipo === 'tecnica' ? techFields() : userFields();

    $('editText').textContent = rec.id + ' · ' + rec.titulo;
    $('editFields').innerHTML =
      editFields.map((f) =>
        '<div class="f' + (f.full ? ' full' : '') + '">' +
          '<label class="l' + (f.optional ? '' : ' req') + '" for="ed-' + f.key + '">' + App.esc(f.label) + '</label>' +
          controlHTML(f, String(f.get(rec) || '')) +
        '</div>').join('') +
      '<div class="f full edit-reason">' +
        '<label class="l req" for="ed-motivo">Motivo de la modificación (queda en el historial)</label>' +
        '<textarea id="ed-motivo" placeholder="Ej: Se ajusta la prioridad según lo acordado en la reunión del comité."></textarea>' +
      '</div>';

    const spec = {};
    editFields.forEach((f) => { spec['ed-' + f.key] = { min: f.min, optional: f.optional }; });
    spec['ed-motivo'] = { min: 5 };
    editValidator = App.createValidator($('editForm'), { fields: spec, steps: [Object.keys(spec)] });
    editValidator.bind();

    lastFocus = document.activeElement;
    $('editModal').hidden = false;
    const first = $('editFields').querySelector('select,input,textarea');
    if (first) first.focus();
  }
  function closeEdit() {
    $('editModal').hidden = true;
    editId = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function submitEdit(e) {
    e.preventDefault();
    if (!editValidator.validateStep(0)) {
      App.toastError('No se pudo guardar. Corrija los campos marcados en rojo.');
      return;
    }
    const rec = App.store.get(editId);
    if (!rec) { closeEdit(); return; }

    const cambios = [];
    editFields.forEach((f) => {
      const nuevo = ($('ed-' + f.key).value || '').trim();
      const antes = String(f.get(rec) || '').trim();
      if (nuevo !== antes) cambios.push({ f, campo: f.label, antes, despues: nuevo });
    });
    if (!cambios.length) {
      App.toast('No hay cambios que guardar: los valores son los mismos.', 'info');
      return;
    }
    const motivo = $('ed-motivo').value.trim();
    const id = editId;
    const upd = App.store.update(id, (r) => {
      r.cambio = r.cambio || {};
      r.planificacion = r.planificacion || {};
      cambios.forEach((c) => c.f.set(r, c.despues));
      finalize(r);
      W().log(r, W().activity('edicion', App.user, {
        cambios: cambios.map((c) => ({ campo: c.campo, antes: c.antes, despues: c.despues })),
        comentario: motivo,
      }));
    });
    closeEdit();
    if (upd) {
      App.toastSuccess('Solicitud ' + id + ' modificada (' + cambios.length + (cambios.length === 1 ? ' campo' : ' campos') + ').');
      App.History.detail(upd);
    }
  }

  /* ===================================================================
     DETALLE: panel de gestión + actividad
     =================================================================== */
  function dlRow(label, html) {
    return '<div class="side-row"><dt>' + App.esc(label) + '</dt><dd>' + html + '</dd></div>';
  }

  function sideHTML(rec, user) {
    const comite = isCommittee(user);
    const st = W().info(rec.estado);
    const trans = W().transitionsFrom(rec.estado);
    const sol = App.History.getSolicitante(rec);
    const sub = App.History.getSolicitanteSub(rec);
    const asg = rec.asignado && rec.asignado.nombre;
    const mine = asg && rec.asignado.usuario === user.usuario;

    let html =
      '<div class="side-card">' +
        '<h3 class="side-h">Estado</h3>' +
        '<div class="side-state">' + W().pill(rec.estado) + '</div>' +
        '<p class="side-note">' + App.esc(st.desc) + '</p>';
    if (comite) {
      html += trans.length
        ? '<div class="side-actions">' +
            trans.map((t) => '<button type="button" class="btn sm tr-' + t.kind + '" data-trans="' + App.esc(t.to) + '">' + App.esc(t.label) + '</button>').join('') +
          '</div>'
        : '<p class="side-note">Solicitud cerrada: no admite más transiciones.</p>';
    }
    html += '</div>';

    html +=
      '<div class="side-card">' +
        '<h3 class="side-h">Revisión</h3>' +
        '<dl class="side-dl">' +
          dlRow('Revisor asignado', asg ? '<span class="avatar">' + App.esc(initials(asg)) + '</span> ' + App.esc(asg) : '<span class="preview-empty">Sin asignar</span>') +
        '</dl>';
    if (comite) {
      html += '<div class="side-actions">' +
        (mine
          ? '<button type="button" class="btn sm sec" data-assign="none">Quitar asignación</button>'
          : '<button type="button" class="btn sm sec" data-assign="me">' + (asg ? 'Tomar revisión' : 'Asignarme') + '</button>') +
        (!W().isClosed(rec.estado) ? '<button type="button" class="btn sm sec" data-edit-rec="1">Modificar solicitud</button>' : '') +
        '</div>';
    }
    html += '</div>';

    html +=
      '<div class="side-card">' +
        '<h3 class="side-h">Detalles</h3>' +
        '<dl class="side-dl">' +
          dlRow('Tipo de solicitud', rec.tipo === 'tecnica' ? 'Técnica' : 'Usuario') +
          dlRow('Tipo de cambio', W().claseOf(rec) ? App.claseBadge(W().claseOf(rec)) : '<span class="preview-empty">No especificado</span>') +
          dlRow('Prioridad', rec.prioridad ? App.tag(rec.prioridad) : '—') +
          dlRow('Fecha deseada', App.esc(App.fmtDate(rec.fechaDeseada) || '—')) +
          dlRow('Solicitante', '<b>' + App.esc(sol) + '</b>' + (sub ? '<br><small>' + App.esc(sub) + '</small>' : '')) +
          dlRow('Creada', App.esc(App.fmtDateTime(rec.creada))) +
          dlRow('Actualizada', App.esc(App.fmtDateTime(rec.actualizada || rec.creada))) +
        '</dl>' +
      '</div>';
    return html;
  }

  const short = (v) => {
    const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!t) return '<i>(vacío)</i>';
    return App.esc(t.length > 140 ? t.slice(0, 140) + '…' : t);
  };

  function entryBody(a) {
    switch (a.tipo) {
      case 'creada':
        return 'creó la solicitud.';
      case 'estado':
        return 'cambió el estado: ' + W().pill(a.de) + ' <span aria-hidden="true">→</span> ' + W().pill(a.a) +
          (a.comentario ? '<div class="act-text">' + App.esc(a.comentario) + '</div>' : '');
      case 'edicion':
        return 'modificó la solicitud:' +
          '<ul class="act-changes">' +
          (a.cambios || []).map((c) =>
            '<li><b>' + App.esc(c.campo) + ':</b> <del>' + short(c.antes) + '</del> <span aria-hidden="true">→</span> <ins>' + short(c.despues) + '</ins></li>').join('') +
          '</ul>' +
          (a.comentario ? '<div class="act-text"><b>Motivo:</b> ' + App.esc(a.comentario) + '</div>' : '');
      case 'asignacion':
        return a.a ? 'asignó la revisión a <b>' + App.esc(a.a) + '</b>.' : 'quitó la asignación de revisión.';
      case 'comentario':
        return 'comentó:<div class="act-text">' + App.esc(a.texto) + '</div>';
      default:
        return '';
    }
  }

  function activityHTML(rec, user) {
    const items = W().timeline(rec).slice().reverse();
    return (
      '<h3 class="act-h">Actividad</h3>' +
      '<form class="comment-form" id="commentForm" novalidate>' +
        '<label class="l" for="commentText">Agregar un comentario</label>' +
        '<textarea id="commentText" placeholder="' +
          (isCommittee(user) ? 'Escriba una nota para el solicitante o el equipo…' : 'Responda al comité o agregue información…') + '"></textarea>' +
        '<div class="msg" id="commentErr" role="alert" hidden></div>' +
        '<div class="comment-actions"><button type="submit" class="btn sm">Comentar</button></div>' +
      '</form>' +
      '<ol class="timeline">' +
        items.map((a) =>
          '<li class="tl-item tl-' + App.esc(a.tipo) + '">' +
            '<span class="avatar" aria-hidden="true">' + App.esc(initials(a.nombre)) + '</span>' +
            '<div class="tl-body">' +
              '<div class="tl-head"><b>' + App.esc(a.nombre || 'Sistema') + '</b>' +
                (a.rol && App.ROLE_LABEL[a.rol] ? ' <span class="tl-role">' + App.esc(App.ROLE_LABEL[a.rol]) + '</span>' : '') +
                ' <span class="tl-date">' + App.esc(App.fmtDateTime(a.fecha)) + '</span></div>' +
              '<div class="tl-text">' + entryBody(a) + '</div>' +
            '</div>' +
          '</li>').join('') +
      '</ol>'
    );
  }

  function renderDetail(rec, user) {
    curId = rec.id;
    $('detailSide').innerHTML = sideHTML(rec, user);
    $('detailActivity').innerHTML = activityHTML(rec, user);

    // Dictamen impreso en la ficha (casilla del Comité CCB)
    const est = W().normalize(rec.estado);
    const ok = est === 'Aprobada' || est === 'Implementada';
    const no = est === 'Rechazada';
    $('detailDictamen').innerHTML =
      '[ ' + (ok ? '<b>X</b>' : '&nbsp;') + ' ] Aprobado &nbsp;&nbsp; [ ' + (no ? '<b>X</b>' : '&nbsp;') + ' ] Rechazado';
  }

  function assign(me) {
    const id = curId;
    const upd = App.store.update(id, (r) => {
      r.asignado = me ? { usuario: App.user.usuario, nombre: App.user.name } : null;
      W().log(r, W().activity('asignacion', App.user, { a: me ? App.user.name : '' }));
    });
    if (!upd) return;
    renderDetail(upd, App.user);
    App.toastSuccess(me ? 'Revisión asignada a ' + App.user.name + '.' : 'Se quitó la asignación.');
  }

  function addComment(e) {
    e.preventDefault();
    const ta = $('commentText');
    const txt = ta.value.trim();
    const err = $('commentErr');
    if (txt.length < 2) {
      err.textContent = 'Escriba un comentario antes de enviarlo.';
      err.hidden = false;
      ta.focus();
      return;
    }
    const upd = App.store.update(curId, (r) => {
      W().log(r, W().activity('comentario', App.user, { texto: txt }));
    });
    if (!upd) return;
    renderDetail(upd, App.user);
    App.toastSuccess('Comentario agregado.');
  }

  /* ===================================================================
     Inicio
     =================================================================== */
  function init() {
    initBoard();
    initDecision();

    $('detailSide').addEventListener('click', (e) => {
      const t = e.target.closest('[data-trans]');
      if (t) { transition(curId, t.getAttribute('data-trans')); return; }
      const a = e.target.closest('[data-assign]');
      if (a) { assign(a.getAttribute('data-assign') === 'me'); return; }
      if (e.target.closest('[data-edit-rec]')) openEdit(curId);
    });
    $('detailActivity').addEventListener('submit', (e) => {
      if (e.target.id === 'commentForm') addComment(e);
    });
    $('detailActivity').addEventListener('input', (e) => {
      if (e.target.id === 'commentText') $('commentErr').hidden = true;
    });

    $('editForm').addEventListener('submit', submitEdit);
    $('editCancel').addEventListener('click', closeEdit);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('decisionModal').hidden) closeDecision();
      else if (!$('editModal').hidden) closeEdit();
    });
  }

  App.Review = { init, renderBoard, renderDetail, transition, openEdit };
})();
