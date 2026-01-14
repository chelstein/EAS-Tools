class EASProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        this.port.postMessage(inputs[0]);
        return !0;
    }
}

registerProcessor("eas-processor", EASProcessor);

class EASRecorderProcessor extends AudioWorkletProcessor {
    process(inputs) {
        if (inputs && inputs[0] && inputs[0].length) {
            this.port.postMessage(inputs[0]);
        }
        return !0;
    }
}

registerProcessor("eas-recorder", EASRecorderProcessor);
