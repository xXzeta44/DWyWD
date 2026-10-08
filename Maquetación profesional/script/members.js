const app = window.AulaNexo;
const { readList, saveList, createId, safeText, formatDate, makeUser } = app;
const currentUser = app.currentUser();

if (!currentUser) {
    window.location.replace("cuenta.html");
} else {
    document.querySelector("#member-name").textContent = `${currentUser.name}.`;
    renderManagedContent();
    renderUsers();
    renderMap();

    document.querySelector("#logout-button").addEventListener("click", () => {
        sessionStorage.removeItem(app.keys.currentUser);
        window.location.replace("cuenta.html");
    });

    document.querySelector("#content-type").addEventListener("change", (event) => {
        document.querySelector("#content-date").required = event.target.value === "event";
    });

    document.querySelector("#content-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const type = String(data.get("type"));
        const listName = type === "event" ? "events" : type === "resource" ? "resources" : "news";
        const list = readList(listName);
        const link = String(data.get("link")).trim();
        if (link && !isSafeLink(link)) {
            alert("El enlace debe empezar con https:// o http://.");
            return;
        }
        list.push({
            id: createId(),
            title: String(data.get("title")).trim(),
            description: String(data.get("description")).trim(),
            date: String(data.get("date")),
            link
        });
        saveList(listName, list);
        event.currentTarget.reset();
        renderManagedContent();
    });

    document.querySelector("#user-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const users = readList("users");
        const email = String(data.get("email")).trim().toLowerCase();
        if (users.some((user) => user.email === email)) {
            alert("Ya existe una cuenta con ese correo.");
            return;
        }
        try {
            users.push(await makeUser(String(data.get("name")), email, String(data.get("password"))));
            saveList("users", users);
            form.reset();
            renderUsers();
        } catch (error) {
            alert(error.message);
        }
    });

    document.querySelector("#map-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const center = String(data.get("location")).trim();
        if (!center) {
            document.querySelector("#map-search").reportValidity();
            return;
        }
        const points = String(data.get("points")).split("\n").map((line) => {
            const separator = line.indexOf(":");
            const label = separator < 0 ? line.trim() : line.slice(0, separator).trim();
            const location = separator < 0 ? line.trim() : line.slice(separator + 1).trim();
            return location ? { label: label || location, location } : null;
        }).filter(Boolean);
        localStorage.setItem(app.keys.map, JSON.stringify({ center, points }));
        renderMap();
    });
}

function renderManagedContent() {
    renderList(document.querySelector("#news-list"), "news", "Noticia breve");
    renderList(document.querySelector("#event-list"), "events", "Actividad académica");
    renderList(document.querySelector("#managed-resource-list"), "resources", "Recurso para miembros");
}

function renderList(target, type, label) {
    if (!target) return;
    target.innerHTML = readList(type).map((item) => {
        const link = item.link && isSafeLink(item.link)
            ? `<p><a href="${safeText(item.link)}" target="_blank" rel="noopener noreferrer">Abrir recurso ↗</a></p>`
            : "";
        return `<article class="content-card">
            <p class="eyebrow">${label}</p>
            ${item.date ? `<time>${safeText(formatDate(item.date))}</time>` : ""}
            <h3>${safeText(item.title)}</h3>
            <p>${safeText(item.description)}</p>
            ${link}
            <div class="management-actions">
                <button type="button" data-content-action="edit" data-type="${type}" data-id="${safeText(item.id)}">Editar</button>
                <button type="button" data-content-action="delete" data-type="${type}" data-id="${safeText(item.id)}">Eliminar</button>
            </div>
        </article>`;
    }).join("");

    target.querySelectorAll("[data-content-action]").forEach((button) => {
        button.addEventListener("click", handleContentAction);
    });
}

function handleContentAction(event) {
    const button = event.currentTarget;
    const type = button.dataset.type;
    const list = readList(type);
    const index = list.findIndex((item) => item.id === button.dataset.id);
    if (index < 0) return;

    if (button.dataset.contentAction === "delete") {
        if (!confirm(`¿Eliminar "${list[index].title}"?`)) return;
        list.splice(index, 1);
    } else {
        const title = prompt("Título:", list[index].title);
        if (title === null) return;
        const description = prompt("Descripción:", list[index].description);
        if (description === null) return;
        if (!title.trim() || !description.trim()) {
            alert("El título y la descripción no pueden quedar vacíos.");
            return;
        }
        list[index] = { ...list[index], title: title.trim(), description: description.trim() };
        if (type === "events") {
            const date = prompt("Fecha (AAAA-MM-DD):", list[index].date || "");
            if (date !== null) list[index].date = date.trim();
        }
        if (type === "resources") {
            const link = prompt("Enlace opcional:", list[index].link || "");
            if (link !== null) {
                if (link.trim() && !isSafeLink(link.trim())) {
                    alert("El enlace debe empezar con https:// o http://.");
                    return;
                }
                list[index].link = link.trim();
            }
        }
    }
    saveList(type, list);
    renderManagedContent();
}

function renderUsers() {
    const target = document.querySelector("#user-list");
    target.innerHTML = readList("users").map((user) => `
        <article class="content-card">
            <h3>${safeText(user.name)}</h3>
            <p>${safeText(user.email)}</p>
            <div class="management-actions">
                <button type="button" data-user-action="edit" data-id="${safeText(user.id)}">Editar</button>
                <button type="button" data-user-action="delete" data-id="${safeText(user.id)}">Eliminar</button>
            </div>
        </article>`).join("");
    target.querySelectorAll("[data-user-action]").forEach((button) => {
        button.addEventListener("click", handleUserAction);
    });
}

function handleUserAction(event) {
    const button = event.currentTarget;
    const users = readList("users");
    const index = users.findIndex((user) => user.id === button.dataset.id);
    if (index < 0) return;

    if (button.dataset.userAction === "delete") {
        if (!confirm(`¿Eliminar la cuenta de ${users[index].name}?`)) return;
        const deletingCurrentUser = users[index].id === currentUser.id;
        users.splice(index, 1);
        saveList("users", users);
        if (deletingCurrentUser) {
            sessionStorage.removeItem(app.keys.currentUser);
            window.location.replace("cuenta.html");
            return;
        }
    } else {
        const name = prompt("Nombre de usuario:", users[index].name);
        if (name === null) return;
        const email = prompt("Correo electrónico:", users[index].email);
        if (email === null) return;
        const normalizedEmail = email.trim().toLowerCase();
        if (!name.trim() || !normalizedEmail.includes("@")) {
            alert("Escribe un nombre y un correo válidos.");
            return;
        }
        if (users.some((user) => user.id !== users[index].id && user.email === normalizedEmail)) {
            alert("Ya existe una cuenta con ese correo.");
            return;
        }
        users[index] = { ...users[index], name: name.trim(), email: normalizedEmail };
        saveList("users", users);
    }
    renderUsers();
}

function isSafeLink(value) {
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

function renderMap() {
    const saved = localStorage.getItem(app.keys.map);
    if (!saved) return;
    const config = JSON.parse(saved);
    const center = typeof config?.center === "string" ? config.center.trim() : "";
    const points = Array.isArray(config?.points) ? config.points.filter(Boolean) : [];
    if (!center) return;
    const places = [{ label: "Centro educativo", location: center }, ...points];
    const frame = document.querySelector("#map-preview");
    frame.innerHTML = `<iframe title="Mapa: ${safeText(places[0].label)}" src="https://maps.google.com/maps?q=${encodeURIComponent(places[0].location)}&output=embed" loading="lazy"></iframe>`;
    document.querySelector("#map-search").value = center;
    document.querySelector("#map-members").value = points.map((point) => `${point.label}: ${point.location}`).join("\n");
}

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
