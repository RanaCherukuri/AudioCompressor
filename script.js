let wavesurfer = null;
let originalBuffer = null;
let originalSize = 0;
let audioCtx = null;

const upload = document.getElementById('upload');
const slider = document.getElementById('compression-slider');
const sampleRateDisplay = document.getElementById('sample-rate');
const originalSizeDisplay = document.getElementById('original-size');
const compressedSizeDisplay = document.getElementById('compressed-size');
const playPauseBtn = document.getElementById('playpause');
const audioPlayer = document.getElementById('audioplayer');

function initWaveSurfer(compressionFactor = 1) {
  if (wavesurfer) {
    wavesurfer.destroy();
  }

  // MORE compression -> MORE lines -> thinner bars, smaller gaps
  const barWidth = Math.max(1, (compressionFactor)*2);
  const barGap = Math.max(0, (compressionFactor));

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#FF5733',
    progressColor: '#2980B9',
    cursorColor: '#fff',
    cursorWidth: 1,
    barWidth: barWidth,
    barHeight: 1,
    barGap: barGap,
    responsive: true,
  });
}

function loadAudioFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  initWaveSurfer(parseInt(slider.value));  // init w/ compression factor
  wavesurfer.load(url);
  audioPlayer.src = url;

  wavesurfer.on('ready', () => {
    // sync wavesurfer position to native audio when seeking
    audioPlayer.ontimeupdate = () => {
      const audioDuration = audioPlayer.duration || 1;
      const audioTime = audioPlayer.currentTime;
      const percent = audioTime / audioDuration;
      if (!wavesurfer.isPlaying()) {
        wavesurfer.seekTo(percent);
      }
    };

    // sync audio element if seeking in waveform
    wavesurfer.on('seek', (progress) => {
      const newTime = progress * audioPlayer.duration;
      audioPlayer.currentTime = newTime;
    });

    // syncing audio playing/pausing
    audioPlayer.onplay = () => {
      if (!wavesurfer.isPlaying()) { wavesurfer.play(); }
      playPauseBtn.textContent = 'Pause';
    };

    audioPlayer.onpause = () => {
      if (wavesurfer.isPlaying()) { wavesurfer.pause(); }
      playPauseBtn.textContent = 'Play';
    };
  });
}

function updateCompression(rateFactor) {
  if (!originalBuffer) return;

  if (rateFactor === 1) {
    compressedSizeDisplay.textContent = originalSize + ' bytes';
    const file = upload.files[0];
    const url = URL.createObjectURL(file);
    initWaveSurfer(rateFactor);
    wavesurfer.load(url);
    audioPlayer.src = url;
    return;
  } else {
    const newSampleRate = originalBuffer.sampleRate / rateFactor;
    const offlineCtx = new OfflineAudioContext(
      originalBuffer.numberOfChannels,
      Math.floor(originalBuffer.duration * newSampleRate),
      newSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = originalBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    offlineCtx.startRendering().then(resampledBuffer => {
      const wavBlob = bufferToWave(resampledBuffer);
      compressedSizeDisplay.textContent = wavBlob.size + ' bytes';
      loadAudioFromBlob(wavBlob);
    });
  }
}

function bufferToWave(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
  const view = new DataView(new ArrayBuffer(length));

  let offset = 0;

  const writeString = (s) => {
    for (let i = 0; i < s.length; i++) { view.setUint8(offset++, s.charCodeAt(i)); }
  };

  writeString('RIFF');
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * numChannels * 2, true); offset += 4;
  view.setUint16(offset, numChannels * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data');
  view.setUint32(offset, length - offset - 4, true); offset += 4;

  const channels = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i));

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      sample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([view.buffer], { type: 'audio/wav' });
}

upload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  originalSize = file.size;
  originalSizeDisplay.textContent = `${originalSize} bytes`;

  const reader = new FileReader();
  reader.onload = (event) => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.decodeAudioData(event.target.result, (buffer) => {
      originalBuffer = buffer;
      updateCompression(parseInt(slider.value));
    });
  };
  reader.readAsArrayBuffer(file);
});

slider.addEventListener('input', () => {
  const factor = parseInt(slider.value);
  sampleRateDisplay.textContent = `${factor}x`;
  updateCompression(factor);
});

playPauseBtn.addEventListener('click', () => {
  if (!wavesurfer) return;
  if (audioPlayer.paused) { audioPlayer.play(); }
  else { audioPlayer.pause(); }
});
