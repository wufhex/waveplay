import { ThemeRegistry } from "./theme.js";
import { EffectRegistry } from "./effect.js";

export function initSettings(db, canvas, dbApi) {
    const themeSelect = document.getElementById("theme-selector");
    const effectSelect = document.getElementById("effect-selector");

    if (!themeSelect || !effectSelect) return;

    themeSelect.innerHTML = "";

    for (const [name, meta] of Object.entries(db.themes || {})) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = meta.name || name;
        themeSelect.appendChild(opt);
    }

    effectSelect.innerHTML = "";

    for (const [name, meta] of Object.entries(db.effects || {})) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = meta.name || name;
        effectSelect.appendChild(opt);
    }

    // defaults
    themeSelect.value = dbApi.getTheme?.() ?? db.defaultTheme;
    effectSelect.value = dbApi.getEffect?.() ?? db.defaultEffect;

    themeSelect.addEventListener("change", (e) => {
        dbApi.setTheme(e.target.value);
    });

    effectSelect.addEventListener("change", (e) => {
        dbApi.setEffect(e.target.value, canvas);
    });
}