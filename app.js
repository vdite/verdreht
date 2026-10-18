const APP_VERSION = "6";

const MOVES = [
  { side: "Linke", limb: "Hand", fileSide: "linke", fileLimb: "hand" },
  { side: "Rechte", limb: "Hand", fileSide: "rechte", fileLimb: "hand" },
  { side: "Linker", limb: "Fuß", fileSide: "linker", fileLimb: "fuss" },
  { side: "Rechter", limb: "Fuß", fileSide: "rechter", fileLimb: "fuss" },
];

const COLORS = [
  { name: "Rot", file: "rot", hex: "#ed4b4f" },
  { name: "Blau", file: "blau", hex: "#4b7ee8" },
  { name: "Gelb", file: "gelb", hex: "#f3c83f" },
  { name: "Grün", file: "gruen", hex: "#61b96f" },
];

const AUDIO_FILES = [
  ...MOVES.flatMap((move) => [move.fileSide, move.fileLimb]),
  "auf",
  ...COLORS.map((color) => color.file),
  "noch-fuenf-sekunden",
];
const UNIQUE_AUDIO_FILES = [...new Set(AUDIO_FILES)];

const state = {
  running: false,
  move: null,
  round: 0,
  secondsLeft: 10,
  interval: Number(localStorage.getItem("twister-interval")) || 10,
  voiceMode: localStorage.getItem("twister-voice") || "auto",
  countdown: localStorage.getItem("twister-countdown") !== "false",
  timer: null,
  deck: [],
  audioContext: null,
  audioBuffers: new Map(),
  activeSources: [],
  audioSequence: 0,
};

const ui = {
  mainButton: document.querySelector("#mainButton"),
  mainButtonLabel: document.querySelector("#mainButton span"),
  repeatButton: document.querySelector("#repeatButton"),
  instruction: document.querySelector("#instruction"),
  roundLabel: document.querySelector("#roundLabel"),
  colorAnswer: document.querySelector("#colorAnswer"),
  colorName: document.querySelector("#colorName"),
  colorDot: document.querySelector("#colorDot"),
  limbVisual: document.querySelector("#limbVisual"),
  handIcon: document.querySelector("#handIcon"),
  footIcon: document.querySelector("#footIcon"),
  moveCard: document.querySelector("#moveCard"),
  statusLight: document.querySelector("#statusLight"),
  statusText: document.querySelector("#statusText"),
  timerText: document.querySelector("#timerText"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  intervalInput: document.querySelector("#intervalInput"),
  intervalOutput: document.querySelector("#intervalOutput"),
  voiceMode: document.querySelector("#voiceMode"),
  countdownToggle: document.querySelector("#countdownToggle"),
  audioUnlockButton: document.querySelector("#audioUnlockButton"),
};

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function refillDeck() {
  const combinations = MOVES.flatMap((move) => COLORS.map((color) => ({ move, color })));
  state.deck = shuffle(combinations);
  if (state.move && state.deck.at(-1)?.move === state.move.move && state.deck.at(-1)?.color === state.move.color) {
    [state.deck[0], state.deck[state.deck.length - 1]] = [state.deck.at(-1), state.deck[0]];
  }
}

function nextMove() {
  if (state.deck.length === 0) refillDeck();
  state.move = state.deck.pop();
  state.round += 1;
  state.secondsLeft = state.interval;
  renderMove();
  announceMove();
}

function renderMove() {
  const { move, color } = state.move;
  ui.instruction.innerHTML = `${move.side}<br />${move.limb}`;
  ui.colorName.textContent = color.name;
  ui.colorDot.style.background = color.hex;
  ui.colorAnswer.hidden = false;
  ui.roundLabel.textContent = `Runde ${state.round}`;
  ui.limbVisual.style.color = color.hex;
  ui.limbVisual.style.background = `${color.hex}20`;
  ui.handIcon.hidden = move.limb !== "Hand";
  ui.footIcon.hidden = move.limb !== "Fuß";
  ui.repeatButton.disabled = false;
  ui.moveCard.classList.remove("reveal");
  requestAnimationFrame(() => ui.moveCard.classList.add("reveal"));
  updateTimerText();
}

async function startGame() {
  ui.mainButton.disabled = true;
  if (state.voiceMode !== "speech" && state.audioBuffers.size > 0) {
    await unlockAudio();
  }
  state.running = true;
  state.round = 0;
  state.deck = [];
  ui.mainButtonLabel.textContent = "Spiel beenden";
  ui.mainButton.querySelector("svg").innerHTML = '<path d="M7 7h10v10H7z" />';
  ui.statusLight.classList.add("active");
  ui.statusText.textContent = "Spiel läuft";
  nextMove();
  clearInterval(state.timer);
  state.timer = setInterval(tick, 1000);
  ui.mainButton.disabled = false;
}

function stopGame() {
  state.running = false;
  clearInterval(state.timer);
  window.speechSynthesis?.cancel();
  stopActiveAudio();
  ui.mainButtonLabel.textContent = "Neues Spiel";
  ui.mainButton.querySelector("svg").innerHTML = '<path d="m8 5 11 7-11 7V5Z" />';
  ui.statusLight.classList.remove("active");
  ui.statusText.textContent = "Pausiert";
  ui.timerText.textContent = `${state.round} ${state.round === 1 ? "Runde" : "Runden"} gespielt`;
}

function tick() {
  if (!state.running) return;
  state.secondsLeft -= 1;
  updateTimerText();

  if (state.countdown && state.secondsLeft === 5) announceCountdown();
  if (state.secondsLeft <= 0) nextMove();
}

function updateTimerText() {
  if (state.running) {
    ui.timerText.textContent = `Nächster Zug in ${state.secondsLeft} Sek.`;
  } else {
    ui.timerText.textContent = `Alle ${state.interval} Sekunden`;
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  stopActiveAudio();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 0.92;
  utterance.pitch = 1;
  const germanVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("de"));
  if (germanVoice) utterance.voice = germanVoice;
  window.speechSynthesis.speak(utterance);
}

function getAudioContext() {
  if (state.audioContext && state.audioContext.state !== "closed") return state.audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    state.audioContext = new AudioContextClass();
    state.audioContext.addEventListener("statechange", () => {
      if (state.audioContext.state === "running") {
        ui.audioUnlockButton.hidden = true;
      } else if (state.running && state.voiceMode !== "speech") {
        ui.audioUnlockButton.hidden = false;
      }
    });
    return state.audioContext;
  } catch (error) {
    console.warn("Web Audio ist in diesem Browser nicht verfügbar.", error);
    return null;
  }
}

function configureAudioSession() {
  if (!("audioSession" in navigator)) return;
  try {
    navigator.audioSession.type = "playback";
  } catch {
    // Die Audio Session API ist noch nicht in allen WebKit-Versionen verfügbar.
  }
}

async function unlockAudio() {
  const context = getAudioContext();
  if (!context) return false;
  configureAudioSession();

  try {
    if (context.state !== "running") {
      const silentSource = context.createBufferSource();
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      silentSource.buffer = context.createBuffer(1, 1, context.sampleRate);
      silentSource.connect(silentGain).connect(context.destination);
      silentSource.start(0);
      await context.resume();
    }
    const unlocked = context.state === "running";
    ui.audioUnlockButton.hidden = unlocked;
    return unlocked;
  } catch (error) {
    console.warn("Audio konnte nicht freigeschaltet werden.", error);
    ui.audioUnlockButton.hidden = false;
    return false;
  }
}

function stopActiveAudio() {
  state.audioSequence += 1;
  for (const source of state.activeSources) {
    try { source.stop(); } catch { /* Quelle war bereits beendet. */ }
  }
  state.activeSources = [];
}

function playAudioSequence(names) {
  const context = getAudioContext();
  if (!context || context.state !== "running") {
    ui.audioUnlockButton.hidden = false;
    return Promise.reject(new Error("Audio ist noch nicht freigeschaltet."));
  }

  const buffers = names.map((name) => {
    const buffer = state.audioBuffers.get(name);
    if (!buffer) throw new Error(`Audio fehlt: ${name}`);
    return buffer;
  });

  stopActiveAudio();
  const sequence = state.audioSequence;
  let startAt = context.currentTime + 0.025;

  return new Promise((resolve) => {
    buffers.forEach((buffer, index) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(startAt);
      startAt += buffer.duration;
      state.activeSources.push(source);

      if (index === buffers.length - 1) {
        source.addEventListener("ended", () => {
          if (sequence === state.audioSequence) state.activeSources = [];
          resolve();
        }, { once: true });
      }
    });
  });
}

function canUseRecordedAudio(names) {
  return names.every((name) => state.audioBuffers.has(name));
}

async function announceMove() {
  const { move, color } = state.move;
  const parts = [move.fileSide, move.fileLimb, "auf", color.file];
  const shouldUseAudio = state.voiceMode === "audio" || (state.voiceMode === "auto" && canUseRecordedAudio(parts));

  if (shouldUseAudio && canUseRecordedAudio(parts)) {
    window.speechSynthesis?.cancel();
    try {
      await playAudioSequence(parts);
      return;
    } catch (error) {
      console.warn("Aufnahmen konnten nicht abgespielt werden. Browser-Stimme wird verwendet.", error);
    }
  }
  speak(`${move.side} ${move.limb} auf ${color.name}`);
}

function announceCountdown() {
  if (state.voiceMode !== "speech" && state.audioBuffers.has("noch-fuenf-sekunden")) {
    playAudioSequence(["noch-fuenf-sekunden"]).catch(() => speak("Noch fünf Sekunden"));
  } else {
    speak("Noch fünf Sekunden");
  }
}

async function findAudioFiles() {
  const context = getAudioContext();
  if (!context) return;

  const checks = UNIQUE_AUDIO_FILES.map(async (name) => {
    const source = `audio/${name}.wav?v=${APP_VERSION}`;
    try {
      const response = await fetch(source);
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && !contentType.includes("text/html")) {
        const audioData = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(audioData);
        state.audioBuffers.set(name, buffer);
      }
    } catch (error) {
      console.warn(`Audio konnte nicht geladen werden: ${source}`, error);
      // Lokale Audio-Dateien sind optional.
    }
  });
  await Promise.all(checks);
}

async function initializeAudio() {
  ui.mainButton.disabled = true;
  ui.mainButtonLabel.textContent = "Audio wird geladen …";
  ui.statusText.textContent = "Wird vorbereitet";

  try {
    await Promise.race([
      findAudioFiles(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  } catch (error) {
    console.warn("Audio-Initialisierung fehlgeschlagen. Browser-Stimme wird verwendet.", error);
  } finally {
    ui.mainButton.disabled = false;
    ui.mainButtonLabel.textContent = "Spiel starten";
    ui.statusText.textContent = "Bereit";
  }
}

function openSettings() {
  ui.intervalInput.value = state.interval;
  ui.intervalOutput.value = state.interval;
  ui.voiceMode.value = state.voiceMode;
  ui.countdownToggle.checked = state.countdown;
  ui.settingsDialog.showModal();
}

function saveSettings() {
  state.interval = Number(ui.intervalInput.value);
  state.voiceMode = ui.voiceMode.value;
  state.countdown = ui.countdownToggle.checked;
  localStorage.setItem("twister-interval", state.interval);
  localStorage.setItem("twister-voice", state.voiceMode);
  localStorage.setItem("twister-countdown", state.countdown);
  if (state.running) state.secondsLeft = state.interval;
  updateTimerText();
}

ui.mainButton.addEventListener("click", async () => (state.running ? stopGame() : startGame()));
ui.repeatButton.addEventListener("click", async () => {
  if (state.voiceMode !== "speech") await unlockAudio();
  announceMove();
});
ui.audioUnlockButton.addEventListener("click", async () => {
  const unlocked = await unlockAudio();
  if (unlocked && state.move) announceMove();
});
ui.settingsButton.addEventListener("click", openSettings);
ui.intervalInput.addEventListener("input", () => { ui.intervalOutput.value = ui.intervalInput.value; });
ui.settingsDialog.addEventListener("close", saveSettings);
ui.settingsDialog.addEventListener("click", (event) => {
  if (event.target === ui.settingsDialog) ui.settingsDialog.close();
});

function resumeAudioAfterInterruption() {
  const context = state.audioContext;
  if (!context || context.state === "running" || context.state === "closed") return;
  configureAudioSession();
  context.resume()
    .then(() => { ui.audioUnlockButton.hidden = context.state === "running"; })
    .catch(() => { ui.audioUnlockButton.hidden = false; });
}

document.addEventListener("pointerdown", resumeAudioAfterInterruption, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resumeAudioAfterInterruption();
});
window.addEventListener("pageshow", resumeAudioAfterInterruption);

window.speechSynthesis?.getVoices();
initializeAudio();
updateTimerText();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(`service-worker.js?v=${APP_VERSION}`, { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => {});
}
