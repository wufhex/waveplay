export const ThemeRegistry = (() => {
    const themes = new Map();

    let activeTheme = null;
    const properties = new Map();

    const listeners = new Set();

    function register(name, themeObject) {
        themes.set(name, themeObject);
    }

    function set(name) {
        const theme = themes.get(name);

        if (!theme) {
            console.warn(`Theme "${name}" not found`);
            return;
        }

        activeTheme = name;

        // Apply CSS variables
        const root = document.documentElement;

        for (const [key, value] of Object.entries(theme)) {
            root.style.setProperty(key, value);
            properties.set(key, value);
        }

        notify();
    }

    function setProperty(key, value) {
        properties.set(key, value);
        document.documentElement.style.setProperty(key, value);

        notifyKey(key, value);
    }

    function getProperty(key) {
        return properties.get(key);
    }

    function getActiveTheme() {
        return activeTheme;
    }

    function getTheme(name) {
        return themes.get(name);
    }

    function subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function notify() {
        listeners.forEach(fn => fn({ type: "theme-change", theme: activeTheme }));
    }

    function notifyKey(key, value) {
        listeners.forEach(fn =>
            fn({ type: "property-change", key, value, theme: activeTheme })
        );
    }

    return {
        register,
        set,
        setProperty,
        getProperty,
        getActiveTheme,
        getTheme,
        subscribe
    };
})();
