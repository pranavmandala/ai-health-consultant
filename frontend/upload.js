const ACCOUNTS_PAGE = "/static/accounts.html";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const previewPanel = document.getElementById("preview-panel");
const renderTarget = document.getElementById("render-target");
const fileDetails = document.getElementById("file-details");
const uploadButton = document.getElementById("upload-btn");

let selectedFile = null;

function getToken() {
    return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
}

if (!getToken()) {
    window.location.replace(ACCOUNTS_PAGE);
}


function showMessage(id, message, error = false) {
    const element = document.getElementById(id);

    element.textContent = message;
    element.classList.add("show");
    element.classList.toggle("error", error);
}


function handleFile(file) {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
        showMessage("upload-status", "File is too large. Maximum size is 10 MB.", true);
        return;
    }

    selectedFile = file;
    uploadedDocId = null;
    uploadButton.textContent = "Upload & Analyze";
    uploadButton.disabled = false;
    document.getElementById("upload-status").classList.remove("show");

    fileDetails.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    previewPanel.classList.remove("hidden");
    renderTarget.innerHTML = "";

    const reader = new FileReader();

    if (file.type.startsWith("image/")) {
        reader.onload = (event) => {
            const img = document.createElement("img");
            img.src = event.target.result;
            img.classList.add("image-render");
            renderTarget.appendChild(img);
        };
        reader.readAsDataURL(file);

    } else if (file.type === "text/plain" || file.type === "application/json" ||
               file.name.endsWith(".txt") || file.name.endsWith(".json")) {
        reader.onload = (event) => {
            const text = document.createElement("div");
            text.classList.add("document-render");
            text.textContent = event.target.result;
            renderTarget.appendChild(text);
        };
        reader.readAsText(file);

    } else {
        const note = document.createElement("div");
        note.classList.add("document-render");
        note.textContent = "No preview available for this file type.";
        renderTarget.appendChild(note);
    }
}

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => handleFile(event.target.files[0]));

["dragenter", "dragover"].forEach(name => {
    dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dropZone.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach(name => {
    dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
    });
});

dropZone.addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));


const CATEGORIES = [
    ["conditions", "Conditions"],
    ["medications", "Medications"],
    ["allergies", "Allergies"],
    ["symptoms", "Symptoms"],
    ["other", "Other"]
];
const MAX_KEYWORD_LENGTH = 120;

let uploadedDocId = null;
let reviewData = {};

function authHeaders() {
    return { "Authorization": `Bearer ${getToken()}` };
}

function sessionExpired() {
    localStorage.removeItem("access_token");
    sessionStorage.removeItem("access_token");
    window.location.replace(ACCOUNTS_PAGE);
}

async function readJson(response) {
    return response.json().catch(() => ({}));
}

async function uploadDocument() {
    if (!selectedFile) {
        showMessage("upload-status", "Choose a file first.", true);
        return;
    }

    uploadButton.disabled = true;

    try {
        if (!uploadedDocId) {
            showMessage("upload-status", "Uploading...");

            const formData = new FormData();
            formData.append("file", selectedFile);
            formData.append("title", selectedFile.name);

            const uploadResponse = await fetch("/api/documents", {
                method: "POST",
                headers: authHeaders(),
                body: formData
            });
            const uploadResult = await readJson(uploadResponse);

            if (uploadResponse.status === 401) return sessionExpired();

            if (!uploadResponse.ok) {
                showMessage("upload-status", uploadResult.detail || "Could not upload document.", true);
                uploadButton.disabled = false;
                return;
            }

            uploadedDocId = uploadResult.id;
        }

        showMessage("upload-status", "Analyzing your document with AI. This can take up to a minute...");

        const analyzeResponse = await fetch(`/api/documents/${uploadedDocId}/analyze`, {
            method: "POST",
            headers: authHeaders()
        });
        const analyzeResult = await readJson(analyzeResponse);

        if (analyzeResponse.status === 401) return sessionExpired();

        if (!analyzeResponse.ok) {
            showMessage("upload-status", analyzeResult.detail || "Could not analyze document.", true);
            uploadButton.textContent = "Try Analysis Again";
            uploadButton.disabled = false;
            return;
        }

        showReview(analyzeResult);

    } catch (error) {
        console.log("Upload error:", error);
        showMessage("upload-status", "Could not connect to the server.", true);
        uploadButton.disabled = false;
    }
}

function showReview(extracted) {
    reviewData = {};
    CATEGORIES.forEach(([key]) => {
        reviewData[key] = Array.isArray(extracted[key]) ? [...extracted[key]] : [];
    });

    document.getElementById("upload-status").classList.remove("show");
    dropZone.classList.add("hidden");
    previewPanel.classList.add("hidden");
    uploadButton.classList.add("hidden");
    document.getElementById("review-panel").classList.remove("hidden");

    renderReview();
}

function renderReview() {
    const container = document.getElementById("review-categories");
    container.innerHTML = "";

    CATEGORIES.forEach(([key, label]) => {
        const section = document.createElement("div");
        section.classList.add("category");

        const heading = document.createElement("h3");
        heading.textContent = label;
        section.appendChild(heading);

        const chips = document.createElement("div");
        chips.classList.add("chips");

        if (reviewData[key].length === 0) {
            const note = document.createElement("span");
            note.classList.add("empty-note");
            note.textContent = "Nothing found";
            chips.appendChild(note);
        }

        reviewData[key].forEach((word, index) => {
            const chip = document.createElement("span");
            chip.classList.add("chip");
            chip.appendChild(document.createTextNode(word));

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "\u00d7";
            remove.setAttribute("aria-label", `Remove ${word}`);
            remove.addEventListener("click", () => {
                reviewData[key].splice(index, 1);
                renderReview();
            });
            chip.appendChild(remove);
            chips.appendChild(chip);
        });
        section.appendChild(chips);

        const row = document.createElement("div");
        row.classList.add("add-row");

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = MAX_KEYWORD_LENGTH;
        input.placeholder = `Add to ${label.toLowerCase()}...`;

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "Add";

        const addWord = () => {
            const word = input.value.trim().replace(/\s+/g, " ");
            if (!word) return;

            const exists = reviewData[key].some(w => w.toLowerCase() === word.toLowerCase());
            if (!exists) reviewData[key].push(word);
            renderReview();
        };

        addButton.addEventListener("click", addWord);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                addWord();
            }
        });

        row.appendChild(input);
        row.appendChild(addButton);
        section.appendChild(row);
        container.appendChild(section);
    });
}

async function confirmProfile() {
    const confirmButton = document.getElementById("confirm-btn");
    confirmButton.disabled = true;
    showMessage("upload-status", "Saving to your profile...");

    try {
        const response = await fetch("/api/profile/confirm", {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ document_id: uploadedDocId, profile: reviewData })
        });
        const result = await readJson(response);

        if (response.status === 401) return sessionExpired();

        if (response.ok) {
            showMessage("upload-status", "Saved. Taking you to your dashboard...");
            setTimeout(() => window.location.replace("/static/dashboard.html"), 1000);
        } else {
            showMessage("upload-status", result.detail || "Could not save your profile.", true);
            confirmButton.disabled = false;
        }

    } catch (error) {
        console.log("Confirm error:", error);
        showMessage("upload-status", "Could not connect to the server.", true);
        confirmButton.disabled = false;
    }
}

async function cancelReview() {
    try {
        if (uploadedDocId) {
            await fetch(`/api/documents/${uploadedDocId}`, {
                method: "DELETE",
                headers: authHeaders()
            });
        }
    } catch (error) {
        console.log("Cancel error:", error);
    }
    window.location.replace("/static/dashboard.html");
}

uploadButton.addEventListener("click", uploadDocument);
document.getElementById("confirm-btn").addEventListener("click", confirmProfile);
document.getElementById("cancel-btn").addEventListener("click", cancelReview);