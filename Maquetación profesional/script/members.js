const app = window.AulaNexo;
const { readList, saveList, createId, safeText, formatDate, makeUser } = app;
const currentUser = app.currentUser();
let galleryObjectUrls = [];
let videoObjectUrls = [];
let memberObjectUrls = [];

if (!currentUser) {
    window.location.replace("cuenta.html");
} else {
    document.querySelector("#member-name").textContent = `${currentUser.name}.`;
    renderManagedContent();
    renderUsers();
    renderMembers().catch((error) => showStatus("#member-status", `No se pudo cargar el registro: ${error.message}`));
    renderMap();

    document.querySelector("#logout-button").addEventListener("click", () => {
        sessionStorage.removeItem(app.keys.currentUser);
        window.location.replace("cuenta.html");
    });

    document.querySelector("#content-type").addEventListener("change", (event) => {
        document.querySelector("#content-date").required = event.target.value === "event";
    });

    const galleryForm = document.querySelector("#gallery-form");
    const galleryImage = document.querySelector("#gallery-image");
    galleryForm.addEventListener("submit", handleGallerySubmit);
    document.querySelector("#gallery-cancel").addEventListener("click", resetGalleryForm);
    document.querySelector("#managed-gallery-list").addEventListener("click", handleGalleryAction);
    document.querySelectorAll(".video-manage-form").forEach((form) => {
        form.addEventListener("submit", handleVideoSubmit);
    });
    document.querySelector("#managed-video-list").addEventListener("click", handleVideoAction);

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

    const memberForm = document.querySelector("#member-form");
    memberForm.addEventListener("submit", handleMemberSubmit);
    document.querySelector("#member-cancel").addEventListener("click", resetMemberForm);
    document.querySelector("#member-list").addEventListener("click", handleMemberAction);

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

    renderGallery().catch((error) => showStatus("#gallery-status", error.message));
    renderVideos().catch((error) => showStatus("#video-status", error.message));
    renderMessages();
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

async function renderGallery() {
    const target = document.querySelector("#managed-gallery-list");
    galleryObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    galleryObjectUrls = [];
    const items = readList("gallery");
    if (!items.length) {
        target.innerHTML = '<p class="image-note">Todavía no hay publicaciones en la galería.</p>';
        return;
    }
    const cards = await Promise.all(items.map(async (item) => {
        let image = item.image;
        if (item.assetId) {
            image = URL.createObjectURL(await requireAsset(item.assetId));
            galleryObjectUrls.push(image);
        }
        return `<article class="content-card">
            <img class="managed-gallery-image" src="${safeText(image)}" alt="${safeText(item.title)}" loading="lazy">
            <h3>${safeText(item.title)}</h3>
            <p>${safeText(item.description)}</p>
            <div class="management-actions">
                <button type="button" data-gallery-action="edit" data-id="${safeText(item.id)}">Editar</button>
                <button type="button" data-gallery-action="delete" data-id="${safeText(item.id)}">Eliminar</button>
            </div>
        </article>`;
    }));
    target.innerHTML = cards.join("");
}

async function handleGallerySubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const list = readList("gallery");
    const id = String(data.get("id"));
    const index = list.findIndex((item) => item.id === id);
    const existing = index >= 0 ? list[index] : null;
    const file = document.querySelector("#gallery-image").files[0];
    if (!existing && !file) {
        showStatus("#gallery-status", "Selecciona una fotografía para publicar.");
        return;
    }
    if (file && !file.type.startsWith("image/")) {
        showStatus("#gallery-status", "Selecciona un archivo de imagen válido.");
        return;
    }

    let newAssetId;
    let listSaved = false;
    try {
        if (file) newAssetId = await app.saveAsset(file);
        const item = {
            id: existing?.id ?? createId(),
            title: String(data.get("title")).trim(),
            description: String(data.get("description")).trim(),
            image: file ? "" : existing.image,
            ...(file ? { assetId: newAssetId } : existing?.assetId ? { assetId: existing.assetId } : {})
        };
        if (existing) list[index] = item;
        else list.push(item);
        saveList("gallery", list);
        listSaved = true;
        if (file && existing?.assetId) await app.deleteAsset(existing.assetId);
        resetGalleryForm();
        showStatus("#gallery-status", existing ? "Publicación actualizada." : "Publicación agregada a la galería.");
        await renderGallery();
    } catch (error) {
        let detail = error.message;
        if (newAssetId && !listSaved) {
            try {
                await app.deleteAsset(newAssetId);
            } catch (cleanupError) {
                detail += ` Además, no se pudo limpiar el archivo temporal: ${cleanupError.message}`;
            }
        }
        showStatus("#gallery-status", listSaved
            ? `Publicación guardada, pero no se pudo limpiar el archivo anterior: ${detail}`
            : `No se pudo guardar la publicación: ${detail}`);
    }
}

async function handleGalleryAction(event) {
    const button = event.target.closest("[data-gallery-action]");
    if (!button) return;
    const list = readList("gallery");
    const index = list.findIndex((item) => item.id === button.dataset.id);
    if (index < 0) return;

    if (button.dataset.galleryAction === "delete") {
        if (!confirm(`¿Eliminar "${list[index].title}" de la galería?`)) return;
        const [deleted] = list.splice(index, 1);
        saveList("gallery", list);
        try {
            if (deleted.assetId) await app.deleteAsset(deleted.assetId);
            await renderGallery();
        } catch (error) {
            showStatus("#gallery-status", `La publicación se eliminó, pero no se pudo limpiar su archivo: ${error.message}`);
        }
        return;
    }

    const item = list[index];
    document.querySelector("#gallery-id").value = item.id;
    document.querySelector("#gallery-title").value = item.title;
    document.querySelector("#gallery-description").value = item.description;
    document.querySelector("#gallery-image").required = false;
    document.querySelector("#gallery-submit").textContent = "Guardar cambios";
    document.querySelector("#gallery-cancel").classList.remove("hidden");
    showStatus("#gallery-status", "Selecciona otra fotografía solo si también quieres reemplazarla.");
    document.querySelector("#gallery-title").focus();
}

function resetGalleryForm() {
    const form = document.querySelector("#gallery-form");
    form.reset();
    document.querySelector("#gallery-id").value = "";
    document.querySelector("#gallery-image").required = true;
    document.querySelector("#gallery-submit").textContent = "Publicar en la galería";
    document.querySelector("#gallery-cancel").classList.add("hidden");
    showStatus("#gallery-status", "");
}

async function renderVideos() {
    const videos = readList("videos");
    videoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    videoObjectUrls = [];
    document.querySelectorAll(".video-manage-form").forEach((form) => {
        const video = videos.find((item) => item.slot === form.dataset.videoSlot);
        const title = form.querySelector('[name="title"]');
        const file = form.querySelector('[name="video"]');
        title.value = video?.title ?? title.defaultValue;
        file.required = !video;
    });

    const target = document.querySelector("#managed-video-list");
    const cards = await Promise.all(videos.map(async (item) => {
        const blob = await requireAsset(item.assetId);
        const source = URL.createObjectURL(blob);
        videoObjectUrls.push(source);
        return `<article class="content-card">
            <p class="eyebrow">${item.slot === "one" ? "01 — Presentación" : "02 — Proceso"}</p>
            <video class="managed-video-preview" controls preload="metadata" aria-label="${safeText(item.title)}"><source src="${safeText(source)}" type="${safeText(blob.type)}"></video>
            <h3>${safeText(item.title)}</h3>
            <div class="management-actions"><button type="button" data-video-action="delete" data-slot="${safeText(item.slot)}">Eliminar video</button></div>
        </article>`;
    }));
    target.innerHTML = cards.join("");
}

async function handleVideoSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const slot = form.dataset.videoSlot;
    const file = form.querySelector('[name="video"]').files[0];
    const list = readList("videos");
    const index = list.findIndex((item) => item.slot === slot);
    const existing = index >= 0 ? list[index] : null;
    if (!file && !existing) {
        showStatus("#video-status", "Selecciona un video para publicar.");
        return;
    }
    if (file && !file.type.startsWith("video/")) {
        showStatus("#video-status", "Selecciona un archivo de video válido.");
        return;
    }

    let newAssetId;
    let listSaved = false;
    try {
        if (file) newAssetId = await app.saveAsset(file);
        const item = {
            id: existing?.id ?? createId(),
            slot,
            title: String(data.get("title")).trim(),
            assetId: newAssetId ?? existing.assetId
        };
        if (existing) list[index] = item;
        else list.push(item);
        saveList("videos", list);
        listSaved = true;
        if (file && existing) await app.deleteAsset(existing.assetId);
        form.reset();
        showStatus("#video-status", "Video publicado en “En primera persona”.");
        await renderVideos();
    } catch (error) {
        let detail = error.message;
        if (newAssetId && !listSaved) {
            try {
                await app.deleteAsset(newAssetId);
            } catch (cleanupError) {
                detail += ` Además, no se pudo limpiar el archivo temporal: ${cleanupError.message}`;
            }
        }
        showStatus("#video-status", listSaved
            ? `Video publicado, pero no se pudo limpiar el archivo anterior: ${detail}`
            : `No se pudo publicar el video: ${detail}`);
    }
}

async function handleVideoAction(event) {
    const button = event.target.closest("[data-video-action]");
    if (!button) return;
    const list = readList("videos");
    const index = list.findIndex((item) => item.slot === button.dataset.slot);
    if (index < 0) return;
    if (!confirm(`¿Eliminar el video "${list[index].title}"?`)) return;
    const [deleted] = list.splice(index, 1);
    saveList("videos", list);
    try {
        await app.deleteAsset(deleted.assetId);
        showStatus("#video-status", "Video eliminado.");
        await renderVideos();
    } catch (error) {
        showStatus("#video-status", `El video se eliminó, pero no se pudo limpiar su archivo: ${error.message}`);
    }
}

function renderMessages() {
    const target = document.querySelector("#contact-message-list");
    const messages = readList("messages").slice().reverse();
    target.innerHTML = messages.length ? messages.map((item) => `
        <article class="content-card">
            <p class="eyebrow">${safeText(item.email)}</p>
            <time>${safeText(formatDate(String(item.date).slice(0, 10)))}</time>
            <h3>${safeText(item.name)}</h3>
            <p class="contact-message-text">${safeText(item.message)}</p>
        </article>`).join("") : '<p class="image-note">Todavía no hay mensajes recibidos.</p>';
}

async function requireAsset(id) {
    const blob = id ? await app.readAsset(id) : null;
    if (!blob) throw new Error("No se encontró un archivo publicado. Vuelve a cargarlo desde gestión.");
    return blob;
}

function showStatus(selector, message) {
    document.querySelector(selector).textContent = message;
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

async function renderMembers() {
    const target = document.querySelector("#member-list");
    memberObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    memberObjectUrls = [];
    const members = readList("members").slice().sort((a, b) => Number(a.listNumber) - Number(b.listNumber));
    if (!members.length) {
        target.innerHTML = '<p class="image-note">Todavía no hay integrantes registrados.</p>';
        return;
    }
    const cards = await Promise.all(members.map(async (member) => {
        let photo = "";
        if (member.assetId) {
            const blob = await app.readAsset(member.assetId);
            if (!blob) throw new Error(`No se encontró la foto de ${member.firstName} ${member.lastName}.`);
            photo = URL.createObjectURL(blob);
            memberObjectUrls.push(photo);
        }
        return `
        <article class="content-card">
            <div class="member-card-heading">
                ${photo ? `<img class="managed-member-photo" src="${safeText(photo)}" alt="Foto de ${safeText(member.firstName)} ${safeText(member.lastName)}" loading="lazy">` : ""}
                <div><p class="eyebrow">Lista ${safeText(member.listNumber)}</p><h3>${safeText(member.firstName)} ${safeText(member.lastName)}</h3></div>
            </div>
            <dl class="member-record-details">
                <div><dt>Edad</dt><dd>${safeText(member.age)} años</dd></div>
                <div><dt>Teléfono</dt><dd>${safeText(member.phone)}</dd></div>
                <div><dt>Dirección</dt><dd>${safeText(member.address)}</dd></div>
            </dl>
            <div class="management-actions">
                <button type="button" data-member-action="edit" data-id="${safeText(member.id)}">Editar</button>
                <button type="button" data-member-action="delete" data-id="${safeText(member.id)}">Eliminar</button>
            </div>
        </article>`;
    }));
    target.innerHTML = cards.join("");
}

async function handleMemberSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const members = readList("members");
    const id = String(data.get("id"));
    const listNumber = String(data.get("listNumber")).trim();
    const existingIndex = members.findIndex((member) => member.id === id);
    if (members.some((member) => member.listNumber === listNumber && member.id !== id)) {
        showStatus("#member-status", "Ya existe un integrante con ese número de lista.");
        return;
    }

    const existing = existingIndex >= 0 ? members[existingIndex] : null;
    const file = document.querySelector("#member-photo").files[0];
    if (file && !file.type.startsWith("image/")) {
        showStatus("#member-status", "Selecciona un archivo de imagen válido.");
        return;
    }

    const member = {
        id: existing?.id ?? createId(),
        listNumber,
        firstName: String(data.get("firstName")).trim(),
        lastName: String(data.get("lastName")).trim(),
        age: String(data.get("age")).trim(),
        phone: String(data.get("phone")).trim(),
        address: String(data.get("address")).trim(),
        ...(existing?.assetId ? { assetId: existing.assetId } : {})
    };
    let newAssetId;
    try {
        if (file) {
            newAssetId = await app.saveAsset(file);
            member.assetId = newAssetId;
        }
        if (existingIndex >= 0) members[existingIndex] = member;
        else members.push(member);
        saveList("members", members);
    } catch (error) {
        let detail = error.message;
        if (newAssetId) {
            try {
                await app.deleteAsset(newAssetId);
            } catch (cleanupError) {
                detail += ` Además, no se pudo limpiar la foto temporal: ${cleanupError.message}`;
            }
        }
        showStatus("#member-status", `No se pudo guardar el integrante: ${detail}`);
        return;
    }

    resetMemberForm();
    let status = existingIndex >= 0 ? "Integrante actualizado." : "Integrante agregado.";
    if (file && existing?.assetId) {
        try {
            await app.deleteAsset(existing.assetId);
        } catch (error) {
            status += ` No se pudo limpiar la foto anterior: ${error.message}`;
        }
    }
    try {
        await renderMembers();
    } catch (error) {
        status += ` No se pudo actualizar la vista del registro: ${error.message}`;
    }
    showStatus("#member-status", status);
}

async function handleMemberAction(event) {
    const button = event.target.closest("[data-member-action]");
    if (!button) return;
    const members = readList("members");
    const index = members.findIndex((member) => member.id === button.dataset.id);
    if (index < 0) return;

    if (button.dataset.memberAction === "delete") {
        if (!confirm(`¿Eliminar a ${members[index].firstName} ${members[index].lastName} del registro?`)) return;
        const [deleted] = members.splice(index, 1);
        try {
            saveList("members", members);
        } catch (error) {
            showStatus("#member-status", `No se pudo eliminar el integrante: ${error.message}`);
            return;
        }
        let status = "Integrante eliminado.";
        if (deleted.assetId) {
            try {
                await app.deleteAsset(deleted.assetId);
            } catch (error) {
                status += ` No se pudo limpiar su foto: ${error.message}`;
            }
        }
        try {
            await renderMembers();
        } catch (error) {
            status += ` No se pudo actualizar la vista del registro: ${error.message}`;
        }
        showStatus("#member-status", status);
        return;
    }

    const member = members[index];
    document.querySelector("#member-id").value = member.id;
    document.querySelector("#member-list-number").value = member.listNumber;
    document.querySelector("#member-first-name").value = member.firstName;
    document.querySelector("#member-last-name").value = member.lastName;
    document.querySelector("#member-age").value = member.age;
    document.querySelector("#member-phone").value = member.phone;
    document.querySelector("#member-address").value = member.address;
    document.querySelector("#member-submit").textContent = "Guardar cambios";
    document.querySelector("#member-cancel").classList.remove("hidden");
    showStatus("#member-status", `Editando a ${member.firstName} ${member.lastName}.`);
    document.querySelector("#member-list-number").focus();
}

function resetMemberForm() {
    document.querySelector("#member-form").reset();
    document.querySelector("#member-id").value = "";
    document.querySelector("#member-photo").value = "";
    document.querySelector("#member-submit").textContent = "Agregar integrante";
    document.querySelector("#member-cancel").classList.add("hidden");
    showStatus("#member-status", "");
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
