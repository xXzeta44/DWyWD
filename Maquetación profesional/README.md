# Organizacion de Roles y Responsabilidades

# Roles y Responsabilidades:

- Reylin(NO. 1): Encargado de Estructura de la Pagina y Diseño de estructura.
- Crisbel(NO. 9): Encargada de Base de Datos y Logistica del Proyecto.
- Daniel(NO. 14): Encargado de Host, creacion de Servidor y Scripts; Organizacion de las Carpetas.

# Logistica de Carpetas:

- Front-End: "html", "css", "script"(Esta es la carpeta para guardar los archivos ".js" y ".ts").
- Back-End: "database" y "server".

- Reylin: HTML y CSS.
- Crisbel: Database.
- Daniel: Script y Server.

# Logistica de Lenguajes:

- Front-End: HTML, CSS, JavaScript.
- Back-End: Javascript, SQL.

# Logistica de dependencias:

- Front-End: (No definidos).
- Back-End: Sqlite3, entre otros...

PD: Si te pasaron la carpeta, escribe en la terminal "pnpm install" para instalar todas las dependencias.

# Instrucciones:

1. No toquen la carpeta de server o database, almenos que Daniel o Crisbel les avise carajo.
2. Si hacen un cambio, avisenlo por el grupo de Whatsapp, porfavor.
3. Cualquier error dentro del codigo, avisenlo y despues lo arreglan.

# Paginas del prototipo AulaNexo

- `html/index.html`: portada, proyectos, novedades, calendario, videos, contacto y ubicacion.
- `html/cuenta.html`: inicio de sesion y registro en pantallas separadas.
- `html/gestion.html`: recursos y administracion para integrantes con sesion iniciada.
- `css/aulanexo.css`: estilos compartidos.
- `script/`: scripts compartidos y comportamiento de cada pagina.

Abre la carpeta `Maquetación profesional` desde un servidor local (por ejemplo, la extension Live Server de VS Code) y visita `html/index.html` para probar las paginas y las cuentas entre ellas. Desde gestión se administran las publicaciones de la galería, los videos de “En primera persona” y el registro de integrantes con sus fotos; los mensajes del formulario de contacto también quedan disponibles para consulta desde gestión. Es solo una maqueta: los datos y archivos quedan en el navegador (localStorage e IndexedDB) y no existe seguridad real ni almacenamiento compartido entre dispositivos.