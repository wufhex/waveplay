import { EffectRegistry } from "./effect.js";

export const AudioEngine = {
    ctx: null,
    workletNode: null,
    analyser: null,
    fftData: null,
    isPlaying: false,

    _t: 0,
    _formulaFunc: null,
    _config: { freq: 8000, volume: 0.3, mode: 'bytebeat' },
    _configProxy: null,

    get t() { return this._t; },
    set t(val) {
        this._t = val;
        if (this.workletNode) {
            this.workletNode.port.postMessage({ type: 'setT', payload: val });
        }
    },

    get formulaFunc() { return this._formulaFunc; },
    set formulaFunc(val) {
        this._formulaFunc = val;
        if (this.workletNode && val) {
            this.workletNode.port.postMessage({ type: 'formula', payload: val.toString() });
        }
    },

    get config() {
        if (!this._configProxy) {
            this._configProxy = new Proxy(this._config, {
                set: (target, prop, value) => {
                    target[prop] = value;
                    if (this.workletNode) {
                        this.workletNode.port.postMessage({ type: 'config', payload: { [prop]: value } });
                    }
                    return true;
                }
            });
        }
        return this._configProxy;
    },
    set config(val) {
        Object.assign(this.config, val);
    },

    async init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.fftData = new Uint8Array(this.analyser.frequencyBinCount);

        await this.ctx.audioWorklet.addModule('./js/bb-processor.js');

        this.workletNode = new AudioWorkletNode(this.ctx, 'bytebeat-processor');

        this.workletNode.port.onmessage = (e) => {
            if (e.data.type === 'updateT') {
                this._t = e.data.payload; 
            }
        };

        this.workletNode.port.postMessage({ type: 'config', payload: this._config });
        if (this._formulaFunc) {
            this.workletNode.port.postMessage({ type: 'formula', payload: this._formulaFunc.toString() });
        }
        if (this.isPlaying) {
            this.workletNode.port.postMessage({ type: 'play' });
        }

        this.workletNode.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
    },

    updateFFT() {
        if (!this.analyser || !this.fftData) return;

        this.analyser.getByteFrequencyData(this.fftData);
        EffectRegistry.setProperty("fftData", new Uint8Array(this.fftData));
    },

    start() {
        if (this.ctx?.state === 'suspended') this.ctx.resume();
        this.isPlaying = true;
        
        if (this.workletNode) {
            this.workletNode.port.postMessage({ type: 'play' });
            this.workletNode.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
        }
    },

    stop() {
        this.isPlaying = false;
        if (this.workletNode) {
            this.workletNode.port.postMessage({ type: 'pause' });
            this.workletNode.disconnect();
        }
    }
};