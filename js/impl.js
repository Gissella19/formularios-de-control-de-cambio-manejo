/* =====================================================================
   impl.js — implementación (desarrollador) y revisión del Pull Request
   (comité) hasta el cierre del cambio.

   Desarrollador asignado, con la solicitud «En implementación»:
     · Bitácora de implementación: registra las actividades que realiza.
     · «Finalizar implementación»: ingresa el Pull Request (número o enlace)
       y la solicitud pasa sola a «Revisión de PR».
   Comité, con la solicitud en «Revisión de PR»:
     · Revisa el Pull Request y verifica el merge hacia develop.
     · Asigna la versión semántica: Minor o Major (cambio normal/estándar)
       o Patch (emergencia).
     · «Aprobar PR y cerrar cambio» (botón del panel de Estado) cierra el
       cambio cuando PR revisado, merge y versión están registrados.
   La verificación en GitHub usa la API pública (solo lectura).
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = App.byId;
  const W = () => App.Workflow;

  const isDev = (rec, user) =>
    !!user && user.role === 'desarrollador' && !!rec.implementador && rec.implementador.usuario === user.usuario;
  const isCommittee = (user) => !!user && user.role === 'comite';
  const estadoOf = (rec) => W().normalize(rec.estado);
  const verText = (v) => (!v ? '' : v.numero && v.tipo ? v.numero + ' (' + v.tipo + ')' : v.tipo || v.numero || '');

  /* ---------- Pull Request: número o enlace ---------- */
  function parsePR(input, repo) {
    const v = String(input || '').trim();
    if (!v) return { error: 'Ingrese el número o enlace del Pull Request.' };
    const built = (r, n) => ({ pr: { numero: Number(n), repo: r || '', url: r ? 'https://github.com/' + r + '/pull/' + n : '', ref: '#' + Number(n) } });
    let m = /^#?(\d{1,9})$/.exec(v);
    if (m && Number(m[1]) > 0) return built(repo, m[1]);
    m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/i.exec(v);
    if (m && Number(m[2]) > 0) {
      if (repo && m[1].toLowerCase() !== repo.toLowerCase()) {
        return { error: 'El Pull Request pertenece a «' + m[1] + '», pero la rama se registró en «' + repo + '».' };
      }
      return built(m[1], m[2]);
    }
    return { error: 'Use el número (42 o #42) o el enlace https://github.com/organizacion/repositorio/pull/42.' };
  }

  /* ---------- Mensajes ---------- */
  function msg(kind, html) {
    const m = $('prMsg');
    if (!m) return;
    m.className = 'git-msg ' + kind;
    m.innerHTML = html || '';
    m.hidden = !html;
  }
  function err(id, text) {
    const e = $(id);
    if (!e) return;
    e.textContent = text || '';
    e.hidden = !text;
  }

  const prLink = (pr) =>
    pr.url
      ? '<a class="git-link mono" target="_blank" rel="noopener noreferrer" href="' + App.esc(pr.url) + '">' + App.esc(pr.ref) + '</a>'
      : '<span class="mono">' + App.esc(pr.ref) + '</span>';

  /* ===================================================================
     BITÁCORA DE IMPLEMENTACIÓN (columna principal)
     =================================================================== */
  function mainHTML(rec, user) {
    const avances = (rec.actividad || []).filter((a) => a.tipo === 'avance').slice().reverse();
    const est = estadoOf(rec);
    const visible = ['En implementación', 'Revisión de PR', 'Implementada'].indexOf(est) >= 0 || avances.length > 0;
    if (!visible) return '';
    const puedeRegistrar = isDev(rec, user) && est === 'En implementación';
    return (
      '<h3 class="act-h">Bitácora de implementación</h3>' +
      (puedeRegistrar
        ? '<form class="comment-form" id="avanceForm" novalidate>' +
            '<label class="l" for="avanceText">Registrar una actividad realizada</label>' +
            '<textarea id="avanceText" placeholder="Ej: Se creó el endpoint de exportación y se agregaron las pruebas unitarias."></textarea>' +
            '<div class="msg" id="avanceErr" role="alert" hidden></div>' +
            '<div class="comment-actions"><button type="submit" class="btn sm">Registrar actividad</button></div>' +
          '</form>'
        : '') +
      (avances.length
        ? '<ol class="timeline">' +
            avances.map((a) =>
              '<li class="tl-item tl-avance"><span class="avatar dev" aria-hidden="true">' + App.esc((a.nombre || '?').slice(0, 2).toUpperCase()) + '</span>' +
              '<div class="tl-body"><div class="tl-head"><b>' + App.esc(a.nombre || '') + '</b> <span class="tl-date">' + App.esc(App.fmtDateTime(a.fecha)) + '</span></div>' +
              '<div class="act-text">' + App.esc(a.texto) + '</div></div></li>').join('') +
          '</ol>'
        : '<p class="side-note">' + (puedeRegistrar ? 'Aún no hay actividades registradas.' : 'El desarrollador no ha registrado actividades.') + '</p>')
    );
  }

  function addAvance(e) {
    e.preventDefault();
    const rec = App.store.get(App.Review.current());
    if (!rec || !isDev(rec, App.user) || estadoOf(rec) !== 'En implementación') return;
    const txt = ($('avanceText').value || '').trim();
    if (txt.length < 5) { err('avanceErr', 'Describa la actividad (mínimo 5 caracteres).'); $('avanceText').focus(); return; }
    if (txt.length > 600) { err('avanceErr', 'Máximo 600 caracteres.'); return; }
    const upd = App.store.update(rec.id, (r) => {
      App.Workflow.log(r, App.Workflow.activity('avance', App.user, { texto: txt }));
    });
    if (!upd) return;
    App.Review.renderDetail(upd, App.user);
    App.toastSuccess('Actividad registrada.');
  }

  /* ===================================================================
     TARJETAS DEL PANEL LATERAL
     =================================================================== */
  function finishCard(rec) {
    return (
      '<div class="side-card" id="finishCard">' +
        '<h3 class="side-h">Finalizar implementación</h3>' +
        '<p class="side-note" style="margin-top:0">Cuando termine su trabajo en la rama <code>' + App.esc(rec.git ? rec.git.rama : '') +
          '</code>, ingrese el Pull Request y finalice: la solicitud pasa a «Revisión de PR».</p>' +
        '<div class="f"><label class="l req" for="prInput">Pull Request (número o enlace)</label>' +
          '<input id="prInput" class="mono" autocapitalize="off" spellcheck="false" placeholder="Ej: 42  o  https://github.com/org/repo/pull/42" value="' +
          App.esc(rec.pr ? rec.pr.ref.replace('#', '') : '') + '" /></div>' +
        '<div class="msg" id="prErr" role="alert" hidden></div>' +
        '<div class="git-msg" id="prMsg" role="status" hidden></div>' +
        '<div class="side-actions">' +
          '<button type="button" class="btn sm tr-ok" data-impl="finish">Finalizar implementación</button>' +
          '<button type="button" class="btn sm sec" data-impl="verify-pr">Verificar PR en GitHub</button>' +
        '</div>' +
      '</div>'
    );
  }

  function reviewCard(rec) {
    const rv = rec.revision || {};
    const opts = W().versionOptions(rec);
    const sel = rv.version && opts.indexOf(rv.version.tipo) >= 0 ? rv.version.tipo : (opts.length === 1 ? opts[0] : '');
    const emergencia = opts.length === 1;
    return (
      '<div class="side-card" id="reviewPrCard">' +
        '<h3 class="side-h">Revisión del Pull Request</h3>' +
        '<dl class="side-dl">' +
          '<div class="side-row"><dt>Pull Request</dt><dd>' + (rec.pr ? prLink(rec.pr) + '<br><small>enviado por ' + App.esc(rec.pr.por ? rec.pr.por.nombre : '') + '</small>' : '—') + '</dd></div>' +
          '<div class="side-row"><dt>Rama</dt><dd class="mono">' + App.esc(rec.git ? rec.git.rama : '—') + '</dd></div>' +
        '</dl>' +
        '<div class="msg" id="prErr" role="alert" hidden></div>' +
        '<div class="git-msg" id="prMsg" role="status" hidden></div>' +
        '<div class="side-actions"><button type="button" class="btn sm sec" data-impl="verify-merge">Verificar PR y merge en GitHub</button></div>' +
        '<label class="check-row"><input type="checkbox" id="chkPr"' + (rv.prRevisado ? ' checked' : '') + '> Pull Request revisado</label>' +
        '<label class="check-row"><input type="checkbox" id="chkMerge"' + (rv.mergeDevelop ? ' checked' : '') + '> Merge hacia <code>develop</code> verificado</label>' +
        '<h3 class="side-h" style="margin-top:12px">Versionamiento semántico</h3>' +
        '<p class="side-note" style="margin-top:0">' +
          (emergencia ? 'Cambio de <b>emergencia</b>: solo corresponde versión <b>Patch</b>.'
                      : 'Cambio <b>' + App.esc(W().claseOf(rec) || 'normal') + '</b>: corresponde versión <b>Minor</b> o <b>Major</b>.') +
        '</p>' +
        '<div class="f"><label class="l req" for="verTipo">Tipo de versión</label>' +
          '<select id="verTipo"><option value="">Seleccione…</option>' +
            opts.map((o) => '<option value="' + o + '"' + (o === sel ? ' selected' : '') + '>' + o + '</option>').join('') +
          '</select></div>' +
        '<div class="f"><label class="l" for="verNum">Número de versión (opcional)</label>' +
          '<input id="verNum" class="mono" autocapitalize="off" spellcheck="false" placeholder="Ej: v2.4.0" value="' +
          App.esc(rv.version && rv.version.numero ? rv.version.numero : '') + '" /></div>' +
        '<div class="msg" id="revErr" role="alert" hidden></div>' +
        '<div class="side-actions"><button type="button" class="btn sm" data-impl="save-review">Guardar revisión</button></div>' +
        '<p class="side-note">Con la revisión guardada, use «Aprobar PR y cerrar cambio» en el panel de Estado.</p>' +
      '</div>'
    );
  }

  function summaryCard(rec) {
    const rv = rec.revision;
    const yes = (v) => (v ? '<b style="color:#166534">Sí</b>' : '<b style="color:#991b1b">No</b>');
    return (
      '<div class="side-card"><h3 class="side-h">Entrega</h3><dl class="side-dl">' +
        '<div class="side-row"><dt>Pull Request</dt><dd>' + prLink(rec.pr) + '</dd></div>' +
        (rec.git ? '<div class="side-row"><dt>Rama</dt><dd class="mono">' + App.esc(rec.git.rama) + '</dd></div>' : '') +
        (rv
          ? '<div class="side-row"><dt>PR revisado</dt><dd>' + yes(rv.prRevisado) + '</dd></div>' +
            '<div class="side-row"><dt>Merge a develop</dt><dd>' + yes(rv.mergeDevelop) + '</dd></div>' +
            (rv.version ? '<div class="side-row"><dt>Versión</dt><dd><b>' + App.esc(verText(rv.version)) + '</b></dd></div>' : '') +
            (rv.por ? '<div class="side-row"><dt>Revisó</dt><dd>' + App.esc(rv.por.nombre) + '<br><small>' + App.esc(App.fmtDateTime(rv.fecha)) + '</small></dd></div>' : '')
          : '') +
      '</dl></div>'
    );
  }

  function sideHTML(rec, user) {
    const est = estadoOf(rec);
    if (isDev(rec, user) && est === 'En implementación') return finishCard(rec);
    if (isCommittee(user) && est === 'Revisión de PR' && rec.pr) return reviewCard(rec);
    if (rec.pr) return summaryCard(rec);
    return '';
  }

  /* ===================================================================
     ACCIONES
     =================================================================== */
  const prAdvice = (p, rec) => {
    const w = [];
    if (rec.git && p.head && p.head !== rec.git.rama) w.push('la rama del PR (<code>' + App.esc(p.head) + '</code>) no coincide con la registrada (<code>' + App.esc(rec.git.rama) + '</code>)');
    return w;
  };
  const prState = (p) => (p.merged ? 'integrado (merge hecho)' : p.estado === 'open' ? 'abierto' : 'cerrado sin merge');

  async function verifyPR(rec, forMerge) {
    const repo = rec.git && rec.git.repositorio;
    const parsed = forMerge ? { pr: rec.pr } : parsePR($('prInput').value, repo);
    err('prErr', parsed.error || ''); msg('', '');
    if (parsed.error) return;
    const pr = parsed.pr;
    if (!pr.repo) { err('prErr', 'No se conoce el repositorio del Pull Request.'); return; }
    msg('info', 'Consultando GitHub…');
    const res = await App.GitBranch.fetchPR(pr.repo, pr.numero);
    if (res.error) { msg('', ''); err('prErr', res.error); return; }
    const p = res.pr;
    const warns = prAdvice(p, rec);
    let kind = 'ok';
    let extra = '';
    if (p.base && p.base !== 'develop') { warns.push('apunta a <code>' + App.esc(p.base) + '</code> y no a <code>develop</code>'); }
    if (forMerge) {
      if (p.merged && p.base === 'develop') {
        const c = $('chkMerge');
        if (c) c.checked = true;
        extra = ' El merge a <code>develop</code> quedó marcado como verificado; recuerde guardar la revisión.';
      } else {
        kind = 'warn';
        warns.push(p.merged ? 'fue integrado en otra rama, no en <code>develop</code>' : 'todavía no está integrado (merge pendiente)');
      }
    }
    if (warns.length && kind === 'ok') kind = 'warn';
    msg(kind,
      'PR <b>#' + pr.numero + '</b>: «' + App.esc(p.titulo || '') + '» — ' + App.esc(prState(p)) +
      (p.head ? ' (' + App.esc(p.head) + ' → ' + App.esc(p.base) + ')' : '') + '.' +
      (warns.length ? '<br>Atención: ' + warns.join('; ') + '.' : '') + extra +
      (p.url ? ' <a class="git-link" target="_blank" rel="noopener noreferrer" href="' + App.esc(p.url) + '">Abrir en GitHub</a>' : ''));
  }

  function finish() {
    const rec = App.store.get(App.Review.current());
    if (!rec || !isDev(rec, App.user) || estadoOf(rec) !== 'En implementación') return;
    const parsed = parsePR($('prInput').value, rec.git && rec.git.repositorio);
    err('prErr', parsed.error || '');
    if (parsed.error) { $('prInput').focus(); return; }
    const pr = parsed.pr;
    App.Review.openDecision({
      title: 'Finalizar implementación',
      text: rec.id + ' · ' + rec.titulo + ' — Pull Request ' + pr.ref + '. La solicitud pasará a «Revisión de PR».',
      label: 'Resumen de lo implementado (opcional)',
      required: false,
      confirm: 'Finalizar implementación',
      kind: 'ok',
      onConfirm(comment) {
        const upd = App.store.update(rec.id, (r) => {
          r.pr = Object.assign({}, pr, { por: { usuario: App.user.usuario, nombre: App.user.name }, fecha: new Date().toISOString() });
          r.estado = 'Revisión de PR';
          r.revision = null;
          App.Workflow.log(r, App.Workflow.activity('estado', App.user, {
            de: 'En implementación', a: 'Revisión de PR', comentario: comment, pr: pr.ref, prUrl: pr.url,
          }));
        });
        if (!upd) return;
        App.toastSuccess(rec.id + ': implementación finalizada. Pasó a «Revisión de PR».');
        App.History.detail(upd);
      },
    });
  }

  function saveReview() {
    const rec = App.store.get(App.Review.current());
    if (!rec || !isCommittee(App.user) || estadoOf(rec) !== 'Revisión de PR') return;
    const tipo = $('verTipo').value;
    const num = ($('verNum').value || '').trim();
    if (tipo && W().versionOptions(rec).indexOf(tipo) < 0) {
      err('revErr', 'La versión ' + tipo + ' no corresponde a este tipo de cambio.'); return;
    }
    if (num && !W().SEMVER.test(num)) { err('revErr', 'Use el formato v2.4.0 (mayor.menor.parche).'); $('verNum').focus(); return; }
    err('revErr', '');
    const revision = {
      prRevisado: $('chkPr').checked,
      mergeDevelop: $('chkMerge').checked,
      version: tipo || num ? { tipo, numero: num } : null, // se conserva el número aunque aún no se haya elegido el tipo
      por: { usuario: App.user.usuario, nombre: App.user.name },
      fecha: new Date().toISOString(),
    };
    const upd = App.store.update(rec.id, (r) => {
      r.revision = revision;
      App.Workflow.log(r, App.Workflow.activity('revision', App.user, {
        prRevisado: revision.prRevisado, mergeDevelop: revision.mergeDevelop, version: verText(revision.version),
      }));
    });
    if (!upd) return;
    App.Review.renderDetail(upd, App.user);
    const falta = W().guard(upd, 'Implementada');
    App.toastSuccess(falta ? 'Revisión guardada. Falta: ' + falta : 'Revisión guardada. Ya puede aprobar el PR y cerrar el cambio.');
  }

  /* ---------- Inicio ---------- */
  function init() {
    $('detailSide').addEventListener('click', (e) => {
      const b = e.target.closest('[data-impl]');
      if (!b) return;
      const act = b.getAttribute('data-impl');
      const rec = App.store.get(App.Review.current());
      if (!rec) return;
      if (act === 'finish') finish();
      else if (act === 'verify-pr') verifyPR(rec, false);
      else if (act === 'verify-merge') verifyPR(rec, true);
      else if (act === 'save-review') saveReview();
    });
    $('detailSide').addEventListener('input', (e) => {
      if (e.target.id === 'prInput') err('prErr', '');
      if (e.target.id === 'verNum') err('revErr', '');
    });
    $('detailImpl').addEventListener('submit', (e) => {
      if (e.target.id === 'avanceForm') addAvance(e);
    });
    $('detailImpl').addEventListener('input', (e) => {
      if (e.target.id === 'avanceText') err('avanceErr', '');
    });
  }

  App.Impl = { init, mainHTML, sideHTML, parsePR, verText };
})();
