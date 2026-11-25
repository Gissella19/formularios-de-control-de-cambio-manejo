/* =====================================================================
   git-branch.js — rama de trabajo de la solicitud y conexión con GitHub.

   El desarrollador al que el comité asignó la solicitud indica en qué
   repositorio y rama trabajará. Al guardar la rama con la solicitud en
   «Aprobada», la implementación se inicia (estado «En implementación»).
   El comité también puede dejar la rama preasignada (sin iniciar).
   Todos los roles ven el dato (solo lectura) con un enlace a GitHub.

   Conexión con GitHub: API pública de solo lectura (sin token):
     · cargar las ramas del repositorio,
     · verificar si la rama ya existe,
     · enlazar a la rama.
   Los repositorios privados no responden sin token, y crear ramas requiere
   autenticación; eso necesitaría un servidor y no está incluido.
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = App.byId;

  const API = 'https://api.github.com';
  const PROTECTED = ['main', 'master', 'develop', 'development', 'production', 'release'];
  const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

  /* ---------- Reglas ---------- */
  /* Quién puede editar la rama: el desarrollador asignado mientras trabaja; el comité solo para preasignarla. */
  function editMode(rec, user) {
    if (!user || !rec.implementador) return '';
    const est = App.Workflow.normalize(rec.estado);
    if (user.role === 'desarrollador' && rec.implementador.usuario === user.usuario && App.Workflow.isWorking(est)) return 'dev';
    if (user.role === 'comite' && est === 'Aprobada') return 'comite';
    return '';
  }
  const canEdit = (rec, user) => !!editMode(rec, user);
  const starts = (rec, mode) => mode === 'dev' && App.Workflow.normalize(rec.estado) === 'Aprobada';

  function repoError(repo) {
    if (!repo) return 'Indique el repositorio.';
    if (!REPO_RE.test(repo)) return 'Use el formato organizacion/repositorio.';
    return '';
  }

  function branchError(name) {
    if (!name) return 'Indique la rama de trabajo.';
    if (/\s/.test(name)) return 'El nombre de la rama no puede tener espacios.';
    if (name.length > 100) return 'El nombre de la rama es demasiado largo (máximo 100).';
    if (/[~^:?*[\\]/.test(name) || name.includes('..') || name.includes('@{') || name.includes('//')) {
      return 'El nombre de la rama tiene caracteres no permitidos.';
    }
    if (/^[-/.]|[/.]$|\.lock$/.test(name)) return 'El nombre de la rama no es válido (no puede empezar o terminar con «-», «/» o «.»).';
    if (PROTECTED.indexOf(name.toLowerCase()) >= 0) {
      return '«' + name + '» es una rama protegida: trabaje en una rama propia (por ejemplo feature/…).';
    }
    return '';
  }

  const slug = (s) =>
    String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

  /* Nombre sugerido: tipo/CODIGO-descripcion-corta */
  function suggest(rec) {
    const clase = String(App.Workflow.claseOf(rec)).toLowerCase();
    const nat = String((rec.datos && rec.datos.tipoCambio) || (rec.cambio && rec.cambio.categoria) || '').toLowerCase();
    const prefix = clase.startsWith('eme') ? 'hotfix' : (nat.includes('correctivo') || nat.includes('error')) ? 'fix' : 'feature';
    const base = rec.tipo === 'tecnica' ? (rec.datos && rec.datos.sistema) : (rec.cambio && rec.cambio.titulo);
    const s = slug(base || rec.titulo);
    return prefix + '/' + rec.id + (s ? '-' + s : '');
  }

  const branchUrl = (repo, rama) =>
    'https://github.com/' + repo + '/tree/' + String(rama).split('/').map(encodeURIComponent).join('/');

  /* ---------- Tarjeta del panel lateral ---------- */
  function cardHTML(rec, user) {
    const g = rec.git;
    if (!rec.implementador && !g) return '';
    const mode = editMode(rec, user);
    const editable = !!mode;
    const prop = rec.datos ? { repo: rec.datos.repositorio || '', rama: rec.datos.ramaOrigen || '' } : { repo: '', rama: '' };

    if (!editable) {
      if (!g) {
        return '<div class="side-card"><h3 class="side-h">Trabajo en Git</h3>' +
          '<p class="side-note" style="margin-top:0">El desarrollador asignado aún no definió la rama de trabajo.</p></div>';
      }
      return '<div class="side-card"><h3 class="side-h">Trabajo en Git</h3><dl class="side-dl">' +
        '<div class="side-row"><dt>Repositorio</dt><dd class="mono">' + App.esc(g.repositorio) + '</dd></div>' +
        '<div class="side-row"><dt>Rama</dt><dd><a class="git-link mono" target="_blank" rel="noopener noreferrer" href="' +
          App.esc(branchUrl(g.repositorio, g.rama)) + '">' + App.esc(g.rama) + '</a></dd></div>' +
        (g.definidaPor ? '<div class="side-row"><dt>Definida por</dt><dd>' + App.esc(g.definidaPor.nombre) +
          '<br><small>' + App.esc(App.fmtDateTime(g.fecha)) + '</small></dd></div>' : '') +
        '</dl></div>';
    }

    return (
      '<div class="side-card" id="gitCard">' +
        '<h3 class="side-h">Trabajo en Git</h3>' +
        '<div class="f"><label class="l req" for="gitRepo">Repositorio</label>' +
          '<input id="gitRepo" class="mono" autocapitalize="off" spellcheck="false" placeholder="organizacion/repositorio" value="' +
          App.esc((g && g.repositorio) || prop.repo) + '" /></div>' +
        '<div class="f"><label class="l req" for="gitBranch">Rama de trabajo</label>' +
          '<input id="gitBranch" class="mono" list="gitBranchList" autocapitalize="off" spellcheck="false" placeholder="feature/' + App.esc(rec.id) + '-…" value="' +
          App.esc((g && g.rama) || '') + '" /><datalist id="gitBranchList"></datalist></div>' +
        (prop.rama ? '<p class="side-note" style="margin-top:-4px">El solicitante propuso la rama <code>' + App.esc(prop.rama) + '</code>.</p>' : '') +
        '<div class="msg" id="gitErr" role="alert" hidden></div>' +
        '<div class="git-msg" id="gitMsg" role="status" hidden></div>' +
        '<div class="side-actions">' +
          '<button type="button" class="btn sm" data-git="save">' + (starts(rec, mode) ? 'Guardar rama e iniciar implementación' : 'Guardar rama') + '</button>' +
          '<button type="button" class="btn sm sec" data-git="suggest">Sugerir nombre</button>' +
          '<button type="button" class="btn sm sec" data-git="load">Cargar ramas de GitHub</button>' +
          '<button type="button" class="btn sm sec" data-git="verify">Verificar en GitHub</button>' +
        '</div>' +
        (starts(rec, mode) ? '<p class="side-note">Al guardar la rama, la solicitud pasa a «En implementación».</p>' : '') +
        (mode === 'comite' ? '<p class="side-note">Puede dejar la rama definida; el desarrollador la confirmará para iniciar la implementación.</p>' : '') +
        '<p class="side-note">Consulta la API pública de GitHub (solo lectura). Los repositorios privados no se pueden consultar.</p>' +
      '</div>'
    );
  }

  /* ---------- Mensajes ---------- */
  function showErr(text) {
    const e = $('gitErr');
    if (!e) return;
    e.textContent = text || '';
    e.hidden = !text;
  }
  function showMsg(kind, html) {
    const m = $('gitMsg');
    if (!m) return;
    m.className = 'git-msg ' + kind;
    m.innerHTML = html || '';
    m.hidden = !html;
  }

  /* ---------- API de GitHub ---------- */
  async function gh(path) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
    try {
      return await window.fetch(API + path, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: ctrl ? ctrl.signal : undefined,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function networkProblem(res) {
    if (res.status === 403 || res.status === 429) {
      return 'GitHub limitó las consultas sin autenticación (60 por hora). Intente más tarde.';
    }
    return 'GitHub respondió con un error (' + res.status + ').';
  }
  const failed = () => 'No se pudo conectar con GitHub. Revise su conexión a internet.';

  function readInputs() {
    return { repo: ($('gitRepo').value || '').trim(), rama: ($('gitBranch').value || '').trim() };
  }

  async function loadBranches() {
    const { repo } = readInputs();
    const err = repoError(repo);
    showErr(err); showMsg('', '');
    if (err) return;
    showMsg('info', 'Consultando GitHub…');
    try {
      const res = await gh('/repos/' + repo + '/branches?per_page=100');
      if (res.status === 404) { showMsg('', ''); showErr('No se encontró el repositorio «' + repo + '» (o es privado).'); return; }
      if (!res.ok) { showMsg('', ''); showErr(networkProblem(res)); return; }
      const list = await res.json();
      const names = (Array.isArray(list) ? list : []).map((b) => b.name);
      $('gitBranchList').innerHTML = names.map((n) => '<option value="' + App.esc(n) + '"></option>').join('');
      showMsg('ok', names.length
        ? names.length + (names.length === 1 ? ' rama cargada' : ' ramas cargadas') + ': pulse el campo «Rama de trabajo» para elegir o escriba una nueva.'
        : 'El repositorio no tiene ramas.');
    } catch (e) {
      showMsg('', ''); showErr(failed());
    }
  }

  async function verifyBranch(rec) {
    const { repo, rama } = readInputs();
    const err = repoError(repo) || branchError(rama);
    showErr(err); showMsg('', '');
    if (err) return;
    showMsg('info', 'Consultando GitHub…');
    try {
      const path = '/repos/' + repo + '/branches/' + rama.split('/').map(encodeURIComponent).join('/');
      const res = await gh(path);
      if (res.ok) {
        const b = await res.json();
        const sha = b && b.commit && b.commit.sha ? String(b.commit.sha).slice(0, 7) : '';
        showMsg('ok', 'La rama ya existe en GitHub' + (sha ? ' (último commit <code>' + App.esc(sha) + '</code>)' : '') + '. ' +
          '<a class="git-link" target="_blank" rel="noopener noreferrer" href="' + App.esc(branchUrl(repo, rama)) + '">Abrir en GitHub</a>');
        return;
      }
      if (res.status === 404) {
        const r2 = await gh('/repos/' + repo);
        if (r2.status === 404) { showMsg('', ''); showErr('No se encontró el repositorio «' + repo + '» (o es privado).'); return; }
        const base = (rec.datos && rec.datos.ramaDestino ? String(rec.datos.ramaDestino).split(' ')[0] : '') || 'main';
        showMsg('warn', 'La rama todavía no existe en GitHub. Créela con:' +
          '<pre class="git-cmd">git checkout -b ' + App.esc(rama) + ' ' + App.esc(base) + '\ngit push -u origin ' + App.esc(rama) + '</pre>');
        return;
      }
      showMsg('', ''); showErr(networkProblem(res));
    } catch (e) {
      showMsg('', ''); showErr(failed());
    }
  }

  /* ---------- Guardar ---------- */
  function save() {
    const id = App.Review.current();
    const rec = App.store.get(id);
    const mode = rec ? editMode(rec, App.user) : '';
    if (!rec || !mode) return;
    const { repo, rama } = readInputs();
    const err = repoError(repo) || branchError(rama);
    showErr(err);
    if (err) return;
    const prev = rec.git;
    const same = !!prev && prev.repositorio === repo && prev.rama === rama;
    const inicia = starts(rec, mode);
    if (same && !inicia) {
      App.toast('La rama de trabajo ya estaba guardada.', 'info');
      return;
    }
    const upd = App.store.update(id, (r) => {
      if (!same) {
        r.git = {
          repositorio: repo, rama,
          definidaPor: { usuario: App.user.usuario, nombre: App.user.name },
          fecha: new Date().toISOString(),
        };
        App.Workflow.log(r, App.Workflow.activity('rama', App.user, {
          repositorio: repo, rama, anterior: prev ? prev.rama : '',
        }));
      }
      if (inicia) {
        r.estado = 'En implementación';
        App.Workflow.log(r, App.Workflow.activity('estado', App.user, {
          de: 'Aprobada', a: 'En implementación', comentario: 'Implementación iniciada en la rama ' + rama + '.',
        }));
      }
    });
    if (!upd) return;
    if (inicia) {
      App.toastSuccess('Implementación iniciada en la rama ' + rama + '.');
      App.History.detail(upd);
    } else {
      App.Review.renderDetail(upd, App.user);
      App.toastSuccess('Rama de trabajo guardada: ' + rama + '.');
    }
  }

  /* Consulta de un Pull Request (API pública, solo lectura). */
  async function fetchPR(repo, numero) {
    try {
      const res = await gh('/repos/' + repo + '/pulls/' + numero);
      if (res.status === 404) return { error: 'No se encontró el Pull Request #' + numero + ' en «' + repo + '» (o el repositorio es privado).' };
      if (!res.ok) return { error: networkProblem(res) };
      const p = await res.json();
      return {
        pr: {
          titulo: p.title, estado: p.state, merged: !!p.merged,
          head: p.head && p.head.ref, base: p.base && p.base.ref,
          autor: p.user && p.user.login, url: p.html_url,
        },
      };
    } catch (e) {
      return { error: failed() };
    }
  }

  /* ---------- Inicio ---------- */
  function init() {
    $('detailSide').addEventListener('click', (e) => {
      const b = e.target.closest('[data-git]');
      if (!b) return;
      const act = b.getAttribute('data-git');
      const rec = App.store.get(App.Review.current());
      if (!rec) return;
      if (act === 'save') save();
      else if (act === 'suggest') { $('gitBranch').value = suggest(rec); showErr(''); $('gitBranch').focus(); }
      else if (act === 'load') loadBranches();
      else if (act === 'verify') verifyBranch(rec);
    });
    $('detailSide').addEventListener('input', (e) => {
      if (e.target.id === 'gitRepo' || e.target.id === 'gitBranch') showErr('');
    });
  }

  App.GitBranch = { init, cardHTML, suggest, branchError, repoError, branchUrl, fetchPR };
})();
