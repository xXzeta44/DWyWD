(() => {
    const keys = {
        news: "aulanexo-news",
        events: "aulanexo-events",
        resources: "aulanexo-resources",
        gallery: "aulanexo-gallery",
        videos: "aulanexo-videos",
        messages: "aulanexo-messages",
        users: "aulanexo-users",
        map: "aulanexo-map",
        currentUser: "aulanexo-current-user",
        members: "aulanexo-members"
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
        gallery: [
            { id: "gallery-1", title: "Prototipos con propósito", description: "Proyecto de taller · Diseño · Trabajo en equipo", image: "../proyectos1.jpeg" },
            { id: "gallery-2", title: "Aprender experimentando", description: "Experiencia académica · Investigación · Práctica", image: "../img/foto grupo.jpeg" },
            { id: "gallery-3", title: "Pequeñas ideas, grandes pasos", description: "En el taller · Creatividad · Innovación", image: "../proyectos1.jpeg" }
        ],
        videos: [],
        messages: [],
        users: [],
        members: []
    };

    const assetDatabaseName = "aulanexo-assets";

    function openAssetDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(assetDatabaseName, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore("assets", { keyPath: "id" });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error("No se pudo abrir el almacenamiento de archivos."));
            request.onblocked = () => reject(new Error("El almacenamiento de archivos está bloqueado por otra pestaña."));
        });
    }

    async function saveAsset(blob, id = createId()) {
        const database = await openAssetDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("assets", "readwrite");
            transaction.objectStore("assets").put({ id, blob });
            transaction.oncomplete = () => {
                database.close();
                resolve(id);
            };
            transaction.onerror = () => {
                database.close();
                reject(transaction.error ?? new Error("No se pudo guardar el archivo."));
            };
            transaction.onabort = () => {
                database.close();
                reject(transaction.error ?? new Error("No se pudo guardar el archivo."));
            };
        });
    }

    async function readAsset(id) {
        const database = await openAssetDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("assets", "readonly");
            const request = transaction.objectStore("assets").get(id);
            request.onsuccess = () => resolve(request.result?.blob ?? null);
            transaction.oncomplete = () => database.close();
            transaction.onerror = () => {
                database.close();
                reject(transaction.error ?? new Error("No se pudo leer el archivo."));
            };
            transaction.onabort = () => {
                database.close();
                reject(transaction.error ?? new Error("No se pudo leer el archivo."));
            };
        });
    }

    async function deleteAsset(id) {
        const database = await openAssetDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("assets", "readwrite");
            transaction.objectStore("assets").delete(id);
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
            transaction.onerror = () => {
                database.close();
                reject(transaction.error ?? new Error("No se pudo eliminar el archivo."));
            };
            transaction.onabort = () => {
                database.close();
                reject(transaction.error ?? new Error("No se pudo eliminar el archivo."));
            };
        });
    }

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

    window.AulaNexo = { keys, readList, saveList, createId, safeText, formatDate, currentUser, passwordHash, makeUser, saveAsset, readAsset, deleteAsset, isGoogleMapsUrl, googleMapsUrl };
})();
