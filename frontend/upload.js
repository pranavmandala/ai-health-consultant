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


async function uploadDocument() {
    if (!selectedFile) {
        showMessage("upload-status", "Choose a file first.", true);
        return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", selectedFile.name);

    uploadButton.disabled = true;
    showMessage("upload-status", "Uploading...");

    try {
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Authorization": `Bearer ${getToken()}` },
            body: formData
        });

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            sessionStorage.removeItem("access_token");
            window.location.replace(ACCOUNTS_PAGE);
            return;
        }

        const result = await response.json();

        if (response.ok) {
            showMessage("upload-status", "Document uploaded. Redirecting to your dashboard...");

            setTimeout(() => {
                window.location.replace("/static/dashboard.html");
            }, 1200);

        } else {
            showMessage("upload-status", result.detail || "Could not upload document.", true);
            uploadButton.disabled = false;
        }

    } catch (error) {
        console.log("Upload error:", error);
        showMessage("upload-status", "Could not connect to the server.", true);
        uploadButton.disabled = false;
    }
}

uploadButton.addEventListener("click", uploadDocument);