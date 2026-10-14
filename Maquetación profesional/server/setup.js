const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const envPath = path.resolve(__dirname, "..", ".env");

if (fs.existsSync(envPath)) {
    console.error("Ya existe .env. No se modificó para proteger las claves actuales.");
    process.exitCode = 1;
} else {
    const env = [
        "PORT=3000",
        "HOST=127.0.0.1",
        `APP_ENCRYPTION_KEY=${crypto.randomBytes(32).toString("hex")}`,
        "ADMIN_NAME=Administración AulaNexo",
        "ADMIN_EMAIL=admin@aulanexo.local",
        `ADMIN_PASSWORD=${crypto.randomBytes(32).toString("base64url")}`,
        ""
    ].join("\n");

    fs.writeFileSync(envPath, env, { flag: "wx", mode: 0o600 });
    console.log("Configuración local creada en .env.");
    console.log("Conserva ese archivo fuera de Git y consulta sus credenciales para el primer acceso.");
}
