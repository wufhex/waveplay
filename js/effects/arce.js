export class AudioReactorCoreEffect {
    constructor(canvas, { getProperty } = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl", { alpha: true, antialias: true }) || 
                  canvas.getContext("experimental-webgl", { alpha: true, antialias: true });
        this.getProperty = getProperty;

        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.cssWidth = 0;
        this.cssHeight = 0;

        // smoothing
        this.sBass = 0;
        this.sMid = 0;
        this.sTreble = 0;
        this.time = 0;

        this.program = null;
        this.buffer = null;
        this.locations = {};

        this.theme = {
            bg1: [31, 25, 42],
            bg2: [46, 52, 64]
        }
        
        // render quad
        this.quad = new Float32Array([
            -1.0, -1.0,   1.0, -1.0,  -1.0,  1.0,
            -1.0,  1.0,   1.0, -1.0,   1.0,  1.0
        ]);
    }

    normalizeRgb(value) {
        return Math.min(255, Math.max(0, value)) / 255;
    }

    loadTheme() {
        const g = (v) =>
            getComputedStyle(document.documentElement)
                .getPropertyValue(v)
                .trim();

        const hexToRgb = (hex) => {
            const h = hex.replace("#", "");
            const n = parseInt(h, 16);
            return h.length === 6
                ? [(n >> 16) & 255, (n >> 8) & 255, n & 255]
                : [255, 255, 255];
        };

        this.theme.bg1 = hexToRgb(g("--color-15"));
        this.theme.bg2 = hexToRgb(g("--color-0"));
    }

    initWebGL() {
        this.canvas.style.opacity = "0.5";
        this.loadTheme();

        const gl = this.gl;
        if (!gl) return;

        const vsSource = `
            attribute vec2 a_position;
            varying vec2 v_uv;
            void main() {
                v_uv = a_position;
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        const fsSource = `
            precision mediump float;
            varying vec2 v_uv;
            
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform float u_bass;
            uniform float u_mid;
            uniform float u_treble;

            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }

            mat2 rot(float a) {
                float s = sin(a), c = cos(a);
                return mat2(c, -s, s, c);
            }

            void main() {
                vec2 uv = v_uv;
                uv.x *= u_resolution.x / u_resolution.y;
                
                // bass
                uv *= 1.0 - (u_bass * 0.4);
                
                // mids
                uv *= rot(u_time * 0.2 + u_mid * 1.5);
                
                float r = length(uv);

                // gradient background
                // 135deg gradient direction
                vec2 dir = normalize(vec2(-1.0, 1.0));

                vec3 c0 = vec3(
                    ${this.normalizeRgb(this.theme.bg1[0])},
                    ${this.normalizeRgb(this.theme.bg1[1])},
                    ${this.normalizeRgb(this.theme.bg1[2])}
                );
                vec3 c1 = vec3(
                    ${this.normalizeRgb(this.theme.bg2[0])},
                    ${this.normalizeRgb(this.theme.bg2[1])},
                    ${this.normalizeRgb(this.theme.bg2[2])}
                );

                float grad = dot(uv, dir);
                grad = grad * 0.5 + 0.5;
                grad = smoothstep(0.0, 1.0, grad);

                vec3 bg = mix(c0, c1, grad);
                vec3 color = vec3(0.0);
                
                // treble
                vec2 ripple = (uv / r) * sin(r * 40.0 - u_time * 15.0) * (u_treble * 0.04);
                uv += ripple;
                
                vec2 p = uv;
                for (float i = 0.0; i < 6.0; i++) {
                    // bass
                    p = abs(p) - (0.15 + u_bass * 0.25);
                    
                    // mids
                    p *= rot(u_time * 0.1 + i * 0.6 + u_mid * 0.5);
                    
                    float d = min(abs(p.x), abs(p.y));
                    
                    // bads
                    float glow = (0.004 + u_bass * 0.015) / d;
                    
                    // treble
                    float hue = u_time * 0.1 + i * 0.15 + (u_treble * 0.8);
                    vec3 layerColor = hsv2rgb(vec3(hue, 0.8, 1.0));
                    
                    color += layerColor * glow;
                }
                
                // bass 
                float coreDist = abs(r - (u_bass * 0.4));
                float coreGlow = 0.02 / max(coreDist, 0.001);
                color += vec3(1.0, 0.3, 0.1) * coreGlow * u_bass * 1.5;
                
                color *= exp(-r * 1.8);
                color += bg;
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        const createShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            return shader;
        };

        const program = gl.createProgram();
        gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
        gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
        gl.linkProgram(program);

        this.program = program;
        this.buffer = gl.createBuffer();
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.quad, gl.STATIC_DRAW);

        this.locations = {
            position: gl.getAttribLocation(program, "a_position"),
            resolution: gl.getUniformLocation(program, "u_resolution"),
            time: gl.getUniformLocation(program, "u_time"),
            bass: gl.getUniformLocation(program, "u_bass"),
            mid: gl.getUniformLocation(program, "u_mid"),
            treble: gl.getUniformLocation(program, "u_treble")
        };
    }

    resize(w, h) {
        this.cssWidth = w;
        this.cssHeight = h;
        this.dpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.width = Math.floor(w * this.dpr);
        this.canvas.height = Math.floor(h * this.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    init() {
        this.initWebGL();
        this.resize(
            this.canvas.clientWidth || this.canvas.width,
            this.canvas.clientHeight || this.canvas.height
        );
    }

    onThemeUpdate() {
        this.loadTheme();
    }

    update() {
        const data = this.getProperty?.("fftData");
        if (!data || data.length === 0) return;
        if (Number.isNaN(data[0])) return;

        const gl = this.gl;
        if (!gl) return;

        let bass = 0, mid = 0, treble = 0;
        
        // Isolate frequency spectrum ranges
        for(let i = 0; i < 8; i++) bass += data[i];
        for(let i = 8; i < 32; i++) mid += data[i];
        for(let i = 32; i < 128; i++) treble += data[i];

        // Map to 0 -> 1
        bass = (bass / 8) / 255;
        mid = (mid / 24) / 255;
        treble = (treble / 96) / 255;

        const smoothLerp = (current, target, attackAmt, decayAmt) => {
            const amt = target > current ? attackAmt : decayAmt;
            return current + (target - current) * amt;
        };

        this.sBass = smoothLerp(this.sBass, bass, 0.45, 0.12);
        this.sMid = smoothLerp(this.sMid, mid, 0.35, 0.10);
        this.sTreble = smoothLerp(this.sTreble, treble, 0.40, 0.12);

        this.time += 0.01 + (this.sBass * 0.015);

        // Draw
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.enableVertexAttribArray(this.locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(this.locations.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.locations.time, this.time);
        gl.uniform1f(this.locations.bass, this.sBass);
        gl.uniform1f(this.locations.mid, this.sMid);
        gl.uniform1f(this.locations.treble, this.sTreble);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    destroy() {
        this.canvas.style.opacity = "1";

        const gl = this.gl;
        if (gl) {
            if (this.buffer) gl.deleteBuffer(this.buffer);
            if (this.program) gl.deleteProgram(this.program);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        this.gl = null;
        this.program = null;
        this.buffer = null;
        this.locations = null;
        this.getProperty = null;
        this.canvas = null;
        this.quad = null;
    }
}