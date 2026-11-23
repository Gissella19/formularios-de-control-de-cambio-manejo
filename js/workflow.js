/* =====================================================================
   workflow.js — flujo de aprobación (estilo Jira) y bitácora de actividad.

   Cada solicitud tiene un estado. El comité mueve la solicitud entre
   estados con "transiciones" permitidas (no se puede saltar de cualquier
   estado a cualquier otro). Cada cambio queda en `rec.actividad`.

     Recibida ─► En revisión ─► Aprobada ─► Implementada
         │            │  ▲          │
         │            ▼  │          └─► (reabrir) En revisión
         │      Cambios solicitados
         └──────────► Rechazada ─► (reabrir) En revisión
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const INITIAL = 'Recibida';
  const LEGACY = { 'Enviada a CCB': 'Recibida' }; // nombre antiguo del estado inicial

  const STATES = [
    { id: 'Recibida', cls: 'recibida', desc: 'Pendiente: el comité aún no la ha revisado.' },
    { id: 'En revisión', cls: 'revision', desc: 'El comité está evaluando la solicitud.' },
    { id: 'Cambios solicitados', cls: 'cambios', desc: 'El comité pidió más información al solicitante.' },
    { id: 'Aprobada', cls: 'aprobada', desc: 'Autorizada para implementarse.' },
    { id: 'Rechazada', cls: 'rechazada', desc: 'El comité no autorizó el cambio.' },
    { id: 'Implementada', cls: 'implementada', desc: 'El cambio ya fue puesto en producción. Solicitud cerrada.' },
  ];

  /* Transiciones permitidas desde cada estado. kind = estilo del botón. */
  const TRANSITIONS = {
    'Recibida': [
      { to: 'En revisión', label: 'Iniciar revisión', kind: 'neutral' },
      { to: 'Aprobada', label: 'Aprobar', kind: 'ok' },
      { to: 'Cambios solicitados', label: 'Pedir cambios', kind: 'warn' },
      { to: 'Rechazada', label: 'Rechazar', kind: 'danger' },
    ],
    'En revisión': [
      { to: 'Aprobada', label: 'Aprobar', kind: 'ok' },
      { to: 'Cambios solicitados', label: 'Pedir cambios', kind: 'warn' },
      { to: 'Rechazada', label: 'Rechazar', kind: 'danger' },
    ],
    'Cambios solicitados': [
      { to: 'En revisión', label: 'Reanudar revisión', kind: 'neutral' },
      { to: 'Rechazada', label: 'Rechazar', kind: 'danger' },
    ],
    'Aprobada': [
      { to: 'Implementada', label: 'Marcar como implementada', kind: 'ok' },
      { to: 'En revisión', label: 'Reabrir revisión', kind: 'neutral' },
    ],
    'Rechazada': [
      { to: 'En revisión', label: 'Reabrir revisión', kind: 'neutral' },
    ],
    'Implementada': [],
  };

  /* Estados que exigen comentario (el solicitante necesita saber el motivo). */
  const NEEDS_COMMENT = ['Rechazada', 'Cambios solicitados'];

  const normalize = (estado) => LEGACY[estado] || estado || INITIAL;
  const info = (estado) => STATES.find((s) => s.id === normalize(estado)) || STATES[0];

  App.Workflow = {
    INITIAL,
    STATES,
    normalize,
    info,
    transitionsFrom: (estado) => TRANSITIONS[normalize(estado)] || [],
    needsComment: (to) => NEEDS_COMMENT.indexOf(to) >= 0,
    isClosed: (estado) => normalize(estado) === 'Implementada',

    /* <span> de estado con color propio. */
    pill(estado) {
      const s = info(estado);
      return '<span class="hist-status-pill st-' + s.cls + '">' + App.esc(s.id) + '</span>';
    },

    /* Tipo de cambio (Normal | Estándar | Emergencia) de cualquier solicitud. */
    claseOf(rec) {
      if (!rec) return '';
      if (rec.datos && rec.datos.claseCambio) return rec.datos.claseCambio;
      if (rec.cambio && rec.cambio.tipo) return String(rec.cambio.tipo).split(':')[0].trim();
      return '';
    },

    /* ---- Bitácora de actividad ---- */
    activity(tipo, user, extra) {
      return Object.assign(
        { tipo, fecha: new Date().toISOString(), usuario: user.usuario, nombre: user.name, rol: user.role },
        extra || {}
      );
    },
    log(rec, entry) {
      rec.actividad = (rec.actividad || []).concat(entry);
      rec.actualizada = entry.fecha;
      return rec;
    },
    /* Actividad lista para mostrar; las solicitudes antiguas sin bitácora reciben su entrada "creada". */
    timeline(rec) {
      const list = (rec.actividad || []).slice();
      if (!list.some((a) => a.tipo === 'creada')) {
        list.unshift({
          tipo: 'creada', fecha: rec.creada,
          nombre: rec.autor ? rec.autor.nombre : '', rol: rec.autor ? rec.autor.rol : '',
        });
      }
      return list;
    },
  };
})();
