/* =====================================================================
   app.js — arranque, vistas, barra lateral y control de roles.

   Roles:
     desarrollador → formulario técnico (CR) + historial de todas las solicitudes
     usuario       → formulario de usuario + historial de sus solicitudes
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = App.byId;

  App.user = null;
  App.form = null;       // módulo de formulario activo (DevForm | UserForm)
  App.view = 'login';    // 'login' | 'form' | 'hist' | 'detail'

  const ROLE_LABEL = { desarrollador: 'Desarrollador', usuario: 'Usuario' };
  const VIEWS = ['form', 'hist', 'detail'];

  /* ---------- Cambio de vista ---------- */
  App.show = function (name) {
    App.view = name;
    VIEWS.forEach((v) => { $('view-' + v).hidden = v !== name; });
    const isForm = name === 'form';
    const appView = $('app-view');
    appView.classList.toggle('layout-form', isForm);
    appView.classList.toggle('layout-hist', name === 'hist');
    appView.classList.toggle('layout-detail', name === 'detail');
    if ($('app-sidebar')) $('app-sidebar').hidden = !isForm;
    App.renderNav();
    App.top();
  };

  App.openHistory = function () {
    App.History.render(App.user);
    App.show('hist');
  };

  App.newRequest = function () {
    App.form.open();
  };

  /* ---------- Stepper horizontal ---------- */
  App.renderNav = function () {
    if (!App.user || !App.form) return;
    const st = App.form.navState();
    const nav = $('steps');
    if (!nav) return;
    nav.innerHTML = '';

    st.items.forEach((it, i) => {
      if (i > 0) {
        const line = document.createElement('div');
        line.className = 'step-h-line' + (st.items[i - 1].done ? ' done' : '');
        line.setAttribute('aria-hidden', 'true');
        nav.appendChild(line);
      }

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step-h' + (it.done ? ' done' : '') + (it.locked ? ' locked' : '');
      if (it.current) b.setAttribute('aria-current', 'step');

      const badgeNum = it.done ? '✓' : (i + 1);
      const roleChip = it.role ? '<span class="chip">' + App.esc(it.role) + '</span>' : '';
      const subText = it.sub ? '<small class="step-h-sub">' + App.esc(it.sub) + '</small>' : '';

      b.innerHTML =
        '<span class="step-h-badge">' + badgeNum + '</span>' +
        '<span class="step-h-info">' +
          '<span class="step-h-title">' + App.esc(it.label) + '</span>' +
          (roleChip || subText ? '<span class="step-h-meta">' + roleChip + subText + '</span>' : '') +
        '</span>';

      if (it.locked) {
        b.disabled = true;
      } else if (it.onClick) {
        b.addEventListener('click', it.onClick);
      }
      nav.appendChild(b);
    });

    if ($('barFill')) $('barFill').style.width = st.pct + '%';
    if ($('pct')) $('pct').textContent = st.text;

    const trace = $('trace');
    if (trace) {
      if (st.trace) {
        trace.hidden = false;
        const rows = $('traceRows');
        if (rows) {
          rows.innerHTML = st.trace
            .map((r) => '<div class="row"><span>' + App.esc(r[0]) + '</span><b class="' + (r[2] === 'ok' || r[2] === 'warn' ? r[2] : r[2] === 'mono' ? 'mono' : '') + '">' + App.esc(r[1]) + '</b></div>')
            .join('');
        }
      } else {
        trace.hidden = true;
      }
    }
  };

  /* ---------- Sesión ---------- */
  App.start = function (user) {
    App.user = user;
    $('login-view').hidden = true;
    $('app-view').hidden = false;
    if ($('whoName')) $('whoName').textContent = user.name;
    const roleTxt = ROLE_LABEL[user.role] || user.role;
    if ($('whoRole')) $('whoRole').textContent = roleTxt;
    if ($('formRoleBadge')) $('formRoleBadge').textContent = roleTxt;
    if ($('histRoleBadge')) $('histRoleBadge').textContent = roleTxt;
    App.form = user.role === 'desarrollador' ? App.DevForm : App.UserForm;
    const mountPoint = $('form-mount-point') || $('view-form');
    App.form.mount(mountPoint, user);
    App.openHistory();
  };

  App.logout = function () {
    App.store.logout();
    App.user = null;
    App.form = null;
    App.view = 'login';
    const mountPoint = $('form-mount-point') || $('view-form');
    mountPoint.innerHTML = '';
    $('toasts').innerHTML = '';
    $('app-view').hidden = true;
    $('login-view').hidden = false;
    $('lg-user').focus();
  };

  /* ---------- Inicio ---------- */
  function init() {
    App.Auth.init();
    App.History.init();
    if ($('btnLogout')) $('btnLogout').addEventListener('click', App.logout);
    if ($('btnLogoutHist')) $('btnLogoutHist').addEventListener('click', App.logout);
    if ($('btnLogoutForm')) $('btnLogoutForm').addEventListener('click', App.logout);
    if ($('btnSideBack')) $('btnSideBack').addEventListener('click', App.openHistory);
    if ($('btnFormBack')) $('btnFormBack').addEventListener('click', App.openHistory);
    const user = App.store.session();
    if (user) App.start(user);
  }
  init();
})();
