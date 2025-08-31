const overlay = document.querySelector('.overlay');
overlay.addEventListener('animationend', () => {
    overlay.style.display = 'none'; // アニメーションが終わったら非表示
});
// ====== 画像 ======
const IMG_MOUSE = "imgs/mouse-box.webp";
const IMG_BASKET = "imgs/mouse-archive.webp";
const IMG_CHEESE = "imgs/cheese.webp";
const IMG_RARE = "imgs/2.5Dcheese.webp";
const IMG_WATER = "imgs/drop.png";
// 虹色はCSS描画するため画像不要。画像を使いたいなら下のURLを設定して使う
const IMG_RAINBOW = null; // 例: "imgs/rainbow.webp"

// ====== DOM ======
const game = document.getElementById("game");
const mouse = document.getElementById("mouse");
const basket = document.getElementById("basket");
const cheeseDisplay = document.getElementById("cheeseCount");
const windowDiv = document.getElementById("window");
const pauseBtn = document.getElementById("pauseBtn");
const statusBar = document.getElementById("statusBar");

// ====== 進行状態（保存系） ======
const LS = {
    coins: "nz_game_coins",
    upRainbow: "nz_game_up_rainbow",
    upRare: "nz_game_up_rare",
    high: "nz_game_highscore",
    upRainbowTime: "nz_game_up_rainbow_time", // 虹時間強化
    upRainbowCheese: "nz_game_up_rainbow_cheese", // 虹チーズ強化（追加）
};
let coins = parseInt(localStorage.getItem(LS.coins) || "0", 10);
let upRainbow = parseInt(localStorage.getItem(LS.upRainbow) || "0", 10); // +0.2%/Lv
let upRare = parseInt(localStorage.getItem(LS.upRare) || "0", 10);       // +0.5%/Lv
let highScore = parseInt(localStorage.getItem(LS.high) || "0", 10);
let upRainbowTime = parseInt(localStorage.getItem(LS.upRainbowTime) || "0", 10); // +2秒/レベル
let upRainbowCheese = parseInt(localStorage.getItem(LS.upRainbowCheese) || "0", 10); // +1チーズ/レベル

// ====== ゲーム状態 ======
let gameOver = false;
let cheeseCount = 0;
let dropTimer = null;
let paused = false;
let fallTimers = [];
let pausedItems = [];
let difficulty = "normal";
let dropInterval = 1000;
let fallSpeed = 6;

// 虹色バフ
const RAINBOW_DURATION = 15000; // 15秒
let rainbowUntil = 0;
let rainbowPausedRemain = 0; // 追加: ポーズ中の残り時間保存
let statusTimer = null;
let pausedAt = 0;

// 画像
mouse.style.backgroundImage = `url(${IMG_MOUSE})`;

// ====== ゲームパラメータ集約 ======
const gameParams = {
    cheese: {
        baseChance: 0.46,
    },
    rare: {
        baseChance: 0.08,
        upPerLv: 0.005,
        cost: [5, 10, 20, 35, 55, 80],
        costStep: 30,
    },
    rainbow: {
        baseChance: 0.01,
        upPerLv: 0.002,
        cost: [5, 10, 20, 35, 55, 80],
        costStep: 30,
    },
    rainbowTime: {
        baseSec: 5,
        upSecPerLv: 2,
        cost: [10, 20, 40, 70, 110, 160],
        costStep: 50,
    },
    rainbowCheese: {
        base: 0,
        upPerLv: 1,
        cost: [10, 20, 40, 70, 110, 160],
        costStep: 50,
    },
    minWaterChance: 0.05,
    difficulty: {
        easy: { dropInterval: 1300, fallSpeed: 6 },
        normal: { dropInterval: 1000, fallSpeed: 8 },
        hard: { dropInterval: 700, fallSpeed: 18 }
    }
};

// ====== 確率（強化反映） ======
function calcChances() {
    const base = {
        rainbow: gameParams.rainbow.baseChance,
        rare: gameParams.rare.baseChance,
        cheese: gameParams.cheese.baseChance
    };
    let pRainbow = base.rainbow + upRainbow * gameParams.rainbow.upPerLv;
    let pRare = base.rare + upRare * gameParams.rare.upPerLv;
    let pCheese = base.cheese;
    const maxNonWater = 1 - gameParams.minWaterChance;
    let total = pRainbow + pRare + pCheese;
    if (total > maxNonWater) {
        const excess = total - maxNonWater;
        const baseR = gameParams.rainbow.baseChance, baseRa = gameParams.rare.baseChance;
        let extraR = Math.max(0, pRainbow - baseR);
        let extraRa = Math.max(0, pRare - baseRa);
        let extraSum = extraR + extraRa;
        if (extraSum > 0) {
            const keep = Math.max(0, (extraSum - excess) / extraSum);
            pRainbow = baseR + extraR * keep;
            pRare = baseRa + extraRa * keep;
        } else {
            pCheese = Math.max(0, pCheese - excess);
        }
    }
    return { pRainbow, pRare, pCheese };
}

// ====== ウィンドウ描画 ======
function windowFunc(type, message) {
    windowDiv.innerHTML = "";
    windowDiv.style.display = (type ? "flex" : "none");
    if (!type) return;

    if (type === "start") {
        // タイトル
        const title = document.createElement("div");
        title.textContent = "ネズミとチーズ - タイトル";
        title.style.fontSize = "24px";
        title.style.marginBottom = "8px";
        title.style.textAlign = "center";
        windowDiv.appendChild(title);

        // コイン/ハイスコア表示
        const info = document.createElement("div");
        info.style.textAlign = "center";
        info.style.marginBottom = "8px";
        info.innerHTML = `🪙 コイン: <b id="coinsSpan">${coins}</b>　/　🏆 ハイスコア: <b id="highSpan">${highScore}</b>`;
        windowDiv.appendChild(info);

        // ショップ
        const shop = document.createElement("div");
        shop.className = "shop";
        const shopr = () => {
            shop.innerHTML = `
      <h3>強化ショップ</h3>
      <div class="row">
        <div class="info">🌈 虹色（カラフル）アイテム出現率<br>
          <small>現在: <b id="lvRainbow">${upRainbow}</b> Lv（+${(upRainbow * 0.2).toFixed(1)}%）</small>
        </div>
        <div class="buy">
          <button id="buyRainbow">強化（<span id="costRainbow"></span>🪙）</button>
        </div>
      </div>
      <div class="row">
        <div class="info">🧀 レアチーズ出現率<br>
          <small>現在: <b id="lvRare">${upRare}</b> Lv（+${(upRare * 0.5).toFixed(1)}%）</small>
        </div>
        <div class="buy">
          <button id="buyRare">強化（<span id="costRare"></span>🪙）</button>
        </div>
      </div>
      <div class="row">
        <div class="info">🌈 虹バフ効果時間<br>
          <small>現在: <b id="lvRainbowTime">${upRainbowTime}</b> Lv（${5 + upRainbowTime * 2}秒）</small>
        </div>
        <div class="buy">
          <button id="buyRainbowTime">強化（<span id="costRainbowTime"></span>🪙）</button>
        </div>
      </div>
      <div class="row">
        <div class="info">🌈 虹アイテム取得時チーズ<br>
          <small>現在: <b id="lvRainbowCheese">${upRainbowCheese}</b> Lv（+${upRainbowCheese}）</small>
        </div>
        <div class="buy">
          <button id="buyRainbowCheese">強化（<span id="costRainbowCheese"></span>🪙）</button>
        </div>
      </div>
      <small>※ セーブは自動（localStorage）</small>
    `;
            const costR = shop.querySelector("#costRainbow");
            const costRa = shop.querySelector("#costRare");
            const costRT = shop.querySelector("#costRainbowTime");
            const costRC = shop.querySelector("#costRainbowCheese");
            costR.textContent = getUpgradeCost("rainbow", upRainbow);
            costRa.textContent = getUpgradeCost("rare", upRare);
            costRT.textContent = getUpgradeCost("rainbowTime", upRainbowTime);
            costRC.textContent = getUpgradeCost("rainbowCheese", upRainbowCheese);
            shop.querySelector("#buyRainbow").onclick = () => { buyUpgrade("rainbow"); };
            shop.querySelector("#buyRare").onclick = () => { buyUpgrade("rare"); };
            shop.querySelector("#buyRainbowTime").onclick = () => { buyUpgrade("rainbowTime"); };
            shop.querySelector("#buyRainbowCheese").onclick = () => { buyUpgrade("rainbowCheese"); };
        };
        shopr();
        windowDiv.appendChild(shop);

        // 難易度
        const diffTitle = document.createElement("div");
        diffTitle.textContent = "難易度を選んでスタート";
        diffTitle.style.fontSize = "16px";
        diffTitle.style.margin = "10px 0 4px";
        diffTitle.style.textAlign = "center";
        windowDiv.appendChild(diffTitle);

        const diffDiv = document.createElement("div");
        diffDiv.style.textAlign = "center";
        diffDiv.innerHTML = `
          <button class="diff-btn" id="easyBtn">やさしい</button>
          <button class="diff-btn" id="normalBtn">ふつう</button>
          <button class="diff-btn" id="hardBtn">むずかしい</button>
        `;
        windowDiv.appendChild(diffDiv);

        const startBtn = document.createElement("button");
        startBtn.textContent = "スタート";
        startBtn.className = "start-btn";
        windowDiv.appendChild(startBtn);

        // セットアップ
        setTimeout(() => {
            const easyBtn = document.getElementById("easyBtn");
            const normalBtn = document.getElementById("normalBtn");
            const hardBtn = document.getElementById("hardBtn");
            function select(btn) {
                [easyBtn, normalBtn, hardBtn].forEach(b => b.classList.remove("selected"));
                btn.classList.add("selected");
            }
            // 既定「ふつう」
            select(normalBtn);
            difficulty = "normal"; dropInterval = 1000; fallSpeed = 6;

            easyBtn.onclick = () => { difficulty = "easy"; dropInterval = gameParams.difficulty.easy.dropInterval; fallSpeed = gameParams.difficulty.easy.fallSpeed; select(easyBtn); };
            normalBtn.onclick = () => { difficulty = "normal"; dropInterval = gameParams.difficulty.normal.dropInterval; fallSpeed = gameParams.difficulty.normal.fallSpeed; select(normalBtn); };
            hardBtn.onclick = () => { difficulty = "hard"; dropInterval = gameParams.difficulty.hard.dropInterval; fallSpeed = gameParams.difficulty.hard.fallSpeed; select(hardBtn); };

            // 強化コスト表示
            const costR = document.getElementById("costRainbow");
            const costRa = document.getElementById("costRare");
            costR.textContent = getUpgradeCost("rainbow", upRainbow);
            costRa.textContent = getUpgradeCost("rare", upRare);

            document.getElementById("buyRainbow").onclick = () => { buyUpgrade("rainbow"); };
            document.getElementById("buyRare").onclick = () => { buyUpgrade("rare"); };

            startBtn.onclick = () => { windowDiv.style.display = "none"; startGame(); };
        }, 0);
    }

    if (type === "gameover") {
        const msgDiv = document.createElement("div");
        msgDiv.textContent = message;
        msgDiv.style.fontSize = "20px";
        msgDiv.style.marginBottom = "12px";
        msgDiv.style.textAlign = "center";
        windowDiv.appendChild(msgDiv);

        const retryBtn = document.createElement("button");
        retryBtn.textContent = "リトライ";
        retryBtn.className = "retry-btn";
        retryBtn.onclick = () => { windowDiv.style.display = "none"; startGame(); };
        windowDiv.appendChild(retryBtn);

        const titleBtn = document.createElement("button");
        titleBtn.textContent = "タイトルに戻る";
        titleBtn.className = "title-btn";
        titleBtn.style.marginTop = "8px";
        titleBtn.onclick = () => { location.reload(); };
        windowDiv.appendChild(titleBtn);
    }
}

// ====== 強化ロジック ======
function getUpgradeCost(type, level) {
    if (type === "rainbow") {
        const base = gameParams.rainbow.cost;
        const idx = Math.min(level, base.length - 1);
        return base[idx] + Math.max(0, level - (base.length - 1)) * gameParams.rainbow.costStep;
    }
    if (type === "rare") {
        const base = gameParams.rare.cost;
        const idx = Math.min(level, base.length - 1);
        return base[idx] + Math.max(0, level - (base.length - 1)) * gameParams.rare.costStep;
    }
    if (type === "rainbowTime") {
        const base = gameParams.rainbowTime.cost;
        const idx = Math.min(level, base.length - 1);
        return base[idx] + Math.max(0, level - (base.length - 1)) * gameParams.rainbowTime.costStep;
    }
    if (type === "rainbowCheese") {
        const base = gameParams.rainbowCheese.cost;
        const idx = Math.min(level, base.length - 1);
        return base[idx] + Math.max(0, level - (base.length - 1)) * gameParams.rainbowCheese.costStep;
    }
    return 0;
}

function buyUpgrade(type) {
    let level;
    if (type === "rainbow") level = upRainbow;
    else if (type === "rare") level = upRare;
    else if (type === "rainbowTime") level = upRainbowTime;
    else if (type === "rainbowCheese") level = upRainbowCheese;
    const cost = getUpgradeCost(type, level);
    if (coins < cost) {
        showToast("🪙 コインが足りません");
        return;
    }
    coins -= cost;
    localStorage.setItem(LS.coins, String(coins));
    const coinsSpan = document.getElementById("coinsSpan");
    if (coinsSpan) coinsSpan.textContent = coins;

    if (type === "rainbow") {
        upRainbow++;
        localStorage.setItem(LS.upRainbow, String(upRainbow));
        document.getElementById("lvRainbow").textContent = upRainbow;
        document.getElementById("costRainbow").textContent = getUpgradeCost("rainbow", upRainbow);
    } else if (type === "rare") {
        upRare++;
        localStorage.setItem(LS.upRare, String(upRare));
        document.getElementById("lvRare").textContent = upRare;
        document.getElementById("costRare").textContent = getUpgradeCost("rare", upRare);
    } else if (type === "rainbowTime") {
        upRainbowTime++;
        localStorage.setItem(LS.upRainbowTime, String(upRainbowTime));
        document.getElementById("lvRainbowTime").textContent = upRainbowTime;
        document.getElementById("costRainbowTime").textContent = getUpgradeCost("rainbowTime", upRainbowTime);
    } else if (type === "rainbowCheese") {
        upRainbowCheese++;
        localStorage.setItem(LS.upRainbowCheese, String(upRainbowCheese));
        document.getElementById("lvRainbowCheese").textContent = upRainbowCheese;
        document.getElementById("costRainbowCheese").textContent = getUpgradeCost("rainbowCheese", upRainbowCheese);
    }
    windowFunc("start");
}


// ====== リセット ======
function resetGame() {
    gameOver = false;
    cheeseCount = 0;
    cheeseDisplay.textContent = "チーズ:" + cheeseCount;
    document.querySelectorAll(".item").forEach(i => i.remove());
    if (dropTimer) clearInterval(dropTimer);
    dropTimer = null;
    fallTimers.forEach(f => clearInterval(f));
    fallTimers = [];
    pausedItems = [];
    paused = false;
    pauseBtn.textContent = "⏸ 一時停止";
    // バフもリセット
    rainbowUntil = 0;
    if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
    statusBar.style.display = "none";
    statusBar.textContent = "";
}

// ====== スタート ======
function startGame() {
    resetGame();
    windowFunc(); // hide
    if (!dropTimer) dropTimer = setInterval(dropItem, dropInterval);
}

// ====== ネズミ移動 ======
function moveMouse(x) {
    const rect = game.getBoundingClientRect();
    // 修正: game.clientWidthで範囲制限
    let nx = x - rect.left - mouse.offsetWidth / 2;
    if (nx < 0) nx = 0;
    if (nx > game.clientWidth - mouse.offsetWidth) nx = game.clientWidth - mouse.offsetWidth;
    mouse.style.left = nx + "px";
    // 底辺を常に維持
    mouse.style.bottom = "10px";
}

// PC: マウス移動
game.addEventListener("mousemove", e => { moveMouse(e.clientX); });

// モバイル: タッチ移動
let lastTouchX = null;
game.addEventListener("touchstart", e => {
    if (e.touches.length > 0) {
        lastTouchX = e.touches[0].clientX;
        moveMouse(lastTouchX);
    }
}, { passive: false });
game.addEventListener("touchmove", e => {
    if (e.touches.length > 0) {
        // 画面外で指を動かしてもネズミが暴走しないように制限
        const touch = e.touches[0];
        let x = touch.clientX;
        // 画面内のみに制限
        const rect = game.getBoundingClientRect();
        if (x < rect.left) x = rect.left;
        if (x > rect.right) x = rect.right;
        moveMouse(x);
        lastTouchX = x;
    }
    e.preventDefault();
}, { passive: false });
game.addEventListener("touchend", e => {
    lastTouchX = null;
});

// ====== アイテム落下 ======
function dropItem() {
    if (gameOver || paused) return;

    const { pRainbow, pRare, pCheese } = calcChances();
    const r = Math.random();

    let type = "water";
    if (r < pRainbow) type = "rainbow";
    else if (r < pRainbow + pRare) type = "rare";
    else if (r < pRainbow + pRare + pCheese) type = "cheese";
    else type = "water";

    // 虹色効果中は新しく落ちるものをすべてチーズ化
    if (isRainbowActive()) type = "cheese";

    const item = document.createElement("div");
    item.className = "item";
    item.dataset.type = type;

    if (type === "cheese") item.style.backgroundImage = `url(${IMG_CHEESE})`;
    if (type === "rare") item.style.backgroundImage = `url(${IMG_RARE})`;
    if (type === "water") item.style.backgroundImage = `url(${IMG_WATER})`;
    if (type === "rainbow") {
        if (IMG_RAINBOW) item.style.backgroundImage = `url(${IMG_RAINBOW})`;
        // 画像を使わない場合はCSSグラデで描画される
    }

    item.style.left = Math.floor(Math.random() * (game.clientWidth - 40)) + "px";
    item.style.top = "0px";
    game.appendChild(item);

    function fallStep() {
        if (gameOver) { item.remove(); return; }
        let top = parseInt(item.style.top);
        if (top > game.clientHeight - 30) {
            item.remove();
            fallTimers = fallTimers.filter(f => f !== fall);
        } else {
            item.style.top = (top + fallSpeed) + "px";
            checkCollision(item, fall);
        }
    }

    const fall = setInterval(() => {
        if (paused) {
            clearInterval(fall);
            fallTimers = fallTimers.filter(f => f !== fall);
            pausedItems.push(item);
            return;
        }
        fallStep();
    }, 30);
    fallTimers.push(fall);
}

// ====== 衝突判定 ======
function checkCollision(item, fall) {
    const iRect = item.getBoundingClientRect();
    const bRect = mouse.getBoundingClientRect();
    if (!(iRect.right < bRect.left || iRect.left > bRect.right || iRect.bottom < bRect.top || iRect.top > bRect.bottom)) {
        const type = item.dataset.type;

        if (type === "cheese") {
            cheeseCount += 1;
            cheeseDisplay.textContent = "チーズ:" + cheeseCount;
        } else if (type === "rare") {
            cheeseCount += 3;
            cheeseDisplay.textContent = "チーズ:" + cheeseCount + "（レア！+3）";
            const mouseRect = mouse.getBoundingClientRect();
            const gameRect = game.getBoundingClientRect();
            const cx = mouseRect.left + mouseRect.width / 2 - gameRect.left;
            const cy = mouseRect.top + mouseRect.height / 2 - gameRect.top;
            createParticleEffect(cx, cy);
            setTimeout(() => { cheeseDisplay.textContent = "チーズ:" + cheeseCount; }, 900);
        } else if (type === "rainbow") {
            triggerRainbowEffect();
            // 虹そのものは得点なし（好みに応じて +1 などにしてOK）
            showToast("🌈 15秒間、全部チーズになるよ！");
        } else {
            // 水
            if (cheeseCount > 0 && !isRainbowActive()) {
                endGame("💧 チーズが入った状態で水に濡れた！カビてゲームオーバー");
            } else if (!isRainbowActive()) {
                endGame("💧 水に濡れた！ゲームオーバー");
            } else {
                // 虹効果中は水も怖くない（チーズ化して落ちてくる想定）
            }
        }

        clearInterval(fall);
        item.remove();
    }
}

// ====== 虹色バフ ======
// RAINBOW_DURATIONは使わず、関数で計算
function getRainbowDuration() {
    return (gameParams.rainbowTime.baseSec + upRainbowTime * gameParams.rainbowTime.upSecPerLv) * 1000;
}

function isRainbowActive() {
    return Date.now() < rainbowUntil;
}

function triggerRainbowEffect() {
    const now = Date.now();
    // 修正: 強化分の秒数を反映
    rainbowUntil = Math.max(rainbowUntil, now) + getRainbowDuration();

    // --- 虹チーズ強化レベルに応じてチーズ加算 ---
    if (upRainbowCheese > 0) {
        const addCheese = upRainbowCheese; // 1レベルごとに+1チーズ
        cheeseCount += addCheese;
        cheeseDisplay.textContent = `チーズ:${cheeseCount}（虹！+${addCheese}）`;
        setTimeout(() => { cheeseDisplay.textContent = "チーズ:" + cheeseCount; }, 900);
    }

    updateStatusBar();
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(updateStatusBar, 100);
}

function updateStatusBar() {
    const remain = Math.max(0, rainbowUntil - Date.now());
    if (remain > 0) {
        statusBar.style.display = "block";
        statusBar.textContent = `🌈 効果中: ${(remain / 1000).toFixed(1)}s`;
    } else {
        statusBar.style.display = "none";
        statusBar.textContent = "";
        if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
    }
}

// ====== ゲーム終了 ======
function endGame(text) {
    gameOver = true;
    if (dropTimer) clearInterval(dropTimer);
    dropTimer = null;
    fallTimers.forEach(f => clearInterval(f));
    fallTimers = [];
    pausedItems = [];

    // スコア保存＆コイン付与
    if (cheeseCount > highScore) {
        highScore = cheeseCount;
        localStorage.setItem(LS.high, String(highScore));
    }
    const earned = Math.floor(cheeseCount / 2);
    coins += earned;
    localStorage.setItem(LS.coins, String(coins));

    windowFunc("gameover", `${text}\n🧀 スコア: ${cheeseCount}　/　🪙 獲得: ${earned}（所持: ${coins}）\n🏆 最高記録: ${highScore}`);
}

// ====== 一時停止 ======
pauseBtn.onclick = function () {
    if (paused) {
        paused = false; pauseBtn.textContent = "⏸ 一時停止";
        // ポーズ解除時、虹タイマーを復元
        if (rainbowPausedRemain > 0) {
            rainbowUntil = Date.now() + rainbowPausedRemain;
            rainbowPausedRemain = 0;
            updateStatusBar();
        }
        if (!gameOver && !dropTimer) dropTimer = setInterval(dropItem, dropInterval);
        pausedItems.forEach(item => {
            function fallStep() {
                if (gameOver) { item.remove(); return; }
                let top = parseInt(item.style.top);
                if (top > game.clientHeight - 30) { item.remove(); fallTimers = fallTimers.filter(f => f !== fall); }
                else { item.style.top = (top + fallSpeed) + "px"; checkCollision(item, fall); }
            }
            const fall = setInterval(() => {
                if (paused) { clearInterval(fall); fallTimers = fallTimers.filter(f => f !== fall); pausedItems.push(item); return; }
                fallStep();
            }, 30);
            fallTimers.push(fall);
        });
        pausedItems = [];
    } else {
        paused = true; pauseBtn.textContent = "▶ 再開";
        pausedAt = Date.now();
        if (dropTimer) { clearInterval(dropTimer); dropTimer = null; }
        fallTimers.forEach(f => clearInterval(f));
        fallTimers = [];
        pausedItems = Array.from(document.querySelectorAll(".item"));
        // ポーズ時、虹タイマーの残り時間を保存し、虹タイマーを止める
        if (isRainbowActive()) {
            rainbowPausedRemain = rainbowUntil - Date.now();
            rainbowUntil = 0;
            updateStatusBar();
        }
    }
};

// ====== トースト的メッセージ ======
function showToast(msg) {
    const div = document.createElement("div");
    div.textContent = msg;
    div.style.position = "absolute";
    div.style.left = "50%";
    div.style.top = "20%";
    div.style.transform = "translate(-50%, -50%)";
    div.style.background = "rgba(0,0,0,0.75)";
    div.style.color = "#fff";
    div.style.padding = "8px 14px";
    div.style.borderRadius = "10px";
    div.style.zIndex = 2000;
    game.appendChild(div);
    setTimeout(() => div.remove(), 1200);
}

// ====== パーティクル ======
function createParticleEffect(x, y) {
    for (let i = 0; i < 12; i++) {
        const p = document.createElement("div"); p.className = "particle";
        const angle = Math.random() * 2 * Math.PI;
        const dist = 30 + Math.random() * 30;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        p.style.left = (x - 5) + "px"; p.style.top = (y - 5) + "px";
        p.animate(
            [{ transform: `translate(0,0)`, opacity: 0.8 },
            { transform: `translate(${dx}px,${dy}px) scale(0.5)`, opacity: 0 }],
            { duration: 700, easing: "ease-out" }
        );
        setTimeout(() => { p.remove(); }, 700);
        game.appendChild(p);
    }
}
game.addEventListener("click", (event) => {
    const rect = game.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    createParticleEffect(x, y);
});

// 管理パネルはURLパラメータ debug または admin のときのみ表示
function getUrlParam(name) {
    return new URLSearchParams(window.location.search).has(name);
}
if (getUrlParam("debug") || getUrlParam("admin")) {
    document.getElementById("adminBtn").style.display = "block";
}

// 管理パネルUIのイベント
document.getElementById("adminBtn").onclick = function () {
    const panel = document.getElementById("adminPanel");
    panel.style.display = (panel.style.display === "none" ? "block" : "none");
    // 値をセット
    document.getElementById("dbg_coins").value = coins;
    document.getElementById("dbg_high").value = highScore;
    document.getElementById("ap_cheese").value = gameParams.cheese.baseChance;
    document.getElementById("ap_rare").value = gameParams.rare.baseChance;
    document.getElementById("ap_rainbow").value = gameParams.rainbow.baseChance;
    document.getElementById("ap_minWater").value = gameParams.minWaterChance;
    document.getElementById("ap_easy_drop").value = gameParams.difficulty.easy.dropInterval;
    document.getElementById("ap_easy_speed").value = gameParams.difficulty.easy.fallSpeed;
    document.getElementById("ap_normal_drop").value = gameParams.difficulty.normal.dropInterval;
    document.getElementById("ap_normal_speed").value = gameParams.difficulty.normal.fallSpeed;
    document.getElementById("ap_hard_drop").value = gameParams.difficulty.hard.dropInterval;
    document.getElementById("ap_hard_speed").value = gameParams.difficulty.hard.fallSpeed;
    document.getElementById("dbg_costRainbow").value = (gameParams.rainbow.cost || []).join(",");
    document.getElementById("dbg_costRare").value = (gameParams.rare.cost || []).join(",");
    document.getElementById("dbg_costRainbowTime").value = (gameParams.rainbowTime.cost || []).join(",");
    document.getElementById("dbg_costRainbowCheese").value = (gameParams.rainbowCheese.cost || []).join(",");
};
document.getElementById("adminClose").onclick = function () {
    document.getElementById("adminPanel").style.display = "none";
};
document.getElementById("adminReset").onclick = function () {
    localStorage.removeItem("nz_game_coins");
    localStorage.removeItem("nz_game_highscore");
    localStorage.removeItem("nz_gameParams_cost_override");
    localStorage.removeItem("nz_gameParams_override");
    location.reload();
};
document.getElementById("adminForm").onsubmit = function (e) {
    e.preventDefault();
    // コイン・ハイスコア
    localStorage.setItem("nz_game_coins", document.getElementById("dbg_coins").value);
    localStorage.setItem("nz_game_highscore", document.getElementById("dbg_high").value);
    // gameParams
    const obj = {
        cheese: parseFloat(document.getElementById("ap_cheese").value),
        rare: parseFloat(document.getElementById("ap_rare").value),
        rainbow: parseFloat(document.getElementById("ap_rainbow").value),
        minWaterChance: parseFloat(document.getElementById("ap_minWater").value),
        difficulty: {
            easy: {
                dropInterval: parseInt(document.getElementById("ap_easy_drop").value, 10),
                fallSpeed: parseInt(document.getElementById("ap_easy_speed").value, 10)
            },
            normal: {
                dropInterval: parseInt(document.getElementById("ap_normal_drop").value, 10),
                fallSpeed: parseInt(document.getElementById("ap_normal_speed").value, 10)
            },
            hard: {
                dropInterval: parseInt(document.getElementById("ap_hard_drop").value, 10),
                fallSpeed: parseInt(document.getElementById("ap_hard_speed").value, 10)
            }
        }
    };
    localStorage.setItem("nz_gameParams_override", JSON.stringify(obj));
    // コスト
    const costOverride = {
        rainbow: (document.getElementById("dbg_costRainbow").value || "").split(",").map(Number),
        rare: (document.getElementById("dbg_costRare").value || "").split(",").map(Number),
        rainbowTime: (document.getElementById("dbg_costRainbowTime").value || "").split(",").map(Number),
        rainbowCheese: (document.getElementById("dbg_costRainbowCheese").value || "").split(",").map(Number)
    };
    localStorage.setItem("nz_gameParams_cost_override", JSON.stringify(costOverride));
    alert("保存しました。ページをリロードします。");
    location.reload();
};

// --- 管理パネル JSON書き出し/読込 ---
document.getElementById("adminExport").onclick = function () {
    const obj = {
        coins: document.getElementById("dbg_coins").value,
        high: document.getElementById("dbg_high").value,
        cheese: parseFloat(document.getElementById("ap_cheese").value),
        rare: parseFloat(document.getElementById("ap_rare").value),
        rainbow: parseFloat(document.getElementById("ap_rainbow").value),
        minWaterChance: parseFloat(document.getElementById("ap_minWater").value),
        difficulty: {
            easy: {
                dropInterval: parseInt(document.getElementById("ap_easy_drop").value, 10),
                fallSpeed: parseInt(document.getElementById("ap_easy_speed").value, 10)
            },
            normal: {
                dropInterval: parseInt(document.getElementById("ap_normal_drop").value, 10),
                fallSpeed: parseInt(document.getElementById("ap_normal_speed").value, 10)
            },
            hard: {
                dropInterval: parseInt(document.getElementById("ap_hard_drop").value, 10),
                fallSpeed: parseInt(document.getElementById("ap_hard_speed").value, 10)
            }
        },
        costRainbow: document.getElementById("dbg_costRainbow").value,
        costRare: document.getElementById("dbg_costRare").value,
        costRainbowTime: document.getElementById("dbg_costRainbowTime").value,
        costRainbowCheese: document.getElementById("dbg_costRainbowCheese").value
    };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "adminParams.json";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
};
document.getElementById("adminImport").onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const obj = JSON.parse(ev.target.result);
            if (obj.coins !== undefined) localStorage.setItem("nz_game_coins", obj.coins);
            if (obj.high !== undefined) localStorage.setItem("nz_game_highscore", obj.high);
            // gameParams
            const paramsObj = {
                cheese: obj.cheese,
                rare: obj.rare,
                rainbow: obj.rainbow,
                minWaterChance: obj.minWaterChance,
                difficulty: obj.difficulty
            };
            localStorage.setItem("nz_gameParams_override", JSON.stringify(paramsObj));
            // コスト
            const costOverride = {
                rainbow: (obj.costRainbow || "").split(",").map(Number),
                rare: (obj.costRare || "").split(",").map(Number),
                rainbowTime: (obj.costRainbowTime || "").split(",").map(Number),
                rainbowCheese: (obj.costRainbowCheese || "").split(",").map(Number)
            };
            localStorage.setItem("nz_gameParams_cost_override", JSON.stringify(costOverride));
            alert("読込完了。ページをリロードします。");
            location.reload();
        } catch (err) {
            alert("JSON読込失敗");
        }
    };
    reader.readAsText(file);
};

// --- gameParams/コスト上書き反映 ---
(function applyAdminParams() {
    const raw = localStorage.getItem("nz_gameParams_override");
    if (raw) {
        try {
            const obj = JSON.parse(raw);
            if (obj.cheese) gameParams.cheese.baseChance = obj.cheese;
            if (obj.rare) gameParams.rare.baseChance = obj.rare;
            if (obj.rainbow) gameParams.rainbow.baseChance = obj.rainbow;
            if (obj.minWaterChance) gameParams.minWaterChance = obj.minWaterChance;
            if (obj.difficulty) {
                if (obj.difficulty.easy) {
                    if (obj.difficulty.easy.dropInterval) gameParams.difficulty.easy.dropInterval = obj.difficulty.easy.dropInterval;
                    if (obj.difficulty.easy.fallSpeed) gameParams.difficulty.easy.fallSpeed = obj.difficulty.easy.fallSpeed;
                }
                if (obj.difficulty.normal) {
                    if (obj.difficulty.normal.dropInterval) gameParams.difficulty.normal.dropInterval = obj.difficulty.normal.dropInterval;
                    if (obj.difficulty.normal.fallSpeed) gameParams.difficulty.normal.fallSpeed = obj.difficulty.normal.fallSpeed;
                }
                if (obj.difficulty.hard) {
                    if (obj.difficulty.hard.dropInterval) gameParams.difficulty.hard.dropInterval = obj.difficulty.hard.dropInterval;
                    if (obj.difficulty.hard.fallSpeed) gameParams.difficulty.hard.fallSpeed = obj.difficulty.hard.fallSpeed;
                }
            }
        } catch (e) { }
    }
    const rawCost = localStorage.getItem("nz_gameParams_cost_override");
    if (rawCost) {
        try {
            const obj = JSON.parse(rawCost);
            if (obj.rainbow) gameParams.rainbow.cost = obj.rainbow;
            if (obj.rare) gameParams.rare.cost = obj.rare;
            if (obj.rainbowTime) gameParams.rainbowTime.cost = obj.rainbowTime;
            if (obj.rainbowCheese) gameParams.rainbowCheese.cost = obj.rainbowCheese;
        } catch (e) { }
    }
})();

// 初期ウィンドウ
windowFunc("start");