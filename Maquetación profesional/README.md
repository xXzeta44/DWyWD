# AulaNexo

Sitio local para consultar publicaciones, actividades, recursos y la galería del grupo. La gestión de contenido, integrantes, archivos, ubicaciones y cuentas requiere una cuenta administradora.

## Requisitos y primer inicio

- Node.js 20.17 o superior y npm.
- Desde esta carpeta, instala dependencias con `npm install`.
- Ejecuta `npm run setup` una vez. El comando crea `.env` con una clave de cifrado aleatoria y credenciales de administración iniciales. Consulta esas credenciales localmente y conserva `.env` fuera del control de versiones.
- Inicia el servidor con `npm start` y abre <http://127.0.0.1:3000/>.

El servidor se enlaza solo a `127.0.0.1` por defecto; no lo expongas a Internet. `npm run dev` inicia el servidor con reinicio automático durante el desarrollo. La base SQLite se crea automáticamente en `database/aulanexo.sqlite`.

## Persistencia y seguridad

- SQLite utiliza el paquete nativo `sqlite3`; los datos iniciales se crean automáticamente en el primer arranque.
- Los registros, la configuración del mapa y los archivos adjuntos se cifran con AES-256-GCM antes de guardarse en SQLite. Correos se indexan mediante HMAC y las contraseñas se derivan con scrypt. No se almacenan contraseñas en texto claro.
- La clave `APP_ENCRYPTION_KEY` solo vive en `.env`, no en la base de datos. Guarda una copia segura de `.env` junto a la copia de seguridad de la base; sin la misma clave no se podrán descifrar los datos.
- Las sesiones usan identificadores aleatorios opacos, se guardan como hashes y se sirven en cookies `HttpOnly` y `SameSite=Strict`. Helmet, límites de intentos, validación de origen y autorización del lado del servidor protegen las rutas.
- Las cuentas creadas desde el registro son de consulta; solo la cuenta administradora inicial puede gestionar información. El administrador puede crear cuentas adicionales desde gestión.
- Los datos de integrantes marcados para aparecer en la portada y las ubicaciones publicadas son visibles para usuarios con sesión iniciada. Comparte únicamente información autorizada.
- El contenido que estuviera guardado previamente en `localStorage` o `IndexedDB` no se importa automáticamente; crea las cuentas de nuevo y vuelve a cargar los archivos que quieras conservar.

`npm test` ejecuta las pruebas de integración del servidor, permisos y cifrado.