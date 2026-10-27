/* =====================================================================
   validator.js — validación de campos reutilizable.
   Los mensajes solo aparecen cuando hacen falta: al salir de un campo
   con un dato incorrecto, o al intentar avanzar de paso.

   App.createValidator(root, { fields, steps })
     fields: { idCampo: { min, re, msg, fn, optional, type:'radio', name, emptyMsg } }
     steps:  [[idCampo, ...], ...]   (campos que valida cada paso)
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});

  App.createValidator = function (root, spec) {
    const fields = spec.fields;
    const steps = spec.steps || [Object.keys(fields)];
    let touched = {};

    const q = (id) => root.querySelector('#' + id);

    function value(id) {
      const f = fields[id];
      if (f.type === 'radio') {
        const c = root.querySelector('input[name="' + f.name + '"]:checked');
        return c ? c.value : '';
      }
      return (q(id).value || '').trim();
    }

    /* Devuelve el mensaje de error ('' si el campo es válido). */
    function check(id) {
      const f = fields[id];
      const v = value(id);
      if (!v) {
        if (f.optional) return '';
        if (f.type === 'radio') return f.emptyMsg || 'Elija una opción.';
        return q(id).tagName === 'SELECT' ? 'Seleccione una opción.' : 'Complete este campo.';
      }
      if (f.min && v.length < f.min) return 'Escriba al menos ' + f.min + ' caracteres (' + v.length + '/' + f.min + ').';
      if (f.re && !f.re.test(v)) return f.msg || 'El formato no es válido.';
      if (f.fn) return f.fn(v) || '';
      return '';
    }

    function show(id, msg) {
      const el = q(id);
      let box = root.querySelector('#err-' + id);
      if (!msg) {
        if (box) box.remove();
        el.classList.remove('invalid');
        el.removeAttribute('aria-invalid');
        el.removeAttribute('aria-describedby');
        return;
      }
      if (!box) {
        box = document.createElement('div');
        box.className = 'msg';
        box.id = 'err-' + id;
        el.insertAdjacentElement('afterend', box);
      }
      box.textContent = msg;
      el.classList.add('invalid');
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('aria-describedby', box.id);
    }

    function focus(id) {
      const el = q(id);
      const t = fields[id].type === 'radio' ? el.querySelector('input') : el;
      if (t) t.focus();
    }

    /* Revalida un campo mostrando el error solo si el usuario ya lo tocó. */
    function validateField(id) {
      const msg = check(id);
      show(id, touched[id] ? msg : '');
      return !msg;
    }
    function stepValid(i) {
      return steps[i].every((id) => !check(id));
    }
    /* Valida un paso completo y muestra todos sus errores. */
    function validateStep(i) {
      let first = null;
      steps[i].forEach((id) => {
        touched[id] = true;
        const msg = check(id);
        show(id, msg);
        if (msg && !first) first = id;
      });
      if (first) focus(first);
      return !first;
    }
    function firstInvalidStep() {
      for (let i = 0; i < steps.length; i++) if (!stepValid(i)) return i;
      return -1;
    }
    function reset() {
      touched = {};
      Object.keys(fields).forEach((id) => show(id, ''));
    }
    function bind(onChange) {
      Object.keys(fields).forEach((id) => {
        const el = q(id);
        if (fields[id].type === 'radio') {
          el.addEventListener('change', () => {
            touched[id] = true;
            validateField(id);
            if (onChange) onChange(id);
          });
          return;
        }
        el.addEventListener('blur', () => { touched[id] = true; validateField(id); });
        el.addEventListener('input', () => {
          if (touched[id]) validateField(id);
          if (onChange) onChange(id);
        });
        el.addEventListener('change', () => {
          touched[id] = true;
          validateField(id);
          if (onChange) onChange(id);
        });
      });
    }

    return { check, value, validateField, validateStep, stepValid, firstInvalidStep, reset, bind };
  };
})();
