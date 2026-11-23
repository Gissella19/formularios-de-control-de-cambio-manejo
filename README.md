# Solicitud de cambio de software

Aplicación web sin servidor: abra `index.html` en el navegador.

## Cuentas de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Desarrollador | `dev` | `dev123` |
| Usuario | `usuario` | `user123` |
| Comité CCB | `comite` | `comite123` |

> Es una demostración: las cuentas están en `js/store.js` y no ofrecen seguridad real.
> Para producción hace falta un servidor con autenticación.

## Qué hace cada rol

- **Desarrollador**: formulario técnico (CR) en 3 fases, vista previa, imprimir/PDF, envío al CCB e historial de **todas** las solicitudes. Puede seguir el estado y comentar.
- **Usuario**: formulario de usuario (Sus datos → El cambio → Revisar y enviar) e historial de **sus** solicitudes. Puede ver la decisión del comité y comentar.
- **Comité CCB**: gestiona y aprueba todas las solicitudes (no crea solicitudes). Ver abajo.

### Formularios

- **Departamento / Área**: lista desplegable en ambos formularios. La lista está en `App.DEPARTAMENTOS` (`js/utils.js`); se edita en un solo lugar.
- **Tipo de cambio** (Normal · Estándar · Emergencia): campo del formulario técnico. El formulario de usuario ya lo tenía. En el formulario técnico, el campo anterior "Tipo de cambio" (Correctivo, Evolutivo…) pasó a llamarse **Naturaleza del cambio**.

### Aprobación por el Comité CCB (modelo tipo Jira)

**Flujo de estados** (`js/workflow.js`). Solo se permiten las transiciones del diagrama:

```
Recibida ─► En revisión ─► Aprobada ─► Implementada
    │            │  ▲          │
    │            ▼  │          └─► reabrir: En revisión
    │      Cambios solicitados
    └──────────► Rechazada ─► reabrir: En revisión
```

- **Tablero** (vista por defecto del comité): una columna por estado, tarjetas con código, tipo de cambio, prioridad, solicitante y revisor. Las emergencias se muestran primero y resaltadas. Se pueden **arrastrar** las tarjetas; solo se iluminan las columnas permitidas. También hay vista **Lista** y filtros por tipo, solicitante y estado.
- **Detalle**: panel lateral con el estado y los botones de transición (Aprobar, Rechazar, Pedir cambios, Iniciar revisión, Marcar como implementada, Reabrir), asignación del revisor ("Asignarme") y **Modificar solicitud**.
- **Rechazar** y **Pedir cambios** exigen un motivo, que ve el solicitante.
- **Modificar solicitud**: el comité edita los campos de la solicitud y debe indicar el motivo. Se regenera la ficha impresa. Una solicitud *Implementada* queda cerrada y no se puede modificar.
- **Actividad**: bitácora de cada solicitud (creación, cambios de estado con motivo, ediciones con valor anterior → nuevo, asignaciones y comentarios). Los comentarios pueden escribirlos todos los roles.
- En la ficha impresa, la casilla "Comité CCB (Dictamen)" se marca sola con Aprobado/Rechazado. El panel de gestión y la actividad no se imprimen.

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
js/app.js           Arranque, vistas, barra lateral y roles
```

Los scripts son clásicos (no módulos) para que funcionen al abrir `index.html` con doble clic.
El orden de carga está en `index.html` y debe respetarse.

Las solicitudes guardadas antes de este cambio siguen funcionando: el estado antiguo
"Enviada a CCB" se muestra como "Recibida" y las que no tienen bitácora reciben su entrada de creación.
