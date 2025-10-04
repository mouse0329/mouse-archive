// 初期マップ
let keyMapJP = [
    // 下段
    { key: "z", note: "C3", color: "白" },
    { key: "s", note: "C#3", color: "黒" },
    { key: "x", note: "D3", color: "白" },
    { key: "d", note: "D#3", color: "黒" },
    { key: "c", note: "E3", color: "白" },
    { key: "v", note: "F3", color: "白" },
    { key: "g", note: "F#3", color: "黒" },
    { key: "b", note: "G3", color: "白" },
    { key: "h", note: "G#3", color: "黒" },
    { key: "n", note: "A3", color: "白" },
    { key: "j", note: "A#3", color: "黒" },
    { key: "m", note: "B3", color: "白" },
    { key: ",", note: "C4", color: "白" },
    { key: "l", note: "C#4", color: "黒" },
    { key: ".", note: "D4", color: "白" },
    { key: ";", note: "D#4", color: "黒" },
    { key: "/", note: "E4", color: "白" },
    { key: "\\", note: "F4", color: "白" },
    { key: "]", note: "F#4", color: "黒" },

    // 上段
    { key: "q", note: "C4", color: "白" },
    { key: "2", note: "C#4", color: "黒" },
    { key: "w", note: "D4", color: "白" },
    { key: "3", note: "D#4", color: "黒" },
    { key: "e", note: "E4", color: "白" },
    { key: "r", note: "F4", color: "白" },
    { key: "5", note: "F#4", color: "黒" },
    { key: "t", note: "G4", color: "白" },
    { key: "6", note: "G#4", color: "黒" },
    { key: "y", note: "A4", color: "白" },
    { key: "7", note: "A#4", color: "黒" },
    { key: "u", note: "B4", color: "白" },
    { key: "i", note: "C5", color: "白" },
    { key: "9", note: "C#5", color: "黒" },
    { key: "o", note: "D5", color: "白" },
    { key: "0", note: "D#5", color: "黒" },
    { key: "p", note: "E5", color: "白" },
    { key: "@", note: "F5", color: "白" },
    { key: "^", note: "F#5", color: "黒" },
    { key: "[", note: "G5", color: "白" }, // ← G5
    { key: "¥", note: "G#5", color: "黒" }, // ← G#5
];


let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let activeOsc = {};
let currentOctaveOffset = 0;
let showNoteLabel = true;

// 楽器ファンクションキー設定
let waveKeyMap = {
    F1: "sine",
    F2: "piano",
    F3: "violin",
    F4: "clarinet",
    F5: "flute",
    F6: "brass",
    F7: "sax",
    F8: "guitar",
    F9: "bass",
    F10: "marimba",
    F11: "vibraphone",
    F12: "organ"
};

// 移調値
let transpose = 0;

// サステイン制御用
let sustainKeys = {};

// 音楽記号→周波数
function noteToFreq(note) {
    const notes = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
    const match = note.match(/^([A-G]#?)(\d)$/); if (!match) return null;
    const [_, n, octave] = match;
    // 移調を反映
    let midi = 12 * (parseInt(octave) + 1) + notes[n] + transpose;
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// 再生開始
function playStart(keyOrCode, instrumentOverride) {
    // keyOrCodeがkeyMapJPに存在しない場合は、直接noteとして扱う
    let mapping = keyMapJP.find(k =>
        k.key.toLowerCase() === String(keyOrCode).toLowerCase() ||
        (k.code && k.code === keyOrCode)
    );
    let note, key;
    if (mapping) {
        note = mapping.note;
        key = mapping.key;
    } else {
        // keyOrCodeが音名の場合（例: "C4"）
        note = keyOrCode;
        key = keyOrCode;
    }

    // スケール・コード制限
    if (!isNoteInScale(note) || !isNoteInChord(note)) return;

    // MIDI出力
    if (midiOutputEnabled) {
        midiNoteOn(note, 100, 0);
    }

    let freq = isNaN(note) ? noteToFreq(note) : parseFloat(note);
    if (!freq) return;

    const instrument = instrumentOverride || document.getElementById("instrument").value;
    const sustainMode = ((instrument === "piano" || instrument === "vibraphone") && sustainKeys[" "]);

    // すでに音が鳴っていた場合のリセット
    if (
        (["guitar", "bass", "vibraphone"].includes(instrument) || (instrument === "piano" && sustainMode))
        && activeOsc[key]
    ) {
        playStop(key);
    }

    freq *= Math.pow(2, currentOctaveOffset);
    if (activeOsc[key]) return; // 多重発音防止

    const keyDiv = document.querySelector(".key[data-key='" + CSS.escape(key) + "']");
    if (keyDiv) keyDiv.classList.add("active");

    let osc, osc2, osc3, osc4, osc5, gain;

    gain = audioCtx.createGain();

    const sustainDecay = sustainMode ? 4.8 : 1.2; // ピアノ
    const vibSustainDecay = sustainMode ? 2.4 : 1.2; // ビブラフォン

    // --- ギター・ベース ---
    if (["guitar", "bass"].includes(instrument)) {
        let decay = instrument === "guitar" ? 4.0 : 4.8;
        osc = audioCtx.createOscillator();
        osc.type = instrument === "guitar" ? "triangle" : "square";
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(instrument === "guitar" ? 0.18 : 0.22, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + decay);
        osc.start();
        activeOsc[key] = { osc, gain, isOneShot: true };
        // 音が消えるタイミングで鍵盤のactiveクラスも外す
        setTimeout(() => {
            delete activeOsc[key];
            const keyDiv2 = document.querySelector(".key[data-key='" + CSS.escape(key) + "']");
            if (keyDiv2) keyDiv2.classList.remove("active");
        }, decay * 1000);
    }

    // --- マリンバ（修正版） ---
    else if (instrument === "marimba") {
        let decay = 0.25;
        osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc2 = audioCtx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq * 4.0;
        osc3 = audioCtx.createOscillator();
        osc3.type = "sine";
        osc3.frequency.value = freq * 10.0;

        osc.connect(gain);
        osc2.connect(gain);
        osc3.connect(gain);
        gain.connect(audioCtx.destination);

        gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + decay);

        osc.start();
        osc2.start();
        osc3.start();

        // decay 終了後にオシレーターを停止
        const stopTime = audioCtx.currentTime + decay;
        osc.stop(stopTime);
        osc2.stop(stopTime);
        osc3.stop(stopTime);

        // activeOsc に登録
        activeOsc[key] = { osc, osc2, osc3, gain, isOneShot: true };

        // decay 終了後に activeOsc から削除＆鍵盤のactiveクラスも外す
        setTimeout(() => {
            delete activeOsc[key];
            const keyDiv2 = document.querySelector(".key[data-key='" + CSS.escape(key) + "']");
            if (keyDiv2) keyDiv2.classList.remove("active");
        }, decay * 1000);
    }

    // --- ビブラフォン ---
    else if (instrument === "vibraphone") {
        osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc2 = audioCtx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq * 2.0;

        let g1 = audioCtx.createGain();
        let g2 = audioCtx.createGain();
        g1.gain.value = 1.0;
        g2.gain.value = 0.3;

        let lfo = audioCtx.createOscillator();
        let lfoGain = audioCtx.createGain();
        lfo.frequency.value = 5.5;
        lfoGain.gain.value = 6;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        osc.connect(g1); g1.connect(gain);
        osc2.connect(g2); g2.connect(gain);
        gain.connect(audioCtx.destination);

        gain.gain.setValueAtTime(0.16, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + vibSustainDecay);

        osc.start();
        osc2.start();
        lfo.start();

        activeOsc[key] = { osc, osc2, gain, g1, g2, lfo, lfoGain, sustain: sustainMode, isVibraphone: true };
    }

    // --- 弦楽器・管楽器・オルガン・シンセ ---
    else if (["violin", "clarinet", "flute", "brass", "sax", "organ", "synth"].includes(instrument)) {
        // --- バイオリン ---
        if (instrument === "violin") {
            osc = audioCtx.createOscillator();
            osc.type = "sawtooth";
            osc.frequency.value = freq;
            let lfo = audioCtx.createOscillator();
            let lfoGain = audioCtx.createGain();
            lfo.frequency.value = 6;
            lfoGain.gain.value = 3;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
            osc.start();
            lfo.start();
            activeOsc[key] = { osc, gain, lfo, lfoGain };
        }
        // --- クラリネット ---
        else if (instrument === "clarinet") {
            osc = audioCtx.createOscillator();
            osc.type = "square";
            osc.frequency.value = freq;
            osc2 = audioCtx.createOscillator();
            osc2.type = "square";
            osc2.frequency.value = freq * 3;
            osc3 = audioCtx.createOscillator();
            osc3.type = "square";
            osc3.frequency.value = freq * 5;
            osc.connect(gain);
            osc2.connect(gain);
            osc3.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.13, audioCtx.currentTime);
            osc.start();
            osc2.start();
            osc3.start();
            activeOsc[key] = { osc, osc2, osc3, gain };
        }
        // --- フルート ---
        else if (instrument === "flute") {
            osc = audioCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = freq;
            osc.connect(gain);
            let bufferSize = 256;
            let noise = audioCtx.createScriptProcessor(bufferSize, 1, 1);
            noise.onaudioprocess = function (e) {
                let output = e.outputBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = (Math.random() * 2 - 1) * 0.03;
                }
            };
            noise.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            osc.start();
            activeOsc[key] = { osc, gain, noise };
        }
        // --- ブラス ---
        else if (instrument === "brass") {
            osc = audioCtx.createOscillator();
            osc.type = "sawtooth";
            osc.frequency.value = freq;
            osc2 = audioCtx.createOscillator();
            osc2.type = "square";
            osc2.frequency.value = freq * 2;
            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
            osc.start();
            osc2.start();
            activeOsc[key] = { osc, osc2, gain };
        }
        // --- サックス ---
        else if (instrument === "sax") {
            osc = audioCtx.createOscillator();
            osc.type = "triangle";
            osc.frequency.value = freq;
            osc2 = audioCtx.createOscillator();
            osc2.type = "square";
            osc2.frequency.value = freq * 2;
            let lfo = audioCtx.createOscillator();
            let lfoGain = audioCtx.createGain();
            lfo.frequency.value = 7;
            lfoGain.gain.value = 4;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.16, audioCtx.currentTime);
            osc.start();
            osc2.start();
            lfo.start();
            activeOsc[key] = { osc, osc2, gain, lfo, lfoGain };
        }
        // --- オルガン ---
        else if (instrument === "organ") {
            osc = audioCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = freq;
            osc2 = audioCtx.createOscillator();
            osc2.type = "sine";
            osc2.frequency.value = freq * 2;
            osc3 = audioCtx.createOscillator();
            osc3.type = "sine";
            osc3.frequency.value = freq * 4;
            osc.connect(gain);
            osc2.connect(gain);
            osc3.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
            osc.start();
            osc2.start();
            osc3.start();
            activeOsc[key] = { osc, osc2, osc3, gain };
        }
        // --- シンセ ---
        else if (instrument === "synth") {
            osc = audioCtx.createOscillator();
            osc.type = "sawtooth";
            osc.frequency.value = freq;
            osc2 = audioCtx.createOscillator();
            osc2.type = "square";
            osc2.frequency.value = freq * 2;
            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);
            gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
            osc.start();
            osc2.start();
            activeOsc[key] = { osc, osc2, gain };
        }
    }

    // --- ピアノ ---
    else if (instrument === "piano") {
        osc = audioCtx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc2 = audioCtx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = freq * 2;
        osc3 = audioCtx.createOscillator();
        osc3.type = "sine";
        osc3.frequency.value = freq * 3;

        let g1 = audioCtx.createGain();
        let g2 = audioCtx.createGain();
        let g3 = audioCtx.createGain();
        g1.gain.value = 1.0;
        g2.gain.value = 0.4;
        g3.gain.value = 0.2;

        osc.connect(g1); g1.connect(gain);
        osc2.connect(g2); g2.connect(gain);
        osc3.connect(g3); g3.connect(gain);
        gain.connect(audioCtx.destination);

        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + sustainDecay);

        osc.start();
        osc2.start();
        osc3.start();

        activeOsc[key] = { osc, osc2, osc3, gain, g1, g2, g3, sustain: sustainMode, isPiano: true };
    }

    // --- 単純波形 ---
    else if (["sine", "square", "triangle", "sawtooth"].includes(instrument)) {
        osc = audioCtx.createOscillator();
        osc.type = instrument;
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        osc.start();
        activeOsc[key] = { osc, gain };
    }
}

function playStop(keyOrCode) {
    let mapping = keyMapJP.find(k =>
        k.key.toLowerCase() === String(keyOrCode).toLowerCase() ||
        (k.code && k.code === keyOrCode)
    );
    let note, key;
    if (mapping) {
        note = mapping.note;
        key = mapping.key;
    } else {
        note = keyOrCode;
        key = keyOrCode;
    }

    // MIDI出力
    if (midiOutputEnabled) {
        midiNoteOff(note, 0);
    }

    const o = activeOsc[key];
    if (o) {
        // サステイン対応（ピアノ・ビブラフォンのみ）
        if ((o.isPiano || o.isVibraphone) && sustainKeys[" "]) {
            // ただし、再発音時は止める（playStartで処理済み）
            return;
        }
        // ワンショット系（ギター・ベース・マリンバ・ビブラフォン・ピアノのサステイン時）は自動で消えるので、ここでは即return
        if (o.isOneShot) return;
        // ピアノ・ビブラフォンは離した瞬間に音を消す
        if ((o.isPiano || o.isVibraphone) && o.gain) {
            try {
                o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
                o.gain.gain.setValueAtTime(o.gain.gain.value, audioCtx.currentTime);
                o.gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            } catch (e) { }
        } else if (o.gain) {
            try {
                o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
                o.gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            } catch (e) { }
        }
        if (o.osc) o.osc.stop(audioCtx.currentTime + 0.12);
        if (o.osc2) o.osc2.stop(audioCtx.currentTime + 0.12);
        if (o.osc3) o.osc3.stop(audioCtx.currentTime + 0.12);
        if (o.lfo) o.lfo.stop(audioCtx.currentTime + 0.12);
        if (o.noise) o.noise.disconnect();
        delete activeOsc[key];
    }
    // playStopで必ず鍵盤のactiveクラスを外す
    const keyDiv = document.querySelector(".key[data-key='" + CSS.escape(key) + "']");
    if (keyDiv) keyDiv.classList.remove("active");
}

// キーボード描画
function renderKeyboard() {
    const kb = document.getElementById("keyboard"); kb.innerHTML = "";
    // noteごとに一つだけ表示
    const shownNotes = new Set();
    keyMapJP.forEach(mapping => {
        if (shownNotes.has(mapping.note)) return;
        shownNotes.add(mapping.note);
        const div = document.createElement("div"); div.className = "key";
        if (mapping.color === "黒") div.classList.add("black");
        div.dataset.key = mapping.key;
        div.textContent = mapping.key; // 真ん中にキー文字
        if (showNoteLabel) {
            const span = document.createElement("div");
            span.style.position = "absolute";
            span.style.bottom = "-20px";   // 下端に表示
            span.style.width = "100%";
            span.style.textAlign = "center";
            span.style.fontSize = "12px";
            span.style.color = (mapping.color === "黒" ? "#fff" : "#000");
            span.textContent = mapping.note;
            div.appendChild(span);
        }

        div.addEventListener("mousedown", () => playStart(mapping.key));
        div.addEventListener("mouseup", () => playStop(mapping.key));
        div.addEventListener("mouseleave", () => playStop(mapping.key));
        div.addEventListener("touchstart", (e) => { e.preventDefault(); playStart(mapping.key); });
        div.addEventListener("touchend", (e) => { e.preventDefault(); playStop(mapping.key); });
        kb.appendChild(div);
    });
}

// 自動保存
function autoSaveMap() { localStorage.setItem("keyMapJP", JSON.stringify(keyMapJP)); }

// マッピングテーブル描画
function renderMappingTable() {
    const table = document.getElementById("mappingTable");
    table.innerHTML = "<tr><th>順番</th><th>キー</th><th>音</th><th>色</th><th>削除</th></tr>";

    keyMapJP.forEach((mapping, index) => {
        const row = table.insertRow();
        row.dataset.index = index;

        // 順番ドラッグ用
        const cellOrder = row.insertCell(); cellOrder.textContent = "☰";

        // キー入力
        const cellKey = row.insertCell();
        const inputKey = document.createElement("input");
        inputKey.value = mapping.key;
        inputKey.maxLength = 1;
        inputKey.addEventListener("input", () => { mapping.key = inputKey.value; renderKeyboard(); autoSaveMap(); });
        cellKey.appendChild(inputKey);

        // 音入力
        const cellNote = row.insertCell();
        const inputNote = document.createElement("input");
        inputNote.value = mapping.note;
        inputNote.addEventListener("input", () => { mapping.note = inputNote.value; renderKeyboard(); autoSaveMap(); });
        cellNote.appendChild(inputNote);

        // 色選択
        const cellColor = row.insertCell();
        const selectColor = document.createElement("select");
        ["白", "黒"].forEach(c => {
            const opt = document.createElement("option");
            opt.value = c; opt.textContent = c;
            if (c === mapping.color) opt.selected = true;
            selectColor.appendChild(opt);
        });
        selectColor.addEventListener("change", () => { mapping.color = selectColor.value; renderKeyboard(); autoSaveMap(); });
        cellColor.appendChild(selectColor);

        // 🔹削除ボタン追加
        const cellDelete = row.insertCell();
        const delBtn = document.createElement("button");
        delBtn.textContent = "削除";
        delBtn.style.background = "#fff";
        delBtn.style.color = "#222";
        delBtn.style.border = "1px solid #ccc";
        delBtn.style.borderRadius = "4px";
        delBtn.style.cursor = "pointer";
        delBtn.addEventListener("click", () => {
            keyMapJP.splice(index, 1);
            renderMappingTable();
            renderKeyboard();
            autoSaveMap();
        });
        cellDelete.appendChild(delBtn);
    });
}


// 新規マッピング
document.getElementById("addMapping").addEventListener("click", () => {
    const key = prompt("追加するキーを入力してチュー:"); if (!key) return;
    const note = prompt("割り当てる音(C4など)を入力してチュー:"); if (!note) return;
    keyMapJP.push({ key, note, color: "白" }); renderMappingTable(); renderKeyboard(); autoSaveMap();
});

// モーダル操作
const modal = document.getElementById("modal");
document.getElementById("openModal").addEventListener("click", () => { modal.style.display = "flex"; });
document.querySelector(".modal-close").addEventListener("click", () => { modal.style.display = "none"; });
window.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });


// タッチ・キー操作
document.addEventListener("keydown", e => {
    // 楽器ファンクションキー
    if (e.key.match(/^F\d+$/)) {
        if (waveKeyMap[e.key]) {
            document.getElementById("instrument").value = waveKeyMap[e.key];
        }
        e.preventDefault();
        return;
    }
    if (e.key === "ArrowUp") {
        currentOctaveOffset++;
        if (currentOctaveOffset > 4) currentOctaveOffset = 4;
        updateOctaveDisplay();
        return;
    }
    if (e.key === "ArrowDown") {
        currentOctaveOffset--;
        if (currentOctaveOffset < -4) currentOctaveOffset = -4;
        updateOctaveDisplay();
        return;
    }
    if (e.key === "ArrowRight") {
        transpose++;
        if (transpose > 24) transpose = 24;
        updateTransposeDisplay();
        return;
    }
    if (e.key === "ArrowLeft") {
        transpose--;
        if (transpose < -24) transpose = -24;
        updateTransposeDisplay();
        return;
    }
    if (e.key === " ") {
        if (!sustainKeys[" "]) {
            sustainKeys[" "] = true;
            // サステイン中に押されているピアノ/ビブラフォン音の減衰を止める
            Object.values(activeOsc).forEach(o => {
                if ((o.isPiano || o.isVibraphone) && o.gain) {
                    try {
                        o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
                        o.gain.gain.setValueAtTime(o.gain.gain.value, audioCtx.currentTime);
                        // スペースキーで減衰時間を伸ばす
                        o.gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 4.8);
                    } catch (e) { }
                }
            });
        }
        e.preventDefault();
        return;
    }
    playStart(e.key);
    playStart(e.code);
});

document.addEventListener("keyup", e => {
    if (e.key === " ") {
        sustainKeys[" "] = false;
        // サステイン解除時にピアノ/ビブラフォン音を減衰させる
        Object.entries(activeOsc).forEach(([k, o]) => {
            if ((o.isPiano || o.isVibraphone) && o.gain) {
                try {
                    o.gain.gain.cancelScheduledValues(audioCtx.currentTime);
                    o.gain.gain.setValueAtTime(o.gain.gain.value, audioCtx.currentTime);
                    o.gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
                } catch (e) { }
                setTimeout(() => playStop(k), 120);
            }
        });
        return;
    }
    playStop(e.key);
    playStop(e.code);
});

// 音符ラベル表示切替
document.getElementById("showNoteLabel").addEventListener("change", (e) => {
    showNoteLabel = e.target.checked; renderKeyboard();
});

// オクターブ表示更新
function updateOctaveDisplay() {
    document.getElementById("octaveInput").value = currentOctaveOffset;
}
// 移調表示更新
function updateTransposeDisplay() {
    document.getElementById("transposeInput").value = transpose;
}

// オクターブ入力欄のイベント
document.addEventListener("DOMContentLoaded", () => {
    const octaveInput = document.getElementById("octaveInput");
    octaveInput.addEventListener("input", () => {
        let v = parseInt(octaveInput.value, 10);
        if (isNaN(v)) v = 0;
        if (v > 4) v = 4;
        if (v < -4) v = -4;
        currentOctaveOffset = v;
        updateOctaveDisplay();
    });
    // 移調入力欄のイベント
    const transposeInput = document.getElementById("transposeInput");
    transposeInput.addEventListener("input", () => {
        let v = parseInt(transposeInput.value, 10);
        if (isNaN(v)) v = 0;
        if (v > 24) v = 24;
        if (v < -24) v = -24;
        transpose = v;
        updateTransposeDisplay();
    });
});

// --- Sortable.jsでタッチ対応ドラッグ順序 ---
new Sortable(document.getElementById('mappingTable'), {
    animation: 150,
    handle: 'td:first-child',
    onEnd: function (evt) {
        const rows = document.querySelectorAll("#mappingTable tr");
        const newMap = [];
        rows.forEach((row, i) => {
            if (i === 0) return;
            const key = row.querySelector('input').value;
            const note = row.querySelectorAll('input')[1].value;
            const color = row.querySelector('select').value;
            newMap.push({ key, note, color });
        });
        keyMapJP = newMap; autoSaveMap(); renderKeyboard();
    }
});

// --- ページ読み込み時自動読み込み ---
window.addEventListener("load", () => {
    const loaded = localStorage.getItem("keyMapJP");
    if (loaded) {
        keyMapJP = JSON.parse(loaded); renderMappingTable
            (); renderKeyboard();
    }
    updateOctaveDisplay();
    updateTransposeDisplay();
    renderWaveKeyTable();
    showWelcomeModalIfNeeded();
});

// 初期描画
renderKeyboard(); renderMappingTable();
updateOctaveDisplay();
updateTransposeDisplay();
renderWaveKeyTable();

// --- 楽器ファンクションキー設定UI ---
function renderWaveKeyTable() {
    const table = document.getElementById("waveKeyTable");
    table.innerHTML = "<tr><th>ファンクションキー</th><th>楽器</th></tr>";
    Object.keys(waveKeyMap).forEach(fkey => {
        const row = table.insertRow();
        const cellKey = row.insertCell();
        cellKey.textContent = fkey;
        const cellWave = row.insertCell();
        const select = document.createElement("select");
        [
            { value: "sine", label: "サイン波" },
            { value: "piano", label: "ピアノ" },
            { value: "violin", label: "バイオリン" },
            { value: "clarinet", label: "クラリネット" },
            { value: "flute", label: "フルート" },
            { value: "brass", label: "ブラス" },
            { value: "sax", label: "サックス" },
            { value: "guitar", label: "ギター" },
            { value: "bass", label: "ベース" },
            { value: "marimba", label: "マリンバ" },
            { value: "vibraphone", label: "ビブラフォン" },
            { value: "organ", label: "オルガン" },
            { value: "synth", label: "シンセ" },
            { value: "square", label: "矩形波" },
            { value: "triangle", label: "三角波" },
            { value: "sawtooth", label: "ノコギリ波" }
        ].forEach(obj => {
            const opt = document.createElement("option");
            opt.value = obj.value;
            opt.textContent = obj.label;
            if (waveKeyMap[fkey] === obj.value) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener("change", () => {
            waveKeyMap[fkey] = select.value;
        });
        cellWave.appendChild(select);
    });
}

// 楽器キー設定モーダルを開くイベントを追加
document.getElementById("openWaveKeyModal").addEventListener("click", () => {
    renderWaveKeyTable();
    document.getElementById("waveKeyModal").style.display = "flex";
});

document.querySelector(".wavekey-modal-close").addEventListener("click", () => {
    document.getElementById("waveKeyModal").style.display = "none";
});
window.addEventListener("click", e => {
    if (e.target === document.getElementById("waveKeyModal")) document.getElementById("waveKeyModal").style.display = "none";
});

document.getElementById("resetWaveKeyMap").addEventListener("click", () => {
    waveKeyMap = {
        F1: "sine",
        F2: "square",
        F3: "triangle",
        F4: "sawtooth",
        F5: "piano",
        F6: "violin",
        F7: "clarinet",
        F8: "flute",
        F9: "brass",
        F10: "sax",
        F11: "guitar",
        F12: "bass"
    };
    renderWaveKeyTable();
});

document.getElementById("clearLocalStorage").addEventListener("click", () => {
    if (confirm("ローカルストレージを削除して初期状態に戻します。よろしいですか？")) {
        localStorage.removeItem("keyMapJP");
        localStorage.removeItem("instrumentParams"); // 楽器パラメータも消す
        // 必要なら他の設定も初期化
        location.reload();
    }
});

// --- ようこそモーダル ---
function showWelcomeModalIfNeeded() {
    if (!localStorage.getItem("welcomeModalClosed")) {
        document.getElementById("welcomeModal").style.display = "flex";
    }
}
document.getElementById("welcomeOk").addEventListener("click", () => {
    document.getElementById("welcomeModal").style.display = "none";
    localStorage.setItem("welcomeModalClosed", "1");
});
document.getElementById("welcomeClose").addEventListener("click", () => {
    document.getElementById("welcomeModal").style.display = "none";
    localStorage.setItem("welcomeModalClosed", "1");
});
window.addEventListener("click", e => {
    if (e.target === document.getElementById("welcomeModal")) {
        document.getElementById("welcomeModal").style.display = "none";
        localStorage.setItem("welcomeModalClosed", "1");
    }
});

// 楽器ごとの音色パラメータ
const instrumentParams = {
    piano: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.4 },
            { ratio: 3, gain: 0.2 }
        ],
        envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 0.1 }
    },
    violin: {
        type: "sawtooth",
        vibrato: { freq: 6, depth: 3 },
        envelope: { attack: 0.05, decay: 0.2, sustain: 1, release: 0.2 }
    },
    clarinet: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 3, gain: 0.5 },
            { ratio: 5, gain: 0.3 }
        ],
        type: "square",
        envelope: { attack: 0.05, decay: 0.3, sustain: 1, release: 0.2 }
    },
    flute: {
        type: "sine",
        noise: 0.03,
        envelope: { attack: 0.03, decay: 0.2, sustain: 1, release: 0.2 }
    },
    brass: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.5 }
        ],
        type: "sawtooth",
        envelope: { attack: 0.03, decay: 0.3, sustain: 1, release: 0.2 }
    },
    sax: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.5 }
        ],
        type: "triangle",
        vibrato: { freq: 7, depth: 4 },
        envelope: { attack: 0.03, decay: 0.3, sustain: 1, release: 0.2 }
    },
    guitar: {
        type: "triangle",
        envelope: { attack: 0.01, decay: 1.0, sustain: 0, release: 0.1 }
    },
    bass: {
        type: "square",
        envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 0.1 }
    },
    marimba: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 4, gain: 0.5 },
            { ratio: 10, gain: 0.2 }
        ],
        type: "sine",
        envelope: { attack: 0.01, decay: 0.5, sustain: 0, release: 0.1 }
    },
    vibraphone: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.3 }
        ],
        type: "sine",
        vibrato: { freq: 5.5, depth: 6 },
        envelope: { attack: 0.01, decay: 1.2, sustain: 0, release: 0.1 }
    },
    organ: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.5 },
            { ratio: 4, gain: 0.3 }
        ],
        type: "sine",
        envelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.2 }
    },
    synth: {
        harmonics: [
            { ratio: 1, gain: 1.0 },
            { ratio: 2, gain: 0.5 }
        ],
        type: "sawtooth",
        envelope: { attack: 0.01, decay: 0.8, sustain: 1, release: 0.2 }
    }
};

// --- 楽器パラメータ保存・復元 ---
function saveInstrumentParams() {
    localStorage.setItem("instrumentParams", JSON.stringify(instrumentParams));
}
function loadInstrumentParams() {
    const data = localStorage.getItem("instrumentParams");
    if (data) {
        try {
            const obj = JSON.parse(data);
            // 既存のinstrumentParamsにマージ
            for (const k in obj) {
                if (instrumentParams[k]) {
                    Object.assign(instrumentParams[k], obj[k]);
                } else {
                    instrumentParams[k] = obj[k];
                }
            }
        } catch (e) { }
    }
}
// 起動時に復元
loadInstrumentParams();

// --- 楽器パラメータ編集UI ---
document.getElementById("editInstrumentParam").addEventListener("click", () => {
    const inst = document.getElementById("instrument").value;
    showInstrumentParamModal(inst);
});

function showInstrumentParamModal(inst) {
    const modal = document.getElementById("instrumentParamModal");
    const form = document.getElementById("instrumentParamForm");
    const param = instrumentParams[inst];
    if (!param) {
        form.innerHTML = "<div>この楽器は編集できません。</div>";
    } else {
        let html = "";
        // envelope
        if (param.envelope) {
            html += "<h4>エンベロープ</h4>";
            for (const key of ["attack", "decay", "sustain", "release"]) {
                html += `<label>${key}: <input type="number" step="0.01" min="0" id="env_${key}" value="${param.envelope[key] ?? 0}" style="width:60px"></label><br>`;
            }
        }
        // harmonics
        if (param.harmonics) {
            html += "<h4>倍音</h4>";
            param.harmonics.forEach((h, i) => {
                html += `比率: <input type="number" step="0.1" min="0" id="harm_ratio_${i}" value="${h.ratio}" style="width:50px"> `;
                html += `ゲイン: <input type="number" step="0.01" min="0" max="1" id="harm_gain_${i}" value="${h.gain}" style="width:50px"> `;
                html += `<button type="button" onclick="removeHarmonic(${i})">削除</button><br>`;
            });
            html += `<button type="button" onclick="addHarmonic()">倍音追加</button><br>`;
        }
        // vibrato
        if (param.vibrato) {
            html += "<h4>ビブラート</h4>";
            html += `freq: <input type="number" step="0.1" min="0" id="vib_freq" value="${param.vibrato.freq}" style="width:60px"> `;
            html += `depth: <input type="number" step="0.1" min="0" id="vib_depth" value="${param.vibrato.depth}" style="width:60px"><br>`;
        }
        // type
        if (param.type) {
            html += `<h4>波形</h4><input type="text" id="osc_type" value="${param.type}" style="width:100px"><br>`;
        }
        // noise
        if (typeof param.noise === "number") {
            html += `<h4>ノイズ</h4><input type="number" step="0.01" min="0" max="1" id="osc_noise" value="${param.noise}" style="width:60px"><br>`;
        }
        form.innerHTML = html;
    }
    modal.style.display = "flex";
    // 倍音追加・削除用
    window.addHarmonic = function () {
        param.harmonics = param.harmonics || [];
        param.harmonics.push({ ratio: 1, gain: 0.1 });
        showInstrumentParamModal(inst);
    };
    window.removeHarmonic = function (idx) {
        param.harmonics.splice(idx, 1);
        showInstrumentParamModal(inst);
    };
}

document.getElementById("instrumentParamClose").onclick = () => {
    document.getElementById("instrumentParamModal").style.display = "none";
};
document.getElementById("instrumentParamSave").onclick = () => {
    const inst = document.getElementById("instrument").value;
    const param = instrumentParams[inst];
    if (!param) return;
    // envelope
    if (param.envelope) {
        for (const key of ["attack", "decay", "sustain", "release"]) {
            const v = parseFloat(document.getElementById("env_" + key).value);
            param.envelope[key] = isNaN(v) ? 0 : v;
        }
    }
    // harmonics
    if (param.harmonics) {
        for (let i = 0; i < param.harmonics.length; i++) {
            const ratio = parseFloat(document.getElementById("harm_ratio_" + i).value);
            const gain = parseFloat(document.getElementById("harm_gain_" + i).value);
            param.harmonics[i].ratio = isNaN(ratio) ? 1 : ratio;
            param.harmonics[i].gain = isNaN(gain) ? 0 : gain;
        }
    }
    // vibrato
    if (param.vibrato) {
        const freq = parseFloat(document.getElementById("vib_freq").value);
        const depth = parseFloat(document.getElementById("vib_depth").value);
        param.vibrato.freq = isNaN(freq) ? 0 : freq;
        param.vibrato.depth = isNaN(depth) ? 0 : depth;
    }
    // type
    if (param.type) {
        param.type = document.getElementById("osc_type").value;
    }
    // noise
    if (typeof param.noise === "number") {
        const n = parseFloat(document.getElementById("osc_noise").value);
        param.noise = isNaN(n) ? 0 : n;
    }
    document.getElementById("instrumentParamModal").style.display = "none";
    saveInstrumentParams();
};
window.addEventListener("click", e => {
    if (e.target === document.getElementById("instrumentParamModal")) {
        document.getElementById("instrumentParamModal").style.display = "none";
    }
});

// --- MIDI出力機能 ---
let midiAccess = null;
let midiOutput = null;
let midiOutputEnabled = false;

// MIDIノート番号変換
function noteToMidiNumber(note) {
    const notes = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
    const match = note.match(/^([A-G]#?)(\d)$/);
    if (!match) return null;
    const [_, n, octave] = match;
    let midi = 12 * (parseInt(octave) + 1) + notes[n] + transpose;
    midi += currentOctaveOffset * 12;
    return midi;
}

// MIDI初期化
function initMIDI() {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(access => {
        midiAccess = access;
        // 最初の出力ポートを選択
        const outputs = Array.from(midiAccess.outputs.values());
        if (outputs.length > 0) midiOutput = outputs[0];
    });
}
initMIDI();

// MIDIノートON
function midiNoteOn(note, velocity = 100, channel = 0) {
    if (!midiOutputEnabled || !midiOutput) return;
    const midiNum = noteToMidiNumber(note);
    if (midiNum == null) return;
    midiOutput.send([0x90 + channel, midiNum, velocity]);
}

// MIDIノートOFF
function midiNoteOff(note, channel = 0) {
    if (!midiOutputEnabled || !midiOutput) return;
    const midiNum = noteToMidiNumber(note);
    if (midiNum == null) return;
    midiOutput.send([0x80 + channel, midiNum, 0]);
}

// MIDI出力ON/OFF UIイベント
const midiEnableElem = document.getElementById("midiOutputEnable");
if (midiEnableElem) {
    midiEnableElem.addEventListener("change", e => {
        midiOutputEnabled = e.target.checked;
    });
    midiOutputEnabled = midiEnableElem.checked;
}

// メトロノーム機能 強化
let metronomeIntervalId = null;
let metronomeIsOn = false;
let metronomeTempo = 120;
let metronomeBeats = 4;
let metronomeBeatCount = 0;
let metronomeVolume = 22; // 0～100

// メトロノームクリック音（強拍・弱拍）
function playMetronomeClick(isAccent) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = isAccent ? "triangle" : "square";
    osc.frequency.value = isAccent ? 1800 : 1200;
    // 音量をスライダー値で調整（0～100 → 0.0～1.0）
    const baseVol = metronomeVolume / 100;
    gain.gain.value = isAccent ? baseVol * 1.7 : baseVol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + (isAccent ? 0.13 : 0.08));
    osc.stop(audioCtx.currentTime + (isAccent ? 0.13 : 0.08));
    setTimeout(() => {
        gain.disconnect();
    }, 150);
}

// メトロノーム視覚表示（ランプ描画・点灯）
function renderMetronomeVisual() {
    const container = document.getElementById("metronomeVisual");
    container.innerHTML = "";
    const lamps = document.createElement("div");
    lamps.className = "metronome-lamps";
    for (let i = 0; i < metronomeBeats; i++) {
        const lamp = document.createElement("div");
        lamp.className = "metronome-lamp";
        lamp.id = "metronomeLamp" + i;
        lamps.appendChild(lamp);
    }
    container.appendChild(lamps);
}

// 拍子変更時にランプ再描画
document.getElementById("metronomeBeats").addEventListener("input", () => {
    renderMetronomeVisual();
});

// ページ初期表示時
window.addEventListener("DOMContentLoaded", () => {
    renderMetronomeVisual();
});

// メトロノームランプ点灯
function updateMetronomeLamps(currentBeat) {
    for (let i = 0; i < metronomeBeats; i++) {
        const lamp = document.getElementById("metronomeLamp" + i);
        if (!lamp) continue;
        lamp.classList.remove("active", "accent");
        if (i === currentBeat) {
            lamp.classList.add(i === 0 ? "accent" : "active");
        }
    }
}

// メトロノーム開始
function startMetronome() {
    if (metronomeIntervalId) clearInterval(metronomeIntervalId);
    metronomeBeatCount = 0;
    renderMetronomeVisual();
    updateMetronomeLamps(0);
    const interval = 60000 / metronomeTempo;
    metronomeIntervalId = setInterval(() => {
        playMetronomeClick(metronomeBeatCount % metronomeBeats === 0);
        updateMetronomeLamps(metronomeBeatCount % metronomeBeats);
        metronomeBeatCount = (metronomeBeatCount + 1) % metronomeBeats;
    }, interval);
    metronomeIsOn = true;
    document.getElementById("metronomeToggle").textContent = "OFF";
}

// メトロノーム停止
function stopMetronome() {
    if (metronomeIntervalId) clearInterval(metronomeIntervalId);
    metronomeIntervalId = null;
    metronomeIsOn = false;
    document.getElementById("metronomeToggle").textContent = "ON";
    // ランプ消灯
    for (let i = 0; i < metronomeBeats; i++) {
        const lamp = document.getElementById("metronomeLamp" + i);
        if (lamp) lamp.classList.remove("active", "accent");
    }
}

// メトロノームON/OFFボタン
document.getElementById("metronomeToggle").addEventListener("click", () => {
    if (metronomeIsOn) {
        stopMetronome();
    } else {
        startMetronome();
    }
});

// テンポ入力欄
document.getElementById("metronomeTempo").addEventListener("input", (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v)) v = 120;
    if (v < 30) v = 30;
    if (v > 300) v = 300;
    metronomeTempo = v;
    e.target.value = v;
    if (metronomeIsOn) {
        startMetronome();
    }
});

// 拍子入力欄
document.getElementById("metronomeBeats").addEventListener("input", (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v)) v = 4;
    if (v < 1) v = 1;
    if (v > 12) v = 12;
    metronomeBeats = v;
    e.target.value = v;
    renderMetronomeVisual();
    if (metronomeIsOn) {
        startMetronome();
    }
});

// メトロノーム音量スライダー
document.getElementById("metronomeVolume").addEventListener("input", (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v)) v = 22;
    if (v < 0) v = 0;
    if (v > 100) v = 100;
    metronomeVolume = v;
    document.getElementById("metronomeVolumeLabel").textContent = `音量(${v})`;
});

// システム機能ボタンの開閉
const systemBtnsToggle = document.getElementById("systemBtnsToggle");
const systemBtnsWrapper = document.getElementById("systemBtnsWrapper");
let systemBtnsOpen = false;
systemBtnsToggle.addEventListener("click", () => {
    systemBtnsOpen = !systemBtnsOpen;
    systemBtnsWrapper.style.display = systemBtnsOpen ? "inline-block" : "none";
    systemBtnsToggle.textContent = systemBtnsOpen ? "▲ システム機能" : "▼ システム機能";
});

// --- 録音・再生・ループ・オーバーダビング機能 ---
let recording = false;
let recordStartTime = 0;
let recordedEvents = [];
let playbackTimeouts = [];
let isPlaying = false;
let isLooping = false;
let overdubMode = false;

// UIボタン追加（HTML側にボタンを追加している前提。なければdocument.createElementで追加可）
const recBtn = document.getElementById("recordBtn");
const playBtn = document.getElementById("playBtn");
const loopBtn = document.getElementById("loopBtn");
const overdubBtn = document.getElementById("overdubBtn");
const stopBtn = document.getElementById("stopBtn");

// 録音開始
function startRecording() {
    recording = true;
    recordStartTime = performance.now();
    if (!overdubMode) recordedEvents = [];
    recBtn.textContent = "録音中...";
    playBtn.disabled = true;
    loopBtn.disabled = true;
    overdubBtn.disabled = true;
    stopBtn.disabled = false;
}

// 録音停止
function stopRecording() {
    recording = false;
    overdubBtn.disabled = false;
    stopBtn.disabled = true;
}

// 再生
function playRecording(loop = false) {
    if (recordedEvents.length === 0) return;
    isPlaying = true;
    isLooping = loop;
    playBtn.disabled = true;
    recBtn.disabled = true;
    loopBtn.disabled = true;
    overdubBtn.disabled = true;
    stopBtn.disabled = false;
    const startTime = performance.now();
    playbackTimeouts = [];
    recordedEvents.forEach(ev => {
        const t = ev.time;
        const timeoutId = setTimeout(() => {
            if (ev.type === "on") playStart(ev.key);
            else playStop(ev.key);
        }, t);
        playbackTimeouts.push(timeoutId);
    });
    // ループ再生
    if (loop) {
        const totalTime = recordedEvents.length > 0 ? recordedEvents[recordedEvents.length - 1].time : 0;
        const loopTimeout = setTimeout(() => {
            stopPlayback();
            playRecording(true);
        }, totalTime + 100);
        playbackTimeouts.push(loopTimeout);
    } else {
        // 再生終了後にボタン状態復帰
        const totalTime = recordedEvents.length > 0 ? recordedEvents[recordedEvents.length - 1].time : 0;
        const endTimeout = setTimeout(() => {
            stopPlayback();
        }, totalTime + 100);
        playbackTimeouts.push(endTimeout);
    }
}

// 停止
function stopPlayback() {
    playbackTimeouts.forEach(id => clearTimeout(id));
    playbackTimeouts = [];
    isPlaying = false;
    isLooping = false;
    playBtn.disabled = false;
    recBtn.disabled = false;
    loopBtn.disabled = false;
    overdubBtn.disabled = false;
    stopBtn.disabled = true;
}

// オーバーダビング
function startOverdub() {
    overdubMode = true;
    startRecording();
}

// イベント記録
function recordEvent(type, key) {
    if (!recording) return;
    const time = performance.now() - recordStartTime;
    recordedEvents.push({ type, key, time });
}

// --- playStart/playStopを楽器指定可能に拡張
// 録音イベントは楽器指定不要なのでそのまま
const origPlayStart = playStart;
playStart = function (keyOrCode, instrumentOverride) {
    recordEvent("on", keyOrCode);
    origPlayStart(keyOrCode, instrumentOverride);
};
const origPlayStop = playStop;
playStop = function (keyOrCode) {
    recordEvent("off", keyOrCode);
    origPlayStop(keyOrCode);
};

// --- ステップシーケンサー機能 ---
let sequencerSteps = 16;
let sequencerChannels = 4;
let sequencerData = []; // [channel][step] = {note, enabled}
let sequencerPlaying = false;
let sequencerStepIdx = 0;
let sequencerIntervalId = null;
let sequencerTempo = 120; // シーケンサー用テンポ（初期値）

// 音階候補（必要に応じて拡張可）
const sequencerNotes = [
    "C3", "D3", "E3", "F3", "G3", "A3", "B3",
    "C4", "D4", "E4", "F4", "G4", "A4", "B4",
    "C5", "D5", "E5", "F5", "G5", "A5", "B5"
];

// 楽器候補
const sequencerInstruments = [
    "piano", "violin", "clarinet", "flute", "brass", "sax", "guitar", "bass", "marimba", "vibraphone", "organ", "synth"
];

// 初期化
function initSequencerData() {
    sequencerData = [];
    for (let ch = 0; ch < sequencerChannels; ch++) {
        const channel = [];
        for (let st = 0; st < sequencerSteps; st++) {
            channel.push({ note: sequencerNotes[ch % sequencerNotes.length], enabled: false, instrument: sequencerInstruments[ch % sequencerInstruments.length] });
        }
        sequencerData.push(channel);
    }
}

// データリサイズ
function resizeSequencerData(newChannels, newSteps) {
    const newData = [];
    for (let ch = 0; ch < newChannels; ch++) {
        const channel = [];
        for (let st = 0; st < newSteps; st++) {
            // 既存データがあればコピー、なければ初期値
            if (sequencerData[ch] && sequencerData[ch][st]) {
                channel.push({ ...sequencerData[ch][st] });
            } else {
                channel.push({
                    note: sequencerNotes[ch % sequencerNotes.length],
                    enabled: false,
                    instrument: sequencerInstruments[ch % sequencerInstruments.length]
                });
            }
        }
        newData.push(channel);
    }
    sequencerData = newData;
}

// UI描画
function renderSequencerGrid() {
    const grid = document.getElementById("sequencerGrid");
    grid.innerHTML = "";
    const table = document.createElement("table");
    table.className = "sequencer-table";
    table.style.borderCollapse = "collapse";
    // ヘッダー
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    trh.appendChild(document.createElement("th")); // チャンネル名
    for (let st = 0; st < sequencerSteps; st++) {
        const th = document.createElement("th");
        th.textContent = st + 1;
        th.style.width = "32px";
        trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);
    // 本体
    const tbody = document.createElement("tbody");
    for (let ch = 0; ch < sequencerChannels; ch++) {
        const tr = document.createElement("tr");
        // チャンネル名・楽器・音階選択
        const tdCh = document.createElement("td");
        tdCh.style.minWidth = "120px";
        // 楽器選択
        const instSel = document.createElement("select");
        sequencerInstruments.forEach(inst => {
            const opt = document.createElement("option");
            opt.value = inst;
            opt.textContent = inst;
            if (sequencerData[ch][0].instrument === inst) opt.selected = true;
            instSel.appendChild(opt);
        });
        instSel.addEventListener("change", () => {
            for (let st = 0; st < sequencerSteps; st++) {
                sequencerData[ch][st].instrument = instSel.value;
            }
        });
        tdCh.appendChild(instSel);
        // 音階選択
        const noteSel = document.createElement("select");
        sequencerNotes.forEach(note => {
            const opt = document.createElement("option");
            opt.value = note;
            opt.textContent = note;
            if (sequencerData[ch][0].note === note) opt.selected = true;
            noteSel.appendChild(opt);
        });
        noteSel.addEventListener("change", () => {
            for (let st = 0; st < sequencerSteps; st++) {
                sequencerData[ch][st].note = noteSel.value;
            }
        });
        tdCh.appendChild(noteSel);
        tr.appendChild(tdCh);
        // ステップ
        for (let st = 0; st < sequencerSteps; st++) {
            const td = document.createElement("td");
            td.style.textAlign = "center";
            td.style.border = "1px solid #ccc";
            td.style.background = sequencerData[ch][st].enabled ? "#4caf50" : "#fff";
            td.style.cursor = "pointer";
            td.onclick = () => {
                sequencerData[ch][st].enabled = !sequencerData[ch][st].enabled;
                renderSequencerGrid();
            };
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    grid.appendChild(table);
}

// 再生
function playSequencer() {
    if (sequencerPlaying) return;
    sequencerPlaying = true;
    sequencerStepIdx = 0;
    document.getElementById("sequencerPlayBtn").disabled = true;
    document.getElementById("sequencerStopBtn").disabled = false;
    const interval = 60000 / sequencerTempo; // ここを変更
    sequencerIntervalId = setInterval(() => {
        // 各チャンネルのこのステップを鳴らす
        for (let ch = 0; ch < sequencerChannels; ch++) {
            const step = sequencerData[ch][sequencerStepIdx];
            if (step.enabled) {
                // 楽器名を直接渡して鳴らす
                playStart(step.note, step.instrument);
                setTimeout(() => {
                    playStop(step.note);
                }, interval * 0.7); // 少し短めに止める
            }
        }
        // ステップインジケータ（セル背景色変更）
        highlightSequencerStep(sequencerStepIdx);
        sequencerStepIdx = (sequencerStepIdx + 1) % sequencerSteps;
    }, interval);
}

// 停止
function stopSequencer() {
    if (sequencerIntervalId) clearInterval(sequencerIntervalId);
    sequencerIntervalId = null;
    sequencerPlaying = false;
    document.getElementById("sequencerPlayBtn").disabled = false;
    document.getElementById("sequencerStopBtn").disabled = true;
    highlightSequencerStep(-1);
}

// ステップインジケータ
function highlightSequencerStep(idx) {
    const grid = document.getElementById("sequencerGrid");
    const table = grid.querySelector("table");
    if (!table) return;
    for (let ch = 0; ch < sequencerChannels; ch++) {
        for (let st = 0; st < sequencerSteps; st++) {
            const td = table.rows[ch + 1]?.cells[st + 1];
            if (td) {
                if (st === idx) {
                    td.style.background = sequencerData[ch][st].enabled ? "#ff9800" : "#ffe0b2";
                } else {
                    td.style.background = sequencerData[ch][st].enabled ? "#4caf50" : "#fff";
                }
            }
        }
    }
}

// UIイベント
document.addEventListener("DOMContentLoaded", () => {
    // 初期化
    initSequencerData();
    renderSequencerGrid();
    // 再生
    const playBtn = document.getElementById("sequencerPlayBtn");
    const stopBtn = document.getElementById("sequencerStopBtn");
    if (playBtn) playBtn.onclick = playSequencer;
    if (stopBtn) stopBtn.onclick = stopSequencer;
    // ステップ数変更
    const stepsInput = document.getElementById("sequencerStepsInput");
    if (stepsInput) stepsInput.onchange = () => {
        let v = parseInt(stepsInput.value, 10);
        if (isNaN(v) || v < 4) v = 4;
        if (v > 64) v = 64;
        // 既存データを保持しつつリサイズ
        resizeSequencerData(sequencerChannels, v);
        sequencerSteps = v;
        renderSequencerGrid();
    };
    const channelsInput = document.getElementById("sequencerChannelsInput");
    if (channelsInput) channelsInput.onchange = () => {
        let v = parseInt(channelsInput.value, 10);
        if (isNaN(v) || v < 1) v = 1;
        if (v > 8) v = 8;
        // 既存データを保持しつつリサイズ
        resizeSequencerData(v, sequencerSteps);
        sequencerChannels = v;
        renderSequencerGrid();
    };
    // シーケンサー用テンポ入力欄イベント
    const sequencerTempoInput = document.getElementById("sequencerTempoInput");
    if (sequencerTempoInput) {
        sequencerTempoInput.addEventListener("input", (e) => {
            let v = parseInt(e.target.value, 10);
            if (isNaN(v)) v = 120;
            if (v < 30) v = 30;
            if (v > 300) v = 300;
            sequencerTempo = v;
            sequencerTempoInput.value = v;
            if (sequencerPlaying) {
                stopSequencer();
                playSequencer();
            }
        });
        // 初期値セット
        sequencerTempoInput.value = sequencerTempo;
    }
});

// メトロノームテンポ変更時にシーケンサー再生中なら即反映
document.getElementById("metronomeTempo").addEventListener("input", () => {
    if (sequencerPlaying) {
        stopSequencer();
        playSequencer();
    }
});

// --- プリセット管理機能 ---
const PRESET_KEY = "ki_presets";
function getPresets() {
    try {
        return JSON.parse(localStorage.getItem(PRESET_KEY)) || {};
    } catch (e) { return {}; }
}
function savePresets(obj) {
    localStorage.setItem(PRESET_KEY, JSON.stringify(obj));
}
function updatePresetSelect() {
    const select = document.getElementById("presetSelect");
    if (!select) return;
    const presets = getPresets();
    select.innerHTML = "";
    Object.keys(presets).forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}
function showPresetStatus(msg) {
    const status = document.getElementById("presetStatus");
    if (status) status.textContent = msg;
}

// 保存
document.getElementById("presetSaveBtn").onclick = () => {
    const name = prompt("プリセット名を入力してください:");
    if (!name) return;
    const presets = getPresets();
    presets[name] = {
        keyMapJP,
        instrumentParams,
        sequencerData,
        sequencerSteps,
        sequencerChannels,
        sequencerTempo
    };
    savePresets(presets); // ← ローカルストレージへ保存
    updatePresetSelect();
    showPresetStatus("保存しました");
};

// 読み込み
document.getElementById("presetLoadBtn").onclick = () => {
    const select = document.getElementById("presetSelect");
    const name = select.value;
    if (!name) return;
    const presets = getPresets(); // ← ローカルストレージから取得
    if (!presets[name]) return;
    keyMapJP = JSON.parse(JSON.stringify(presets[name].keyMapJP));
    Object.assign(instrumentParams, JSON.parse(JSON.stringify(presets[name].instrumentParams)));
    // ステップシーケンサー関連も復元
    sequencerData = JSON.parse(JSON.stringify(presets[name].sequencerData || []));
    sequencerSteps = presets[name].sequencerSteps || 16;
    sequencerChannels = presets[name].sequencerChannels || 4;
    sequencerTempo = presets[name].sequencerTempo || 120;
    renderMappingTable();
    renderKeyboard();
    saveInstrumentParams();
    autoSaveMap();
    renderSequencerGrid();
    // UI値も復元
    document.getElementById("sequencerStepsInput").value = sequencerSteps;
    document.getElementById("sequencerChannelsInput").value = sequencerChannels;
    document.getElementById("sequencerTempoInput").value = sequencerTempo;
    showPresetStatus("読み込みました");
};

// 削除
document.getElementById("presetDeleteBtn").onclick = () => {
    const select = document.getElementById("presetSelect");
    const name = select.value;
    if (!name) return;
    if (!confirm(`プリセット「${name}」を削除しますか？`)) return;
    const presets = getPresets();
    delete presets[name];
    savePresets(presets);
    updatePresetSelect();
    showPresetStatus("削除しました");
};

// エクスポート
document.getElementById("presetExportBtn").onclick = () => {
    const select = document.getElementById("presetSelect");
    const name = select.value;
    if (!name) return;
    const presets = getPresets();
    if (!presets[name]) return;
    const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(presets[name], null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `preset_${name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showPresetStatus("エクスポートしました");
};

// インポート
document.getElementById("presetImportBtn").onclick = () => {
    document.getElementById("presetImportInput").click();
};
document.getElementById("presetImportInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const obj = JSON.parse(ev.target.result);
            const name = prompt("プリセット名を入力してください:", file.name.replace(/\.json$/, ""));
            if (!name) return;
            const presets = getPresets();
            presets[name] = obj;
            savePresets(presets);
            updatePresetSelect();
            showPresetStatus("インポートしました");
        } catch (err) {
            showPresetStatus("インポート失敗");
        }
    };
    reader.readAsText(file);
};

// --- WAVエクスポート機能 ---
document.getElementById("exportWavBtn").onclick = () => {
    if (recordedEvents.length === 0) {
        showPresetStatus("録音データがありません");
        return;
    }
    // OfflineAudioContextで再合成
    const duration = recordedEvents.length > 0 ? recordedEvents[recordedEvents.length - 1].time / 1000 + 2 : 2;
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(1, duration * sampleRate, sampleRate);

    // 再生イベントをOfflineAudioContextで再現
    let activeOsc = {};
    recordedEvents.forEach(ev => {
        const t = ev.time / 1000;
        if (ev.type === "on") {
            const freq = noteToFreq(ev.key);
            if (!freq) return;
            const osc = offlineCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = freq;
            const gain = offlineCtx.createGain();
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.linearRampToValueAtTime(0.001, t + 1.0);
            osc.connect(gain);
            gain.connect(offlineCtx.destination);
            osc.start(t);
            osc.stop(t + 1.0);
            activeOsc[ev.key] = osc;
        } else if (ev.type === "off") {
            // 早めに減衰
            // 実装簡易化のため、osc.stopはonで1秒後に止める
        }
    });

    offlineCtx.startRendering().then(buffer => {
        // WAVバイナリ生成
        function encodeWAV(audioBuffer) {
            const nSamples = audioBuffer.length;
            const buffer = new ArrayBuffer(44 + nSamples * 2);
            const view = new DataView(buffer);

            function writeString(view, offset, string) {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            }

            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + nSamples * 2, true);
            writeString(view, 8, 'WAVE');
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeString(view, 36, 'data');
            view.setUint32(40, nSamples * 2, true);

            // PCMデータ
            const channelData = audioBuffer.getChannelData(0);
            let offset = 44;
            for (let i = 0; i < nSamples; i++) {
                let s = Math.max(-1, Math.min(1, channelData[i]));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                offset += 2;
            }
            return buffer;
        }

        const wavBuffer = encodeWAV(buffer);
        const blob = new Blob([wavBuffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "recording.wav";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showPresetStatus("WAVエクスポートしました");
    });
};

// --- MIDIエクスポート機能 ---
document.getElementById("exportMidiBtn").onclick = () => {
    if (recordedEvents.length === 0) {
        showPresetStatus("録音データがありません");
        return;
    }
    // 簡易MIDIファイル生成
    function midiNoteNumber(note) {
        const notes = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
        const match = note.match(/^([A-G]#?)(\d)$/);
        if (!match) return 60;
        const [_, n, octave] = match;
        return 12 * (parseInt(octave) + 1) + notes[n];
    }

    // SMF format 0
    let events = [];
    let lastTime = 0;
    recordedEvents.forEach(ev => {
        const t = Math.round(ev.time / 1000 * 480); // 480 ticks/sec
        const delta = t - lastTime;
        lastTime = t;
        // delta time (variable length)
        function encodeVarLen(value) {
            let buffer = [];
            let val = value & 0x7F;
            while ((value >>= 7)) {
                val <<= 8;
                val |= ((value & 0x7F) | 0x80);
            }
            while (true) {
                buffer.push(val & 0xFF);
                if (val & 0x80) val >>= 8;
                else break;
            }
            return buffer.reverse();
        }
        events.push(...encodeVarLen(delta));
        if (ev.type === "on") {
            events.push(0x90, midiNoteNumber(ev.key), 100);
        } else {
            events.push(0x80, midiNoteNumber(ev.key), 0);
        }
    });

    // ヘッダー
    function hex(...args) { return new Uint8Array(args); }
    let header = [
        ...hex(0x4d, 0x54, 0x68, 0x64), // MThd
        ...hex(0x00, 0x00, 0x00, 0x06), // header length
        ...hex(0x00, 0x00),           // format 0
        ...hex(0x00, 0x01),           // 1 track
        ...hex(0x01, 0xe0),           // division (480)
        // Track chunk
        0x4d, 0x54, 0x72, 0x6b,         // MTrk
    ];
    // track length placeholder
    let trackLenIdx = header.length;
    header.push(0, 0, 0, 0);

    // track data
    let track = [];
    track.push(0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20); // tempo 500000 (120bpm)
    track.push(...events);
    track.push(0x00, 0xFF, 0x2F, 0x00); // end of track

    // track length
    let trackLen = track.length;
    header[trackLenIdx] = (trackLen >> 24) & 0xFF;
    header[trackLenIdx + 1] = (trackLen >> 16) & 0xFF;
    header[trackLenIdx + 2] = (trackLen >> 8) & 0xFF;
    header[trackLenIdx + 3] = trackLen & 0xFF;

    let midiData = new Uint8Array([...header, ...track]);
    const blob = new Blob([midiData], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recording.mid";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showPresetStatus("MIDIエクスポートしました");
};

// --- スケール・コード判定関数（仮実装） ---
function isNoteInScale(note) {
    // 本来はscaleMode/scaleRootに応じて判定
    return true;
}
function isNoteInChord(note) {
    // 本来はchordMode/chordRootに応じて判定
    return true;
}