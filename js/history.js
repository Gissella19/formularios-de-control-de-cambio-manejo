/* =====================================================================
   history.js — historial de solicitudes y vista de detalle.
   - Desarrollador: ve todas las solicitudes (técnicas y de usuarios).
   - Usuario: ve solo las que él envió.
   - Buscador robusto: tolera tildes, mayúsculas, múltiples palabras y
     ofrece filtros independientes por Tipo y por Solicitante.
   ===================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const $ = App.byId;

  let current = null;
  let activeUser = null;
  let allVisible = [];

  /* Normalización: minúsculas, sin tildes/diacríticos y sin espacios extra */
  function norm(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /* ---------- Extracción de datos del solicitante ---------- */
  function getSolicitante(r) {
    if (!r) return '—';
    if (r.datos && r.datos.solicitante) return String(r.datos.solicitante);
    if (r.solicitante) {
      if (typeof r.solicitante === 'string') return r.solicitante;
      if (r.solicitante.nombre) return String(r.solicitante.nombre);
    }
    // Si es un registro previo sin objeto datos, buscar en las filas de secciones
    if (Array.isArray(r.secciones)) {
      for (let s = 0; s < r.secciones.length; s++) {
        const sec = r.secciones[s];
        if (Array.isArray(sec.filas)) {
          for (let f = 0; f < sec.filas.length; f++) {
            const row = sec.filas[f];
            const label = norm(row[0]);
            if (label.includes('solicitante') || label.includes('desarrollador responsable') || label.includes('nombre completo')) {
              if (row[1]) return String(row[1]);
            }
          }
        }
      }
    }
    if (r.autor && r.autor.nombre) return String(r.autor.nombre);
    return '—';
  }

  function getSolicitanteSub(r) {
    if (!r) return '';
    if (r.datos && r.datos.departamento) return String(r.datos.departamento);
    if (r.solicitante && r.solicitante.area) return String(r.solicitante.area);
    if (r.datos && r.datos.correo) return String(r.datos.correo);
    if (r.solicitante && r.solicitante.correo) return String(r.solicitante.correo);
    if (r.autor && r.autor.correo) return String(r.autor.correo);
    if (Array.isArray(r.secciones)) {
      for (let s = 0; s < r.secciones.length; s++) {
        const sec = r.secciones[s];
        if (Array.isArray(sec.filas)) {
          for (let f = 0; f < sec.filas.length; f++) {
            const row = sec.filas[f];
            const label = norm(row[0]);
            if (label.includes('departamento') || label.includes('area') || label.includes('correo')) {
              if (row[1]) return String(row[1]);
            }
          }
        }
      }
    }
    return '';
  }

  function getTipoLabel(r) {
    return r.tipo === 'tecnica' ? 'Técnica' : 'Usuario';
  }

  /* Construye todo el contenido textual del registro para búsqueda por tokens */
  function buildRecordCorpus(r) {
    const parts = [];
    if (r.id) parts.push(r.id);

    // Tipo y variantes semánticas
    parts.push(getTipoLabel(r));
    parts.push('tipo');
    if (r.tipo === 'tecnica') parts.push('tecnica', 'tecnico', 'cr', 'desarrollo', 'dev');
    else parts.push('usuario', 'rfc', 'solicitud usuario');

    if (r.datos && r.datos.tipoCambio) parts.push(r.datos.tipoCambio);
    if (r.cambio && r.cambio.tipo) parts.push(r.cambio.tipo);

    // Solicitante y sinónimos
    parts.push('solicitante', 'responsable', 'autor');
    const sol = getSolicitante(r);
    if (sol && sol !== '—') parts.push(sol);
    const solSub = getSolicitanteSub(r);
    if (solSub) parts.push(solSub);

    // Autor
    if (r.autor) {
      if (r.autor.nombre) parts.push(r.autor.nombre);
      if (r.autor.usuario) parts.push(r.autor.usuario);
      if (r.autor.correo) parts.push(r.autor.correo);
      if (r.autor.rol) parts.push(r.autor.rol);
    }

    // Datos técnicos extra
    if (r.datos) {
      if (r.datos.leadReviewer) parts.push(r.datos.leadReviewer);
      if (r.datos.sistema) parts.push(r.datos.sistema);
      if (r.datos.prioridad) parts.push(r.datos.prioridad);
    }
    if (r.cambio) {
      if (r.cambio.sistema) parts.push(r.cambio.sistema);
    }

    if (r.titulo) parts.push(r.titulo);
    if (r.estado) parts.push(r.estado);

    return parts.join(' ');
  }

  /* ---------- Criterio de filtrado reactivo ---------- */
  function matchRecord(r, query, filterTipo, filterSol) {
    // 1. Filtro Tipo (select)
    if (filterTipo && filterTipo !== 'todos') {
      if (r.tipo !== filterTipo) return false;
    }

    // 2. Filtro Solicitante (select)
    if (filterSol && filterSol !== 'todos') {
      const solNorm = norm(getSolicitante(r));
      const targetNorm = norm(filterSol);
      if (!solNorm.includes(targetNorm)) return false;
    }

    // 3. Búsqueda por texto (palabras/tokens sin importar acentos ni orden)
    if (!query) return true;
    const corpus = norm(buildRecordCorpus(r));
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    return tokens.every((token) => corpus.includes(token));
  }

  /* Rellena dinámicamente el selector de solicitantes con los nombres existentes */
  function populateSolicitantes(list) {
    const sel = $('histFilterSol');
    if (!sel) return;
    const currentVal = sel.value || 'todos';
    const namesSet = new Set();
    list.forEach((r) => {
      const s = getSolicitante(r);
      if (s && s !== '—') namesSet.add(s);
    });
    const names = Array.from(namesSet).sort();

    sel.innerHTML =
      '<option value="todos">Todos los solicitantes</option>' +
      names.map((name) => '<option value="' + App.esc(name) + '">' + App.esc(name) + '</option>').join('');

    if (names.includes(currentVal)) {
      sel.value = currentVal;
    } else {
      sel.value = 'todos';
    }
  }

  /* ---------- Renderizado de filas y estado de búsqueda ---------- */
  function updateView() {
    if (!activeUser) return;
    const searchInput = $('histSearch');
    const query = (searchInput ? searchInput.value : '').trim();
    const filterTipo = $('histFilterTipo') ? $('histFilterTipo').value : 'todos';
    const filterSol = $('histFilterSol') ? $('histFilterSol').value : 'todos';

    const clearBtn = $('histSearchClear');
    if (clearBtn) clearBtn.hidden = !query;

    const filtered = allVisible.filter((r) => matchRecord(r, query, filterTipo, filterSol));

    // Contador informativo
    const countEl = $('histCount');
    if (countEl) {
      if (allVisible.length === 0) {
        countEl.textContent = '';
      } else if (!query && filterTipo === 'todos' && filterSol === 'todos') {
        countEl.textContent = allVisible.length === 1 ? '1 solicitud' : allVisible.length + ' solicitudes';
      } else {
        countEl.textContent = filtered.length + ' de ' + allVisible.length + ' ' + (allVisible.length === 1 ? 'solicitud' : 'solicitudes');
      }
    }

    const tableEl = $('histTable') || ($('histRows') ? $('histRows').closest('table') : null);
    const filterBar = $('histFilterBar');
    const emptyEl = $('histEmpty');

    if (allVisible.length === 0) {
      if (filterBar) filterBar.hidden = true;
      if (tableEl) tableEl.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML = 'Aún no hay solicitudes registradas.';
      }
      return;
    }

    if (filterBar) filterBar.hidden = false;
    if (tableEl) tableEl.hidden = false;

    if (filtered.length === 0) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.innerHTML =
          '<div class="hist-no-results">' +
          'No se encontraron solicitudes que coincidan con la búsqueda.' +
          '<button type="button" class="linkbtn" id="btnResetFilter" style="margin-left:8px; font-weight:700;">Restablecer filtros</button>' +
          '</div>';
        const rst = $('btnResetFilter');
        if (rst) {
          rst.addEventListener('click', () => {
            if ($('histSearch')) $('histSearch').value = '';
            if ($('histFilterTipo')) $('histFilterTipo').value = 'todos';
            if ($('histFilterSol')) $('histFilterSol').value = 'todos';
            updateView();
            if ($('histSearch')) $('histSearch').focus();
          });
        }
      }
      $('histRows').innerHTML = '';
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    $('histRows').innerHTML = filtered
      .map((r) => {
        const sol = getSolicitante(r);
        const sub = getSolicitanteSub(r);
        const tipoCls = r.tipo === 'tecnica' ? 'tecnica' : 'usuario';
        const tipoTxt = getTipoLabel(r);
        return (
          '<tr>' +
          '<td><span class="mono hist-code">' + App.esc(r.id) + '</span></td>' +
          '<td><span class="hist-type-badge ' + tipoCls + '">' + tipoTxt + '</span></td>' +
          '<td><div class="hist-cell-title">' + App.esc(r.titulo) + '</div></td>' +
          '<td><div class="hist-sol-name">' + App.esc(sol) + '</div>' +
          (sub ? '<div class="hist-sol-sub">' + App.esc(sub) + '</div>' : '') +
          '</td>' +
          '<td>' + App.tag(r.prioridad) + '</td>' +
          '<td>' + App.esc(App.fmtDate(r.fechaDeseada)) + '</td>' +
          '<td><span class="hist-status-pill">' + App.esc(r.estado) + '</span></td>' +
          '<td><span class="hist-date-text">' + App.esc(App.fmtDateTime(r.creada)) + '</span></td>' +
          '<td style="text-align:center;"><button type="button" class="btn sec sm" data-ver="' + App.esc(r.id) + '">Ver</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ---------- Render principal ---------- */
  function render(user) {
    activeUser = user;
    const dev = user.role === 'desarrollador';
    $('histLead').textContent = dev
      ? 'Todas las solicitudes registradas en este navegador, técnicas y de usuarios.'
      : 'Las solicitudes que ha enviado desde este navegador.';

    // Encabezado con los campos solicitados
    $('histHead').innerHTML =
      '<tr>' +
      '<th scope="col" style="width:130px;">N.º</th>' +
      '<th scope="col" style="width:105px;">Tipo</th>' +
      '<th scope="col">Título</th>' +
      '<th scope="col" style="width:170px;">Solicitante</th>' +
      '<th scope="col" style="width:115px;">Importancia</th>' +
      '<th scope="col" style="width:120px;">Fecha deseada</th>' +
      '<th scope="col" style="width:125px;">Estado</th>' +
      '<th scope="col" style="width:145px;">Enviada</th>' +
      '<th scope="col" style="width:80px; text-align:center;">Acción</th>' +
      '</tr>';

    allVisible = App.store.visibleFor(user).slice().sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
    populateSolicitantes(allVisible);
    updateView();
  }

  /* ---------- Detalle de solicitud ---------- */
  function detail(rec) {
    current = rec;
    $('detailTitle').textContent = rec.id + ' · ' + rec.titulo;
    $('detailMeta').textContent =
      (rec.tipo === 'tecnica' ? 'Solicitud técnica' : 'Solicitud de usuario') +
      (rec.autor ? ' de ' + rec.autor.nombre : '') + ' · enviada ' + App.fmtDateTime(rec.creada);
    $('detailStatus').textContent = rec.estado.toUpperCase();
    $('detailBody').innerHTML = App.sectionsHTML(rec.secciones || [], false);
    App.show('detail');
  }

  /* ---------- Inicialización ---------- */
  function init() {
    $('histRows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ver]');
      if (!b) return;
      const rec = App.store.get(b.getAttribute('data-ver'));
      if (rec) detail(rec);
    });

    $('btnHistNew').addEventListener('click', () => App.newRequest());
    $('btnDetailBack').addEventListener('click', () => App.openHistory());
    $('btnDetailPrint').addEventListener('click', () => window.print());

    const searchInput = $('histSearch');
    if (searchInput) {
      searchInput.addEventListener('input', updateView);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchInput.value) {
          searchInput.value = '';
          updateView();
        }
      });
    }

    const clearBtn = $('histSearchClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        updateView();
      });
    }

    const filterTipo = $('histFilterTipo');
    if (filterTipo) {
      filterTipo.addEventListener('change', updateView);
    }

    const filterSol = $('histFilterSol');
    if (filterSol) {
      filterSol.addEventListener('change', updateView);
    }
  }

  App.History = { init, render, detail, norm, getSolicitante, matchRecord };
})();
