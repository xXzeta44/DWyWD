const { readList, saveList, makeUser, passwordHash } = window.AulaNexo;
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
    const user = window.AulaNexo.currentUser();
    const signedIn = Boolean(user);
    const welcomeMessage = document.querySelector("#welcome-message");

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
}

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
    window.location.replace("cuenta.html");
});

document.querySelector("#current-year").textContent = String(new Date().getFullYear());
updateAccountView();
