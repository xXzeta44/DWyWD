const { readList, saveList, makeUser, passwordHash } = window.AulaNexo;
const status = document.querySelector("#account-status");
const signinTab = document.querySelector("#signin-tab");
const signupTab = document.querySelector("#signup-tab");
const signinPanel = document.querySelector("#signin-panel");
const signupPanel = document.querySelector("#signup-panel");
const signedInPanel = document.querySelector("#signed-in-panel");

if (!signinTab || !signupTab || !signinPanel || !signupPanel || !signedInPanel) {
    throw new Error("La página de cuenta no tiene los elementos esperados.");
}

function showForm(mode) {
    const signingUp = mode === "signup";
    signinTab.classList.toggle("is-active", !signingUp);
    signupTab.classList.toggle("is-active", signingUp);
    signinTab.setAttribute("aria-selected", String(!signingUp));
    signupTab.setAttribute("aria-selected", String(signingUp));
    signinPanel.classList.toggle("hidden", signingUp);
    signinPanel.hidden = signingUp;
    signupPanel.classList.toggle("hidden", !signingUp);
    signupPanel.hidden = !signingUp;
}

function updateAccountView() {
    const user = window.AulaNexo.currentUser();
    const signedIn = Boolean(user);
    const accountTabs = document.querySelector("#account-tabs");
    const welcomeMessage = document.querySelector("#welcome-message");

    if (accountTabs) {
        accountTabs.classList.toggle("hidden", signedIn);
    }
    signinPanel.classList.toggle("hidden", signedIn);
    signinPanel.hidden = signedIn;
    signupPanel.classList.add("hidden");
    signupPanel.hidden = true;
    signedInPanel.classList.toggle("hidden", !signedIn);
    signedInPanel.hidden = !signedIn;
    if (welcomeMessage) {
        welcomeMessage.textContent = signedIn ? `Sesión iniciada como ${user.name}.` : "";
    }
}

signinTab.addEventListener("click", () => showForm("signin"));
signupTab.addEventListener("click", () => showForm("signup"));

document.querySelector("#signup-panel").addEventListener("submit", async (event) => { 
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const users = readList("users");
    const email = String(data.get("email")).trim().toLowerCase();
    if (users.some((user) => user.email === email)) {
        status.textContent = "Ya existe una cuenta con ese correo.";
        return;
    }

    try {
        const user = await makeUser(String(data.get("name")), email, String(data.get("password")));
        users.push(user);
        saveList("users", users);
        sessionStorage.setItem(window.AulaNexo.keys.currentUser, user.id);
        form.reset();
        status.textContent = `Cuenta creada. ¡Bienvenido/a, ${user.name}!`;
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
    const user = readList("users").find((item) => item.email === email);
    if (!user) {
        status.textContent = "No se encontró una cuenta con ese correo.";
        return;
    }

    try {
        if (await passwordHash(String(data.get("password")), user.salt) !== user.passwordHash) {
            status.textContent = "La contraseña no coincide.";
            return;
        }
        sessionStorage.setItem(window.AulaNexo.keys.currentUser, user.id);
        form.reset();
        status.textContent = `Sesión iniciada. ¡Hola, ${user.name}!`;
        updateAccountView();
    } catch (error) {
        status.textContent = error.message;
    }
});

document.querySelector("#logout-button").addEventListener("click", () => {
    sessionStorage.removeItem(window.AulaNexo.keys.currentUser);
    status.textContent = "Se cerró la sesión.";
    updateAccountView();
    showForm("signin");
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
updateAccountView();
