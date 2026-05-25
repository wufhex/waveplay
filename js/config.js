import { EffectRegistry } from "./effect.js";
import { ThemeRegistry } from "./theme.js";

const STORAGE_KEY    = "waveplay-editor-config";
const DEFAULT_VOLUME = 0.3;

function loadStoredConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.warn("[Config] Failed to parse stored config", err);
        return {};
    }
}

function saveStoredConfig(patch) {
    try {
        const current = loadStoredConfig();
        const next = { ...current, ...patch };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (err) {
        console.warn("[Config] Failed to save config", err);
    }
}

export async function loadDB() {
    try {
        const res = await fetch(new URL("https://wufhex.github.io/waveplay/data/ext-db.json", import.meta.url));

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!data) {
            throw new Error("DB is empty or invalid JSON");
        }

        return data;
    } catch (err) {
        console.error("[Config] Failed to load DB:", err);

        return {
            themes: {},
            effects: {}
        };
    }
}

async function loadModule(meta) {
    const mod = await import(meta.module);
    return mod[meta.export] ?? mod.default;
}

async function registerPlugins(dbSection, Registry, label) {
    const items = dbSection || {};

    for (const [name, meta] of Object.entries(items)) {
        try {
            const Plugin = await loadModule(meta);

            if (!Plugin) {
                throw new Error(`No export found in ${meta.module}`);
            }

            Registry.register(name, Plugin);
        } catch (err) {
            console.error(`[${label} load error] ${name}`, err);
        }
    }
}

export async function registerThemesFromDB(db) {
    return registerPlugins(db?.themes, ThemeRegistry, "Theme");
}

export async function registerEffectsFromDB(db) {
    return registerPlugins(db?.effects, EffectRegistry, "Effect");
}

export async function ensureDefaults(db) {
    if (!db) {
        console.warn("[Config] DB was null, using empty fallback");
        db = { themes: {}, effects: {} };
    }

    const stored = loadStoredConfig();

    if (!db.themes || Object.keys(db.themes).length === 0) {
        db.themes = {
            north: {
                name: "Nordic",
                module: "./themes/north.js",
                export: "NorthTheme",
                default: true
            }
        };
        await registerThemesFromDB(db);
    }

    if (!db.effects || Object.keys(db.effects).length === 0) {
        db.effects = {
            fft: {
                name: "FFT Spectrum",
                module: "./effects/fft.js",
                export: "FFTEffect",
                default: true
            }
        };
        await registerEffectsFromDB(db);
    }

    const validThemes = Object.keys(db.themes);
    const validEffects = Object.keys(db.effects);

    const themeDefault =
        Object.entries(db.themes || {}).find(([_, meta]) => meta.default)?.[0];

    const effectDefault =
        Object.entries(db.effects || {}).find(([_, meta]) => meta.default)?.[0];

    const currentTheme =
        (stored.currentTheme && validThemes.includes(stored.currentTheme))
            ? stored.currentTheme
            : themeDefault ?? validThemes[0];

    const currentEffect =
        (stored.currentEffect && validEffects.includes(stored.currentEffect))
            ? stored.currentEffect
            : effectDefault ?? validEffects[0];

    const currentVolume =
        typeof stored.currentVolume === "number"
            ? Math.min(1, Math.max(0, stored.currentVolume))
            : DEFAULT_VOLUME;

    saveStoredConfig({
        currentTheme,
        currentEffect,
        currentVolume
    });

    return {
        currentTheme,
        currentEffect,
        currentVolume,

        getTheme() {
            return loadStoredConfig().currentTheme || currentTheme;
        },

        getEffect() {
            return loadStoredConfig().currentEffect || currentEffect;
        },

        setTheme(name) {
            if (!validThemes.includes(name)) return;

            saveStoredConfig({ currentTheme: name });
            ThemeRegistry.set(name);
            EffectRegistry.onThemeUpdate();
        },

        setEffect(name, canvas) {
            if (!validEffects.includes(name)) return;

            saveStoredConfig({ currentEffect: name });
            EffectRegistry.set(name, canvas);
        },

        getVolume() {
            const v = loadStoredConfig().currentVolume;
            return typeof v === "number" ? v : currentVolume;
        },

        setVolume(value) {
            const clamped = Math.min(1, Math.max(0, value));
            saveStoredConfig({ currentVolume: clamped });
        }
    };
}
