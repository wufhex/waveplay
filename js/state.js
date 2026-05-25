export function encodeState(state) {
    const json = JSON.stringify({
        c: state.code ?? "",
        f: state.freq ?? 8000,
        m: state.mode ?? "bytebeat"
    });

    return LZString.compressToEncodedURIComponent(json);
}

export function decodeState() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("d");

    if (!raw) {
        return {
            code: null,
            freq: null,
            mode: null
        };
    }

    try {
        const json = LZString.decompressFromEncodedURIComponent(raw);
        const obj = JSON.parse(json);

        return {
            code: obj.c || null,
            freq: obj.f ?? null,
            mode: obj.m || null
        };

    } catch (e) {
        console.warn("Invalid URL state:", e);

        return {
            code: null,
            freq: null,
            mode: null
        };
    }
}

export function updateUrl(state) {
    const data = encodeState(state);

    const params = new URLSearchParams();
    params.set("d", data);

    const newUrl = `${window.location.pathname}?${params.toString()}`;

    window.history.replaceState({}, "", newUrl);
}