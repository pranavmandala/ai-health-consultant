const ACCOUNTS_PAGE = "/static/accounts.html";

const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");

function getToken() {
    return localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
}

if (!getToken()) {
    window.location.replace(ACCOUNTS_PAGE);
}


function appendMessage(sender, text) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", sender === "user" ? "user-msg" : "ai-msg");
    bubble.textContent = text;
    chatBox.appendChild(bubble);
    chatBox.scrollTop = chatBox.scrollHeight;
    return bubble;
}

async function sendChatMessage(text) {
    const aiBubble = appendMessage("ai", "Thinking...");
    let fullText = "";

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${getToken()}`
            },
            body: JSON.stringify({ message: text })
        });

        if (response.status === 401) {
            logout();
            return;
        }

        if (!response.ok || !response.body) {
            aiBubble.textContent = "Something went wrong. Please try again.";
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        aiBubble.textContent = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            fullText += decoder.decode(value, { stream: true });
            aiBubble.textContent = fullText;
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        fetchSavedMetrics();

    } catch (error) {
        console.log("Chat error:", error);
        aiBubble.textContent = "Could not connect to the server.";
    }
}

function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    chatInput.value = "";
    sendChatMessage(text);
}

async function fetchSavedMetrics() {
    try {
        const response = await fetch("/api/patient/metrics", {
            headers: { "Authorization": `Bearer ${getToken()}` }
        });

        if (response.status === 401) {
            logout();
            return;
        }

        if (response.ok) {
            const metrics = await response.json();
            document.getElementById("saved-concern").textContent =
                metrics.primary_concern || "Awaiting AI analysis...";

            if (metrics.document_name) {
                document.getElementById("meta-doc-name").textContent = metrics.document_name;
            }
        }
    } catch (error) {
        console.log("Metrics error:", error);
    }
}


function logout() {
    localStorage.removeItem("access_token");
    sessionStorage.removeItem("access_token");
    window.location.replace(ACCOUNTS_PAGE);
}

document.getElementById("send-chat-btn").addEventListener("click", handleSend);
chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleSend();
});
document.getElementById("sync-btn").addEventListener("click", fetchSavedMetrics);
document.getElementById("logout-btn").addEventListener("click", logout);

appendMessage(
    "ai",
    "Hello! I am your secure AI Health Consultant. What can I help you with today? " +
    "Please describe your symptoms or fitness goals."
);
fetchSavedMetrics();
