/* =====================================================================
   workflow.js — ciclo de vida del cambio (estilo Jira) y bitácora.

   Cada solicitud tiene un estado. Las "transiciones" permitidas dependen
   del estado y de quién las ejecuta (comité o desarrollador). Cada cambio
   queda en `rec.actividad`.

   Fase de aprobación (comité)
     Recibida ─► En revisión ─► Aprobada
         │            │  ▲
         │            ▼  │
         │      Cambios solicitados
         └──────────► Rechazada ─► (reabrir) En revisión

   Fase de implementación (desarrollador) y cierre (comité)
     Aprobada ─(dev registra la rama)─► En implementación
     En implementación ─(dev: PR + «Finalizar»)─► Revisión de PR
     Revisión de PR ─(comité: PR revisado + merge a develop + versión)─► Implementada (cerrada)
     Revisión de PR ─(comité devuelve)─► En implementación
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
    { id: 'Aprobada', cls: 'aprobada', desc: 'Autorizada. Se asigna un desarrollador, que registra la rama para iniciar la implementación.' },
    { id: 'En implementación', cls: 'implementacion', desc: 'El desarrollador trabaja en su rama y registra sus avances.' },
    { id: 'Revisión de PR', cls: 'pr', desc: 'Implementación terminada: el comité revisa el Pull Request, verifica el merge a develop y asigna la versión.' },
    { id: 'Implementada', cls: 'implementada', desc: 'Pull Request aprobado, merge a develop verificado y versión asignada. Cambio cerrado.' },
    { id: 'Rechazada', cls: 'rechazada', desc: 'El comité no autorizó el cambio.' },
  ];

  /* Transiciones permitidas desde cada estado.
     by: quién la ejecuta ('comite' por defecto, o 'dev'); kind = estilo del botón. */
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
      { to: 'En implementación', label: 'Iniciar implementación', kind: 'neutral', by: 'dev' },
      { to: 'En revisión', label: 'Reabrir revisión', kind: 'neutral' },
    ],
    'En implementación': [
      { to: 'Revisión de PR', label: 'Finalizar implementación', kind: 'ok', by: 'dev' },
      { to: 'En revisión', label: 'Reabrir revisión', kind: 'neutral' },
    ],
    'Revisión de PR': [
      { to: 'Implementada', label: 'Aprobar PR y cerrar cambio', kind: 'ok' },
      { to: 'En implementación', label: 'Devolver al desarrollador', kind: 'warn' },
    ],
    'Rechazada': [
      { to: 'En revisión', label: 'Reabrir revisión', kind: 'neutral' },
    ],
    'Implementada': [],
  };

  /* Destinos que exigen comentario (el solicitante o el desarrollador necesitan el motivo). */
  const NEEDS_COMMENT = ['Aprobada', 'Rechazada', 'Cambios solicitados', 'En implementación', 'Implementada'];

  const normalize = (estado) => LEGACY[estado] || estado || INITIAL;
  const info = (estado) => STATES.find((s) => s.id === normalize(estado)) || STATES[0];

  const claseOf = (rec) => {
    if (!rec) return '';
    if (rec.datos && rec.datos.claseCambio) return rec.datos.claseCambio;
    if (rec.cambio && rec.cambio.tipo) return String(rec.cambio.tipo).split(':')[0].trim();
    return '';
  };

  /* Versionamiento semántico: normal o estándar → Minor o Major; emergencia → Patch. */
  const versionOptions = (rec) => (String(claseOf(rec)).toLowerCase().startsWith('eme') ? ['Patch'] : ['Minor', 'Major']);
  const SEMVER = /^v?\d+\.\d+\.\d+$/;

  /* Requisitos para pasar a un estado. Devuelve el mensaje de lo que falta ('' si todo está bien). */
  function guard(rec, to) {
    const from = normalize(rec.estado);
    if (to === 'En implementación' && from === 'Aprobada') {
      if (!rec.implementador) return 'Primero debe asignarse un desarrollador.';
      if (!rec.git || !rec.git.rama) return 'Registre primero la rama de trabajo.';
    }
    if (to === 'Revisión de PR') {
      if (!rec.git || !rec.git.rama) return 'Registre primero la rama de trabajo.';
      if (!rec.pr || !rec.pr.numero) return 'Ingrese el número o enlace del Pull Request.';
    }
    if (to === 'Implementada') {
      const rv = rec.revision;
      if (!rec.pr) return 'La solicitud no tiene Pull Request.';
      if (!rv || !rv.prRevisado) return 'Marque «Pull Request revisado» y guarde la revisión.';
      if (!rv.mergeDevelop) return 'Verifique el merge hacia develop y guarde la revisión.';
      if (!rv.version || !rv.version.tipo) return 'Asigne la versión (Major, Minor o Patch) y guarde la revisión.';
      if (versionOptions(rec).indexOf(rv.version.tipo) < 0) {
        return 'La versión ' + rv.version.tipo + ' no corresponde a un cambio ' + (claseOf(rec) || 'normal') + '. Corrija la versión y guarde la revisión.';
      }
    }
    return '';
  }

  App.Workflow = {
    INITIAL,
    STATES,
    SEMVER,
    normalize,
    info,
    claseOf,
    versionOptions,
    guard,
    /* Transiciones que puede ejecutar un rol ('comite' | 'dev') desde un estado. */
    transitionsFrom: (estado, by) => (TRANSITIONS[normalize(estado)] || []).filter((t) => (t.by || 'comite') === (by || 'comite')),
    needsComment: (to) => NEEDS_COMMENT.indexOf(to) >= 0,
    isClosed: (estado) => normalize(estado) === 'Implementada',
    /* Estados en los que el desarrollador asignado trabaja. */
    isWorking: (estado) => ['Aprobada', 'En implementación'].indexOf(normalize(estado)) >= 0,

    /* <span> de estado con color propio. */
    pill(estado) {
      const s = info(estado);
      return '<span class="hist-status-pill st-' + s.cls + '">' + App.esc(s.id) + '</span>';
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
