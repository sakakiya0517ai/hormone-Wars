// ===================================
// HORMONE WARS - MAIN GAME ENGINE
// ===================================
import {
    state, STAGES, EVENTS, SHOP_ITEMS,
    HORMONE_COOLDOWN, HORMONE_POWER,
    SAFE_MIN, SAFE_MAX, DANGER_LOW, DANGER_HIGH, GLUCOSE_RANGE,
    HP_DANGER_RATE, BASE_SCORE_PER_SEC, TICK_MS
} from './data.js';


// ---- Globals ----
let gameLoopInterval = null;
let nextEventTimer = 0;         // counts in TICKS (not seconds)
let trendCtx = null;
let introTimeout = null;
let transitionMode = false;
let tickCount = 0;              // total ticks (4 per second)


// ---- Utility Functions ----
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function showEl(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hideEl(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function $(id) { return document.getElementById(id); }

// ========================
// SCREEN MANAGEMENT
// ========================
function _switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) screen.classList.add('active');
}
window.showScreen = _switchScreen;

window.goToTitle = function () {
    clearInterval(gameLoopInterval);
    state.gameRunning = false;
    initTitleParticles();
    _switchScreen('screen-title');
};
window.goToHowTo = function () { _switchScreen('screen-howto'); };
window.goToIntro = function () {
    _switchScreen('screen-intro');
    // Reset intro box to avoid double-run
    if (introTimeout) clearTimeout(introTimeout);
    const box = $('introTextBox');
    if (box) box.innerHTML = '';
    const btn = $('btnIntroNext');
    if (btn) btn.style.display = 'none';
    runIntro();
};

// ========================
// TITLE SCREEN PARTICLES
// ========================
function initTitleParticles() {
    const container = $('titleBgAnim');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 80; i++) {
        const star = document.createElement('div');
        star.className = 'star-particle';
        const size = rand(1, 3);
        star.style.cssText = `
      width:${size}px; height:${size}px;
      left:${rand(0, 100)}%;
      top:${rand(0, 100)}%;
      --dur:${rand(2, 6)}s;
      --op:${rand(0.2, 0.7)};
      animation-delay:${rand(0, 4)}s;
    `;
        container.appendChild(star);
    }
    // Floating glucose particles
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        const size = rand(4, 10);
        p.style.cssText = `
      position:absolute;
      width:${size}px; height:${size}px;
      border-radius:50%;
      background:rgba(0,229,255,0.15);
      left:${rand(0, 100)}%;
      top:${rand(0, 100)}%;
      --dur:${rand(4, 10)}s;
      --op:0.3;
      animation: twinkle var(--dur) ease-in-out infinite;
      animation-delay:${rand(0, 5)}s;
      border: 1px solid rgba(0,229,255,0.3);
    `;
        container.appendChild(p);
    }
}

// ========================
// INTRO TYPEWRITER
// ========================
const INTRO_TEXTS = [
    '⚠️ 血糖値センサー異常を検知...',
    '🧠 間脳（視床下部）より緊急通達：',
    '「体内環境が乱れ始めています。',
    '食事、ストレス、老化... あらゆる脅威があなたの体を狙っています。',
    '💉 インスリン、グルカゴン、アドレナリン... ホルモンを駆使して血糖値を守れ！',
    '🎯 目標：血糖値80〜120mg/dLを維持し、恒常性を保ち続けよ。」',
    '✅ 準備完了。あなたの体内サバイバルが今、始まる...',
];

function runIntro() {
    const box = $('introTextBox');
    const btn = $('btnIntroNext');
    if (!box) return;
    box.innerHTML = '';
    let lineIdx = 0;

    function showNextLine() {
        if (lineIdx >= INTRO_TEXTS.length) {
            if (btn) btn.style.display = '';
            return;
        }
        const line = document.createElement('p');
        line.style.cssText = 'opacity:0; transition:opacity 0.5s; margin-bottom:10px;';
        line.textContent = INTRO_TEXTS[lineIdx];
        box.appendChild(line);
        requestAnimationFrame(() => { line.style.opacity = '1'; });
        lineIdx++;
        introTimeout = setTimeout(showNextLine, 750);
    }
    introTimeout = setTimeout(showNextLine, 200);
}

// ========================
// COUNTDOWN & GAME START
// ========================
window.startGameMode = function (mode) {
    state.gameMode = mode;
    goToIntro();
};

window.beginCountdown = function () {
    const stage = STAGES[0]; // always start from first stage
    $('cdStageBadge').textContent = `${stage.emoji} ${stage.name} スタート！`;
    $('cdTip').textContent = `インスリンで血糖値を下げ、グルカゴンで上げよう。目標は80〜120 mg/dL！`;
    _switchScreen('screen-countdown');
    let count = 3;
    $('cdNumber').textContent = count;
    $('cdNumber').className = 'countdown-number';

    const tick = setInterval(() => {
        count--;
        const numEl = $('cdNumber');
        if (count > 0) {
            numEl.textContent = count;
            numEl.style.animation = 'none';
            void numEl.offsetWidth;
            numEl.style.animation = 'cdPop 0.6s ease-out';
        } else {
            clearInterval(tick);
            numEl.textContent = 'GO!';
            numEl.style.color = '#00ff88';
            numEl.style.animation = 'none';
            void numEl.offsetWidth;
            numEl.style.animation = 'cdPop 0.6s ease-out';
            setTimeout(() => { window.startGame(); }, 800);
        }
    }, 1000);
};

// ========================
// GAME INIT & RESTART
// ========================
window.startGame = function () {
    // Reset state
    Object.assign(state, {
        glucose: 100, hp: 100, score: 0, combo: 1.0, comboTicks: 0,
        stage: 0, stageTime: 0, totalTime: 0, gameRunning: true, gamePaused: false,
        glucoseHistory: [100], activeEvent: null, eventTimeLeft: 0,
        cooldowns: { insulin: 0, glucagon: 0, adrenaline: 0 },
        effects: {}, equippedItems: [null, null, null], ownedItems: [],
        immunityToNextDisease: false,
    });
    const startStage = STAGES[0];
    nextEventTimer = randInt(startStage.eventFreqMin * 4, startStage.eventFreqMax * 4);
    transitionMode = false;
    tickCount = 0;

    // Set up mode specific intros
    if (state.gameMode === 'type1') {
        setTimeout(() => {
            showToast('⚠️ 【Ⅰ型糖尿病モード】自然なインスリン分泌がゼロです。常に手動でインスリンを打ち続けてください。', 'danger');
        }, 1500);
    } else if (state.gameMode === 'type2') {
        setTimeout(() => {
            showToast('⚠️ 【Ⅱ型糖尿病モード】重度のインスリン抵抗性により、インスリンボタンの効きが通常の半分になっています。', 'warning');
        }, 1500);
    }


    // Init trend canvas
    const canvas = $('trendCanvas');
    if (canvas) trendCtx = canvas.getContext('2d');

    showScreen('screen-game');
    updateHUD();
    updateEquipSlots();
    updateEffectsList();
    updateShopPanel();
    renderGauge();

    clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(gameTick, TICK_MS);

};

window.restartGame = function () {
    clearInterval(gameLoopInterval);
    window.startGame();
};

// ========================
// MAIN GAME LOOP (TICK_MS interval, ~250ms)
// ========================
function gameTick() {
    if (!state.gameRunning || state.gamePaused) return;

    const stage = STAGES[state.stage];
    tickCount++;

    // Only update time every 4 ticks (= 1 second real time)
    const isSec = (tickCount % 4 === 0);
    if (isSec) {
        state.stageTime++;
        state.totalTime++;
    }

    // Auto-score from equipment (per tick)
    if (state.effects.autoScoreRate) {
        addScore(state.effects.autoScoreRate / 4);
    }

    // Passive glucose drop from private gym item
    if (state.effects.passiveGlucDrop && state.glucose > 100) {
        state.glucose = Math.max(100, state.glucose - state.effects.passiveGlucDrop);
    }

    // Auto-balance effect (auto normalize glucose toward 100)
    if (state.effects.autoBalance) {
        state.glucose += (100 - state.glucose) * 0.05;
    }

    // Auto-normalize (virtue item)
    if (state.effects.autoNorm && state._autoNormActive) {
        state.glucose += (100 - state.glucose) * 0.08;
    }

    // Super mode from hero_mode event
    if (state._superModeTicks > 0) { state._superModeTicks--; }

    // Decay cooldowns (per tick)
    for (const h in state.cooldowns) {
        if (state.cooldowns[h] > 0) {
            state.cooldowns[h] = Math.max(0, state.cooldowns[h] - 1);
        }
    }
    updateCooldownBars();

    // Natural glucose drift toward ~95 (per tick, 1/4 per second)
    // Type 1 Diabetes: The body produces NO natural insulin, so it drifts UP towards 200 instead of recovering to 95.
    let driftTarget = 95;
    if (state.gameMode === 'type1') {
        driftTarget = 200; // Constantly requires manual intervention
    }
    const drift = (driftTarget - state.glucose) * (0.01 / 4);

    // Micro-fluctuation noise: adds ~±1.5 per tick for more granular and dynamic movement
    const noise = (Math.random() - 0.5) * 3.0;
    state.glucose = clamp(state.glucose + drift + noise, GLUCOSE_RANGE.min, GLUCOSE_RANGE.max);

    // Process active event (count down in ticks)
    if (state.activeEvent) {
        // Apply gradual glucose change from event
        if (state._eventGlucTotalDelta !== 0 && state._eventGlucTicksTotal > 0) {
            const deltaPerTick = state._eventGlucTotalDelta / state._eventGlucTicksTotal;
            state.glucose = clamp(state.glucose + deltaPerTick, GLUCOSE_RANGE.min, GLUCOSE_RANGE.max);
        }

        state.eventTimeLeft--;
        updateEventTimer();
        if (state.eventTimeLeft <= 0) {
            endEvent();
        }
    } else {
        // Count down to next event (in ticks)
        nextEventTimer--;
        if (nextEventTimer <= 0) {
            triggerRandomEvent();
            nextEventTimer = randInt(stage.eventFreqMin * 4, stage.eventFreqMax * 4);
        }
    }

    // HP logic: lose HP when out of safe zone
    const inSafe = state.glucose >= SAFE_MIN && state.glucose <= SAFE_MAX;
    if (!inSafe) {
        let decay = HP_DANGER_RATE;
        if (state.effects.hpDecayReduce) decay *= (1 - state.effects.hpDecayReduce);
        state.hp = Math.max(0, state.hp - decay);
    } else {
        // Recover HP slowly when safe
        const recoverRate = 0.2 + (state.effects.hpRecovery || 0) * 0.2;
        const maxHp = 100 + (state.effects.maxHpBonus || 0);
        state.hp = Math.min(maxHp, state.hp + recoverRate);
    }

    // Combo system: 40 consecutive safe ticks (10s) = combo up
    if (inSafe) {
        state.comboTicks++;
        if (state.comboTicks >= 40) {
            state.comboTicks = 0;
            state.combo = Math.min(5.0, Math.round((state.combo + 0.2) * 10) / 10);
        }
    } else {
        state.comboTicks = 0;
        state.combo = Math.max(1.0, state.combo - 0.1);
        state.combo = Math.round(state.combo * 10) / 10;
    }

    // Score: points per second if in safe zone
    if (inSafe) {
        let pts = BASE_SCORE_PER_SEC * state.combo;
        if (state.effects.scoreMultBonus) pts *= (1 + state.effects.scoreMultBonus);
        pts = Math.round(pts);
        addScore(pts);
    }

    // Record glucose history (every tick for smooth graph)
    state.glucoseHistory.push(Math.round(state.glucose));
    if (state.glucoseHistory.length > 360) state.glucoseHistory.shift();

    // Check game over
    if (state.hp <= 0) {
        triggerGameOver('HP');
        return;
    }
    if (state.glucose <= DANGER_LOW) {
        triggerGameOver('低血糖');
        return;
    }
    if (state.glucose >= DANGER_HIGH) {
        triggerGameOver('高血糖');
        return;
    }

    // Brain miss effect (elder stage)
    if (state._brainMissTicks > 0) {
        state._brainMissTicks--;
        if (state._brainMissTicks === 0) enableHormoneButtons(true);
    }

    // Stage advancement (check every second)
    if (isSec && state.stageTime >= stage.duration) {
        triggerStageTransition();
        return;
    }

    // Update UI
    updateHUD();
    renderGauge();
    drawTrendGraph();
    updateDangerOverlay();
    updateBrainStatus();
}

// ========================
// EVENTS
// ========================
function triggerRandomEvent() {
    const stage = STAGES[state.stage];
    const stageIdx = state.stage; // 0=child, 1=adult, 2=elder

    // Filter by stages array (events specify which stages they appear in by ID)
    // Events without stages property appear in all stages
    let pool = EVENTS.filter(e => {
        if (e.stages && !e.stages.includes(stage.id)) return false;
        if (e.cat === 'disease' && state.immunityToNextDisease) return false;
        if (e.cat === 'aging' && state.effects.noAgingEvents) return false;
        return true;
    });

    // Weighted random selection
    const totalWeight = pool.reduce((sum, e) => sum + (e.weight || 1.0), 0);
    let rand = Math.random() * totalWeight;
    let evt = pool[pool.length - 1];
    for (const e of pool) {
        rand -= (e.weight || 1.0);
        if (rand <= 0) { evt = e; break; }
    }
    if (!evt) return;

    state.activeEvent = evt;

    // Calculate duration in TICKS (items can shorten disease)
    let dur = evt.duration * 4;  // convert seconds to ticks
    if (evt.cat === 'disease' && state.effects.diseaseShorten) dur = Math.round(dur * 0.7);

    state.eventTimeLeft = dur;

    // Apply glucose delta
    let delta = evt.glucDelta || 0;

    // Suppress food spikes
    if (evt.cat === 'food') {
        if (state.effects.noFoodSpike) delta = Math.min(delta, 5);
        else if (delta > 0) {
            const reduce = state.effects.spikeReduce || 0;
            delta = Math.round(delta * (1 - reduce));
            // 25% chance meals are healthy
            if (state.effects.healthyMeal25 && Math.random() < 0.25) delta = Math.round(delta * 0.3);
            if (state.effects.healthyMeal50 && Math.random() < 0.50) delta = Math.round(delta * 0.3);
        }
    }
    // Suppress stress events
    if (evt.cat === 'stress' && delta > 0) {
        const sr = Math.min(1, state.effects.stressReduce || 0);
        delta = Math.round(delta * (1 - sr));
    }

    // Set gradual glucose targets rather than applying instantly
    state._eventGlucTotalDelta = delta;
    state._eventGlucTicksTotal = dur; // dur is already in ticks

    // HP damage from events
    if (evt.hpDmg) state.hp = Math.max(0, state.hp - evt.hpDmg);
    if (evt.hpHeal) state.hp = Math.min(100 + (state.effects.maxHpBonus || 0), state.hp + evt.hpHeal);

    // Special effects
    if (evt.immunityBuff) state.immunityToNextDisease = true;
    if (evt.superMode) { state._superModeTicks = 15; }
    if (evt.autoNorm) { state._autoNormActive = true; setTimeout(() => { state._autoNormActive = false; }, evt.duration * 1000); }

    // Brain miss (elder stage equivalent)
    if (evt.brainMiss && stage.hormoneMult < 0.6 && !state.effects.noBrainMiss) {
        state._brainMissTicks = 32;
        enableHormoneButtons(false);
        showToast('⚠️ 間脳の指令ミス！操作が8秒間使えません！', 'warning');
    }

    // Reset immunity after use
    if (evt.cat === 'disease') state.immunityToNextDisease = false;

    // Animate
    animateEvent(evt);
    animateBrainPulse();
    animatePancreasPulse(delta < 0 ? 'insulin' : 'glucagon');

    // Update UI
    showEventCard(evt, delta);
    showEduPopup(evt.edu);
}

function endEvent() {
    state.activeEvent = null;
    state.eventTimeLeft = 0;
    hideEventCard();
    hideEduPopup();
    state._eventGlucTotalDelta = 0;
    state._eventGlucTicksTotal = 0;
}

function showEventCard(evt, delta) {
    const card = $('eventCard');
    if (card) card.classList.add('active-event');
    $('eventIcon').textContent = evt.emoji;
    $('eventName').textContent = evt.name;
    $('eventDesc').textContent = evt.desc;
    const eff = $('eventEffect');
    if (delta > 0) {
        eff.textContent = `血糖値が徐々に上昇中… (+${delta})`;
        eff.className = 'event-card-effect effect-bad';
    } else if (delta < 0) {
        eff.textContent = `血糖値が徐々に下降中… (${delta})`;
        eff.className = 'event-card-effect effect-good';
    } else {
        eff.textContent = '特殊効果発動！';
        eff.className = 'event-card-effect effect-neutral';
    }
}
function hideEventCard() {
    const card = $('eventCard');
    if (card) card.classList.remove('active-event');
    $('eventIcon').textContent = '💤';
    $('eventName').textContent = '待機中...';
    $('eventDesc').textContent = '次のイベントを待っています。';
    $('eventEffect').textContent = '';
    $('eventTimerBar').style.width = '0%';
}
function updateEventTimer() {
    if (!state.activeEvent) return;
    const dur = state.activeEvent.duration * (state.effects.diseaseShorten && state.activeEvent.cat === 'disease' ? 0.7 : 1);
    const pct = (state.eventTimeLeft / dur) * 100;
    $('eventTimerBar').style.width = `${pct}%`;
}

function showEduPopup(text) {
    if (!text) return;
    $('eduPopup').style.display = '';
    $('eduPopupText').textContent = text;
}
function hideEduPopup() {
    $('eduPopup').style.display = 'none';
}

window.openEquipShop = function (slotIndex) {
    if (!state.gameRunning) return;

    // If the slot is currently occupied, clicking it will just unequip it first.
    if (state.equippedItems[slotIndex]) {
        unequipItem(slotIndex);
        return;
    }

    // Otherwise open the shop specifically to 'Owned' tab
    toggleShop(true);
    filterShop('owned');
};

// ========================
// HORMONE BUTTONS
// ========================
window.fireHormone = function (type) {
    if (state.cooldowns[type] > 0) return;
    if (!state.gameRunning) return;

    const stage = STAGES[state.stage];
    let mult = stage.hormoneMult;
    if (state.effects.hormoneBoost) mult *= (1 + state.effects.hormoneBoost);
    if (state._superModeTicks > 0) mult *= 2;
    if (state.effects.stableHormone) mult *= 1.1;

    let power = HORMONE_POWER[type] * mult;
    state.glucose = clamp(state.glucose + power, GLUCOSE_RANGE.min, GLUCOSE_RANGE.max);

    // Set cooldown
    let cd = HORMONE_COOLDOWN[type];
    if (state.effects.instantHormone) cd = Math.max(2, cd * 0.3);
    state.cooldowns[type] = cd;

    // Animate
    animateHormone(type);
    animatePancreasPulse(type);

    // Flash button
    const btn = $(`btn${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (btn) {
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => { btn.style.transform = ''; }, 150);
    }

    renderGauge();
    updateHUD();
};

function enableHormoneButtons(enabled) {
    ['Insulin', 'Glucagon', 'Adrenaline'].forEach(h => {
        const btn = $(`btn${h}`);
        if (btn) btn.disabled = !enabled;
    });
}

function updateCooldownBars() {
    const cds = { insulin: HORMONE_COOLDOWN.insulin, glucagon: HORMONE_COOLDOWN.glucagon, adrenaline: HORMONE_COOLDOWN.adrenaline };
    for (const h in state.cooldowns) {
        const pct = (state.cooldowns[h] / cds[h]) * 100;
        const bar = $(`cdBar${h.charAt(0).toUpperCase() + h.slice(1)}`);
        if (bar) bar.style.width = `${pct}%`;
        const btn = $(`btn${h.charAt(0).toUpperCase() + h.slice(1)}`);
        if (btn) btn.disabled = (state.cooldowns[h] > 0);
    }
}

// ========================
// GAUGE / UI RENDERING
// ========================
function renderGauge() {
    const g = state.glucose;
    const outerEl = $('gaugeOuter');
    if (!outerEl) return;

    // Ensure the bar container exists
    let barCont = outerEl.querySelector('.gauge-inner-bar');
    if (!barCont) {
        barCont = document.createElement('div');
        barCont.className = 'gauge-inner-bar';
        outerEl.innerHTML = '';
        outerEl.appendChild(barCont);

        // Safe zone marker
        const safeMarker = document.createElement('div');
        safeMarker.className = 'gauge-safe-zone-marker';
        barCont.appendChild(safeMarker);

        // Needle
        const needle = document.createElement('div');
        needle.className = 'gauge-needle';
        needle.id = 'gaugeNeedle2';
        barCont.appendChild(needle);

        // Labels
        const labels = document.createElement('div');
        labels.className = 'gauge-labels';
        labels.innerHTML = `
      <span class="gauge-label-low">低血糖<br>↓30</span>
      <div class="gauge-label-safe">
        <span>80 <span class="safe-zone-label">✅ 安全域 (80-120)</span> 120</span>
      </div>
      <span class="gauge-label-high">高血糖<br>400↑</span>
    `;
        outerEl.appendChild(labels);
    }

    // Needle position: map glucose (0-450) to 0-100%
    const pct = ((g - 0) / (450 - 0)) * 100;
    const needle = $('gaugeNeedle2') || $('gaugeNeedle');
    if (needle) needle.style.left = `calc(${clamp(pct, 0, 100)}% - 2px)`;

    // Color of glucose display
    const el = $('glucoseValue');
    if (!el) return;
    el.textContent = Math.round(g);
    if (g < DANGER_LOW || g > DANGER_HIGH) el.className = 'glucose-value danger';
    else if (g < SAFE_MIN || g > SAFE_MAX) el.className = 'glucose-value warning';
    else el.className = 'glucose-value safe';
}

function updateHUD() {
    const stage = STAGES[state.stage];
    const stageEl = $('hudStage');
    if (stageEl) {
        stageEl.textContent = `${stage.emoji} ${stage.name}`;
        stageEl.className = `hud-stage stage-${stage.id}`;
    }

    // Update game screen stage class (for background color)
    const gameScreen = $('screen-game');
    if (gameScreen) {
        gameScreen.classList.remove('stage-child', 'stage-adult', 'stage-elder');
        gameScreen.classList.add(`stage-${stage.id}`);
    }

    // Update LIVE badge
    const liveBadge = $('hudLiveBadge');
    if (!liveBadge) {
        const hud = document.querySelector('.hud-top');
        if (hud) {
            const badge = document.createElement('div');
            badge.id = 'hudLiveBadge';
            badge.className = 'hud-live-badge';
            badge.innerHTML = '<span class="hud-live-dot"></span>🟢 今ゲームを行っています';
            hud.insertBefore(badge, hud.firstChild);
        }
    }

    // Stage Progress
    const t = state.stageTime;
    const m = String(Math.floor(t / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');

    const label = $('hudProgressLabel');
    if (label) label.textContent = `進行度 ${m}:${s}`;

    // Progress bar fill (based on stage duration)
    const progressBar = $('hudProgressBar');
    if (progressBar) {
        let pct = (state.stageTime / stage.duration) * 100;
        pct = clamp(pct, 0, 100);
        progressBar.style.width = `${pct}%`;

        // Color transition based on progress
        if (pct < 33) {
            progressBar.style.background = '#00ff88'; // Green
        } else if (pct < 66) {
            progressBar.style.background = '#ffdd44'; // Yellow
        } else if (pct < 85) {
            progressBar.style.background = '#ff8c00'; // Orange
        } else {
            progressBar.style.background = '#ff2244'; // Red
        }
    }

    // Score
    $('hudScore').textContent = state.score.toLocaleString();

    // Combo
    $('hudCombo').textContent = `x${state.combo.toFixed(1)}`;
    const comboWrap = $('hudComboWrap');
    if (comboWrap) {
        comboWrap.style.opacity = state.combo > 1 ? '1' : '0.4';
    }

    // HP bar
    const maxHp = 100 + (state.effects.maxHpBonus || 0);
    const hpPct = (state.hp / maxHp) * 100;
    $('hpBar').style.width = `${clamp(hpPct, 0, 100)}%`;

    // Shop score
    const shopScoreEl = $('shopScore');
    if (shopScoreEl) shopScoreEl.textContent = state.score.toLocaleString();
}

function updateDangerOverlay() {
    const g = state.glucose;
    const highEl = $('dangerHigh'); const lowEl = $('dangerLow');
    if (!highEl || !lowEl) return;
    highEl.style.display = (g > SAFE_MAX) ? '' : 'none';
    lowEl.style.display = (g < SAFE_MIN) ? '' : 'none';

    // Animate intensity by how far out of range
    if (g > SAFE_MAX) {
        const intensity = Math.min(1, (g - SAFE_MAX) / 80);
        highEl.style.opacity = intensity;
    }
    if (g < SAFE_MIN) {
        const intensity = Math.min(1, (SAFE_MIN - g) / 40);
        lowEl.style.opacity = intensity;
    }
}

function updateBrainStatus() {
    const g = state.glucose;
    const inSafe = g >= SAFE_MIN && g <= SAFE_MAX;
    const brainEl = $('brainStatus');
    const pancreasEl = $('pancreasStatus');
    if (brainEl) brainEl.textContent = inSafe ? '監視中 ✅' : '⚠️ 異常を検知！';
    if (pancreasEl) {
        if (state.cooldowns.insulin > 0) pancreasEl.textContent = `インスリン放出中`;
        else if (state.cooldowns.glucagon > 0) pancreasEl.textContent = `グルカゴン放出中`;
        else pancreasEl.textContent = '待機中';
    }

    // Brain pulse color
    const brainOrgan = $('organBrain');
    if (brainOrgan) {
        brainOrgan.querySelector('ellipse').style.stroke = inSafe ? '#5588ff' : '#ff4444';
    }
}

// ========================
// TREND GRAPH
// ========================
function drawTrendGraph() {
    if (!trendCtx) return;
    const canvas = trendCtx.canvas;
    const w = canvas.width, h = canvas.height;
    trendCtx.clearRect(0, 0, w, h);

    // Background
    trendCtx.fillStyle = 'rgba(10,22,40,0.8)';
    trendCtx.fillRect(0, 0, w, h);

    // Safe zone band
    const safeY1 = h - ((SAFE_MAX - 0) / (450 - 0)) * h;
    const safeY2 = h - ((SAFE_MIN - 0) / (450 - 0)) * h;
    trendCtx.fillStyle = 'rgba(0,255,136,0.08)';
    trendCtx.fillRect(0, safeY1, w, safeY2 - safeY1);
    trendCtx.strokeStyle = 'rgba(0,255,136,0.3)';
    trendCtx.lineWidth = 1;
    trendCtx.setLineDash([4, 4]);
    trendCtx.beginPath(); trendCtx.moveTo(0, safeY1); trendCtx.lineTo(w, safeY1); trendCtx.stroke();
    trendCtx.beginPath(); trendCtx.moveTo(0, safeY2); trendCtx.lineTo(w, safeY2); trendCtx.stroke();
    trendCtx.setLineDash([]);

    if (state.glucoseHistory.length < 2) return;

    const hist = state.glucoseHistory.slice(-90);
    const step = w / (hist.length - 1);

    // Draw line
    trendCtx.beginPath();
    hist.forEach((v, i) => {
        const x = i * step;
        const y = h - ((v - 0) / (450 - 0)) * h;
        if (i === 0) trendCtx.moveTo(x, y);
        else trendCtx.lineTo(x, y);
    });
    trendCtx.strokeStyle = '#00e5ff';
    trendCtx.lineWidth = 2;
    trendCtx.stroke();

    // Current value dot
    const lastV = hist[hist.length - 1];
    const lastX = w - 2;
    const lastY = h - ((lastV - 0) / (450 - 0)) * h;
    trendCtx.beginPath();
    trendCtx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    trendCtx.fillStyle = lastV >= SAFE_MIN && lastV <= SAFE_MAX ? '#00ff88' : '#ff2244';
    trendCtx.fill();
}

// ========================
// SVG ANIMATIONS
// ========================
function animateBrainPulse() {
    const brainEl = document.getElementById('organBrain');
    if (!brainEl) return;
    // Pulse ring
    const ring = document.getElementById('brainPulseRing');
    if (ring) {
        ring.style.animation = 'none';
        void ring.offsetWidth;
        ring.style.animation = '';
        ring.style.opacity = '0.8';
        setTimeout(() => { ring.style.opacity = '0'; }, 1000);
    }
    // Send pulse down to pancreas
    spawnPulseSignal();
}

function spawnPulseSignal() {
    const container = document.getElementById('pulseSignals');
    if (!container) return;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', '#4488ff');
    circle.setAttribute('cx', '140');
    circle.setAttribute('cy', '74');
    circle.style.filter = 'drop-shadow(0 0 4px #2266ff)';
    container.appendChild(circle);

    // Animate along path: brain(140,74) -> stomach (140,170) -> pancreas(155,226)
    const pathPts = [
        { x: 140, y: 74 }, { x: 140, y: 110 }, { x: 140, y: 150 }, { x: 140, y: 170 }, { x: 148, y: 200 }, { x: 155, y: 226 }
    ];
    let idx = 0;
    const move = () => {
        if (idx >= pathPts.length) { circle.remove(); return; }
        circle.setAttribute('cx', pathPts[idx].x);
        circle.setAttribute('cy', pathPts[idx].y);
        idx++;
        setTimeout(move, 80);
    };
    move();
}

function animatePancreasPulse(type) {
    const ring = document.getElementById('pancreasPulseRing');
    if (!ring) return;
    ring.setAttribute('stroke', type === 'insulin' ? '#00e5ff' : type === 'glucagon' ? '#ff8c00' : '#ff2244');
    ring.style.opacity = '0.9';

    let rx = 30, ry = 14;
    const expand = setInterval(() => {
        rx += 3; ry += 2;
        ring.setAttribute('rx', rx);
        ring.setAttribute('ry', ry);
        ring.style.opacity = String(parseFloat(ring.style.opacity) - 0.1);
        if (parseFloat(ring.style.opacity) <= 0) {
            clearInterval(expand);
            ring.setAttribute('rx', '30'); ring.setAttribute('ry', '14');
            ring.style.opacity = '0';
        }
    }, 50);

    // Spawn hormone particles
    spawnHormoneParticles(type);
}

function spawnHormoneParticles(type) {
    const container = document.getElementById('hormoneParticles');
    if (!container) return;
    const color = type === 'insulin' ? '#00e5ff' : type === 'glucagon' ? '#ff8c00' : '#ff2244';

    for (let i = 0; i < 5; i++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', '3');
        c.setAttribute('cx', '155');
        c.setAttribute('cy', '240');
        c.setAttribute('fill', color);
        c.style.filter = `drop-shadow(0 0 3px ${color})`;
        container.appendChild(c);

        const targetX = 140 + (Math.random() - 0.5) * 60;
        const targetY = 150 + Math.random() * 60;
        let px = 155, py = 240;
        const dx = (targetX - px) / 15, dy = (targetY - py) / 15;
        let steps = 0;
        const mv = setInterval(() => {
            steps++;
            px += dx; py += dy;
            c.setAttribute('cx', px);
            c.setAttribute('cy', py);
            c.style.opacity = String(1 - steps / 16);
            if (steps >= 15) { clearInterval(mv); c.remove(); }
        }, 50);
    }
}

function animateEvent(evt) {
    if (evt.cat === 'food') animateFoodParticles(evt);
    else if (evt.cat === 'exercise') animateSugarConsumption();
    else animateStressEffect();
}

function animateFoodParticles(evt) {
    const container = document.getElementById('foodParticles');
    if (!container) return;
    // Food emoji near mouth (140, 108)
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '160'); text.setAttribute('y', '100');
    text.setAttribute('font-size', '20'); text.textContent = evt.emoji;
    container.appendChild(text);
    // Move into mouth, then spawn sugar particles
    let y = 100, opacity = 1;
    const mv = setInterval(() => {
        y += 1.5; opacity -= 0.07;
        text.setAttribute('y', y);
        text.style.opacity = opacity;
        if (opacity <= 0) { clearInterval(mv); text.remove(); spawnSugarParticles(5); }
    }, 40);
}

function spawnSugarParticles(count) {
    const container = document.getElementById('sugarParticles');
    if (!container) return;
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('r', '4');
            c.setAttribute('cx', '135');
            c.setAttribute('cy', '190');
            c.setAttribute('fill', '#ffdd44');
            c.style.filter = 'drop-shadow(0 0 3px #ffaa00)';
            container.appendChild(c);
            // Flow toward blood vessel area
            const targetX = 130 + (Math.random() - 0.5) * 80;
            const targetY = 230 + Math.random() * 80;
            let px = 135, py = 190, steps = 0;
            const dx = (targetX - px) / 20, dy = (targetY - py) / 20;
            const mv = setInterval(() => {
                steps++; px += dx; py += dy;
                c.setAttribute('cx', px); c.setAttribute('cy', py);
                c.style.opacity = String(1 - steps / 22);
                if (steps >= 20) { clearInterval(mv); c.remove(); }
            }, 60);
        }, i * 100);
    }
}

function animateSugarConsumption() {
    // Shrink existing sugar particles (exercise burns glucose)
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const svg = document.getElementById('sugarParticles');
    if (svg) {
        text.setAttribute('x', '100'); text.setAttribute('y', '280');
        text.setAttribute('font-size', '14'); text.setAttribute('fill', '#00ff88');
        text.textContent = '🏃 燃焼中!';
        svg.appendChild(text);
        setTimeout(() => text.remove(), 2000);
    }
}

function animateStressEffect() {
    const brainEl = document.getElementById('organBrain');
    if (!brainEl) return;
    // Flash red
    const ellipse = brainEl.querySelector('ellipse');
    if (!ellipse) return;
    const orig = ellipse.getAttribute('stroke');
    ellipse.setAttribute('stroke', '#ff2244');
    setTimeout(() => ellipse.setAttribute('stroke', orig || '#5588ff'), 800);
}

// ========================
// STAGE TRANSITIONS
// ========================
function triggerStageTransition() {
    state.gameRunning = false;
    clearInterval(gameLoopInterval);
    transitionMode = true;

    const stage = STAGES[state.stage];
    const nextStage = STAGES[state.stage + 1];

    $('transitionEmoji').textContent = stage.emoji;
    $('transitionTitle').textContent = `${stage.name} 突破！`;
    $('transitionBody').textContent = stage.desc;
    $('transitionScore').textContent = `現在のスコア: ${state.score.toLocaleString()} HP`;

    // Stats
    const statsEl = $('transitionStats');
    if (statsEl) {
        const inSafeCount = state.glucoseHistory.filter(v => v >= SAFE_MIN && v <= SAFE_MAX).length;
        const safePct = state.glucoseHistory.length > 0 ? Math.round(inSafeCount / state.glucoseHistory.length * 100) : 0;
        statsEl.innerHTML = `
          <div class="stat-item"><span class="stat-v">${safePct}%</span><span class="stat-k">安全域滞在率</span></div>
          <div class="stat-item"><span class="stat-v">${state.combo.toFixed(1)}x</span><span class="stat-k">最終コンボ</span></div>
          <div class="stat-item"><span class="stat-v">${Math.round(state.hp)}%</span><span class="stat-k">残体力</span></div>
        `;
    }

    const hintEl = $('transitionNextHint');
    if (hintEl && nextStage) {
        hintEl.innerHTML = `<strong>次: ${nextStage.emoji} ${nextStage.name}</strong> — ${nextStage.desc}`;
    } else if (hintEl) {
        hintEl.textContent = 'いよいよ最終ステージ！全力で恒常性を守れ！';
    }

    // Burst effect
    spawnTransitionBurst();

    _switchScreen('screen-transition');
}

function spawnTransitionBurst() {
    const burst = $('transitionBurst');
    if (!burst) return;
    burst.innerHTML = '';
    const colors = ['#00ff88', '#00e5ff', '#ffd700', '#ff8c00', '#ff44aa'];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const angle = Math.random() * 360;
        const dist = 100 + Math.random() * 200;
        p.style.cssText = `
          position:absolute; width:8px; height:8px; border-radius:50%;
          background:${color}; left:50%; top:50%;
          animation: burstParticle 1s ease-out forwards;
          --dx:${Math.cos(angle * Math.PI / 180) * dist}px;
          --dy:${Math.sin(angle * Math.PI / 180) * dist}px;
          animation-delay:${Math.random() * 0.2}s;
        `;
        burst.appendChild(p);
    }
}

window.proceedToNextStage = function () {
    if (!transitionMode) return; // Prevent double clicking

    if (state.stage >= STAGES.length - 1) {
        triggerEnding();
        return;
    }
    state.stage++;
    state.stageTime = 0;
    state.gameRunning = true;
    transitionMode = false;
    const ns = STAGES[state.stage];
    nextEventTimer = randInt(ns.eventFreqMin * 4, ns.eventFreqMax * 4);

    const stage = STAGES[state.stage];
    // Countdown for next stage
    $('cdStageBadge').textContent = `${stage.emoji} ${stage.name} スタート！`;
    $('cdTip').textContent = stage.id === 'adult'
        ? '成人期：イベントが激化します！ショップで装備を固めましょう。'
        : '高齢期：ホルモンの効きが落ちます。装備フル活用で乗り切れ！';
    _switchScreen('screen-countdown');

    let count = 3;
    $('cdNumber').textContent = count;
    $('cdNumber').style.color = '';
    const tick = setInterval(() => {
        count--;
        const numEl = $('cdNumber');
        if (count > 0) {
            numEl.textContent = count;
            numEl.style.animation = 'none';
            void numEl.offsetWidth;
            numEl.style.animation = 'cdPop 0.6s ease-out';
        } else {
            clearInterval(tick);
            numEl.textContent = 'GO!';
            numEl.style.color = '#00ff88';
            numEl.style.animation = 'none';
            void numEl.offsetWidth;
            numEl.style.animation = 'cdPop 0.6s ease-out';
            setTimeout(() => {
                _switchScreen('screen-game');
                updateHUD();
                clearInterval(gameLoopInterval);
                gameLoopInterval = setInterval(gameTick, TICK_MS);
                showToast(`${stage.emoji} ${stage.name} 開始！`, 'info');
            }, 800);
        }
    }, 1000);
};

window.openShopFromTransition = function () {
    state.shopOpenDuringTransition = true;
    toggleShop();
};

// ========================
// GAME OVER & ENDING
// ========================
function getScoreRank(score) {
    if (score >= 80000) return { rank: 'S', label: '🌟 ホメオスタシスの神', color: '#ffd700' };
    if (score >= 50000) return { rank: 'A', label: '⭐ ホルモン・マスター', color: '#00ff88' };
    if (score >= 25000) return { rank: 'B', label: '💙 恒常性の守護者', color: '#00e5ff' };
    if (score >= 10000) return { rank: 'C', label: '🟡 血糖値バランサー', color: '#ffcc00' };
    return { rank: 'D', label: '🔴 体内環境は不安定…', color: '#ff6644' };
}

function triggerGameOver(reason) {
    state.gameRunning = false;
    clearInterval(gameLoopInterval);

    const stageName = STAGES[state.stage].name;
    const stageEmoji = STAGES[state.stage].emoji;

    let reasonText, eduText, emoji;
    if (reason === 'HP') {
        emoji = '💔';
        reasonText = `体力が尽きてしまいました。血糖値が乱れ続け、臓器に深刻なダメージが蓄積しました。`;
        eduText = '💡 血糖値が80〜120mg/dLの安全域を外れると、血管・神経・内臓がダメージを受けます。高血糖が続く「糖尿病」は失明・腎不全・壊疽などの合併症の主因です。インスリンやグルカゴンを使った素早い対処が命を救います！';
    } else if (reason === '低血糖') {
        emoji = '😵';
        reasonText = `血糖値が${DANGER_LOW}mg/dL以下まで急落しました。脳への糖供給が止まり、意識を失いました。`;
        eduText = `💡 低血糖（50mg/dL以下）では脳のエネルギーが枯渇します。すい臓α細胞から「グルカゴン」を分泌させ、肝臓のグリコーゲンをブドウ糖に分解することで血糖を回復できます！`;
    } else {
        emoji = '🔥';
        reasonText = `血糖値が${DANGER_HIGH}mg/dL以上に急騰しました。血管に糖が溢れ、多臓器が機能不全に陥りました。`;
        eduText = `💡 高血糖（180mg/dL以上）は「糖毒性」として血管内皮を傷つけます。インスリンが不足・機能不全を起こした状態が糖尿病です。すい臓のβ細胞からインスリンが正常に分泌されることがいかに大切かわかりましたか？`;
    }

    $('gameoverEmoji').textContent = emoji;
    $('gameoverStageReached').textContent = `到達ステージ: ${stageEmoji} ${stageName}`;
    $('gameoverReason').textContent = reasonText;
    $('gameoverEdu').textContent = eduText;
    $('gameoverScore').textContent = state.score.toLocaleString() + ' HP';

    const rank = getScoreRank(state.score);
    const rankEl = $('gameoverRank');
    if (rankEl) rankEl.innerHTML = `<span style="color:${rank.color};font-size:1.2rem;font-weight:900">RANK ${rank.rank}</span> ${rank.label}`;

    spawnGameoverParticles();
    _switchScreen('screen-gameover');
}

function spawnGameoverParticles() {
    const container = $('gameoverParticles');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.style.cssText = `
          position:absolute;
          width:${2 + Math.random() * 4}px; height:${20 + Math.random() * 60}px;
          background:rgba(255,34,68,${0.2 + Math.random() * 0.3});
          left:${Math.random() * 100}%;
          top:${Math.random() * 100}%;
          border-radius:2px;
          animation: floatUp ${3 + Math.random() * 4}s ease-in-out infinite;
          animation-delay:${Math.random() * 3}s;
        `;
        container.appendChild(p);
    }
}

function triggerEnding() {
    state.gameRunning = false;
    clearInterval(gameLoopInterval);

    let stars = '⭐';
    if (state.score > 80000) stars = '⭐⭐⭐';
    else if (state.score > 40000) stars = '⭐⭐';

    $('endingStars').textContent = stars;
    $('endingScore').textContent = state.score.toLocaleString() + ' HP';
    $('endingBody').textContent = `幼少期から高齢期まで、血糖値の恒常性を守り抜きました！かかった時間: ${Math.floor(state.totalTime / 60)}分${state.totalTime % 60}秒`;

    const rank = getScoreRank(state.score);
    const rankEl = $('endingRank');
    if (rankEl) rankEl.innerHTML = `<span style="color:${rank.color};font-size:1.4rem;font-weight:900">RANK ${rank.rank}</span> <span style="color:${rank.color}">${rank.label}</span>`;

    $('endingEduSummary').innerHTML = `
        <h4>🎓 今日学んだこと</h4>
        <p>
          ✅ <strong>恒常性（ホメオスタシス）</strong>：体の内部環境を一定に保つ仕組み。<br>
          ✅ <strong>インスリン</strong>：すい臓β細胞から分泌。血液中のブドウ糖を細胞に取り込ませ、血糖値を下げる。<br>
          ✅ <strong>グルカゴン</strong>：すい臓α細胞から分泌。肝臓グリコーゲンを分解して血糖値を上げる。<br>
          ✅ <strong>アドレナリン</strong>：副腎髄質から分泌。緊急時に血糖値を素早く上昇させる。<br>
          ✅ <strong>間脳（視床下部）</strong>：体内異常を検知してホルモン分泌の指令を出す司令塔。<br>
          ✅ <strong>老化</strong>：ホルモン反応の低下・すい臓機能の衰えにより血糖コントロールが難しくなる。
        </p>
    `;

    spawnEndingFireworks();
    _switchScreen('screen-ending');
}

function spawnEndingFireworks() {
    const container = $('endingFireworks');
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#ffd700', '#ff8c00', '#00ff88', '#00e5ff', '#ff44aa', '#aa44ff'];
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        p.style.cssText = `
          position:absolute;
          width:${4 + Math.random() * 6}px; height:${4 + Math.random() * 6}px;
          border-radius:50%;
          background:${color};
          left:${Math.random() * 100}%;
          top:${Math.random() * 60}%;
          animation: fireworkFall ${2 + Math.random() * 3}s ease-in forwards;
          animation-delay:${Math.random() * 2}s;
          box-shadow: 0 0 6px ${color};
        `;
        container.appendChild(p);
    }
    // Repeat fireworks
    setTimeout(spawnEndingFireworks, 4000);
}

// ========================
// SHOP SYSTEM
// ========================
window.toggleShop = function () {
    const overlay = $('shopOverlay');
    if (!overlay) return;
    const isOpen = overlay.style.display !== 'none';
    overlay.style.display = isOpen ? 'none' : '';
    if (!isOpen) {
        state.gamePaused = true;
        updateShopPanel();
        $('shopScore').textContent = state.score.toLocaleString();
    } else {
        state.gamePaused = false;
        state.shopOpenDuringTransition = false;
    }
};

window.filterShop = function (cat) {
    state.shopFilter = cat;
    document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
    const tab = document.getElementById(`tab-${cat}`);
    if (tab) tab.classList.add('active');
    updateShopPanel();
};

function updateShopPanel() {
    const grid = $('shopItemsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    let items = SHOP_ITEMS;
    if (state.shopFilter === 'owned') {
        items = items.filter(i => state.ownedItems.includes(i.id));
    } else if (state.shopFilter !== 'all') {
        items = items.filter(i => i.cat === state.shopFilter || i.rank === '伝説' && state.shopFilter === 'legendary');
    }

    items.forEach(item => {
        const owned = state.ownedItems.includes(item.id);
        const equipped = state.equippedItems.includes(item.id);
        const discount = state.effects.shopDiscount || 0;
        const price = Math.round(item.price * (1 - discount));
        const cantAfford = !owned && state.score < price;

        const card = document.createElement('div');
        card.className = `shop-item-card${owned ? ' owned' : ''}${cantAfford ? ' cant-afford' : ''}${equipped ? ' equipped' : ''}`;
        card.innerHTML = `
      <div class="shop-item-rank rank-${item.rank}">${item.rank}</div>
      <div class="shop-item-icon">${item.emoji}</div>
      <div class="shop-item-name">${item.name}</div>
      <div class="shop-item-effect">${item.effect}</div>
      <div class="shop-item-price">${price.toLocaleString()} HP</div>
      <div class="shop-item-status ${equipped ? 'status-equipped' : owned ? 'status-equip' : ''}">
        ${equipped ? '✅ 装備中' : owned ? '💾 装着する' : ''}
      </div>
    `;

        if (!cantAfford || owned) {
            card.addEventListener('click', () => handleShopItemClick(item, price));
        }
        grid.appendChild(card);
    });
}

function handleShopItemClick(item, price) {
    const owned = state.ownedItems.includes(item.id);
    const equipped = state.equippedItems.includes(item.id);

    if (equipped) {
        showToast(`${item.emoji} ${item.name}は既に装備中です！`, 'info');
        return;
    }
    if (!owned) {
        // Purchase
        if (state.score < price) { showToast('スコアが足りません！', 'warning'); return; }
        state.score -= price;
        state.ownedItems.push(item.id);
        showToast(`${item.emoji} ${item.name} を購入しました！`, 'success');
        addScore(0); // update display
    }
    // Equip
    const emptySlot = state.equippedItems.findIndex(s => s === null);
    if (emptySlot === -1) {
        showToast('装備スロットが満杯です！先に外してください。', 'warning');
        return;
    }
    state.equippedItems[emptySlot] = item.id;
    // Apply effect
    state.effects = {};
    state.equippedItems.filter(Boolean).forEach(id => {
        const it = SHOP_ITEMS.find(i => i.id === id);
        if (it && it.effectFn) it.effectFn(state);
    });

    updateEquipSlots();
    updateEffectsList();
    updateShopPanel();
    showToast(`${item.emoji} ${item.name} を装着しました！`, 'success');
}

window.unequipItem = function (slotIdx) {
    const id = state.equippedItems[slotIdx];
    if (!id) return;
    const item = SHOP_ITEMS.find(i => i.id === id);
    state.equippedItems[slotIdx] = null;
    // Recompute effects
    state.effects = {};
    state.equippedItems.filter(Boolean).forEach(eid => {
        const it = SHOP_ITEMS.find(i => i.id === eid);
        if (it && it.effectFn) it.effectFn(state);
    });
    updateEquipSlots();
    updateEffectsList();
    updateShopPanel();
    if (item) showToast(`${item.emoji} ${item.name} を外しました。`, 'info');
};

function updateEquipSlots() {
    state.equippedItems.forEach((id, i) => {
        const slot = $(`slot${i}`);
        if (!slot) return;
        if (id) {
            const item = SHOP_ITEMS.find(it => it.id === id);
            slot.classList.add('filled');
            slot.innerHTML = `<span class="slot-icon">${item.emoji}</span><span class="slot-name">${item.name}</span>`;
        } else {
            slot.classList.remove('filled');
            slot.innerHTML = '<span class="slot-empty">空</span><span class="slot-empty click-hint">装備する</span>';
        }
    });
}

function updateEffectsList() {
    const list = $('effectsList');
    if (!list) return;
    const effs = state.equippedItems.filter(Boolean).map(id => {
        const item = SHOP_ITEMS.find(i => i.id === id);
        return item ? `<div class="effect-item">${item.emoji} ${item.effect}</div>` : '';
    });
    list.innerHTML = effs.length ? effs.join('') : '<span class="no-effects">なし</span>';
}

// ========================
// NOTIFICATIONS
// ========================
function addScore(pts) {
    state.score += pts;
    if (state.score < 0) state.score = 0;

    if (pts > 50) {
        const pop = $('scorePop');
        if (pop) {
            pop.textContent = `+${pts}`;
            pop.className = 'score-pop popping';
            setTimeout(() => { pop.className = 'score-pop'; }, 1200);
        }
    }
}

function showToast(msg, type = 'info') {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderColor = type === 'success' ? '#00ff88' : type === 'warning' ? '#ffcc00' : '#2a8eff';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
}

// ========================
// INITIALIZATION
// ========================
document.addEventListener('DOMContentLoaded', () => {
    _switchScreen('screen-title');
    initTitleParticles();
});

