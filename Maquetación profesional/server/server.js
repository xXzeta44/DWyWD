const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const ROOT = path.resolve(__dirname, "..");
const COLLECTIONS = new Set(["news", "events", "resources", "gallery", "videos", "members", "messages"]);
const PUBLIC_COLLECTIONS = ["news", "events", "resources", "gallery", "videos", "members"];
const ADMIN_COLLECTIONS = ["news", "events", "resources", "gallery", "videos", "members", "messages"];
const SESSION_COOKIE = "aulanexo.sid";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;

const samples = {
    news: [
        { id: "news-1", title: "La inteligencia artificial en el aula", description: "Las herramientas de IA pueden apoyar la investigación y la creatividad cuando las usamos con criterio y verificamos la información.", date: "2026-10-01" },
        { id: "news-2", title: "Energía solar para comunidades", description: "Los paneles solares continúan mejorando su eficiencia y ayudan a imaginar soluciones energéticas más sostenibles.", date: "2026-10-03" }
    ],
    events: [
        { id: "event-1", title: "Muestra de proyectos del aula", description: "Presentación breve de ideas y prototipos del curso.", date: "2026-10-15" },
        { id: "event-2", title: "Jornada práctica de taller", description: "Trabajo en equipo para probar y mejorar nuestros proyectos.", date: "2026-10-27" }
    ],
    resources: [
        { id: "resource-1", title: "Guía para organizar un proyecto", description: "Pasos sencillos para planear una idea, repartir tareas y registrar avances.", link: "" }
    ],
    gallery: [
        { id: "gallery-1", title: "Prototipos con propósito", description: "Proyecto de taller · Diseño · Trabajo en equipo", image: "../img/proyectos1.jpeg" },
        { id: "gallery-2", title: "Aprender experimentando", description: "Experiencia académica · Investigación · Práctica", image: "../img/foto grupo.jpeg" },
        { id: "gallery-3", title: "Pequeñas ideas, grandes pasos", description: "En el taller · Creatividad · Innovación", image: "../img/proyectos1.jpeg" }
    ],
    videos: [],
    members: [],
    messages: []
};

function createStore({ dbPath, encryptionKey }) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey ?? "")) {
        throw new Error("APP_ENCRYPTION_KEY debe contener exactamente 64 caracteres hexadecimales. Ejecuta npm run setup.");
    }
    const masterKey = Buffer.from(encryptionKey, "hex");
    const encryptionKeyBytes = Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), "aulanexo/data-encryption/v1", 32));
    const indexKey = Buffer.from(crypto.hkdfSync("sha256", masterKey, Buffer.alloc(0), "aulanexo/email-index/v1", 32));
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new sqlite3.Database(dbPath);
    let writeQueue = Promise.resolve();

    function enqueueWrite(operation) {
        const queued = writeQueue.then(operation);
        writeQueue = queued.catch(() => {});
        return queued;
    }

    function rawRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function (error) {
                if (error) reject(error);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    function run(sql, params = []) {
        return enqueueWrite(() => rawRun(sql, params));
    }

    function rawGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
        });
    }

    function get(sql, params = []) {
        return enqueueWrite(() => rawGet(sql, params));
    }

    function rawAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
        });
    }

    function all(sql, params = []) {
        return enqueueWrite(() => rawAll(sql, params));
    }

    function rawExec(sql) {
        return new Promise((resolve, reject) => {
            db.exec(sql, (error) => error ? reject(error) : resolve());
        });
    }

    function exec(sql) {
        return enqueueWrite(() => rawExec(sql));
    }

    function transaction(operation) {
        return enqueueWrite(async () => {
            await rawRun("BEGIN IMMEDIATE");
            try {
                const result = await operation({ run: rawRun, get: rawGet, all: rawAll });
                await rawRun("COMMIT");
                return result;
            } catch (cause) {
                await rawRun("ROLLBACK");
                throw cause;
            }
        });
    }

    function seal(value) {
        const nonce = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKeyBytes, nonce);
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
        return JSON.stringify({
            nonce: nonce.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
            ciphertext: ciphertext.toString("base64")
        });
    }

    function unseal(value) {
        const sealed = JSON.parse(value);
        const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKeyBytes, Buffer.from(sealed.nonce, "base64"));
        decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(sealed.ciphertext, "base64")),
            decipher.final()
        ]).toString("utf8");
        return JSON.parse(plaintext);
    }

    function emailIndex(email) {
        return crypto.createHmac("sha256", indexKey).update(email.trim().toLowerCase()).digest("hex");
    }

    async function initialize() {
        await exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            PRAGMA secure_delete = ON;
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email_index TEXT NOT NULL UNIQUE,
                profile TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
            CREATE TABLE IF NOT EXISTS data_items (
                collection TEXT NOT NULL,
                id TEXT NOT NULL,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (collection, id)
            );
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_config (
                key TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
        `);

        for (const [collection, items] of Object.entries(samples)) {
            const count = await get("SELECT COUNT(*) AS count FROM data_items WHERE collection = ?", [collection]);
            if (count.count === 0 && items.length) {
                for (const item of items) await writeItem(collection, item);
            }
        }

        await run("DELETE FROM sessions WHERE expires_at <= ?", [Date.now()]);
        await seedInitialAdmin();
    }

    async function writeItem(collection, item, runQuery = run) {
        await runQuery(
            `INSERT INTO data_items (collection, id, payload, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(collection, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
            [collection, item.id, seal(item), new Date().toISOString()]
        );
    }

    async function readCollection(collection) {
        const rows = await all("SELECT payload FROM data_items WHERE collection = ? ORDER BY rowid", [collection]);
        return rows.map((row) => unseal(row.payload));
    }

    async function writeCollection(collection, items) {
        await transaction(async ({ run: runQuery }) => {
            await runQuery("DELETE FROM data_items WHERE collection = ?", [collection]);
            for (const item of items) await writeItem(collection, item, runQuery);
        });
    }

    async function appendItem(collection, item) {
        await transaction(({ run: runQuery }) => runQuery(
            "INSERT INTO data_items (collection, id, payload, updated_at) VALUES (?, ?, ?, ?)",
            [collection, item.id, seal(item), new Date().toISOString()]
        ));
    }

    async function createUser({ name, email, password, role = "member" }) {
        const normalizedEmail = email.trim().toLowerCase();
        const id = crypto.randomUUID();
        const salt = crypto.randomBytes(16);
        const passwordHash = await derivePassword(password, salt);
        const createdAt = new Date().toISOString();
        const profile = { id, name: name.trim(), email: normalizedEmail, role, createdAt };
        await run(
            "INSERT INTO users (id, email_index, profile, password_salt, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [id, emailIndex(normalizedEmail), seal(profile), salt.toString("base64"), passwordHash.toString("base64"), role, createdAt]
        );
        return profile;
    }

    async function seedInitialAdmin() {
        const existingAdmin = await get("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
        if (existingAdmin) return;
        const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const configuredPassword = process.env.ADMIN_PASSWORD;
        if (!configuredEmail || !configuredPassword) {
            console.warn("No hay una cuenta administradora. Configura ADMIN_EMAIL y ADMIN_PASSWORD en .env y reinicia el servidor.");
            return;
        }
        if (configuredPassword.length < 12) {
            throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres.");
        }
        const existingUser = await get("SELECT id, profile FROM users WHERE email_index = ?", [emailIndex(configuredEmail)]);
        if (existingUser) {
            const profile = unseal(existingUser.profile);
            profile.role = "admin";
            await run("UPDATE users SET role = 'admin', profile = ? WHERE id = ?", [seal(profile), existingUser.id]);
        } else {
            await createUser({
                name: process.env.ADMIN_NAME || "Administración AulaNexo",
                email: configuredEmail,
                password: configuredPassword,
                role: "admin"
            });
        }
        console.log(`Cuenta administradora inicial configurada: ${configuredEmail}`);
    }

    return {
        db,
        initialize,
        seal,
        unseal,
        emailIndex,
        createUser,
        readCollection,
        writeCollection,
        appendItem,
        run,
        get,
        all,
        transaction,
        async getUserByEmail(email) {
            return get("SELECT * FROM users WHERE email_index = ?", [emailIndex(email)]);
        },
        async getUserById(id) {
            return get("SELECT * FROM users WHERE id = ?", [id]);
        },
        async getUsers() {
            const rows = await all("SELECT id, profile, role FROM users ORDER BY created_at");
            return rows.map((row) => ({ ...unseal(row.profile), role: row.role }));
        }
    };
}

function derivePassword(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
        });
    });
}

function createApp({ store, sessionTtl = SESSION_TTL_SECONDS } = {}) {
    if (!store) throw new Error("Se requiere un almacén SQLite inicializado.");
    const app = express();
    app.disable("x-powered-by");
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                formAction: ["'self'"],
                frameAncestors: ["'self'"],
                frameSrc: ["'self'", "https://maps.google.com", "https://www.google.com"],
                imgSrc: ["'self'", "data:", "blob:"],
                mediaSrc: ["'self'", "blob:"],
                objectSrc: ["'none'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "https://fonts.googleapis.com"]
            }
        }
    }));
    app.use(express.json({ limit: "1mb", strict: true }));

    const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
    const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
    const error = (status, message) => Object.assign(new Error(message), { status });
    const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

    function parseCookie(header, name) {
        const entry = String(header ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
        if (!entry) return "";
        try {
            return decodeURIComponent(entry.slice(name.length + 1));
        } catch {
            return "";
        }
    }

    async function loadUser(req) {
        const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
        if (!token) return null;
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const session = await store.get(
            "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
            [tokenHash]
        );
        if (!session) return null;
        if (session.expires_at <= Date.now()) {
            await store.run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
            return null;
        }
        const row = await store.get("SELECT profile, role FROM users WHERE id = ?", [session.user_id]);
        return row ? { ...store.unseal(row.profile), role: row.role } : null;
    }

    const requireUser = asyncRoute(async (req, res, next) => {
        req.user = await loadUser(req);
        if (!req.user) throw error(401, "Inicia sesión para continuar.");
        next();
    });
    const requireAdmin = asyncRoute(async (req, res, next) => {
        req.user = await loadUser(req);
        if (!req.user || req.user.role !== "admin") throw error(403, "Se requiere una cuenta administradora.");
        next();
    });

    app.use("/api", (req, res, next) => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
        const origin = req.get("origin");
        const expectedOrigin = `${req.protocol}://${req.get("host")}`;
        if (!origin || origin !== expectedOrigin) return next(error(403, "Origen de solicitud no permitido."));
        next();
    });

    app.get("/api/health", (req, res) => res.json({ status: "ok" }));
    app.get("/api/auth/session", asyncRoute(async (req, res) => {
        res.set("Cache-Control", "no-store").json({ user: await loadUser(req) });
    }));

    app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
        const { name, email, password } = req.body ?? {};
        if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
            throw error(400, "El nombre debe tener entre 2 y 100 caracteres.");
        }
        if (!validEmail(email)) throw error(400, "Escribe un correo electrónico válido.");
        validatePassword(password);
        let user;
        try {
            user = await store.createUser({ name, email, password, role: "member" });
        } catch (cause) {
            if (cause.code === "SQLITE_CONSTRAINT") throw error(409, "Ya existe una cuenta con ese correo.");
            throw cause;
        }
        await startSession(req, res, user.id);
        res.status(201).set("Cache-Control", "no-store").json({ user });
    }));

    app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
        const { email, password } = req.body ?? {};
        if (!validEmail(email) || typeof password !== "string" || password.length > 256) {
            throw error(401, "El correo o la contraseña no coinciden.");
        }
        const row = await store.getUserByEmail(email);
        if (!row) {
            await derivePassword(String(password), Buffer.alloc(16));
            throw error(401, "El correo o la contraseña no coinciden.");
        }
        const actualHash = await derivePassword(password, Buffer.from(row.password_salt, "base64"));
        const expectedHash = Buffer.from(row.password_hash, "base64");
        if (actualHash.length !== expectedHash.length || !crypto.timingSafeEqual(actualHash, expectedHash)) {
            throw error(401, "El correo o la contraseña no coinciden.");
        }
        await startSession(req, res, row.id);
        res.set("Cache-Control", "no-store").json({ user: { ...store.unseal(row.profile), role: row.role } });
    }));

    app.post("/api/auth/logout", asyncRoute(async (req, res) => {
        const token = parseCookie(req.headers.cookie, SESSION_COOKIE);
        if (token) {
            await store.run("DELETE FROM sessions WHERE token_hash = ?", [crypto.createHash("sha256").update(token).digest("hex")]);
        }
        clearSessionCookie(res);
        res.status(204).end();
    }));

    app.get("/api/bootstrap", asyncRoute(async (req, res) => {
        const user = await loadUser(req);
        const collections = {};
        for (const collection of PUBLIC_COLLECTIONS) {
            if (!user) {
                collections[collection] = [];
                continue;
            }
            const items = await store.readCollection(collection);
            collections[collection] = collection === "members"
                ? items.filter((item) => item.featured)
                : items;
        }
        const configRow = user ? await store.get("SELECT payload FROM app_config WHERE key = 'map'") : null;
        const state = { collections, map: configRow ? store.unseal(configRow.payload) : null, user };
        if (user?.role === "admin") {
            for (const collection of ADMIN_COLLECTIONS) {
                if (collection !== "members") collections[collection] = await store.readCollection(collection);
            }
            collections.members = await store.readCollection("members");
            collections.users = await store.getUsers();
        }
        res.set("Cache-Control", "no-store").json(state);
    }));

    app.get("/api/data/:collection", requireUser, asyncRoute(async (req, res) => {
        const { collection } = req.params;
        if (!COLLECTIONS.has(collection)) throw error(404, "Colección no encontrada.");
        const user = req.user;
        if (["messages"].includes(collection) && user?.role !== "admin") throw error(403, "No tienes permiso para consultar esta colección.");
        let items = await store.readCollection(collection);
        if (collection === "members" && user?.role !== "admin") items = items.filter((item) => item.featured);
        res.set("Cache-Control", "no-store").json({ items });
    }));

    app.put("/api/data/:collection", requireAdmin, asyncRoute(async (req, res) => {
        const { collection } = req.params;
        if (!["news", "events", "resources", "gallery", "videos", "members"].includes(collection)) {
            throw error(404, "Colección no encontrada.");
        }
        const items = req.body?.items;
        if (!Array.isArray(items) || items.length > 500 || items.some((item) => !item || typeof item !== "object" || typeof item.id !== "string" || item.id.length > 100)) {
            throw error(400, "La colección enviada no tiene un formato válido.");
        }
        if (new Set(items.map((item) => item.id)).size !== items.length) throw error(400, "Los identificadores de la colección deben ser únicos.");
        if (collection === "members") {
            const listNumbers = new Set();
            const featuredMembers = items.filter((item) => item.featured);
            if (featuredMembers.length > 3) throw error(400, "Solo se pueden destacar tres integrantes.");
            for (const member of items) {
                const listNumber = String(member.listNumber ?? "").trim();
                if (!listNumber || listNumbers.has(listNumber)) throw error(409, "Cada integrante debe tener un número de lista único.");
                if (typeof member.firstName !== "string" || typeof member.lastName !== "string" ||
                    typeof member.phone !== "string" || !validGoogleMapsUrl(member.address)) {
                    throw error(400, "Los datos de un integrante no son válidos.");
                }
                if (member.featured && typeof member.assetId !== "string") {
                    throw error(400, "Cada integrante destacado debe tener una foto guardada.");
                }
                listNumbers.add(listNumber);
            }
        }
        await store.writeCollection(collection, items);
        res.status(204).end();
    }));

    app.put("/api/map", requireAdmin, asyncRoute(async (req, res) => {
        const config = req.body;
        if (!config || typeof config.center !== "string" || config.center.length > 1000 || !Array.isArray(config.points) || config.points.length > 100) {
            throw error(400, "La configuración del mapa no tiene un formato válido.");
        }
        await store.run(
            `INSERT INTO app_config (key, payload) VALUES ('map', ?)
             ON CONFLICT(key) DO UPDATE SET payload = excluded.payload`,
            [store.seal(config)]
        );
        res.status(204).end();
    }));

    app.post("/api/contact", contactLimiter, asyncRoute(async (req, res) => {
        const { name, email, message } = req.body ?? {};
        if (typeof name !== "string" || name.trim().length < 1 || name.length > 100 ||
            !validEmail(email) || typeof message !== "string" || message.trim().length < 1 || message.length > 5000) {
            throw error(400, "Completa el nombre, correo y mensaje con valores válidos.");
        }
        await store.appendItem("messages", {
            id: crypto.randomUUID(),
            name: name.trim(),
            email: email.trim().toLowerCase(),
            message: message.trim(),
            date: new Date().toISOString()
        });
        res.status(201).json({ status: "saved" });
    }));

    app.get("/api/admin/users", requireAdmin, asyncRoute(async (req, res) => {
        res.set("Cache-Control", "no-store").json({ users: await store.getUsers() });
    }));

    app.post("/api/admin/users", requireAdmin, asyncRoute(async (req, res) => {
        const { name, email, password } = req.body ?? {};
        if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 || !validEmail(email)) {
            throw error(400, "Escribe un nombre y correo válidos.");
        }
        validatePassword(password);
        try {
            const user = await store.createUser({ name, email, password });
            res.status(201).json({ user });
        } catch (cause) {
            if (cause.code === "SQLITE_CONSTRAINT") throw error(409, "Ya existe una cuenta con ese correo.");
            throw cause;
        }
    }));

    app.put("/api/admin/users", requireAdmin, asyncRoute(async (req, res) => {
        const users = req.body?.users;
        if (!Array.isArray(users) || users.length > 500) throw error(400, "La lista de cuentas no es válida.");
        const storedUsers = await store.getUsers();
        const storedById = new Map(storedUsers.map((user) => [user.id, user]));
        const requestedIds = new Set();
        const emailIndexes = new Set();
        for (const user of users) {
            if (!user || typeof user.id !== "string" || !storedById.has(user.id) ||
                typeof user.name !== "string" || user.name.trim().length < 2 || user.name.trim().length > 100 ||
                !validEmail(user.email) || requestedIds.has(user.id)) {
                throw error(400, "La lista contiene una cuenta inválida.");
            }
            requestedIds.add(user.id);
            const index = store.emailIndex(user.email);
            if (emailIndexes.has(index)) throw error(409, "Ya existe una cuenta con ese correo.");
            emailIndexes.add(index);
        }
        if (!users.some((user) => storedById.get(user.id).role === "admin")) {
            throw error(400, "No se puede eliminar la última cuenta administradora.");
        }
        await store.transaction(async ({ run: runQuery }) => {
            for (const existing of storedUsers) {
                if (!requestedIds.has(existing.id)) await runQuery("DELETE FROM users WHERE id = ?", [existing.id]);
            }
            for (const user of users) {
                await runQuery("UPDATE users SET email_index = ? WHERE id = ?", [`pending:${user.id}`, user.id]);
            }
            for (const user of users) {
                const existing = storedById.get(user.id);
                const profile = { ...existing, name: user.name.trim(), email: user.email.trim().toLowerCase() };
                await runQuery(
                    "UPDATE users SET email_index = ?, profile = ? WHERE id = ?",
                    [store.emailIndex(profile.email), store.seal(profile), user.id]
                );
            }
        });
        res.status(204).end();
    }));

    app.delete("/api/admin/users/:id", requireAdmin, asyncRoute(async (req, res) => {
        const row = await store.getUserById(req.params.id);
        if (!row) throw error(404, "La cuenta no existe.");
        if (row.role === "admin") {
            const count = await store.get("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
            if (count.count <= 1) throw error(400, "No se puede eliminar la última cuenta administradora.");
        }
        await store.run("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.status(204).end();
    }));

    app.post("/api/assets", requireAdmin, express.raw({ type: ["image/*", "video/*"], limit: MAX_ASSET_BYTES }), asyncRoute(async (req, res) => {
        if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw error(400, "El archivo está vacío o su formato no está permitido.");
        if (!/^image\/[a-z0-9.+-]+$|^video\/[a-z0-9.+-]+$/i.test(req.get("content-type") ?? "")) {
            throw error(415, "Solo se permiten imágenes y videos.");
        }
        const id = crypto.randomUUID();
        const payload = {
            type: req.get("content-type"),
            name: String(req.get("x-file-name") ?? "archivo").replace(/[^\w.-]/g, "_").slice(0, 120),
            content: req.body.toString("base64")
        };
        await store.run("INSERT INTO assets (id, payload, created_at) VALUES (?, ?, ?)", [id, store.seal(payload), new Date().toISOString()]);
        res.status(201).json({ id });
    }));

    app.get("/api/assets/:id", asyncRoute(async (req, res) => {
        const user = await loadUser(req);
        if (!user) throw error(401, "Inicia sesión para consultar archivos.");
        if (user.role !== "admin" && !await isMemberVisibleAsset(store, req.params.id)) {
            throw error(404, "No se encontró el archivo publicado.");
        }
        const row = await store.get("SELECT payload FROM assets WHERE id = ?", [req.params.id]);
        if (!row) throw error(404, "No se encontró el archivo.");
        const payload = store.unseal(row.payload);
        res.set({
            "Cache-Control": "private, no-store",
            "Content-Disposition": `inline; filename="${payload.name}"`,
            "X-Content-Type-Options": "nosniff"
        }).type(payload.type).send(Buffer.from(payload.content, "base64"));
    }));

    app.delete("/api/assets/:id", requireAdmin, asyncRoute(async (req, res) => {
        await store.run("DELETE FROM assets WHERE id = ?", [req.params.id]);
        res.status(204).end();
    }));

    app.get("/", (req, res) => res.redirect("/html/index.html"));
    for (const directory of ["html", "css", "script", "img"]) {
        app.use(`/${directory}`, express.static(path.join(ROOT, directory), {
            dotfiles: "deny",
            fallthrough: false,
            index: false
        }));
    }
    app.use((req, res, next) => next(error(404, "No se encontró la página solicitada.")));
    app.use((cause, req, res, next) => {
        if (res.headersSent) return next(cause);
        if (cause.type === "entity.too.large") return res.status(413).json({ error: "El archivo o solicitud supera el tamaño permitido." });
        if (cause.type === "entity.parse.failed") return res.status(400).json({ error: "El JSON enviado no es válido." });
        const status = Number.isInteger(cause.status) ? cause.status : 500;
        if (status >= 500) console.error("Error del servidor:", cause);
        res.status(status).json({ error: status >= 500 ? "Error interno del servidor." : cause.message });
    });

    async function startSession(req, res, userId) {
        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = Date.now() + sessionTtl * 1000;
        await store.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [tokenHash, userId, expiresAt]);
        const secure = req.secure ? "; Secure" : "";
        res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTtl}${secure}`);
    }

    function clearSessionCookie(res) {
        res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    }

    return app;
}

async function isMemberVisibleAsset(store, assetId) {
    for (const collection of ["gallery", "videos", "members"]) {
        const items = await store.readCollection(collection);
        if (items.some((item) => (collection !== "members" || item.featured) && [item.assetId, item.videoAssetId].includes(assetId))) {
            return true;
        }
    }
    return false;
}

function validEmail(value) {
    return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validGoogleMapsUrl(value) {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        const googleDomain = hostname === "google.com" || hostname.endsWith(".google.com");
        return url.protocol === "https:" && !url.username && !url.password && !url.port && (
            hostname === "maps.app.goo.gl" ||
            (hostname === "goo.gl" && url.pathname.startsWith("/maps")) ||
            (googleDomain && (hostname === "maps.google.com" || url.pathname.startsWith("/maps")))
        );
    } catch {
        return false;
    }
}

function validatePassword(value) {
    if (typeof value !== "string" || value.length < 8 || value.length > 256) {
        const cause = new Error("La contraseña debe tener entre 8 y 256 caracteres.");
        cause.status = 400;
        throw cause;
    }
}

async function main() {
    const dbPath = process.env.DB_PATH
        ? path.resolve(process.env.DB_PATH)
        : path.join(ROOT, "database", "aulanexo.sqlite");
    const store = createStore({ dbPath, encryptionKey: process.env.APP_ENCRYPTION_KEY });
    await store.initialize();
    const app = createApp({ store });
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? "127.0.0.1";
    const server = app.listen(port, host, () => console.log(`AulaNexo disponible en http://${host}:${port}`));

    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => server.close(() => store.db.close((error) => {
            if (error) {
                console.error("No se pudo cerrar SQLite correctamente:", error);
                process.exitCode = 1;
            }
        })));
    }
}

if (require.main === module) {
    main().catch((cause) => {
        console.error(cause.message);
        process.exitCode = 1;
    });
}

module.exports = { createApp, createStore, derivePassword, validEmail };
