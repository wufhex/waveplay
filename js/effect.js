export const EffectRegistry = (() => {
    const effects = new Map();
    let activeEffect = null;
    let activeInstance = null;
    const properties = new WeakMap();

    function register(name, EffectClass) {
        effects.set(name, EffectClass);
    }

    function set(name, canvas, context = {}) {
        activeInstance?.destroy?.();
        properties.delete(activeInstance);

        const EffectClass = effects.get(name);
        if (!EffectClass) {
            console.warn(`Effect "${name}" not found`);
            return;
        }

        activeEffect = name;
        activeInstance = new EffectClass(canvas, {
            getProperty,
            setProperty,
            context
        });

        activeInstance.init?.();
        properties.set(activeInstance, new Map());
    }

    function update(time) {
        activeInstance?.update?.(time);
    }

    function onThemeUpdate() {
        activeInstance?.onThemeUpdate?.();
    }

    function resize(w, h) {
        activeInstance?.resize?.(w, h);
    }

    function setProperty(key, value) {
        if (!activeInstance) return;

        let map = properties.get(activeInstance);
        if (!map) {
            map = new Map();
            properties.set(activeInstance, map);
        }

        map.set(key, value);
        activeInstance?.onPropertyChange?.(key, value);
    }

    function getProperty(key) {
        if (!activeInstance) return undefined;

        const map = properties.get(activeInstance);
        return map?.get(key);
    }

    function getActiveEffect() {
        return activeEffect;
    }

    return {
        register,
        set,
        update,
        onThemeUpdate,
        resize,
        setProperty,
        getProperty,
        getActiveEffect
    };
})();
