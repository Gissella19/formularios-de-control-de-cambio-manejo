/* =====================================================================
   auth.js — vista de inicio de sesión.
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  function init() {
    const form = App.byId('loginForm');
    const err = App.byId('lg-error');
    const validator = App.createValidator(form, {
      fields: { 'lg-user': {}, 'lg-pass': {} },
      steps: [['lg-user', 'lg-pass']],
    });
    validator.bind(() => { err.hidden = true; });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.hidden = true;
      if (!validator.validateStep(0)) return;

      const user = App.store.login(App.byId('lg-user').value, App.byId('lg-pass').value);
      if (!user) {
        err.textContent = 'Usuario o contraseña incorrectos.';
        err.hidden = false;
        App.toastError('No se pudo iniciar sesión. Usuario o contraseña incorrectos.');
        App.byId('lg-pass').value = '';
        App.byId('lg-pass').focus();
        return;
      }
      form.reset();
      validator.reset();
      App.toastSuccess('Sesión iniciada correctamente. Bienvenido, ' + user.name + '.');
      App.start(user);
    });
  }

  App.Auth = { init };
})();
