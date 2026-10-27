/* =====================================================================
   user-form.js — Formulario de solicitud de cambio para usuarios.
   Rol: usuario.  (Diseño y flujo del formulario de usuario del equipo.)

   Flujo: Sus datos → El cambio → Revisar y enviar → pantalla de éxito
   con ficha, impresión, copia JSON, historial y "crear otra solicitud".
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const STEPS = [{ title: 'Sus datos' }, { title: 'El cambio' }, { title: 'Revisar y enviar' }];
  const N = STEPS.length;
  const STEP_FIELDS = [
    ['nombre', 'correo', 'area', 'tel'],
    ['titulo', 'tipo', 'categoria', 'sistema', 'desc', 'just', 'g-prioridad', 'fecha'],
    [],
  ];

  let root, form, panes, user, validator;
  let cur = 0;          // paso actual (0..2)
  let sub = 'form';     // 'form' | 'done'
  let sent = false;
  let last = null;      // última solicitud enviada

  const q = (id) => root.querySelector('#' + id);
  const val = (id) => (q(id).value || '').trim();
  const prio = () => { const r = form.querySelector('input[name=prioridad]:checked'); return r ? r.value : ''; };
  const opt = (id) => { const s = q(id); return s.selectedIndex > 0 ? s.options[s.selectedIndex].text : ''; };

  /* ---------- Reglas de validación ---------- */
  function rules() {
    return {
      nombre: { min: 3 },
      correo: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'Escriba un correo válido, por ejemplo nombre@empresa.com.' },
      area: { min: 2 },
      tel: { optional: true, re: /^[\d\s+()-]{3,}$/, msg: 'Use solo números, espacios y + ( ) -.' },
      titulo: { min: 5 },
      tipo: {},
      categoria: {},
      sistema: { min: 2 },
      desc: { min: 20 },
      just: { min: 15 },
      'g-prioridad': { type: 'radio', name: 'prioridad', emptyMsg: 'Elija qué tan importante es.' },
      fecha: { fn: (v) => (v < App.today() ? 'La fecha no puede ser anterior a hoy.' : '') },
    };
  }

  /* ---------- Montaje ---------- */
  function mount(container, usr) {
    user = usr;
    container.innerHTML = '';
    root = document.createElement('div');
    root.appendChild(App.byId('tpl-user-form').content.cloneNode(true));
    container.appendChild(root);

    form = q('userForm');
    panes = [].slice.call(form.querySelectorAll('.pane'));
    q('fecha').min = App.today();
    validator = App.createValidator(root, { fields: rules(), steps: STEP_FIELDS });
    validator.bind(refresh);

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-edit]');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-edit')) { go(parseInt(b.getAttribute('data-edit'), 10)); return; }
      const actions = {
        prev: () => go(cur - 1), next: onNext, print: () => window.print(),
        hist: () => App.openHistory(), new: () => { nuevo(); App.show('form'); },
      };
      if (actions[b.getAttribute('data-act')]) actions[b.getAttribute('data-act')]();
    });

    sent = false; last = null; cur = 0; sub = 'form';
    prefill();
    root.querySelectorAll('textarea').forEach((ta) => {
      ta.addEventListener('input', () => autoResize(ta));
    });
    paint();
  }

  function prefill() {
    q('nombre').value = user.name;
    q('correo').value = user.email;
  }

  /* ---------- Navegación ---------- */
  function go(j) {
    if (j < 0) return;
    if (j > cur) {
      // Para avanzar se validan los pasos intermedios.
      for (let i = cur; i < j && i < N - 1; i++) {
        if (!validator.validateStep(i)) { cur = i; sub = 'form'; paint(); validator.validateStep(i); App.show('form'); return; }
      }
    }
    cur = j;
    sub = 'form';
    paint();
    App.show('form');
    App.top();
  }
  function onNext() {
    if (cur < N - 1) {
      if (!validator.validateStep(cur)) {
        App.toastError('No se pudo avanzar. Complete los campos obligatorios en rojo.');
        return;
      }
      go(cur + 1);
      return;
    }
    enviar();
  }

  /* ---------- Envío ---------- */
  function sections() {
    return [
      { titulo: 'Sus datos personales y contacto', filas: [
        ['Nombre completo', val('nombre')], ['Correo electrónico', val('correo')], ['Área o departamento', val('area')], ['Teléfono o extensión', val('tel')],
      ] },
      { titulo: 'Detalle del cambio solicitado', filas: [
        ['Título corto', val('titulo')], ['Tipo de cambio', opt('tipo')], ['Categoría', opt('categoria')], ['Sistema o aplicación', val('sistema')],
        ['Importancia', prio(), 'tag'], ['Fecha deseada', App.fmtDate(val('fecha'))],
        ['Descripción', val('desc'), 'long'], ['Motivo / Beneficio', val('just'), 'long'],
        ['Criterio de éxito', val('aceptacion'), 'long'], ['Referencia / Enlace', val('ref'), 'mono'],
      ] },
    ];
  }

  function enviar() {
    for (let i = 0; i < N - 1; i++) {
      if (validator.stepValid(i)) continue;
      cur = i; sub = 'form'; paint(); validator.validateStep(i); App.show('form');
      App.toastError('No se pudo realizar el registro. Complete los campos requeridos en rojo.');
      return;
    }
    const r = {
      id: App.store.nextId('RFC'),
      tipo: 'usuario',
      estado: 'Recibida',
      creada: new Date().toISOString(),
      prioridad: prio(),
      titulo: val('titulo'),
      fechaDeseada: val('fecha'),
      autor: { usuario: user.usuario, nombre: user.name, correo: user.email, rol: user.role },
      solicitante: { nombre: val('nombre'), correo: val('correo'), area: val('area'), telefono: val('tel') },
      cambio: { titulo: val('titulo'), tipo: opt('tipo'), categoria: opt('categoria'), sistema: val('sistema'),
                descripcion: val('desc'), justificacion: val('just'), referencias: val('ref') },
      planificacion: { fechaDeseada: val('fecha'), criteriosAceptacion: val('aceptacion') },
      secciones: sections(),
    };
    App.store.save(r);
    last = r;
    sent = true;
    sub = 'done';

    q('uDoneId').textContent = 'Solicitud ' + r.id + ' enviada';
    q('uDoneTxt').textContent =
      'Importancia ' + r.prioridad.toLowerCase() + '. Estado: Recibida. Guarde este número para consultar el avance con el equipo de control de cambios.';
    q('uDoneSummary').innerHTML = App.sectionsHTML(r.secciones, false);
    paint();
    App.show('form');
    App.top();
    App.toastSuccess('Solicitud ' + r.id + ' enviada con éxito. Estado: Recibida.');
  }

  function nuevo() {
    form.reset();
    validator.reset();
    sent = false; last = null; cur = 0; sub = 'form';
    prefill();
    root.querySelectorAll('textarea').forEach((ta) => {
      ta.addEventListener('input', () => autoResize(ta));
    });
    paint();
  }

  function autoResize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 68) + 'px';
  }

  function resizeAllTextareas() {
    root.querySelectorAll('textarea').forEach((ta) => {
      if (ta.offsetParent !== null) autoResize(ta);
    });
  }

  /* ---------- Pintado ---------- */
  function paint() {
    panes.forEach((p, i) => { p.hidden = i !== cur; });
    form.hidden = sub !== 'form';
    q('uDone').hidden = sub !== 'done';
    q('uPrev').style.visibility = cur === 0 ? 'hidden' : 'visible';
    q('uNext').textContent = cur === N - 1 ? 'Enviar solicitud' : 'Siguiente';
    if (cur === N - 1 && sub === 'form') q('uResumen').innerHTML = App.sectionsHTML(sections(), true);
    setTimeout(resizeAllTextareas, 40);
    refresh();
  }
  function refresh() {
    if (App.form === User) App.renderNav();
  }

  /* ---------- Estado para la barra lateral ---------- */
  function navState() {
    const onForm = App.view === 'form' && sub === 'form';
    const done = [validator.stepValid(0), validator.stepValid(1), sent];
    const n = done.filter(Boolean).length;
    return {
      items: STEPS.map((s, i) => ({
        label: s.title, done: done[i], current: onForm && cur === i,
        onClick: () => { if (sent) { nuevo(); App.show('form'); return; } go(i); },
      })),
      pct: Math.round((n / N) * 100),
      text: sent ? 'Solicitud enviada' : 'Paso ' + (cur + 1) + ' de ' + N + ' · ' + n + ' completados',
      trace: null,
    };
  }

  /* Abre el formulario (desde historial): si ya se envió, empieza uno nuevo. */
  function open() {
    if (sent) nuevo();
    App.show('form');
  }

  const User = { mount, navState, open };
  App.UserForm = User;
})();
