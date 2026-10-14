const { readList, safeText, formatDate } = window.AulaNexo;
let galleryObjectUrls = [];
let videoObjectUrls = [];
let featuredMemberObjectUrls = [];
let featuredMembersRenderId = 0;

function renderCards(target, items, label) {
    if (!target) return;
    target.innerHTML = items.map((item) => `
        <article class="content-card">
            <p class="eyebrow">${label}</p>
            ${item.date ? `<time>${safeText(formatDate(item.date))}</time>` : ""}
            <h3>${safeText(item.title)}</h3>
            <p>${safeText(item.description)}</p>
        </article>`).join("");
}

renderCards(document.querySelector("#news-list"), readList("news"), "Artículo breve");
refreshFeaturedMembers();
window.addEventListener("storage", (event) => {
    if (event.key === window.AulaNexo.keys.members) refreshFeaturedMembers();
});
window.addEventListener("pageshow", refreshFeaturedMembers);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshFeaturedMembers();
});
initializeCalendar();
renderGallery().catch(showGalleryError);
renderVideos().catch(showVideoError);

function refreshFeaturedMembers() {
    renderFeaturedMembers().catch(showFeaturedMembersError);
}

async function renderFeaturedMembers() {
    const target = document.querySelector("#featured-member-list");
    if (!target) return;
    const renderId = ++featuredMembersRenderId;
    const nextObjectUrls = [];

    try {
        const featured = readList("members")
            .filter((member) => member.featured)
            .sort((a, b) => Number(a.listNumber) - Number(b.listNumber))
            .slice(0, 3);
        const cards = await Promise.all(Array.from({ length: 3 }, async (_, index) => {
            const member = featured[index];
            if (!member) {
                return `
                <article class="content-card featured-member-card is-pending">
                    <div class="featured-member-photo-placeholder" aria-hidden="true">+</div>
                    <p class="eyebrow">Integrante ${index + 1}</p>
                    <h3>Perfil por completar</h3>
                    <p>Completa los datos desde el espacio de gestión.</p>
                </article>`;
            }

            let photo = "";
            if (member.assetId) {
                const blob = await window.AulaNexo.readAsset(member.assetId);
                if (!blob) throw new Error(`No se encontró la foto de ${member.firstName} ${member.lastName}.`);
                photo = URL.createObjectURL(blob);
                nextObjectUrls.push(photo);
            }
            const name = `${member.firstName} ${member.lastName}`.trim();
            const address = String(member.address ?? "").trim();
            const phone = String(member.phone ?? "").trim();
            const mapUrl = window.AulaNexo.googleMapsUrl(address);
            const phoneHref = phone.replace(/[^\d+]/g, "");

            return `
            <article class="content-card featured-member-card">
                ${photo
                    ? `<img class="featured-member-photo" src="${safeText(photo)}" alt="Foto de ${safeText(name)}" loading="lazy">`
                    : '<div class="featured-member-photo-placeholder" aria-hidden="true">◎</div>'}
                <p class="eyebrow">Integrante del equipo</p>
                <h3>${safeText(name)}</h3>
                <dl class="member-record-details">
                    <div><dt>Edad</dt><dd>${safeText(member.age ? `${member.age} años` : "Por completar")}</dd></div>
                    <div><dt>Teléfono</dt><dd>${phone
                        ? `<a href="tel:${safeText(phoneHref)}">${safeText(phone)}</a>`
                        : "Por completar"}</dd></div>
                    <div><dt>Ubicación</dt><dd>${address
                        ? `<a href="${safeText(mapUrl)}" target="_blank" rel="noopener noreferrer">Abrir ubicación en Google Maps ↗</a>`
                        : "Por completar"}</dd></div>
                </dl>
            </article>`;
        }));

        if (renderId !== featuredMembersRenderId) {
            nextObjectUrls.forEach((url) => URL.revokeObjectURL(url));
            return;
        }
        featuredMemberObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        featuredMemberObjectUrls = nextObjectUrls;
        target.innerHTML = cards.join("");
    } catch (error) {
        nextObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        throw error;
    }
}

function initializeCalendar() {
    const calendar = document.querySelector("#event-calendar");
    if (!calendar) return;

    const grid = document.querySelector("#calendar-grid");
    const monthLabel = document.querySelector("#calendar-month");
    const details = document.querySelector("#calendar-day-details");
    const events = readList("events");
    const today = new Date();
    let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    let selectedDate = toDateKey(today);

    document.querySelector("#calendar-prev").addEventListener("click", () => {
        displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
        selectedDate = toDateKey(displayedMonth);
        renderCalendar();
    });
    document.querySelector("#calendar-next").addEventListener("click", () => {
        displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
        selectedDate = toDateKey(displayedMonth);
        renderCalendar();
    });
    document.querySelector("#calendar-today").addEventListener("click", () => {
        displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        selectedDate = toDateKey(today);
        renderCalendar();
    });

    function renderCalendar() {
        const year = displayedMonth.getFullYear();
        const month = displayedMonth.getMonth();
        const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cellCount = Math.ceil((firstDayOffset + daysInMonth) / 7) * 7;
        const weekdayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
        monthLabel.textContent = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(displayedMonth);

        const weekdayCells = weekdayNames.map((name) => `<div class="calendar-weekday" role="columnheader">${name}</div>`);
        const dayCells = Array.from({ length: cellCount }, (_, index) => {
            const dayNumber = index - firstDayOffset + 1;
            if (dayNumber < 1 || dayNumber > daysInMonth) {
                return '<div class="calendar-day is-outside" role="gridcell" aria-hidden="true"></div>';
            }

            const date = new Date(year, month, dayNumber);
            const dateKey = toDateKey(date);
            const dayEvents = events.filter((event) => event.date === dateKey);
            const isToday = dateKey === toDateKey(today);
            const selected = dateKey === selectedDate;
            const eventLabels = dayEvents.slice(0, 2).map((event) => `<span class="calendar-event">${safeText(event.title)}</span>`).join("");
            const overflow = dayEvents.length > 2 ? `<span class="calendar-more">+${dayEvents.length - 2} más</span>` : "";

            return `<div class="calendar-day${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}" role="gridcell">
                <button class="calendar-date" type="button" data-calendar-date="${dateKey}" aria-label="${safeText(date.toLocaleDateString("es", { dateStyle: "full" }))}${dayEvents.length ? `, ${dayEvents.length} actividades` : ""}" aria-pressed="${selected}">${dayNumber}</button>
                <div class="calendar-events">${eventLabels}${overflow}</div>
            </div>`;
        });

        grid.innerHTML = [...weekdayCells, ...dayCells].join("");
        grid.querySelectorAll("[data-calendar-date]").forEach((button) => {
            button.addEventListener("click", () => {
                selectedDate = button.dataset.calendarDate;
                renderCalendar();
            });
        });
        renderSelectedDay();
    }

    function renderSelectedDay() {
        const selectedEvents = events.filter((event) => event.date === selectedDate);
        const date = new Date(`${selectedDate}T12:00:00`);
        const heading = date.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
        details.innerHTML = `<h4>${safeText(heading)}</h4>${selectedEvents.length
            ? `<ul>${selectedEvents.map((event) => `<li><strong>${safeText(event.title)}</strong>${event.description ? `<span>${safeText(event.description)}</span>` : ""}</li>`).join("")}</ul>`
            : "<p>No hay actividades programadas para este día.</p>"}`;
    }

    renderCalendar();
}

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

const menuToggle = document.querySelector("#menu-toggle");
const mainNav = document.querySelector("#main-nav");
if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
        const open = menuToggle.getAttribute("aria-expanded") !== "true";
        menuToggle.setAttribute("aria-expanded", String(open));
        menuToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
        mainNav.classList.toggle("is-open", open);
    });
    mainNav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            menuToggle.setAttribute("aria-expanded", "false");
            mainNav.classList.remove("is-open");
        });
    });
}

const contactForm = document.querySelector("#contact-form");
const contactStatus = document.querySelector("#contact-status");
if (contactForm && contactStatus) {
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        const data = new FormData(event.currentTarget);
        const messages = readList("messages");
        messages.push({
            id: window.AulaNexo.createId(),
            name: String(data.get("name")).trim(),
            email: String(data.get("email")).trim(),
            message: String(data.get("message")).trim(),
            date: new Date().toISOString()
        });
        try {
            window.AulaNexo.saveList("messages", messages);
        } catch (error) {
            console.error(error);
            contactStatus.textContent = "No se pudo guardar tu mensaje. Inténtalo de nuevo.";
            return;
        }
        const name = data.get("name");
        contactStatus.textContent = `Gracias, ${name}. Tu mensaje se guardó para que el equipo lo revise.`;
        event.currentTarget.reset();
    });
}

function renderMap() {
    const saved = localStorage.getItem(window.AulaNexo.keys.map);
    if (!saved) return;
    const config = JSON.parse(saved);
    const center = typeof config?.center === "string" ? config.center.trim() : "";
    const points = Array.isArray(config?.points) ? config.points.filter(Boolean) : [];
    if (!center) return;
    const places = [{ label: "Centro educativo", location: center }, ...points];
    const frame = document.querySelector("#map-frame");
    const mapLink = document.querySelector("#map-link");
    const mapPoints = document.querySelector("#map-points");
    const emptyState = document.querySelector("#map-empty");
    if (!frame || !mapLink || !mapPoints) return;

    function showPlace(place, selectedButton) {
        const mapUrl = `https://maps.google.com/maps?q=${encodeURIComponent(place.location)}&output=embed`;
        frame.innerHTML = `<iframe title="Mapa: ${safeText(place.label)}" src="${safeText(mapUrl)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
        mapLink.href = `https://maps.google.com/maps?q=${encodeURIComponent(place.location)}`;
        mapPoints.querySelectorAll("button").forEach((button) => button.setAttribute("aria-current", String(button === selectedButton)));
    }

    mapPoints.innerHTML = places.map((place, index) => `<button type="button" data-place-index="${index}">${safeText(place.label)}</button>`).join("");
    mapPoints.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => showPlace(places[Number(button.dataset.placeIndex)], button));
    });
    showPlace(places[0], mapPoints.querySelector("button"));
    mapLink.classList.remove("hidden");
    if (emptyState) emptyState.classList.add("hidden");
}

const currentYear = document.querySelector("#current-year");
if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
}
renderMap();

async function renderGallery() {
    const target = document.querySelector("#project-grid");
    if (!target) return;
    galleryObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    galleryObjectUrls = [];
    const items = readList("gallery");
    if (!items.length) {
        target.innerHTML = '<p class="image-note">Todavía no hay publicaciones en la galería.</p>';
        return;
    }
    const cards = await Promise.all(items.map(async (item, index) => {
        let imageUrl = item.image;
        if (item.assetId) {
            imageUrl = URL.createObjectURL(await requireAsset(item.assetId));
            galleryObjectUrls.push(imageUrl);
        }
        return `<article class="project-card${index === 0 ? " project-feature" : ""}">
            <img src="${safeText(imageUrl)}" alt="${safeText(item.title)}" loading="lazy">
            <div class="project-caption"><span>Galería del grupo</span><h3>${safeText(item.title)}</h3><p>${safeText(item.description)}</p></div>
        </article>`;
    }));
    target.innerHTML = cards.join("");
}

async function renderVideos() {
    const target = document.querySelector("#video-grid");
    if (!target) return;
    videoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    videoObjectUrls = [];
    const items = readList("videos").filter((item) => item.assetId).sort((a, b) => a.slot.localeCompare(b.slot));
    if (!items.length) {
        target.innerHTML = '<p class="image-note">Aún no hay videos publicados.</p>';
        return;
    }
    target.innerHTML = (await Promise.all(items.map(async (item) => {
        const blob = await window.AulaNexo.readAsset(item.assetId);
        if (!blob) throw new Error(`No se encontró el archivo del video "${item.title}".`);
        const url = URL.createObjectURL(blob);
        videoObjectUrls.push(url);
        return `<article class="video-card">
            <video controls preload="metadata" aria-label="${safeText(item.title)}"><source src="${safeText(url)}" type="${safeText(blob.type)}"></video>
            <div class="video-info"><span>En primera persona</span><h3>${safeText(item.title)}</h3></div>
        </article>`;
    }))).join("");
}

async function requireAsset(id) {
    const blob = await window.AulaNexo.readAsset(id);
    if (!blob) throw new Error("No se encontró el archivo de una publicación de la galería.");
    return blob;
}

function showGalleryError(error) {
    console.error(error);
    const target = document.querySelector("#project-grid");
    if (target) target.innerHTML = '<p class="image-note">No se pudo cargar la galería. Inténtalo de nuevo más tarde.</p>';
}

function showVideoError(error) {
    console.error(error);
    const target = document.querySelector("#video-grid");
    if (target) target.innerHTML = '<p class="image-note">No se pudieron cargar los videos publicados.</p>';
}

function showFeaturedMembersError(error) {
    console.error(error);
    const target = document.querySelector("#featured-member-list");
    if (target) target.innerHTML = '<p class="image-note">No se pudieron cargar los perfiles del equipo.</p>';
}
