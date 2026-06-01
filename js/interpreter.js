import { AudioEngine } from "./audio.js";
import { Compiler } from "./compiler.js";
import { decodeState, updateUrl } from "./state.js";

export class InterpreterPage {
    constructor(configApi) {
        this.rafId = null;
        this.configApi = configApi;

        this.state = {
            isEditingT: false,
            isEditingSec: false,
        };

        this.el = {
            formula: document.getElementById('formula'),
            freq: document.getElementById('frequency'),
            freqPreset: document.getElementById('frequencyPreset'),
            volume: document.getElementById('volume'),

            tInput: document.getElementById('counter-t'),
            secInput: document.getElementById('counter-sec'),

            modeSelector: document.getElementById('mode-selector'),

            playBtn: document.getElementById('play-btn'),
            resetBtn: document.getElementById('reset-btn'),

            error: document.getElementById('error-display'),
        };

        this.init();
    }

    init() {
        this.bindEvents();

        const urlState = decodeState();

        const freq = urlState.freq ?? 8000;
        const mode = urlState.mode ?? "bytebeat";
        const code = urlState.code ?? this.el.formula.value;

        this.el.formula.value = code;
        this.el.freq.value = freq;
        this.el.modeSelector.value = mode;
        this.el.volume.value = this.configApi.getVolume();

        AudioEngine.config.freq = parseFloat(freq);
        AudioEngine.config.volume = this.configApi.getVolume();
        AudioEngine.config.mode = mode;

        this.updateFormula();

        this.syncUI();
        this.syncCounters();

        this.pushURLState();
    }

    bindEvents() {
        this.el.playBtn.addEventListener('click', () => {
            if (!AudioEngine.ctx)
                AudioEngine.init();

            this.updateFormula();

            if (!AudioEngine.isPlaying) {
                AudioEngine.start();
                this.el.playBtn.textContent = 'Pause';
                this.el.playBtn.classList.add('playing');
            } else {
                AudioEngine.stop();
                this.el.playBtn.textContent = 'Play';
                this.el.playBtn.classList.remove('playing');
            }
        });

        this.el.resetBtn.addEventListener('click', () => {
            AudioEngine.t = 0;
            this.el.tInput.value = 0;
            this.el.secInput.value = 0;

            this.pushURLState();
        });

        this.el.freq.addEventListener('input', () => {
            AudioEngine.config.freq =
                parseFloat(this.el.freq.value) || 8000;

            this.pushURLState();
        });

        this.el.freqPreset.addEventListener('click', () => {
            const matchFound = Array.from(this.el.freqPreset.options).some(
                option => option.value === this.el.freq.value
            );

            if (matchFound) {
                this.el.freqPreset.value = this.el.freq.value;
            } else {
                this.el.freqPreset.value = '';
            }
            
            this.pushURLState();
        });

        this.el.freqPreset.addEventListener('change', (evt) => {
            this.el.freq.value = evt.target.value;
            AudioEngine.config.freq = parseFloat(evt.target.value);

            this.pushURLState();
        });

        this.el.volume.addEventListener('input', () => {
            this.configApi.setVolume(this.el.volume.value);
            AudioEngine.config.volume =
                parseFloat(this.el.volume.value);
        });

        this.el.formula.addEventListener(
            'input',
            () => this.updateFormula()
        );

        this.el.modeSelector.addEventListener('change', () => {
            AudioEngine.config.mode =
                this.el.modeSelector.value;

            this.pushURLState();
        });

        this.el.tInput.addEventListener('input', () => {
            AudioEngine.t =
                parseInt(this.el.tInput.value) || 0;

            this.el.secInput.value =
                (AudioEngine.t / AudioEngine.config.freq)
                    .toFixed(3);
        });

        this.el.secInput.addEventListener('input', () => {
            const secs =
                parseFloat(this.el.secInput.value) || 0;

            AudioEngine.t =
                secs * AudioEngine.config.freq;

            this.el.tInput.value =
                Math.floor(AudioEngine.t);
        });

        this.el.tInput.addEventListener('focus', () => {
            this.state.isEditingT = true;
        });

        this.el.tInput.addEventListener('blur', () => {
            this.state.isEditingT = false;
        });

        this.el.secInput.addEventListener('focus', () => {
            this.state.isEditingSec = true;
        });

        this.el.secInput.addEventListener('blur', () => {
            this.state.isEditingSec = false;
        });
    }

    updateFormula() {
        const compiled = Compiler.compile(
            this.el.formula.value,
            (err) => {
                this.el.error.textContent = err.formattedMessage;
                this.el.error.className = "error-visible";
            },
            () => {
                this.el.error.textContent = "";
                this.el.error.className = "error-hidden";
            }
        );

        if (compiled) {
            AudioEngine.formulaFunc = compiled;
        }

        this.pushURLState();
    }

    syncCounters() {
        const update = () => {

            if (AudioEngine.isPlaying) {

                if (!this.state.isEditingT) {
                    this.el.tInput.value =
                        Math.floor(AudioEngine.t);
                }

                if (!this.state.isEditingSec) {
                    this.el.secInput.value =
                        (AudioEngine.t / AudioEngine.config.freq)
                            .toFixed(3);
                }
            }

            this.rafId =
                requestAnimationFrame(update);
        };

        update();
    }

    syncUI() {
        if (AudioEngine.isPlaying) {
            this.el.playBtn.textContent = 'Pause';
            this.el.playBtn.classList.add('playing');
        } else {
            this.el.playBtn.textContent = 'Play';
            this.el.playBtn.classList.remove('playing');
        }
    }

    pushURLState() {
        updateUrl({
            code: this.el.formula.value,
            freq: AudioEngine.config.freq,
            mode: AudioEngine.config.mode
        });
    }

    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}