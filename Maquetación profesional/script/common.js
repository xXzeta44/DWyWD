(() => {
    const keys = {
        news: "aulanexo-news",
        events: "aulanexo-events",
        resources: "aulanexo-resources",
        users: "aulanexo-users",
        map: "aulanexo-map",
        currentUser: "aulanexo-current-user"
    };

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
        users: []
    };

    function readList(name) {
        const saved = localStorage.getItem(keys[name]);
        if (saved === null) {
            localStorage.setItem(keys[name], JSON.stringify(samples[name]));
            return samples[name].slice();
        }
        const value = JSON.parse(saved);
        if (!Array.isArray(value)) throw new Error(`Los datos guardados de "${name}" no son válidos.`);
        return value;
    }

    function saveList(name, value) {
        localStorage.setItem(keys[name], JSON.stringify(value));
    }

    function createId() {
        return globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function safeText(value) {
        const node = document.createElement("span");
        node.textContent = String(value ?? "");
        return node.innerHTML;
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("es", { year: "numeric", month: "long", day: "numeric" });
    }

    function currentUser() {
        const id = sessionStorage.getItem(keys.currentUser);
        return id ? readList("users").find((user) => user.id === id) ?? null : null;
    }

    async function passwordHash(password, salt) {
        if (!globalThis.crypto?.subtle) {
            throw new Error("Para probar cuentas, abre el sitio desde localhost o HTTPS en un navegador moderno.");
        }
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
        const result = await crypto.subtle.deriveBits({
            name: "PBKDF2",
            salt: Uint8Array.from(salt.match(/.{2}/g), (pair) => Number.parseInt(pair, 16)),
            iterations: 100000,
            hash: "SHA-256"
        }, key, 256);
        return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    async function makeUser(name, email, password) {
        const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
        return {
            id: createId(),
            name: name.trim(),
            email: email.trim().toLowerCase(),
            salt,
            passwordHash: await passwordHash(password, salt)
        };
    }

    window.AulaNexo = { keys, readList, saveList, createId, safeText, formatDate, currentUser, passwordHash, makeUser };
})();
