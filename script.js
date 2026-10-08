
/* ==========================================
   PRODUCER360 – RITMUSKÖR V2
   ÖTFORDULÓS NAPI BEMELEGÍTÉS
   ========================================== */

// FELÜLETI ELEMEK

const bpmInput = document.getElementById("bpm");
const bpmDisplay = document.getElementById("bpm-display");
const bpmMinus = document.getElementById("bpm-minus");
const bpmPlus = document.getElementById("bpm-plus");
const bpmSlider = document.getElementById("bpm-slider");

const hand = document.getElementById("hand");
const startBtn = document.getElementById("start-btn");
const tapBtn = document.getElementById("tap-btn");
const saveBtn = document.getElementById("save-btn");

const timing = document.getElementById("timing");
const accuracy = document.getElementById("accuracy");
const scoreDisplay = document.getElementById("score");
const streakDisplay = document.getElementById("streak");
const hitsDisplay = document.getElementById("hits");
const missesDisplay = document.getElementById("misses");
const bestScoreDisplay = document.getElementById("best-score");

const soundEnabled = document.getElementById("sound-enabled");
const volumeSlider = document.getElementById("volume");
const themeToggle = document.getElementById("theme-toggle");

const roundDisplay = document.getElementById("round-display");
const beatProgress = document.getElementById("beat-progress");
const dailyScoreDisplay = document.getElementById("daily-score");
const roundSteps = document.querySelectorAll(".round-step");

// JÁTÉKSZABÁLYOK

const ROUND_RANGES = [
    [60, 75],
    [76, 90],
    [91, 110],
    [111, 130],
    [131, 150]
];

const BEATS_PER_ROUND = 8;
const HIT_WINDOW = 80;
const STORAGE_KEY = "producer360RhythmV2BestScore";

let currentRound = 0;
let bpm = 120;
let beatDuration = 60000 / bpm;

let running = false;
let challengeActive = false;
let preparingRound = false;

let startTime = 0;
let animationId = null;
let countdownTimer = null;
let sessionId = 0;

let score = 0;
let streak = 0;
let hits = 0;
let consecutiveMisses = 0;
let bestScore = 0;

let roundStartScore = 0;
let nextBeatToJudge = 1;
const beatResults = new Map();

// FORDULÓNKÉNTI EREDMÉNYEK

const roundResult = document.getElementById("round-result");
const roundPointsDisplay = document.getElementById("round-points");
const roundHitsDisplay = document.getElementById("round-hits");
const roundBestDisplay = document.getElementById("round-best");
const roundNextDisplay = document.getElementById("round-next");

let roundHits = 0;
let roundBestError = Infinity;

function hideRoundResult() {
    roundResult.hidden = true;
}

function showRoundResult(points) {
    roundPointsDisplay.textContent = points;
    roundHitsDisplay.textContent =
        `${roundHits} / ${BEATS_PER_ROUND}`;

    roundBestDisplay.textContent =
        Number.isFinite(roundBestError)
            ? `${Math.round(roundBestError)} ms`
            : "—";

    roundNextDisplay.textContent =
        currentRound < ROUND_RANGES.length - 1
            ? "Hamarosan indul a következő forduló!"
            : "A napi kihívás véget ért.";

    roundResult.hidden = false;
}

// HANGRENDSZER

let audioContext = null;
let audioTimer = null;
let audioStartTime = 0;
let nextAudioBeat = 0;

// REKORD BETÖLTÉSE

try {
    bestScore = Number(
        localStorage.getItem(STORAGE_KEY)
    ) || 0;
} catch (error) {
    console.warn("A rekord nem tölthető be.", error);
}

// BPM KEZELÉS

function setBpm(value) {
    bpm = Math.max(
        40,
        Math.min(150, Math.round(Number(value) || 120))
    );

    beatDuration = 60000 / bpm;

    bpmInput.value = bpm;
    bpmSlider.value = bpm;
    bpmDisplay.textContent = bpm;
}

function chooseRoundBpm(roundIndex) {
    const [min, max] = ROUND_RANGES[roundIndex];

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

// A NAPI KIHÍVÁSBAN A GÉP VÁLASZT TEMPÓT

bpmMinus.addEventListener("click", () => {
    if (!challengeActive) setBpm(bpm - 1);
});

bpmPlus.addEventListener("click", () => {
    if (!challengeActive) setBpm(bpm + 1);
});

bpmSlider.addEventListener("input", () => {
    if (!challengeActive) setBpm(bpmSlider.value);
});

bpmInput.addEventListener("change", () => {
    if (!challengeActive) setBpm(bpmInput.value);
});

// STATISZTIKÁK

function updateStats() {
    scoreDisplay.textContent = score;
    streakDisplay.textContent = streak;
    hitsDisplay.textContent = hits;

    missesDisplay.textContent =
        `${consecutiveMisses} / 3`;

    bestScoreDisplay.textContent = bestScore;
    dailyScoreDisplay.textContent = score;
}

function updateRoundPanel(completedBeats = 0) {
    roundDisplay.textContent =
        `${currentRound + 1} / 5. FORDULÓ`;

    beatProgress.textContent =
        `${completedBeats} / ${BEATS_PER_ROUND}`;

    roundSteps.forEach((step, index) => {
        step.classList.toggle(
            "completed",
            index < currentRound
        );

        step.classList.toggle(
            "active",
            index === currentRound
        );
    });
}

// PONTOZÁS

function evaluateTiming(error) {
    const difference = Math.abs(error);

    if (difference <= 10) return ["TÖKÉLETES!", 100];
    if (difference <= 25) return ["NAGYSZERŰ!", 75];
    if (difference <= 50) return ["JÓ!", 50];
    if (difference <= 80) return ["ELFOGADHATÓ", 20];

    return ["HIBA", 0];
}

function registerMiss() {
    consecutiveMisses++;
    streak = 0;

    if (consecutiveMisses >= 3) {
        consecutiveMisses = 0;

        timing.textContent = "SOROZAT MEGSZAKADT";
        accuracy.textContent =
            "3 kihagyott ütem. A napi pontjaid megmaradnak.";
    } else {
        timing.textContent = "KIHAGYOTT ÜTEM";
        accuracy.textContent =
            `${consecutiveMisses} / 3 hiba`;
    }
}

function judgeBeat(beatNumber) {
    const result = beatResults.get(beatNumber);

    if (result && result.points > 0) {
        score += result.points;
        hits++;
        streak++;
        consecutiveMisses = 0;
        
roundHits++;
roundBestError = Math.min(
    roundBestError,
    Math.abs(result.error)
);


        timing.textContent = result.rating;

        const direction =
            result.error < 0 ? "KORÁN" : "KÉSŐN";

        accuracy.textContent =
            `${direction}: ${Math.round(
                Math.abs(result.error)
            )} ms`;
    } else {
        registerMiss();
    }

    beatResults.delete(beatNumber);

    updateStats();
    updateRoundPanel(beatNumber);
}

function processCompletedBeats(now) {
    if (!running) return;

    const elapsed = now - startTime;

    while (
        running &&
        nextBeatToJudge <= BEATS_PER_ROUND &&
        elapsed >=
            nextBeatToJudge * beatDuration + HIT_WINDOW
    ) {
        judgeBeat(nextBeatToJudge);
        nextBeatToJudge++;

        if (nextBeatToJudge > BEATS_PER_ROUND) {
            finishRound();
            return;
        }
    }
}

// MUTATÓ

function animate() {
    if (!running) return;

    const now = performance.now();

    if (now < startTime) {
        hand.style.transform = "rotate(0deg)";
    } else {
        const elapsed = now - startTime;

        const progress =
            (elapsed % beatDuration) / beatDuration;

        hand.style.transform =
            `rotate(${progress * 360}deg)`;

        processCompletedBeats(now);
    }

    if (running) {
        animationId = requestAnimationFrame(animate);
    }
}

// SPACE / ÜTÉS

function registerHit() {
    if (!running) return;

    const elapsed = performance.now() - startTime;
    if (elapsed < 0) return;

    const beatNumber = Math.round(
        elapsed / beatDuration
    );

    if (beatNumber < 1) return;
    if (beatNumber > BEATS_PER_ROUND) return;
    if (beatNumber < nextBeatToJudge) return;
    if (beatResults.has(beatNumber)) return;

    const error =
        elapsed - beatNumber * beatDuration;

    if (Math.abs(error) > HIT_WINDOW) return;

    const [rating, points] = evaluateTiming(error);

    beatResults.set(beatNumber, {
        error,
        rating,
        points
    });

    timing.textContent = rating;

    accuracy.textContent =
        `${error < 0 ? "KORÁN" : "KÉSŐN"}: ` +
        `${Math.round(Math.abs(error))} ms`;
}

// GOMBOK

function setControls() {
    // A tempót kizárólag a gép állítja
    // a napi kihívás során.
    bpmInput.disabled = true;
    bpmSlider.disabled = true;
    bpmMinus.disabled = true;
    bpmPlus.disabled = true;

    tapBtn.disabled = !running;
    saveBtn.disabled = !challengeActive;

    startBtn.textContent =
        challengeActive ? "MEGSZAKÍTÁS" : "INDÍTÁS";
}

// METRONÓM HANG

function playClick(time) {
    if (!soundEnabled.checked || !audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";

    oscillator.frequency.setValueAtTime(1100, time);

    oscillator.frequency.exponentialRampToValueAtTime(
        650,
        time + 0.035
    );

    const volume = Number(volumeSlider.value) / 100;

    gain.gain.setValueAtTime(
        Math.max(0.0001, volume * 0.35),
        time
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        time + 0.055
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(time);
    oscillator.stop(time + 0.06);
}

function scheduleAudio() {
    if (!running || !audioContext) return;

    const now = audioContext.currentTime;
    const horizon = now + 0.1;

    while (true) {
        const beatTime =
            audioStartTime +
            nextAudioBeat * (beatDuration / 1000);

        if (beatTime > horizon) break;

        if (beatTime >= now) {
            playClick(beatTime);
        }

        nextAudioBeat++;
    }
}

async function startAudio() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    await audioContext.resume();

    if (audioContext.state !== "running") {
        throw new Error("A hangrendszer nem indult el.");
    }

    // A két időalap közös indulási pontja.
    const audioNow = audioContext.currentTime;
    const visualNow = performance.now();
    const leadTime = 0.5;

    audioStartTime = audioNow + leadTime;
    startTime = visualNow + leadTime * 1000;

    nextAudioBeat = 0;

    scheduleAudio();

    if (audioTimer !== null) {
        clearInterval(audioTimer);
    }

    audioTimer = setInterval(scheduleAudio, 25);
}

function stopAudio() {
    if (audioTimer !== null) {
        clearInterval(audioTimer);
        audioTimer = null;
    }

    // Nem függesztjük fel az AudioContextet
    // minden forduló végén: így a következő
    // indulás stabilabb marad.
}

// EGY FORDULÓ INDÍTÁSA

async function startRound() {
    if (!challengeActive) return;

    const mySession = sessionId;

    preparingRound = true;
    running = false;

    stopAudio();

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    setBpm(chooseRoundBpm(currentRound));

    nextBeatToJudge = 1;
    beatResults.clear();
    
roundHits = 0;
roundBestError = Infinity;
hideRoundResult();


    consecutiveMisses = 0;
    roundStartScore = score;

    updateStats();
    updateRoundPanel(0);

    timing.textContent = "FELKÉSZÜLÉS...";
    accuracy.textContent =
        `${currentRound + 1}. forduló – ${bpm} BPM`;

    // A hangütemezéshez már aktív állapot kell.
    running = true;
    setControls();

    let audioReady = false;

    try {
        await startAudio();
        audioReady = true;
    } catch (error) {
        console.error("Metronómhiba:", error);
        startTime = performance.now() + 500;
    }

    // Ha közben a játékos megszakította,
    // nem indítunk el régi fordulót.
    if (!challengeActive || mySession !== sessionId) {
        running = false;
        stopAudio();
        return;
    }

    preparingRound = false;

    timing.textContent = "INDULHAT!";
    accuracy.textContent = audioReady
        ? "Tartsd a ritmust!"
        : "Hang nélkül folytatódik a gyakorlás.";

    animate();
}

// FORDULÓ LEZÁRÁSA

function finishRound() {
    if (!running) return;

    running = false;
    stopAudio();

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    hand.style.transform = "rotate(0deg)";
    setControls();

    const roundPoints = score - roundStartScore;
    showRoundResult(roundPoints);

    if (currentRound === ROUND_RANGES.length - 1) {
        finishChallenge();
        return;
    }

    timing.textContent = "FORDULÓ TELJESÍTVE!";
    accuracy.textContent =
        `Fordulópont: ${roundPoints} | Napi pont: ${score}`;

    startCountdown();
}

// AUTOMATIKUS VISSZASZÁMLÁLÁS

function startCountdown() {
    let remaining = 3;
    const mySession = sessionId;

    // A következő forduló már elő van készítve
    // logikailag, de csak a visszaszámlálás
    // végén indul el.
    currentRound++;
    updateRoundPanel(0);

    function tick() {
        if (!challengeActive || mySession !== sessionId) {
            return;
        }

        if (remaining > 0) {
            timing.textContent = `KÖVETKEZŐ: ${remaining}`;

            accuracy.textContent =
                `${currentRound + 1}. forduló következik`;

            remaining--;

            countdownTimer = setTimeout(tick, 1000);
        } else {
            countdownTimer = null;
            startRound();
        }
    }

    tick();
}

// TELJES KIHÍVÁS INDÍTÁSA

function startGame() {
    if (challengeActive) return;

    sessionId++;
    challengeActive = true;
    currentRound = 0;

    score = 0;
    streak = 0;
    hits = 0;
    consecutiveMisses = 0;

    updateStats();
    updateRoundPanel(0);

    startRound();
}

// REKORD MENTÉSE

function saveRecord() {
    if (score <= bestScore) return;

    bestScore = score;

    try {
        localStorage.setItem(
            STORAGE_KEY,
            String(bestScore)
        );
    } catch (error) {
        console.warn("Nem sikerült menteni.", error);
    }

    updateStats();
}

// ÖTÖDIK FORDULÓ UTÁN

function finishChallenge() {
    challengeActive = false;
    preparingRound = false;

    saveRecord();
    setControls();

    roundSteps.forEach(step => {
        step.classList.remove("active");
        step.classList.add("completed");
    });

    timing.textContent = "NAPI KIHÍVÁS TELJESÍTVE!";
    accuracy.textContent =
        `Összpontszám: ${score} | Találatok: ${hits}`;
}

// MEGSZAKÍTÁS / MENTÉS

function stopGame(save = false) {
    if (!challengeActive) return;

    sessionId++;
    challengeActive = false;
    preparingRound = false;
    running = false;

    if (countdownTimer !== null) {
        clearTimeout(countdownTimer);
        countdownTimer = null;
    }

    stopAudio();

    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    hand.style.transform = "rotate(0deg)";

    if (save) {
        saveRecord();

        timing.textContent = "EREDMÉNY MENTVE";
        accuracy.textContent =
            `Elmentett pontszám: ${score}`;
    } else {
        timing.textContent = "JÁTÉK MEGSZAKÍTVA";
        accuracy.textContent =
            `Nem mentett pontszám: ${score}`;
    }

    setControls();
    updateStats();
}

// ESEMÉNYKEZELŐK

startBtn.addEventListener("click", () => {
    if (challengeActive) {
        stopGame(false);
    } else {
        startGame();
    }
});

saveBtn.addEventListener("click", () => {
    stopGame(true);
});

tapBtn.addEventListener("pointerdown", event => {
    event.preventDefault();
    registerHit();
});

document.addEventListener("keydown", event => {
    if (event.code !== "Space" || event.repeat) return;
    if (!running) return;

    const tag = event.target.tagName;

    if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        event.target.isContentEditable
    ) {
        return;
    }

    event.preventDefault();
    registerHit();
});

// SÖTÉT / VILÁGOS MÓD

function updateThemeButton() {
    if (!themeToggle) return;

    const isLight =
        document.body.classList.contains("light-theme");

    themeToggle.textContent = isLight
        ? "🌙 SÖTÉT MÓD"
        : "☀️ VILÁGOS MÓD";

    themeToggle.setAttribute(
        "aria-label",
        isLight
            ? "Váltás sötét témára"
            : "Váltás világos témára"
    );
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");
        updateThemeButton();
    });
}

updateThemeButton();

// KEZDŐÁLLAPOT

setBpm(120);
updateStats();
updateRoundPanel(0);
setControls();
