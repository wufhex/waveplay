class BytebeatProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.t = 0;
        this.formulaFunc = null;
        this.config = { freq: 8000, volume: 0.3, mode: 'bytebeat' };
        this.isPlaying = false;
        
        this.framesSinceLastUpdate = 0; 

        this.port.onmessage = (e) => {
            const { type, payload } = e.data;
            
            if (type === 'config') {
                Object.assign(this.config, payload);
            } else if (type === 'formula') {
                try {
                    this.formulaFunc = new Function('return ' + payload)();
                } catch (err) {
                    this.formulaFunc = null;
                }
            } else if (type === 'play') {
                this.isPlaying = true;
            } else if (type === 'pause') {
                this.isPlaying = false;
            } else if (type === 'setT') {
                this.t = payload;
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channel = output[0];
        if (!channel) return true;

        if (!this.isPlaying || !this.formulaFunc) {
            channel.fill(0);
            return true;
        }

        const step = this.config.freq / sampleRate;
        const isFloatbeat = this.config.mode === 'floatbeat';

        for (let i = 0; i < channel.length; i++) {
            this.t += step;
            try {
                const rawSample = this.formulaFunc(Math.floor(this.t));

                if (isFloatbeat) {
                    channel[i] = rawSample * this.config.volume;
                } else {
                    const byteValue = rawSample & 255;
                    channel[i] = ((byteValue / 127.5) - 1.0) * this.config.volume;
                }
            } catch (err) {
                channel[i] = 0;
            }
        }

        this.framesSinceLastUpdate++;
        if (this.framesSinceLastUpdate >= 10) { 
            this.port.postMessage({ type: 'updateT', payload: this.t });
            this.framesSinceLastUpdate = 0;
        }

        return true;
    }
}

registerProcessor('bytebeat-processor', BytebeatProcessor);