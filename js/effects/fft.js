export class FFTEffect {
    constructor(canvas, { getProperty } = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl", { alpha: true, antialias: true }) || 
                  canvas.getContext("experimental-webgl", { alpha: true, antialias: true });
        this.getProperty = getProperty;

        this.dpr = Math.max(1, window.devicePixelRatio || 1);

        this.cssWidth = 0;
        this.cssHeight = 0;

        this.smoothLevels = [];

        this.opts = {
            maxBars: 256,
            spacing: 2,
            smoothing: 0.16,
            minBarHeight: 2,

            centerLine: false,

            trailAlpha: 0, 

            glow: true,
            glowIntensity: 0.22,
            glowPasses: 2
        };

        this.theme = {
            base: [120, 190, 255],
            mid: [120, 255, 210],
            glow: [180, 220, 255]
        };

        this.program = null;
        this.buffer = null;
        this.locations = {};
        
        this.vertexArray = new Float32Array(256 * 2 * 6 * 2);
        this.glowVertexArray = new Float32Array(256 * 2 * 6 * 2);
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

        this.theme.base = hexToRgb(g("--color-8"));
        this.theme.mid = hexToRgb(g("--color-9"));
        this.theme.glow = hexToRgb(g("--color-4"));
    }

    initWebGL() {
        const gl = this.gl;
        if (!gl) return;

        const vsSource = `
            attribute vec2 a_position;
            uniform vec2 u_resolution;
            varying float v_y;
            void main() {
                v_y = a_position.y / u_resolution.y;
                vec2 zeroToOne = a_position / u_resolution;
                vec2 zeroToTwo = zeroToOne * 2.0;
                gl_Position = vec4(zeroToTwo.x - 1.0, 1.0 - zeroToTwo.y, 0.0, 1.0);
            }
        `;

        const fsSource = `
            precision mediump float;
            varying float v_y;
            uniform vec3 u_base_color;
            uniform vec3 u_mid_color;
            uniform float u_alpha;
            void main() {
                vec4 color;
                if (v_y < 0.55) {
                    float t = v_y / 0.55;
                    color = mix(vec4(u_base_color, 1.0), vec4(u_mid_color, 0.9), t);
                } else {
                    float t = (v_y - 0.55) / 0.45;
                    color = mix(vec4(u_mid_color, 0.9), vec4(u_base_color, 0.25), t);
                }
                color.a *= u_alpha;
                gl_FragColor = color;
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

        this.locations = {
            position: gl.getAttribLocation(program, "a_position"),
            resolution: gl.getUniformLocation(program, "u_resolution"),
            baseColor: gl.getUniformLocation(program, "u_base_color"),
            midColor: gl.getUniformLocation(program, "u_mid_color"),
            alpha: gl.getUniformLocation(program, "u_alpha")
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
        this.loadTheme();
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

        const w = this.cssWidth;
        const h = this.cssHeight;
        const len = Math.min(data.length, this.opts.maxBars);

        if (this.smoothLevels.length !== len) {
            this.smoothLevels = new Array(len).fill(0);
        }

        const barW = w / len;
        const usableW = Math.max(1, barW - this.opts.spacing);

        const centerY = h * 0.5;
        const maxH = this.opts.centerLine ? h * 0.38 : h * 0.88;

        let x = 0;
        let idx = 0;
        let gIdx = 0;

        // Populate geometry 
        for (let i = 0; i < len; i++) {
            const v = data[i] / 255;

            this.smoothLevels[i] +=
                (v - this.smoothLevels[i]) * this.opts.smoothing;

            const s = this.smoothLevels[i];
            const eased = s * s * (3 - 2 * s);

            const hBar = Math.max(this.opts.minBarHeight, eased * maxH);
            const hBarGlow = s * maxH; 

            if (this.opts.centerLine) {
                // Base Geometry 
                const y1_top = centerY - hBar, y2_top = centerY;
                const y1_bot = centerY, y2_bot = centerY + hBar;

                // Top Rect
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y1_top;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y1_top;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y2_top;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y2_top;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y1_top;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y2_top;
                // Bottom Rect
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y1_bot;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y1_bot;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y2_bot;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y2_bot;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y1_bot;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y2_bot;

                if (this.opts.glow) {
                    // Glow Geometry 
                    const gy1_top = centerY - hBarGlow, gy2_top = centerY;
                    const gy1_bot = centerY, gy2_bot = centerY + hBarGlow;

                    // Glow Top
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy1_top;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy1_top;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy2_top;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy2_top;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy1_top;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy2_top;
                    // Glow Bottom
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy1_bot;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy1_bot;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy2_bot;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy2_bot;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy1_bot;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy2_bot;
                }
            } else {
                // Base Geometry 
                const y1 = h - hBar, y2 = h;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y1;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y1;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y2;
                this.vertexArray[idx++] = x;           this.vertexArray[idx++] = y2;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y1;
                this.vertexArray[idx++] = x + usableW; this.vertexArray[idx++] = y2;

                if (this.opts.glow) {
                    // Glow Geometry 
                    const gy1 = h - hBarGlow, gy2 = h;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy1;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy1;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy2;
                    this.glowVertexArray[gIdx++] = x;           this.glowVertexArray[gIdx++] = gy2;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy1;
                    this.glowVertexArray[gIdx++] = x + usableW; this.glowVertexArray[gIdx++] = gy2;
                }
            }
            x += barW;
        }

        // Pipeline setup
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.program);
        gl.enableVertexAttribArray(this.locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

        // Global uniform updates
        gl.uniform2f(this.locations.resolution, w, h);
        gl.uniform3f(this.locations.baseColor, this.theme.base[0] / 255, this.theme.base[1] / 255, this.theme.base[2] / 255);
        gl.uniform3f(this.locations.midColor, this.theme.mid[0] / 255, this.theme.mid[1] / 255, this.theme.mid[2] / 255);

        // Draw base pass
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexArray.subarray(0, idx), gl.DYNAMIC_DRAW);
        gl.uniform1f(this.locations.alpha, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, idx / 2);

        // Draw glow passes
        if (this.opts.glow) {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE); 
            gl.bufferData(gl.ARRAY_BUFFER, this.glowVertexArray.subarray(0, gIdx), gl.DYNAMIC_DRAW);

            for (let g = 0; g < this.opts.glowPasses; g++) {
                const alpha = this.opts.glowIntensity / (g + 1);
                gl.uniform1f(this.locations.alpha, alpha);
                gl.drawArrays(gl.TRIANGLES, 0, gIdx / 2);
            }
        }
    }

    destroy() {
        this.smoothLevels = [];
        this.vertexArray = null;
        this.glowVertexArray = null;

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
    }
}