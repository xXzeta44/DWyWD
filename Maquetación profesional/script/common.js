(() => {
    const state = { collections: {}, map: null, user: null };

    async function request(url, options = {}) {
        const response = await fetch(url, { credentials: "same-origin", ...options });
        if (response.status === 204) return null;
        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json")
            ? await response.json()
            : await response.blob();
        if (!response.ok) {
            throw new Error(body?.error || `La solicitud falló (${response.status}).`);
        }
        return body;
    }

    async function refresh() {
        const bootstrap = await request("/api/bootstrap");
        state.collections = bootstrap.collections;
        state.map = bootstrap.map;
        state.user = bootstrap.user;
    }

    const ready = refresh();

    function readList(name) {
        if (!Array.isArray(state.collections[name])) {
            throw new Error(`No hay datos disponibles para "${name}". Comprueba tu sesión y los permisos.`);
        }
        return structuredClone(state.collections[name]);
    }

    async function saveList(name, value) {
        await ready;
        const url = name === "users" ? "/api/admin/users" : `/api/data/${encodeURIComponent(name)}`;
        const body = name === "users" ? { users: value } : { items: value };
        await request(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        state.collections[name] = value;
    }

    async function saveAsset(blob) {
        await ready;
        const response = await request("/api/assets", {
            method: "POST",
            headers: { "Content-Type": blob.type, "X-File-Name": encodeURIComponent(blob.name ?? "archivo") },
            body: blob
        });
        return response.id;
    }

    async function readAsset(id) {
        await ready;
        return request(`/api/assets/${encodeURIComponent(id)}`);
    }

    async function deleteAsset(id) {
        await ready;
        await request(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
    }

    async function saveMap(config) {
        await ready;
        await request("/api/map", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config)
        });
        state.map = config;
    }

    function readMap() {
        return state.map;
    }

    async function register(name, email, password) {
        const response = await request("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        state.user = response.user;
        return response.user;
    }

    async function login(email, password) {
        const response = await request("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        state.user = response.user;
        return response.user;
    }

    async function logout() {
        await request("/api/auth/logout", { method: "POST" });
        state.user = null;
    }

    function createId() {
        return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function safeText(value) {
        const node = document.createElement("span");
        node.textContent = String(value ?? "");
        return node.innerHTML;
    }

    function isGoogleMapsUrl(value) {
        try {
            const url = new URL(String(value));
            const host = url.hostname.toLowerCase();
            const googleDomain = host === "google.com" || host.endsWith(".google.com");
            return url.protocol === "https:" && !url.username && !url.password && !url.port && (
                host === "maps.app.goo.gl" ||
                (host === "goo.gl" && url.pathname.startsWith("/maps")) ||
                (googleDomain && (host === "maps.google.com" || url.pathname.startsWith("/maps")))
            );
        } catch {
            return false;
        }
    }

    function googleMapsUrl(value) {
        const location = String(value ?? "").trim();
        return isGoogleMapsUrl(location)
            ? location
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
    }

    function currentUser() {
        return state.user;
    }

    async function makeUser(name, email, password) {
        await ready;
        const response = await request("/api/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        if (Array.isArray(state.collections.users)) state.collections.users.push(response.user);
        return response.user;
    }

    window.AulaNexo = {
        ready,
        refresh,
        request,
        readList,
        saveList,
        createId,
        safeText,
        formatDate,
        currentUser,
        register,
        login,
        logout,
        makeUser,
        saveAsset,
        readAsset,
        deleteAsset,
        readMap,
        saveMap,
        isGoogleMapsUrl,
        googleMapsUrl
    };
})();
