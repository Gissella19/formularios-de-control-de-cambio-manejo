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
    { user: 'usuario', pass: 'user123', role: 'usuario', name: 'Usuario Demo', email: 'usuario@empresa.com' },
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
    return { usuario: u.user, role: u.role, name: u.name, email: u.email };
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
    /* El desarrollador ve todas; el usuario solo las suyas. */
    visibleFor(user) {
      const list = readReq();
      return user.role === 'desarrollador' ? list : list.filter((r) => r.autor && r.autor.usuario === user.usuario);
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
