const email = document.getElementById("login-email");
const password = document.getElementById("login-password");

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function showForm(formName) {
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");

    const loginTab = document.getElementById("login-tab");
    const registerTab = document.getElementById("register-tab");

    loginForm.classList.toggle("active", formName === "login");
    registerForm.classList.toggle("active", formName === "register");

    loginTab.classList.toggle("active", formName === "login");
    registerTab.classList.toggle("active", formName === "register");

    document.getElementById("subtitle").textContent =
        formName === "login"
            ? "Welcome back. Log in to continue."
            : "Create an account to get started.";
}

function showMessage(id, message, error = false) {
    const element = document.getElementById(id);

    element.textContent = message;
    element.classList.add("show");
    element.classList.toggle("error", error);
}


document.querySelectorAll("[data-form]").forEach(button => {
    button.addEventListener("click", (event) => {
        event.preventDefault();
        showForm(button.dataset.form);
    });
});

document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.password);

        if (input.type === "password") {
            input.type = "text";
            button.textContent = "Hide";
        } else {
            input.type = "password";
            button.textContent = "Show";
        }
    });
});

async function createAccount(event) {
    event.preventDefault();

    const name = document.getElementById("register-name").value.trim();
    const userEmail = document.getElementById("register-email").value.trim();
    const userPassword = document.getElementById("register-password").value;
    const confirmPassword = document.getElementById("register-confirm").value;
    const terms = document.getElementById("accept-terms").checked;

    if (!name || !userEmail || !userPassword || !confirmPassword) {
        showMessage("register-status", "Please fill in all fields.", true);
        return;
    }

    if (!EMAIL_RE.test(userEmail)) {
        showMessage("register-status", "Enter a valid email.", true);
        return;
    }

    if (userPassword.length < 8 ||
        !/[a-zA-Z]/.test(userPassword) ||
        !/\d/.test(userPassword)) {
        showMessage("register-status", "Password must have at least 8 characters, a letter, and a number.", true);
        return;
    }

    if (userPassword !== confirmPassword) {
        showMessage("register-status", "Passwords do not match.", true);
        return;
    }

    if (!terms) {
        showMessage("register-status", "Please accept the Terms and Privacy Policy.", true);
        return;
    }

    const userData = {
        username: userEmail,
        password: userPassword
    };

    try {
        const response = await fetch("/api/bugs/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });

        const result = await response.json();

        if (response.ok) {
            showMessage("register-status", "Account created successfully! Please log in.");

            document.getElementById("login-email").value = userEmail;

            registerForm.reset();

            setTimeout(() => {
                showForm("login");
            }, 1500);

        } else {
            showMessage(
                "register-status",
                result.detail || "Could not create account.",
                true
            );
        }

    } catch (error) {
        console.log("Registration error:", error);
        showMessage("register-status", "Could not connect to the server.", true);
    }
}


async function loginUser(event) {
    event.preventDefault();

    const userEmail = email.value.trim();
    const userPassword = password.value;
    const rememberMe = document.getElementById("remember-me").checked;

    if (!userEmail || !userPassword) {
        showMessage("login-status", "Enter your email and password.", true);
        return;
    }

    if (!EMAIL_RE.test(userEmail)) {
        showMessage("login-status", "Enter a valid email.", true);
        return;
    }

    const userData = {
        username: userEmail,
        password: userPassword
    };

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(userData)
        });

        const result = await response.json();

        if (response.ok) {

            localStorage.removeItem("access_token");
            sessionStorage.removeItem("access_token");

            if (rememberMe) {
                localStorage.setItem("access_token", result.access_token);
            } else {
                sessionStorage.setItem("access_token", result.access_token);
            }

            showMessage("login-status", "Login successful. Redirecting...");

            setTimeout(() => {
                window.location.replace("/static/dashboard.html");
            }, 1500);

        } else {
            showMessage("login-status", "Invalid email or password.", true);
        }

    } catch (error) {
        console.log("Login error:", error);
        showMessage("login-status", "Could not connect to the server.", true);
    }
}


loginForm.addEventListener("submit", loginUser);
registerForm.addEventListener("submit", createAccount);


document.getElementById("forgot-password").addEventListener("click", (event) => {
    event.preventDefault();
    showMessage("login-status", "Password reset is not available yet.", true);
});