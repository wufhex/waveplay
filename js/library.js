export async function initLibrary() {
    const statusEl = document.getElementById("library-status");
    const repoListEl = document.getElementById("repo-list");

    if (!statusEl || !repoListEl) return;

    try {
        const dbData = await fetchRepoDB();
        hideStatus(statusEl);

        const observer = createObserver();

        Object.entries(dbData.repos).forEach(([key, config]) => {
            const card = createCard(key, config);
            repoListEl.appendChild(card);
            observer.observe(card);
        });
    } catch (err) {
        showError(statusEl, err);
    }
}

async function fetchRepoDB() {
    const res = await fetch("https://wufhex.github.io/waveplay/data/repo-db.json");
    if (!res.ok) throw new Error("Failed to load repository index file.");
    return res.json();
}

function createObserver() {
    return new IntersectionObserver(onIntersection, {
        rootMargin: "250px 0px"
    });
}

async function onIntersection(entries) {
    for (const entry of entries) {
        const card = entry.target;
        entry.isIntersecting ? await handleEnter(card) : handleExit(card);
    }
}

async function handleEnter(card) {
    resetSizing(card);

    switch (card._state) {
        case "unloaded":
            return await loadCard(card);
        case "loaded":
            return renderRepository(card, card._repoData);
        case "error":
            return renderErrorCard(card, card._repoKey, card._errorMsg);
        default:
            return;
    }
}

function handleExit(card) {
    if (!["loaded", "error"].includes(card._state)) return;

    card.style.height = `${card.offsetHeight}px`;
    card.innerHTML = "";
}

function resetSizing(card) {
    card.style.height = "";
    card.style.minHeight = "";
}

async function loadCard(card) {
    card._state = "loading";

    const { url, hash } = card._repoConfig;

    try {
        const text = await fetchText(url);
        await validateRepo(text, hash);

        card._repoData = JSON.parse(text);
        card._state = "loaded";

        renderRepository(card, card._repoData);
    } catch (err) {
        markError(card, err);
    }
}

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not access tracking address: ${url}`);
    return res.text();
}

async function validateRepo(text, expectedHash) {
    const ok = await verifyHash(text, expectedHash);
    if (!ok) throw new Error("Security verification failed (Hash Mismatch).");
}

function markError(card, err) {
    card._state = "error";
    card._errorMsg = err.message;
    renderErrorCard(card, card._repoKey, card._errorMsg);
}

function createCard(repoKey, repoConfig) {
    const card = document.createElement("div");

    card.className = "repo-card";
    card.style.minHeight = "80px";

    card._repoKey = repoKey;
    card._repoConfig = repoConfig;
    card._state = "unloaded";
    card._isExpanded = false;

    return card;
}

function hideStatus(el) {
    el.style.display = "none";
}

function showError(el, err) {
    el.innerText = `Library component error: ${err.message}`;
    el.classList.add("error-visible");
}

async function verifyHash(text, expectedHash) {
    if (!expectedHash?.startsWith("sha256:")) return false;

    const target = expectedHash.split(":")[1].toLowerCase().trim();
    const normalized = text.replace(/\r\n/g, "\n").trim();

    const buffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized)
    );

    const actual = [...new Uint8Array(buffer)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    return actual === target;
}

function renderRepository(card, repo) {
    card.className = "repo-card";
    card.innerHTML = "";

    const header = buildHeader(card, repo);
    const drawer = buildDrawer(card, repo);

    if (card._isExpanded) {
        drawer.classList.remove("collapsed");
        header.classList.add("active");
    }

    header.addEventListener("click", () => toggleDrawer(card, header, drawer));

    card.append(header, drawer);
}

function buildHeader(card, repo) {
    const el = document.createElement("div");
    el.className = "repo-header";

    el.innerHTML = `
        <div class="repo-meta">
            <span class="repo-name">${escapeHTML(repo.name)}</span>
            <span class="repo-desc">${escapeHTML(repo.description)}</span>
        </div>
        <div class="repo-toggle-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>
    `;

    return el;
}

function buildDrawer(card, repo) {
    const drawer = document.createElement("div");
    drawer.className = "repo-drawer collapsed";

    repo.tracks.forEach(track => {
        drawer.appendChild(buildTrack(track));
    });

    return drawer;
}

function buildTrack(track) {
    const item = document.createElement("div");
    item.className = "track-item";

    const info = document.createElement("div");
    info.className = "track-info";
    info.innerHTML = `
        <strong>${escapeHTML(track.name)}</strong>
        <span class="track-author">- ${escapeHTML(track.author)}</span>
    `;

    const actions = document.createElement("div");
    actions.className = "track-actions";

    track.links.slice(0, 3).forEach(link => {
        actions.appendChild(buildLinkButton(link));
    });

    item.append(info, actions);
    return item;
}

function buildLinkButton(link) {
    const btn = document.createElement("button");
    btn.className = "btn-secondary btn-compact";
    btn.textContent = link.name;

    btn.onclick = () => {
        const target = link.url.includes("?d=")
            ? link.url.slice(link.url.indexOf("?d="))
            : link.url;

        window.location.search = target;
    };

    return btn;
}

function toggleDrawer(card, header, drawer) {
    const collapsed = drawer.classList.toggle("collapsed");
    header.classList.toggle("active", !collapsed);
    card._isExpanded = !collapsed;
}

function renderErrorCard(card, repoKey, msg) {
    card.className = "repo-card error-card";

    card.innerHTML = `
        <div class="repo-header">
            <div>
                <strong>${escapeHTML(repoKey)}</strong>
                <span style="color: var(--color-11); margin-left: 6px;">
                    - ${escapeHTML(msg)}
                </span>
            </div>
        </div>
    `;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        "\"": "&quot;"
    }[c]));
}