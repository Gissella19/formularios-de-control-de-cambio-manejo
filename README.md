# Solicitud de cambio de software

Aplicación web sin servidor: abra `index.html` en el navegador.

## Cuentas de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Desarrollador | `dev` | `dev123` |
| Desarrollador 2 | `dev2` | `dev123` |
| Usuario | `usuario` | `user123` |
| Comité CCB · presidente (superadmin) | `comite` | `comite123` |
| Comité CCB · miembro | `gisselle` | `gisselle123` |
| Comité CCB · miembro | `diego` | `diego123` |
| Comité CCB · miembro | `fernando` | `fernando123` |

> Es una demostración: las cuentas están en `js/store.js` y no ofrecen seguridad real.
> Para producción hace falta un servidor con autenticación.

## Qué hace cada rol

- **Desarrollador**: formulario técnico (CR) en 3 fases, vista previa, imprimir/PDF y envío al CCB. Tiene dos listas: **Mis solicitudes** (las que creó) y **Asignadas a mí** (las que el comité aprobó y le encargó implementar). No ve las solicitudes de otros. Puede seguir el estado y comentar.
- **Usuario**: formulario de usuario (Sus datos → El cambio → Revisar y enviar) e historial de **sus** solicitudes. Puede ver la decisión del comité y comentar.
- **Comité CCB**: gestiona y aprueba todas las solicitudes (no crea solicitudes). Lo forman el **presidente** (`comite`, superadmin) y los **miembros** (`gisselle`, `diego`, `fernando`). Ver abajo.

### Formularios

- **Planes de ejecución (formulario técnico, fase 2)**: **Plan de Rollout** (cómo se despliega: pasos, ventana, responsables, validación) y **Plan de Backout** (cómo se revierte: cuándo se activa, pasos, tiempo). Ambos son obligatorios (mínimo 30 caracteres). El antiguo «Plan de reversión (rollback)» de la fase 3 pasó a ser el Backout; la fase 3 quedó como «Riesgo y pruebas».

- **Departamento / Área**: lista desplegable en ambos formularios. La lista está en `App.DEPARTAMENTOS` (`js/utils.js`); se edita en un solo lugar.
- **Tipo de cambio** (Normal · Estándar · Emergencia): campo del formulario técnico. El formulario de usuario ya lo tenía. En el formulario técnico, el campo anterior "Tipo de cambio" (Correctivo, Evolutivo…) pasó a llamarse **Naturaleza del cambio**.

### Aprobación por el Comité CCB (modelo tipo Jira)

**Flujo de estados** (`js/workflow.js`). Solo se permiten las transiciones del diagrama:

```
Fase de aprobación (comité)
  Recibida ─► En revisión ─► Aprobada
      │            │  ▲
      │            ▼  │
      │      Cambios solicitados
      └──────────► Rechazada ─► reabrir: En revisión

Fase de implementación (desarrollador) y cierre (comité)
  Aprobada ──(dev registra la rama)──► En implementación
  En implementación ──(dev: PR + «Finalizar implementación»)──► Revisión de PR
  Revisión de PR ──(comité: PR revisado + merge a develop + versión)──► Implementada (cerrada)
  Revisión de PR ──(comité devuelve, con comentario)──► En implementación
```

- **Tablero** (vista por defecto del comité): una columna por estado, tarjetas con código, tipo de cambio, prioridad, solicitante y revisor. Las emergencias se muestran primero y resaltadas. Se pueden **arrastrar** las tarjetas; solo se iluminan las columnas permitidas. También hay vista **Lista** y filtros por tipo, solicitante y estado.
- **Detalle**: panel lateral con el estado y los botones de transición del comité (Aprobar, Rechazar, Pedir cambios, Iniciar revisión, Reabrir, y en la fase final Aprobar PR y cerrar cambio / Devolver al desarrollador), asignación del revisor y **Modificar solicitud**. Las transiciones del desarrollador (iniciar y finalizar la implementación) las hace él mismo, no el comité.
- **Aprobar**, **Rechazar**, **Pedir cambios**, **Devolver al desarrollador** y **Aprobar PR y cerrar cambio** exigen un comentario (mínimo 5 caracteres), que ven el solicitante y el desarrollador.
- **Modificar solicitud**: el comité edita los campos de la solicitud y debe indicar el motivo. Se regenera la ficha impresa. Una solicitud *Implementada* queda cerrada y no se puede modificar.
- **Planes de ejecución** (solo solicitudes técnicas): la tarjeta «Planes de ejecución» tiene el botón **Detallar Rollout y Backout**, que abre un diálogo con los dos planes del desarrollador para que el comité los amplíe y aclare antes de aprobar y pasar a ejecución. Exige un motivo, regenera la ficha y deja en la bitácora qué cambió y quién lo hizo. «Modificar solicitud» también permite editarlos.
- **Revisor asignado** (tarjeta «Revisión»): el **presidente** asigna o reasigna la revisión a cualquier miembro (o a sí mismo); un **miembro** puede tomar una revisión que esté libre y soltar la suya, pero no quitársela a otro. El tablero y la lista se pueden filtrar por revisor («Asignadas a mí», «Sin revisor» o un miembro). Todos los miembros del comité pueden cambiar el estado y modificar solicitudes.
- **Desarrollador asignado**: cuando la solicitud está *Aprobada*, el comité elige qué desarrollador la implementa (tarjeta «Implementación»); se puede reasignar o quitar. La solicitud aparece en la lista «Asignadas a mí» de ese desarrollador y su avatar (verde) se ve en el tablero.
- **Trabajo en Git (rama de trabajo)**: el desarrollador asignado, mientras la solicitud está *Aprobada* o *En implementación*, abre la solicitud en «Asignadas a mí» y define en la tarjeta «Trabajo en Git» el **repositorio** (`organizacion/repositorio`, precargado si la solicitud es técnica) y la **rama**. Se valida el formato y se rechazan ramas protegidas (`main`, `master`, `develop`, `release`…). Botones:
  - **Sugerir nombre**: propone `feature/`, `fix/` o `hotfix/` (emergencia) + código + descripción.
  - **Cargar ramas de GitHub**: lista las ramas del repositorio para elegirlas.
  - **Verificar en GitHub**: dice si la rama existe (con su último commit y enlace) o, si no, muestra los comandos `git checkout -b …` para crearla.
  - La rama queda en la bitácora (con la anterior si se cambia), en la lista del desarrollador y, en solo lectura y con enlace a GitHub, para el comité y el solicitante.
  - La conexión usa la **API pública de GitHub, solo lectura y sin token**: los repositorios privados no se pueden consultar (límite: 60 consultas por hora) y crear ramas desde la web requeriría un token y un servidor, que no están incluidos.
### Implementación y cierre (desarrollador → comité)

1. **Inicio (desarrollador).** En «Asignadas a mí» abre la solicitud y, en «Trabajo en Git», pulsa **Sugerir nombre** (`feature/CODIGO-nombre`, `fix/…` o `hotfix/…` si es emergencia) y **Guardar rama e iniciar implementación**: la solicitud pasa a **En implementación**. El comité también puede dejar la rama preasignada (sin iniciar); el desarrollador la confirma al guardar.
2. **Ejecución (desarrollador).** En la **Bitácora de implementación** registra las actividades o avances que va realizando (como comentarios o commits de Jira). Quedan con fecha y autor, y también en la actividad general.
3. **Fin del desarrollo (desarrollador).** En «Finalizar implementación» ingresa el **Pull Request** (número `42` / `#42` o el enlace `https://github.com/org/repo/pull/42`; debe ser del mismo repositorio que la rama). Puede pulsar **Verificar PR en GitHub** para ver su título, estado y ramas. Al pulsar **Finalizar implementación** (con un resumen opcional) la solicitud pasa **automáticamente a Revisión de PR**. Después de finalizar no puede editar nada más.
4. **Revisión y cierre (comité).** En «Revisión del Pull Request» el comité:
   - revisa el PR (enlace) y marca **Pull Request revisado**;
   - verifica y marca **Merge hacia develop** (el botón **Verificar PR y merge en GitHub** lo comprueba y lo marca solo si el PR está integrado en `develop`);
   - asigna la **versión semántica**: **Minor o Major** si el cambio es Normal o Estándar, **Patch** si es de Emergencia (el sistema solo ofrece las opciones válidas y bloquea el cierre si no corresponde). Opcionalmente anota el número (`v2.4.0`);
   - pulsa **Guardar revisión** y luego **Aprobar PR y cerrar cambio**. Si falta algo (PR revisado, merge o versión) el cierre se bloquea y se indica qué falta. El cambio queda **Implementada** (cerrado) con su versión registrada.
   - Si hay observaciones, **Devolver al desarrollador** (con comentario): vuelve a *En implementación*, se reinicia la revisión y el desarrollador puede corregir y volver a finalizar.

La verificación en GitHub usa la API pública (solo lectura, sin token): no funciona con repositorios privados y tiene un límite de consultas por hora.

- **Actividad**: bitácora de cada solicitud (creación, cambios de estado con motivo, ediciones con valor anterior → nuevo, asignaciones y comentarios). Los comentarios pueden escribirlos todos los roles.
- El panel de gestión y la actividad no se imprimen: la ficha impresa incluye solo los datos de la solicitud.

## Estructura

```
index.html          Estructura: login, layout, modales y plantillas de los dos formularios
css/styles.css      Todos los estilos (incluye tablero y panel del comité)
js/utils.js         Utilidades, catálogos (departamentos, tipos de cambio), avisos (toast) y modal
js/store.js         Cuentas, sesión y solicitudes (localStorage con respaldo en memoria)
js/workflow.js      Estados, transiciones permitidas y bitácora de actividad
js/validator.js     Validación reutilizable (mensajes solo cuando hacen falta)
js/auth.js          Inicio de sesión
js/dev-form.js      Formulario del desarrollador (lógica)
js/user-form.js     Formulario del usuario (lógica)
js/history.js       Historial (lista / tablero) y detalle de solicitudes
js/review.js        Gestión del comité: tablero, transiciones, edición, comentarios
js/git-branch.js    Rama de trabajo del desarrollador y conexión con la API de GitHub
js/impl.js          Bitácora de implementación, Pull Request, revisión del comité, merge y versión
js/app.js           Arranque, vistas, barra lateral y roles
```

Los scripts son clásicos (no módulos) para que funcionen al abrir `index.html` con doble clic.
El orden de carga está en `index.html` y debe respetarse.

Las solicitudes guardadas antes de este cambio siguen funcionando: el estado antiguo
"Enviada a CCB" se muestra como "Recibida" y las que no tienen bitácora reciben su entrada de creación.
