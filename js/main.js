import { EffectRegistry } from "./effect.js";
import { ThemeRegistry } from "./theme.js";
import { AudioEngine } from "./audio.js";
import { InterpreterPage } from "./interpreter.js";

import { initSettings } from "./settings.js";
import { initLibrary } from "./library.js";

import {
    loadDB,
    registerThemesFromDB,
    registerEffectsFromDB,
    ensureDefaults
} from "./config.js";

const el = {
    effectCanvas: document.getElementById("effect-canvas"),
    content: document.getElementById("content"),
    uiOverlay: document.getElementById("ui-overlay"),
    pcOnly: Array.from(document.querySelectorAll(".el-pc-only"))
};

const state = {
    currentPage: null,
    config: null,
    configApi: null,
    timeStart: Date.now(),
    rafId: null,
};

function updateEffects() {
    const t = (Date.now() - state.timeStart) / 100;

    if (AudioEngine.isPlaying) {
        AudioEngine.updateFFT();
    }

    EffectRegistry.update(t);

    state.rafId = requestAnimationFrame(updateEffects);
}

function updateActiveNav(page) {
    document.querySelectorAll("[data-page]").forEach(btn => {
        const isActive = btn.dataset.page === page;
        btn.classList.toggle("btn-primary", isActive);
        btn.classList.toggle("btn-secondary", !isActive);
    });
}

function updateUI() {
    const isPC = window.innerWidth >= 1024;
    el.pcOnly.forEach(el => {
        el.style.display = isPC ? "" : "none";
    });
}

async function loadPage(page) {
    const response = await fetch(`https://wufhex.github.io/waveplay/pages/${page}.html`);
    const html = await response.text();

    el.content.innerHTML = html;
    el.content.className = "";
    el.content.classList.add(`page-${page}`);

    if (state.currentPage?.destroy) {
        state.currentPage.destroy();
    }

    updateActiveNav(page);

    switch (page) {
        case "interpreter":
            state.currentPage = new InterpreterPage(state.configApi);
            break;

        case "settings":
            initSettings(state.config, el.effectCanvas, state.configApi);
            break;

        case "library":
            await initLibrary();
            break;
    }
}

function resizeCanvas(canvas) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    return {
        width: canvas.width,
        height: canvas.height
    };
}

document.onkeydown = function(evt) {
    if (evt.key === "F3") {
        evt.preventDefault();
        const elStyle = el.uiOverlay.style;
        elStyle.display = (elStyle.display === "none" || elStyle.display === "")
            ? "block"
            : "none";
    }
};

window.onresize = function () {
    updateUI();
    const { width, height } = resizeCanvas(el.effectCanvas);
    EffectRegistry.resize(width, height);
};

window.addEventListener("DOMContentLoaded", async () => {    
    const db = await loadDB();

    state.config = db;

    await registerThemesFromDB(db);
    await registerEffectsFromDB(db);

    const configApi = await ensureDefaults(db);
    state.configApi = configApi;

    ThemeRegistry.set(configApi.currentTheme);
    EffectRegistry.set(configApi.currentEffect, el.effectCanvas);

    updateEffects();
    updateUI();

    document.querySelectorAll("[data-page]").forEach(button => {
        button.addEventListener("click", () => {
            loadPage(button.dataset.page);
        });
    });

    loadPage("interpreter");
});
