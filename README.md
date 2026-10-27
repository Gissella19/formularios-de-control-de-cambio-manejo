# Solicitud de cambio de software

Aplicación web sin servidor: abra `index.html` en el navegador.

## Cuentas de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Desarrollador | `dev` | `dev123` |
| Usuario | `usuario` | `user123` |

> Es una demostración: las cuentas están en `js/store.js` y no ofrecen seguridad real.
> Para producción hace falta un servidor con autenticación.

## Qué hace cada rol

- **Desarrollador**: formulario técnico (CR) en 3 fases, vista previa, imprimir/PDF, envío al CCB e historial de **todas** las solicitudes.
- **Usuario**: formulario de usuario (Sus datos → El cambio → Revisar y enviar) e historial de **sus** solicitudes.

## Estructura

```
index.html          Estructura: login, layout, modal y plantillas de los dos formularios
css/styles.css      Todos los estilos (diseño del formulario de usuario)
js/utils.js         Utilidades, avisos emergentes (toast) y modal
js/store.js         Cuentas, sesión y solicitudes (localStorage con respaldo en memoria)
js/validator.js     Validación reutilizable (mensajes solo cuando hacen falta)
js/auth.js          Inicio de sesión
js/dev-form.js      Formulario del desarrollador (lógica)
js/user-form.js     Formulario del usuario (lógica)
js/history.js       Historial y detalle de solicitudes
js/app.js           Arranque, vistas, barra lateral y roles
```

Los scripts son clásicos (no módulos) para que funcionen al abrir `index.html` con doble clic.
El orden de carga está en `index.html` y debe respetarse.
