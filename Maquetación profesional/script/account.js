const app = window.AulaNexo;
const status = document.querySelector("#account-status");
const signinPanel = document.querySelector("#signin-panel");
const signupPanel = document.querySelector("#signup-panel");
const signedInPanel = document.querySelector("#signed-in-panel");
const signupLink = document.querySelector("#signup-link");
const signinLink = document.querySelector("#signin-link");
const signupMode = new URLSearchParams(window.location.search).has("registro");

if (!signinPanel || !signupPanel || !signedInPanel || !signupLink || !signinLink) {
    throw new Error("La página de cuenta no tiene los elementos esperados.");
}

function updateAccountView() {
    const user = app.currentUser();
    const signedIn = Boolean(user);
    const welcomeMessage = document.querySelector("#welcome-message");
    const managementLink = document.querySelector("#management-link");
    const memberNote = document.querySelector("#member-account-note");

    signinPanel.classList.toggle("hidden", signedIn || signupMode);
    signinPanel.hidden = signedIn || signupMode;
    signupPanel.classList.toggle("hidden", signedIn || !signupMode);
    signupPanel.hidden = signedIn || !signupMode;
    signupLink.classList.toggle("hidden", signedIn || signupMode);
    signupLink.hidden = signedIn || signupMode;
    signinLink.classList.toggle("hidden", signedIn || !signupMode);
    signinLink.hidden = signedIn || !signupMode;
    signedInPanel.classList.toggle("hidden", !signedIn);
    signedInPanel.hidden = !signedIn;
    if (welcomeMessage) {
        welcomeMessage.textContent = signedIn ? `Sesión iniciada como ${user.name}.` : "";
    }
    if (managementLink) {
        managementLink.hidden = !signedIn || user.role !== "admin";
        managementLink.classList.toggle("hidden", managementLink.hidden);
    }
    if (memberNote) {
        memberNote.hidden = !signedIn || user.role === "admin";
        memberNote.classList.toggle("hidden", memberNote.hidden);
    }
}

document.querySelector("#signup-panel").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email")).trim().toLowerCase();

    try {
        const user = await app.register(String(data.get("name")), email, String(data.get("password")));
        form.reset();
        status.textContent = `Cuenta creada. ¡Bienvenido/a, ${user.name}! Esta cuenta no tiene permisos de gestión.`;
        updateAccountView();
    } catch (error) {
        status.textContent = error.message;
    }
});

document.querySelector("#signin-panel").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email")).trim().toLowerCase();

    try {
        const user = await app.login(email, String(data.get("password")));
        form.reset();
        status.textContent = `Sesión iniciada. ¡Hola, ${user.name}!`;
        updateAccountView();
    } catch (error) {
        status.textContent = error.message;
    }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
        await app.logout();
        window.location.replace("cuenta.html");
    } catch (error) {
        status.textContent = `No se pudo cerrar la sesión: ${error.message}`;
    }
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
app.ready.then(updateAccountView).catch((error) => {
    status.textContent = `No se pudo conectar con el servidor local: ${error.message}`;
});
