let wavesurfer;
let originalBuffer = null;
let originalSize = 0;

const upload = document.getElementById('upload');
const slider = document.getElementById('compression-slider');
const sampleRateDisplay = document.getElementById('sample-rate');
const originalSizeDisplay = document.getElementById('original-size');
const compressedSizeDisplay = document.getElementById('compressed-size');
const playPauseBtn = document.getElementById('playpause');

function createWaveSurfer() {
  if (wavesurfer) {
    wavesurfer.destroy();
  }

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#e74c3c',
    progressColor: '#c0392b',
    height: 200,
  });
}

function updateCompression(rateFactor) {
  if (!originalBuffer) return;

  const newSampleRate = originalBuffer.sampleRate / rateFactor;

  const offlineCtx = new OfflineAudioContext(
    originalBuffer.numberOfChannels,
    originalBuffer.duration * newSampleRate,
    newSampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  offlineCtx.startRendering().then(resampledBuffer => {
    const length = resampledBuffer.length * resampledBuffer.numberOfChannels * 2;
    const compressedSize = Math.floor(length);

    compressedSizeDisplay.textContent = compressedSize + ' bytes';

    // Convert to blob and use object URL
    const wavBlob = bufferToWave(resampledBuffer);
    const url = URL.createObjectURL(wavBlob);
    wavesurfer.load(url);
  });
}

function bufferToWave(abuffer) {
  let numOfChan = abuffer.numberOfChannels,
    length = abuffer.length * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [],
    i,
    sample,
    offset = 0,
    pos = 0;

  setUint32(0x46464952); // \"RIFF\"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // \"WAVE\"

  setUint32(0x20746d66); // \"fmt \" chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded)

  setUint32(0x61746164); // \"data\" - chunk
  setUint32(length - pos - 4); // chunk length

  for (i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

upload.addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  originalSize = file.size;
  originalSizeDisplay.textContent = originalSize + ' bytes';

  const reader = new FileReader();
  reader.onload = function (event) {
    const arrayBuffer = event.target.result;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.decodeAudioData(arrayBuffer, function (buffer) {
      originalBuffer = buffer;
      createWaveSurfer();
      updateCompression(parseInt(slider.value));
    });
  };
  reader.readAsArrayBuffer(file);
});

slider.addEventListener('input', function () {
  sampleRateDisplay.textContent = slider.value;
  updateCompression(parseInt(slider.value));
});

playPauseBtn.addEventListener('click', () => {
  if (wavesurfer) {
    wavesurfer.playPause();
    playPauseBtn.textContent = wavesurfer.isPlaying() ? 'Pause' : 'Play';
  }
});
