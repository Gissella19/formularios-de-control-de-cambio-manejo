/* =====================================================================
   store.js — cuentas de prueba, sesión y solicitudes guardadas.
   Persistencia en el navegador (localStorage / sessionStorage) con
   respaldo en memoria si el navegador bloquea el almacenamiento.
   IMPORTANTE: es una demostración sin servidor; las contraseñas viven
   en este archivo y NO ofrecen seguridad real.
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  const KEY_REQ = 'rfc-solicitudes';
  const KEY_SES = 'rfc-sesion';
  const mem = { req: [], ses: null };

  const USERS = [
    { user: 'dev', pass: 'dev123', role: 'desarrollador', name: 'Desarrollador Demo', email: 'dev@empresa.com' },
    { user: 'dev2', pass: 'dev123', role: 'desarrollador', name: 'Desarrollador Dos', email: 'dev2@empresa.com' },
    { user: 'usuario', pass: 'user123', role: 'usuario', name: 'Usuario Demo', email: 'usuario@empresa.com' },
    { user: 'comite', pass: 'comite123', role: 'comite', name: 'Comité CCB', email: 'comite@empresa.com', cargo: 'Presidente del comité', superadmin: true },
    { user: 'gisselle', pass: 'gisselle123', role: 'comite', name: 'Gisselle', email: 'gisselle@empresa.com', cargo: 'Miembro del comité' },
    { user: 'diego', pass: 'diego123', role: 'comite', name: 'Diego', email: 'diego@empresa.com', cargo: 'Miembro del comité' },
    { user: 'fernando', pass: 'fernando123', role: 'comite', name: 'Fernando', email: 'fernando@empresa.com', cargo: 'Miembro del comité' },
  ];

  function area(kind) {
    try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch (e) { return null; }
  }
  function readReq() {
    try {
      const st = area('local');
      const raw = st && st.getItem(KEY_REQ);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* usar memoria */ }
    return mem.req;
  }
  function writeReq(list) {
    mem.req = list;
    try { const st = area('local'); if (st) st.setItem(KEY_REQ, JSON.stringify(list)); } catch (e) { /* solo memoria */ }
  }
  function publicUser(u) {
    return { usuario: u.user, role: u.role, name: u.name, email: u.email, cargo: u.cargo || '', superadmin: !!u.superadmin };
  }

  App.store = {
    /* ---- Sesión ---- */
    login(user, pass) {
      const name = String(user || '').trim().toLowerCase();
      const u = USERS.find((x) => x.user === name && x.pass === pass);
      if (!u) return null;
      mem.ses = u.user;
      try { const st = area('session'); if (st) st.setItem(KEY_SES, u.user); } catch (e) { /* memoria */ }
      return publicUser(u);
    },
    session() {
      let name = mem.ses;
      try { const st = area('session'); const v = st && st.getItem(KEY_SES); if (v) name = v; } catch (e) { /* memoria */ }
      const u = USERS.find((x) => x.user === name);
      return u ? publicUser(u) : null;
    },
    logout() {
      mem.ses = null;
      try { const st = area('session'); if (st) st.removeItem(KEY_SES); } catch (e) { /* nada */ }
    },

    /* ---- Solicitudes ---- */
    all: () => readReq(),
    /* Solicitudes creadas por el usuario. */
    mine(user) {
      return readReq().filter((r) => r.autor && r.autor.usuario === user.usuario);
    },
    /* Solicitudes que el comité asignó a este desarrollador para implementarlas. */
    assignedTo(user) {
      return readReq().filter((r) => r.implementador && r.implementador.usuario === user.usuario);
    },
    /* El comité ve todas; el usuario solo las suyas; el desarrollador las suyas y las que le asignaron. */
    visibleFor(user) {
      if (user.role === 'comite') return readReq();
      if (user.role === 'desarrollador') {
        const asg = App.store.assignedTo(user);
        return App.store.mine(user).concat(asg.filter((r) => !(r.autor && r.autor.usuario === user.usuario)));
      }
      return App.store.mine(user);
    },
    /* Miembros del comité (excluye al presidente/superadmin): pueden recibir revisiones. */
    committeeMembers() {
      return USERS.filter((u) => u.role === 'comite' && !u.superadmin).map((u) => ({ usuario: u.user, nombre: u.name }));
    },
    /* Cuentas de desarrollador (para que el comité asigne la implementación). */
    developers() {
      return USERS.filter((u) => u.role === 'desarrollador').map((u) => ({ usuario: u.user, nombre: u.name }));
    },
    get: (id) => readReq().find((r) => r.id === id) || null,
    exists: (id) => readReq().some((r) => r.id === id),
    save(rec) {
      const list = readReq().slice();
      const i = list.findIndex((r) => r.id === rec.id);
      if (i >= 0) list[i] = rec; else list.push(rec);
      writeReq(list);
      return rec;
    },
    /* Modifica una solicitud sobre la copia más reciente guardada: fn(copia) la edita. */
    update(id, fn) {
      const list = readReq().slice();
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) return null;
      const copy = JSON.parse(JSON.stringify(list[i]));
      fn(copy);
      list[i] = copy;
      writeReq(list);
      return copy;
    },
    /* Siguiente número correlativo del año: PREFIJO-AAAA-0001 */
    nextId(prefix) {
      const y = new Date().getFullYear();
      const re = new RegExp('^' + prefix + '-' + y + '-(\\d+)$');
      let max = 0;
      readReq().forEach((r) => {
        const m = re.exec(r.id);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return prefix + '-' + y + '-' + String(max + 1).padStart(4, '0');
    },
  };
})();
