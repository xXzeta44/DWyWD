const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp, createStore } = require("../server/server");

test("persists encrypted data and enforces admin-only mutations", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aulanexo-test-"));
    const key = crypto.randomBytes(32).toString("hex");
    const oldAdminEmail = process.env.ADMIN_EMAIL;
    const oldAdminPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.ADMIN_PASSWORD = "admin-test-password-1234";

    const store = createStore({ dbPath: path.join(directory, "test.sqlite"), encryptionKey: key });
    await store.initialize();
    const server = createApp({ store }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;

    t.after(async () => {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await new Promise((resolve, reject) => store.db.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(directory, { recursive: true, force: true });
        if (oldAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
        else process.env.ADMIN_EMAIL = oldAdminEmail;
        if (oldAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
        else process.env.ADMIN_PASSWORD = oldAdminPassword;
    });

    async function request(route, { method = "GET", body, cookie, headers = {} } = {}) {
        const response = await fetch(`${origin}${route}`, {
            method,
            headers: {
                ...(method === "GET" ? {} : { Origin: origin }),
                ...(body instanceof Buffer ? { "Content-Type": "image/png" } : body ? { "Content-Type": "application/json" } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...headers
            },
            body: body instanceof Buffer ? body : body ? JSON.stringify(body) : undefined
        });
        const contentType = response.headers.get("content-type") ?? "";
        const result = contentType.includes("application/json") ? await response.json() : await response.text();
        return { response, result };
    }

    const anonymousBootstrap = await request("/api/bootstrap");
    assert.equal(anonymousBootstrap.result.user, null);
    assert.deepEqual(anonymousBootstrap.result.collections.news, []);
    const anonymousData = await request("/api/data/news");
    assert.equal(anonymousData.response.status, 401);

    const login = await request("/api/auth/login", {
        method: "POST",
        body: { email: "admin@test.local", password: "admin-test-password-1234" }
    });
    assert.equal(login.response.status, 200);
    const adminCookie = login.response.headers.get("set-cookie").split(";")[0];
    assert.equal(login.result.user.role, "admin");

    const registration = await request("/api/auth/register", {
        method: "POST",
        body: { name: "Cuenta lectora", email: "member@test.local", password: "member-password-123" }
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.result.user.role, "member");
    const memberCookie = registration.response.headers.get("set-cookie").split(";")[0];

    const deniedWrite = await request("/api/data/news", {
        method: "PUT",
        cookie: memberCookie,
        body: { items: [] }
    });
    assert.equal(deniedWrite.response.status, 403);

    const secretMessages = [crypto.randomUUID(), crypto.randomUUID()].map((id) => `mensaje-privado-${id}`);
    const contacts = await Promise.all(secretMessages.map((message) => request("/api/contact", {
        method: "POST",
        body: { name: "Persona de prueba", email: "persona@test.local", message }
    })));
    assert.ok(contacts.every((contact) => contact.response.status === 201));

    const adminBootstrap = await request("/api/bootstrap", { cookie: adminCookie });
    assert.deepEqual(
        adminBootstrap.result.collections.messages.map((message) => message.message).sort(),
        secretMessages.sort()
    );
    assert.ok(adminBootstrap.result.collections.users.some((user) => user.email === "member@test.local"));

    const databaseRows = await store.all("SELECT payload FROM data_items");
    const encryptedRows = databaseRows.map((row) => row.payload).join("\n");
    assert.ok(secretMessages.every((message) => !encryptedRows.includes(message)));
    assert.equal(encryptedRows.includes("persona@test.local"), false);
    assert.equal(store.unseal(databaseRows[0].payload).id.length > 0, true);

    const assetBody = Buffer.from("private-image-" + crypto.randomUUID());
    const uploaded = await request("/api/assets", {
        method: "POST",
        cookie: adminCookie,
        body: assetBody
    });
    assert.equal(uploaded.response.status, 201);
    const privateAsset = await request(`/api/assets/${uploaded.result.id}`);
    assert.equal(privateAsset.response.status, 401);

    const galleryWrite = await request("/api/data/gallery", {
        method: "PUT",
        cookie: adminCookie,
        body: { items: [{ id: "asset-test", title: "Imagen", description: "", assetId: uploaded.result.id }] }
    });
    assert.equal(galleryWrite.response.status, 204);
    const publicAsset = await request(`/api/assets/${uploaded.result.id}`, { cookie: memberCookie });
    assert.equal(publicAsset.response.status, 200);
    assert.equal(publicAsset.result, assetBody.toString());

    const encryptedAsset = await store.get("SELECT payload FROM assets WHERE id = ?", [uploaded.result.id]);
    assert.equal(encryptedAsset.payload.includes(assetBody.toString()), false);
});
