const { readList, safeText, formatDate } = window.AulaNexo;

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
renderCards(document.querySelector("#event-list"), readList("events").sort((a, b) => (a.date || "").localeCompare(b.date || "")), "Actividad académica");

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
        const name = new FormData(event.currentTarget).get("name");
        contactStatus.textContent = `Gracias, ${name}. Este formulario de demostración no envía el mensaje.`;
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

document.querySelectorAll("[id$='-file']").forEach((input) => {
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        const video = document.querySelector(`#${input.id.replace("-file", "")}`);
        if (video.dataset.objectUrl) URL.revokeObjectURL(video.dataset.objectUrl);
        video.dataset.objectUrl = URL.createObjectURL(file);
        video.src = video.dataset.objectUrl;
        video.load();
    });
});

const currentYear = document.querySelector("#current-year");
if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
}
renderMap();
