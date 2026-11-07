const ACCOUNTS_PAGE = "/static/accounts.html";

const CATEGORIES = [
    ["conditions", "Conditions"],
    ["medications", "Medications"],
    ["allergies", "Allergies"],
    ["symptoms", "Symptoms"],
    ["other", "Other"]
];

let currentProfile = null;

function getToken() {
    return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
}

if (!getToken()) {
    window.location.replace(ACCOUNTS_PAGE);
}

function logout() {
    localStorage.removeItem("access_token");
    sessionStorage.removeItem("access_token");
    window.location.replace(ACCOUNTS_PAGE);
}

async function apiGet(url) {
    const response = await fetch(url, {
        headers: { "Authorization": `Bearer ${getToken()}` }
    });

    if (response.status === 401) {
        logout();
        return null;
    }

    return response.ok ? response.json() : null;
}


function hasAnyData(profile) {
    return CATEGORIES.some(([key]) => (profile[key] || []).length > 0);
}

function renderProfile(profile, updatedAt) {
    const body = document.getElementById("profile-body");
    body.innerHTML = "";
    currentProfile = profile;

    const copyButton = document.getElementById("copy-btn");
    const updated = document.getElementById("profile-updated");

    if (!profile || !hasAnyData(profile)) {
        const empty = document.createElement("p");
        empty.classList.add("empty-profile");
        empty.textContent = "Your profile is empty. Upload a document to build it.";
        body.appendChild(empty);
        copyButton.disabled = true;
        updated.textContent = "";
        return;
    }

    CATEGORIES.forEach(([key, label]) => {
        const words = profile[key] || [];
        if (words.length === 0) return;

        const section = document.createElement("div");
        section.classList.add("category");

        const heading = document.createElement("h4");
        heading.textContent = label;
        section.appendChild(heading);

        const chips = document.createElement("div");
        chips.classList.add("chips");
        words.forEach(word => {
            const chip = document.createElement("span");
            chip.classList.add("chip");
            chip.textContent = word;
            chips.appendChild(chip);
        });
        section.appendChild(chips);
        body.appendChild(section);
    });

    copyButton.disabled = false;
    updated.textContent = updatedAt
        ? `Last updated ${new Date(updatedAt).toLocaleString()}`
        : "";
}

async function loadProfile() {
    const result = await apiGet("/api/profile");
    if (result) renderProfile(result.profile, result.updated_at);
}


async function loadDocuments() {
    const documents = await apiGet("/api/documents");
    const list = document.getElementById("doc-list");
    const count = document.getElementById("doc-count");
    list.innerHTML = "";

    if (!documents) {
        count.textContent = "Could not load documents";
        return;
    }

    count.textContent = documents.length === 1 ? "1 document" : `${documents.length} documents`;

    documents.forEach(doc => {
        const item = document.createElement("li");

        const name = document.createElement("span");
        name.classList.add("doc-name");
        name.textContent = doc.title;

        const date = document.createElement("span");
        date.classList.add("doc-date");
        date.textContent = doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : "";

        item.appendChild(name);
        item.appendChild(date);
        list.appendChild(item);
    });
}


function buildCopyText(profile) {
    const lines = [
        "Here is my medical profile, taken from my own uploaded records. " +
        "Use it as background for my questions. I know you are not a doctor and this is not medical advice.",
        ""
    ];

    CATEGORIES.forEach(([key, label]) => {
        const words = profile[key] || [];
        if (words.length > 0) lines.push(`${label}: ${words.join(", ")}`);
    });

    return lines.join("\n");
}

async function copyProfile() {
    const status = document.getElementById("copy-status");
    if (!currentProfile || !hasAnyData(currentProfile)) return;

    const text = buildCopyText(currentProfile);

    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);

        if (!ok) {
            status.textContent = "Could not copy automatically. Select the profile text and copy it.";
            return;
        }
    }

    status.textContent = "Copied! Paste it into any AI chat.";
    setTimeout(() => { status.textContent = ""; }, 3000);
}


document.getElementById("copy-btn").addEventListener("click", copyProfile);
document.getElementById("logout-btn").addEventListener("click", logout);

loadProfile();
loadDocuments();