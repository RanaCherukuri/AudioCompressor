let wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#ddd',
    progressColor: '#2196f3',
    barWidth: 2,
    cursorWidth: 0,
    interact: true,
    dragSelection: false,
    backend: 'MediaElement',
    media: document.getElementById('audioplayer'),
    normalize: false,
    barGap: 0,
    barRadius: 30,
});


let context = new (window.AudioContext || window.webkitAudioContext)();
let audioBuffer = null;
let slider = document.getElementById('compression-slider');
let sliderValueDisplay = document.getElementById('sample-rate');
let fileInput = document.getElementById('upload');
let audioPlayer = document.getElementById('audioplayer');
let originalSizeDisplay = document.getElementById('original-size');
let compressedSizeDisplay = document.getElementById('compressed-size');
let originalFileSize = 0;
let seeking = false;

let minBars = 30;


fileInput.addEventListener('change', async (e) => {
    let file = e.target.files[0];
    if (!file) return;

    originalFileSize = file.size;
    originalSizeDisplay.textContent = formatBytes(originalFileSize);


    let arrayBuffer = await file.arrayBuffer();
    audioBuffer = await context.decodeAudioData(arrayBuffer);
    wavesurfer.loadBlob(file);
    audioPlayer.src = URL.createObjectURL(file);


    slider.value = 1;
    sliderValueDisplay.textContent = '1x';
    compressAndDisplay(audioBuffer, 1);
});

function adjustBarWidth(currentSampleRate) {
    if (!audioBuffer || !wavesurfer.drawer) return;
    let duration = wavesurfer.getDuration();
    if (!duration) return;
    let waveformWidth = wavesurfer.drawer.width;
    let samplesPerPixel = currentSampleRate / waveformWidth;
    wavesurfer.setOptions({
      container: '#waveform',
        waveColor: '#ddd',
        progressColor: '#2196f3',
        cursorWidth: 0,
        interact: true,
        dragSelection: false,
        backend: 'MediaElement',
        media: document.getElementById('audioplayer'),
        normalize: false,
        barRadius: 30,
        barWidth: Math.max(1, 1 currentSampleRate),
        barGap: 0
    });
    console.log(currentSampleRate);
}

function compressAndDisplay(inputBuffer, compressionFactor) {
    if (!inputBuffer) return;

    let targetSampleRate = inputBuffer.sampleRate / compressionFactor;
    targetSampleRate = Math.max(1, targetSampleRate);

    let srcData = inputBuffer.getChannelData(0);
    let srcRate = inputBuffer.sampleRate;
    let duration = inputBuffer.duration;
    let samplesNeeded = Math.floor(duration * targetSampleRate);
    let sampledData = new Float32Array(samplesNeeded);

    for (let i = 0; i < samplesNeeded; i++) {
        let srcIndex = Math.floor(i * srcRate / targetSampleRate);
        sampledData[i] = srcData[srcIndex];
    }

    let resampledData = new Float32Array(srcData.length);
    for (let i = 0; i < resampledData.length; i++) {
        let t = i / srcRate;
        let indexInSampled = t * targetSampleRate;
        let i0 = Math.floor(indexInSampled);
        let i1 = Math.min(i0 + 1, sampledData.length - 1);
        let frac = indexInSampled - i0;
        let val = sampledData[i0] * (1 - frac) + sampledData[i1] * frac;
        resampledData[i] = val;
    }

    let newBuffer = context.createBuffer(1, resampledData.length, inputBuffer.sampleRate);
    newBuffer.copyToChannel(resampledData, 0);

    let wavBlob = bufferToWaveBlob(newBuffer);
    let blobUrl = URL.createObjectURL(wavBlob);

    wavesurfer.load(blobUrl); // Use the load method to update the existing instance
    audioPlayer.src = blobUrl;

    adjustBarWidth(targetSampleRate);

    let compressedFileSize = calculateCompressedSize(originalFileSize, inputBuffer.sampleRate, targetSampleRate);
    compressedSizeDisplay.textContent = formatBytes(compressedFileSize);
}


wavesurfer.on('ready', () => {
    audioPlayer.play();
});

wavesurfer.on('seek', (time) => {
    seeking = true;
    audioPlayer.pause();
    audioPlayer.currentTime = time;
});



slider.addEventListener('input', async () => {
    let compressionFactor = parseInt(slider.value);
    sliderValueDisplay.textContent = compressionFactor + 'x';

    if (!audioBuffer) return;

    compressAndDisplay(audioBuffer, compressionFactor);
});


// followed yt tutorial
function bufferToWaveBlob(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    let pos = 0;

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    const channels = [];
    for (let i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));

    const sampleCount = buffer.length;
    for (let i = 0; i < sampleCount; i++) {
        for (let chan = 0; chan < numOfChan; chan++) {
            let sample = Math.max(-1, Math.min(1, channels[chan][i]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// from stack overflow
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


function calculateCompressedSize(originalSize, originalSampleRate, newSampleRate) {
    return Math.round(originalSize * (newSampleRate / originalSampleRate));
}
