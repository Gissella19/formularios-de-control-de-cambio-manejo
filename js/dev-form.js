/* =====================================================================
   dev-form.js — Formulario de solicitud de cambio técnico (CR).
   Rol: desarrollador.

   Flujo: 3 fases (una a la vez) → modal de confirmación → vista previa.
   Barra superior: Formulario · Imprimir / Guardar PDF · Validar y Enviar.
   Barra lateral: Flujo de control (incluye etapa CCB) + Trazabilidad SCM.
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const STEPS = [
    { title: 'Identificación y Git', role: 'DEV' },
    { title: 'Información del cambio', role: 'DEV' },
    { title: 'Riesgo y rollback', role: 'DEV / QA' },
  ];
  const STEP_FIELDS = [
    ['fechaSolicitud', 'fechaRequerida', 'solicitante', 'leadReviewer', 'departamento', 'correo', 'repositorio', 'ramaOrigen', 'ramaDestino'],
    ['sistema', 'tipoCambio', 'prioridad', 'origen', 'descripcion', 'justificacion'],
    ['riesgo', 'ambiente', 'pruebas', 'rollback'],
  ];
  const ALL_FIELDS = ['codigo'].concat(STEP_FIELDS[0], STEP_FIELDS[1], STEP_FIELDS[2]);
  const MSG_SENT = 'Solicitud validada y enviada. Queda pendiente de dictamen del Comité de Control de Cambios (CCB).';

  let root, form, panes, user, validator;
  let cur = 0;          // fase actual (0..2)
  let sub = 'form';     // 'form' | 'preview'
  let sent = false;

  const q = (id) => root.querySelector('#' + id);
  const val = (id) => (q(id).value || '').trim();

  /* ---------- Reglas de validación ---------- */
  function rules() {
    return {
      fechaSolicitud: {
        fn: (v) => {
          if (!v) return 'La fecha de solicitud es obligatoria.';
          if (v < App.today()) return 'No se puede solicitar con una fecha pasada.';
          return '';
        },
      },
      fechaRequerida: {
        fn: (v) => {
          if (!v) return 'La fecha requerida es obligatoria.';
          if (v < App.today()) return 'No se puede requerir una fecha pasada.';
          const s = val('fechaSolicitud');
          if (s && v < s) return 'No puede ser anterior a la fecha de solicitud.';
          return '';
        },
      },
      solicitante: { min: 4 },
      leadReviewer: { min: 4 },
      departamento: { min: 3 },
      correo: { re: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, msg: 'Ingrese un correo válido.' },
      repositorio: { re: /^[\w.-]+\/[\w.-]+$/, msg: 'Use el formato organizacion/repositorio.' },
      ramaOrigen: { re: /^\S{2,}$/, msg: 'Nombre de rama no válido (sin espacios).' },
      ramaDestino: {},
      sistema: { min: 3 },
      tipoCambio: {},
      prioridad: {},
      origen: {},
      descripcion: { min: 25 },
      justificacion: { min: 25 },
      riesgo: {},
      ambiente: {},
      pruebas: { min: 20 },
      rollback: { min: 20 },
    };
  }

  /* ---------- Montaje ---------- */
  function mount(container, usr) {
    user = usr;
    container.innerHTML = '';
    root = document.createElement('div');
    root.appendChild(App.byId('tpl-dev-form').content.cloneNode(true));
    container.appendChild(root);

    form = q('devForm');
    panes = [].slice.call(form.querySelectorAll('.pane'));
    validator = App.createValidator(root, { fields: rules(), steps: STEP_FIELDS });
    validator.bind(refresh);
    q('fechaSolicitud').addEventListener('change', () => {
      const s = val('fechaSolicitud');
      const minReq = s && s >= App.today() ? s : App.today();
      q('fechaRequerida').min = minReq;
      validator.validateField('fechaSolicitud');
      validator.validateField('fechaRequerida');
    });
    q('fechaRequerida').addEventListener('change', () => {
      validator.validateField('fechaRequerida');
    });

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act],[data-edit]');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-edit')) { go(parseInt(b.getAttribute('data-edit'), 10)); return; }
      const actions = {
        form: onFormButton, print: onPrint, send: onSend, prev: onPrev, next: onNext,
        hist: () => App.openHistory(), new: () => { nuevo(); App.show('form'); },
        example: fillExample,
      };
      if (actions[b.getAttribute('data-act')]) actions[b.getAttribute('data-act')]();
    });

    sent = false; cur = 0; sub = 'form';
    setDefaults();
    restoreDraft();
    bindCharCounters();
    root.querySelectorAll('textarea').forEach((ta) => {
      ta.addEventListener('input', () => autoResize(ta));
    });
    paint();

    form.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    });
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
  }

  const DRAFT_KEY = 'rfc-draft-dev';
  function saveDraft() {
    if (sent) return;
    try {
      const d = {};
      ALL_FIELDS.forEach((id) => {
        const el = q(id);
        if (el) d[id] = el.value;
      });
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) {}
  }

  function restoreDraft() {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      ALL_FIELDS.forEach((id) => {
        if (d[id] != null && id !== 'codigo') {
          const el = q(id);
          if (el) el.value = d[id];
        }
      });
      return true;
    } catch (e) { return false; }
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  function bindCharCounters() {
    root.querySelectorAll('.char-counter').forEach((box) => {
      const fieldId = box.getAttribute('data-for');
      const min = parseInt(box.getAttribute('data-min'), 10);
      const input = q(fieldId);
      if (!input) return;
      const update = () => {
        const len = (input.value || '').trim().length;
        const cnt = box.querySelector('.cnt');
        if (cnt) cnt.textContent = len;
        box.classList.toggle('ready', len >= min);
      };
      input.addEventListener('input', update);
      update();
    });
  }

  function updateCharCounters() {
    root.querySelectorAll('.char-counter').forEach((box) => {
      const fieldId = box.getAttribute('data-for');
      const min = parseInt(box.getAttribute('data-min'), 10);
      const input = q(fieldId);
      if (input) {
        const len = (input.value || '').trim().length;
        const cnt = box.querySelector('.cnt');
        if (cnt) cnt.textContent = len;
        box.classList.toggle('ready', len >= min);
      }
    });
  }

  function autoResize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    const minH = ta.id === 'rollback' ? 98 : 72;
    ta.style.height = Math.max(ta.scrollHeight, minH) + 'px';
  }

  function resizeAllTextareas() {
    root.querySelectorAll('textarea').forEach((ta) => {
      if (ta.offsetParent !== null) {
        autoResize(ta);
      }
    });
  }

  function setDefaults() {
    const today = App.today();
    q('fechaSolicitud').value = today;
    q('fechaSolicitud').min = today;
    q('fechaRequerida').value = App.addDays(3);
    q('fechaRequerida').min = today;
    const nextCode = App.store.nextId('CR');
    q('codigo').value = nextCode;
    if (q('codigoDisplay')) q('codigoDisplay').textContent = nextCode;
    q('solicitante').value = user.name;
    q('correo').value = user.email;
  }

  function fillExample() {
    q('leadReviewer').value = 'Ing. Patricia Torres (Tech Lead / QA)';
    q('departamento').value = 'Dirección de TI - Departamento de Desarrollo';
    q('repositorio').value = 'fisei-uta/gestion-academica';
    q('ramaOrigen').value = 'feature/CR-2026-login-oauth2';
    q('ramaDestino').value = 'main (Producción)';
    q('sistema').value = 'Módulo de Autenticación y Matrículas Web';
    q('tipoCambio').value = 'Evolutivo / mejora';
    q('prioridad').value = 'Alta';
    q('origen').value = 'Auditoría';
    q('descripcion').value = 'Implementación de inicio de sesión único (SSO) mediante OAuth 2.0 y JWT. Se corrigen además los retardos en la generación de reportes concurrentes de matrícula estudiantil.';
    q('justificacion').value = 'Resuelve las vulnerabilidades de seguridad identificadas en la auditoría técnica SCM-2026 y disminuye el tiempo de respuesta del servidor en horas de alta demanda institucional.';
    q('riesgo').value = 'Medio';
    q('ambiente').value = 'Producción';
    q('pruebas').value = 'Pruebas unitarias ejecutadas con Jest (92% de cobertura). Pruebas de integración superadas en ambiente QA con 100 usuarios concurrentes sin fallos HTTP 500.';
    q('rollback').value = '1. git revert -m 1 HEAD\n2. Ejecutar rollback de base de datos: npm run db:rollback\n3. Re-desplegar la versión v2.3.9 en el clúster\n4. Verificar logs de monitoreo en Graylog';
    updateCharCounters();
    resizeAllTextareas();
    saveDraft();
    validator.validateStep(cur);
    refresh();
    App.toast('Datos de ejemplo cargados en el formulario.', 'info');
  }

  /* ---------- Navegación entre fases ---------- */
  function go(n) {
    cur = n;
    sub = 'form';
    paint();
    App.show('form');
    focusFirstField();
  }
  function focusFirstField() {
    const pane = panes[cur];
    if (!pane) return;
    const first = pane.querySelector('input:not([readonly]):not([type=hidden]),select,textarea');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 40);
  }
  function canReach(n) {
    for (let i = 0; i < n; i++) if (!validator.stepValid(i)) return false;
    return true;
  }
  function onPrev() { if (cur > 0) go(cur - 1); }
  function onNext() {
    if (!validator.validateStep(cur)) {
      App.toastError('No se pudo avanzar. Complete los campos obligatorios en rojo.');
      return;
    }
    if (cur < STEPS.length - 1) { go(cur + 1); return; }
    finalizar();
  }

  /* Última fase completada: se verifica todo y se muestra el modal de éxito. */
  function finalizar() {
    const bad = validator.firstInvalidStep();
    if (bad >= 0) {
      go(bad);
      validator.validateStep(bad);
      App.toastError('No se pudo completar el formulario. Corrija los campos en rojo.');
      return;
    }
    App.modal.open({
      title: 'Formulario completado correctamente',
      text: 'Todos los datos fueron registrados. Haga clic en «Ver vista previa» para revisar su formulario lleno.',
      actions: [
        { label: 'Seguir editando', kind: 'sec' },
        { label: 'Ver vista previa', kind: 'primary', onClick: showPreview },
      ],
    });
  }

  /* ---------- Barra superior ---------- */
  function onFormButton() {
    if (sent) { nuevo(); App.show('form'); App.toast('La solicitud anterior ya fue enviada. Se abrió un formulario nuevo.', 'info'); return; }
    go(cur);
  }
  function onPrint() {
    const bad = validator.firstInvalidStep();
    if (bad >= 0) {
      go(bad);
      validator.validateStep(bad);
      App.toastError('No se puede imprimir. Corrija los campos en rojo.');
      return;
    }
    showPreview();
    setTimeout(() => window.print(), 150);
  }
  function onSend() {
    const bad = validator.firstInvalidStep();
    if (bad >= 0) {
      go(bad);
      validator.validateStep(bad);
      App.toastError('No se pudo realizar el registro. Corrija los campos marcados en rojo.');
      return;
    }
    if (sent) {
      showPreview();
      App.toastWarning('Esta solicitud ya fue enviada.');
      return;
    }

    // El código es correlativo; se recalcula si otra pestaña ya lo usó.
    if (App.store.exists(val('codigo'))) {
      const nextCode = App.store.nextId('CR');
      q('codigo').value = nextCode;
      if (q('codigoDisplay')) q('codigoDisplay').textContent = nextCode;
    }
    App.store.save(buildRecord());
    clearDraft();
    sent = true;
    showPreview();
    App.toastSuccess('Solicitud validada y enviada al CCB con éxito.');
  }

  /* ---------- Vista previa ---------- */
  function sections() {
    const g = val;
    return [
      { titulo: 'Identificación y trazabilidad técnica', filas: [
        ['Código de solicitud', g('codigo'), 'mono'],
        ['Fecha de solicitud', App.fmtDate(g('fechaSolicitud'))],
        ['Fecha requerida de pase', App.fmtDate(g('fechaRequerida'))],
        ['Desarrollador responsable', g('solicitante')],
        ['Correo institucional', g('correo')],
        ['Lead Reviewer / Auditor SCM', g('leadReviewer')],
        ['Departamento / Área', g('departamento')],
        ['Repositorio y servicio', g('repositorio'), 'mono'],
        ['Rama origen', g('ramaOrigen'), 'mono'],
        ['Rama destino', g('ramaDestino'), 'mono'],
      ] },
      { titulo: 'Información técnica del cambio', filas: [
        ['Sistema o módulo afectado', g('sistema')],
        ['Tipo de cambio', g('tipoCambio')],
        ['Prioridad', g('prioridad'), 'tag'],
        ['Origen de la solicitud', g('origen')],
        ['Descripción del cambio', g('descripcion'), 'long'],
        ['Justificación técnica', g('justificacion'), 'long'],
      ] },
      { titulo: 'Riesgo, pruebas y plan de reversión', filas: [
        ['Nivel de riesgo', g('riesgo'), 'tag'],
        ['Ambiente de despliegue', g('ambiente')],
        ['Pruebas y cobertura', g('pruebas'), 'long'],
        ['Plan de reversión (rollback)', g('rollback'), 'code'],
      ] },
    ];
  }

  function buildRecord() {
    const datos = {};
    ALL_FIELDS.forEach((id) => { datos[id] = val(id); });
    return {
      id: val('codigo'),
      tipo: 'tecnica',
      estado: 'Enviada a CCB',
      creada: new Date().toISOString(),
      prioridad: val('prioridad'),
      titulo: val('tipoCambio') + ': ' + val('sistema'),
      fechaDeseada: val('fechaRequerida'),
      autor: { usuario: user.usuario, nombre: user.name, correo: user.email, rol: user.role },
      datos,
      secciones: sections(),
    };
  }

  function showPreview() {
    q('devSummary').innerHTML = App.sectionsHTML(sections(), !sent);
    const badge = q('devBadge');
    if (badge) {
      badge.textContent = sent ? 'ENVIADO · PENDIENTE DE SESIÓN CCB' : 'FORMULARIO COMPLETO · PENDIENTE DE ENVÍO';
      badge.classList.toggle('ok', sent);
    }
    q('devSentActions').hidden = !sent;
    if (q('devPreActions')) q('devPreActions').hidden = sent;
    sub = 'preview';
    paint();
    App.show('form');
    if (!sent) {
      App.toastWarning('FORMULARIO COMPLETO · PENDIENTE DE ENVÍO');
    }
  }

  /* ---------- Nuevo formulario ---------- */
  function nuevo() {
    clearDraft();
    form.reset();
    validator.reset();
    setDefaults();
    updateCharCounters();
    sent = false;
    cur = 0;
    sub = 'form';
    paint();
  }

  /* ---------- Pintado ---------- */
  function paint() {
    panes.forEach((p, i) => { p.hidden = i !== cur; });
    form.hidden = sub !== 'form';
    q('devPreview').hidden = sub !== 'preview';
    const tb = root.querySelector('.toolbar');
    if (tb) tb.hidden = sub === 'preview';
    if (q('devBtnForm')) q('devBtnForm').classList.toggle('on', sub === 'form');
    q('devPrev').style.visibility = cur === 0 ? 'hidden' : 'visible';
    q('devNext').textContent = cur === STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
    setTimeout(resizeAllTextareas, 40);
    refresh();
  }
  function refresh() {
    if (App.form === Dev) App.renderNav();
  }

  /* ---------- Estado para la barra lateral ---------- */
  function navState() {
    const onForm = App.view === 'form' && sub === 'form';
    const done = STEPS.map((s, i) => validator.stepValid(i));
    const doneCount = done.filter(Boolean).length;
    const allValid = doneCount === STEPS.length;

    const items = STEPS.map((s, i) => {
      const isCur = onForm && cur === i;
      return {
        label: s.title, role: s.role, done: done[i], current: isCur,
        sub: done[i] ? 'Completado' : isCur ? 'En proceso' : 'Pendiente',
        onClick: () => {
          if (sent) { nuevo(); App.show('form'); return; }
          if (isCur) return;
          if (i <= cur || canReach(i)) go(i);
        },
      };
    });
    const pct = Math.round((doneCount / STEPS.length) * 100);
    return {
      items,
      pct,
      text: sent ? 'Solicitud enviada al CCB' : 'Fase ' + (cur + 1) + ' de ' + STEPS.length + ' · ' + doneCount + ' completadas',
      trace: null,
    };
  }

  /* Abre el formulario (desde historial o menú): si ya se envió, empieza uno nuevo. */
  function open() {
    if (sent) nuevo();
    App.show('form');
  }

  const Dev = { mount, navState, open };
  App.DevForm = Dev;
})();
