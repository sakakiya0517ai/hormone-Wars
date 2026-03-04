// ===================================
// HORMONE WARS - GAME ENGINE (game.js)
// ===================================

// ---- GAME STATE ----
const state = {
    glucose: 100,
    hp: 100,
    score: 0,
    combo: 1.0,
    comboTicks: 0,
    stage: 0, // 0=child, 1=adult, 2=elder
    stageTime: 0,       // seconds in current stage
    totalTime: 0,       // total seconds
    gameRunning: false,
    gamePaused: false,
    glucoseHistory: [],
    activeEvent: null,
    eventTimeLeft: 0,
    cooldowns: { insulin: 0, glucagon: 0, adrenaline: 0 },
    effects: {},        // active item effects
    equippedItems: [null, null, null],
    ownedItems: [],
    shopFilter: 'all',
    brainAlert: false,
    immunityToNextDisease: false,
    shopOpenDuringTransition: false,
};

const STAGES = [
    { id: '10s', name: '10代', emoji: '🧑‍🎓', duration: 40, hormoneMult: 1.5, eventFreqMin: 1.5, eventFreqMax: 2.5, desc: '成長期で代謝も活発。どんな無茶な生活でもすぐ立て直せる！', bgColor: 'rgba(0,180,100,0.06)', accentColor: '#00ff88' },
    { id: '20s', name: '20代', emoji: '🏢', duration: 40, hormoneMult: 1.2, eventFreqMin: 1.0, eventFreqMax: 2.0, desc: '社会人デビュー。飲み会や残業などで生活リズムが急に乱れ始める。', bgColor: 'rgba(0,140,200,0.06)', accentColor: '#00e5ff' },
    { id: '30s', name: '30代', emoji: '💼', duration: 40, hormoneMult: 1.0, eventFreqMin: 1.0, eventFreqMax: 2.0, desc: '仕事の責任が増え、運動不足に。少しずつ数値が気になり出す頃。', bgColor: 'rgba(30,80,220,0.06)', accentColor: '#3388ff' },
    { id: '40s', name: '40代', emoji: '😫', duration: 40, hormoneMult: 0.9, eventFreqMin: 0.8, eventFreqMax: 1.5, desc: '代謝の低下を実感。同じように食べているだけなのに…', bgColor: 'rgba(80,50,180,0.06)', accentColor: '#8855ff' },
    { id: '50s', name: '50代', emoji: '🩺', duration: 40, hormoneMult: 0.8, eventFreqMin: 0.8, eventFreqMax: 1.5, desc: '更年期や健康診断の恐怖。病気イベントの危険性が高まる。', bgColor: 'rgba(120,40,140,0.06)', accentColor: '#cc44ff' },
    { id: '60s', name: '60代', emoji: '🎌', duration: 40, hormoneMult: 0.7, eventFreqMin: 1.0, eventFreqMax: 2.0, desc: '定年退職。ストレスは減るが運動量も激減。すい臓もかなりお疲れ。', bgColor: 'rgba(150,50,80,0.06)', accentColor: '#ff4488' },
    { id: '70s', name: '70代', emoji: '👴', duration: 40, hormoneMult: 0.55, eventFreqMin: 1.2, eventFreqMax: 2.5, desc: 'インスリンのでが悪くなる。間脳の指令ミスによる操作停止に注意！', bgColor: 'rgba(180,60,40,0.06)', accentColor: '#ff6644' },
    { id: '80s', name: '80代+', emoji: '🙏', duration: 40, hormoneMult: 0.4, eventFreqMin: 1.5, eventFreqMax: 3.0, desc: '最終ステージ！血管は熟成し、あらゆる機能が低下。気合で生き抜け！', bgColor: 'rgba(120,30,10,0.06)', accentColor: '#ff3311' }
];

const HORMONE_COOLDOWN = { insulin: 0.5, glucagon: 0.5, adrenaline: 3.0 };
const HORMONE_POWER = { insulin: -4, glucagon: 4, adrenaline: 10 };
const SAFE_MIN = 80, SAFE_MAX = 120;
const DANGER_LOW = 30, DANGER_HIGH = 400;
const GLUCOSE_RANGE = { min: 0, max: 450 };
const TICK_MS = 250;                        // ゲームループ間隔
const HP_DANGER_RATE = 2.0 / 4;            // HP損失/tick
const BASE_SCORE_PER_SEC = 25 / 4;         // スコア/tick


// ---- EVENTS DATABASE ----
const EVENTS = [
    // --- 若年層向け (10s, 20s) ---
    { id: 'cake', emoji: '🍰', name: 'ショートケーキの暴力', stages: ['10s', '20s', '30s'], weight: 1.2, cat: 'food', desc: '胃袋が真っ白に染まる糖分。血糖値が爆速で上昇！', glucDelta: +120, duration: 8, effectType: 'bad', edu: '食品の糖質は消化によりブドウ糖になります。甘いお菓子は特に急上昇しやすい！' },
    { id: 'energy', emoji: '⚡', name: '魔のエナジードリンク', stages: ['10s', '20s'], weight: 1.0, cat: 'food', desc: '翼を授かった代償に…数秒後に血糖値クラッシュ！', glucDelta: +150, duration: 6, effectType: 'bad', edu: '液体の糖は固形食より吸収が速く、強烈な血糖スパイクを引き起こします。' },
    { id: 'ramen', emoji: '🍜', name: '深夜のヤサイマシマシラーメン', stages: ['10s', '20s', '30s'], weight: 1.0, cat: 'food', desc: '脂と糖の暴力。血糖値が未知の領域へ突入！', glucDelta: +180, duration: 12, effectType: 'bad', edu: '麺類は糖質が多く、大盛りや深夜の摂取は急上昇の最大要因になります。' },
    { id: 'skip', emoji: '😴', name: '絶望の朝食抜き', stages: ['10s', '20s', '30s'], weight: 1.0, cat: 'food', desc: 'お腹が鳴るたびに血糖値が下がる。次の食事でドカンと来るぞ！', glucDelta: -60, duration: 10, effectType: 'bad', edu: '朝食抜きで血糖が下がりすぎると、次の食事で急上昇（リバウンド）しやすくなります！' },
    { id: 'dash', emoji: '🚨', name: '遅刻確定の全力疾走', stages: ['10s', '20s'], weight: 1.2, cat: 'exercise', desc: 'アドレナリン全開！低血糖気味のときはマジで白目。', glucDelta: -80, duration: 5, effectType: 'good', edu: '激しい運動ではアドレナリンが大量分泌され、糖が緊急消費されます。' },
    { id: 'playground', emoji: '🛝', name: '部活のハードトレーニング', stages: ['10s'], weight: 1.4, cat: 'exercise', desc: '限界突破！若さゆえの驚異的な体力消費。', glucDelta: -100, duration: 10, effectType: 'good', edu: '10代は筋肉のグリコーゲン消費が非常に活発で、激しい運動中は血糖が急低下します。' },

    // --- 中年層向け (30s, 40s, 50s) ---
    { id: 'midnight', emoji: '🍻', name: '終わらない飲み会', stages: ['30s', '40s', '50s'], weight: 1.1, cat: 'food', desc: 'アルコールと〆のラーメンのコンボ。内臓が悲鳴を上げる。', glucDelta: +160, duration: 12, effectType: 'bad', edu: 'アルコールは肝臓での糖新生を抑える一方、一緒に食べるおつまみで乱れやすくなります。' },
    { id: 'overtime', emoji: '🌙', name: '寝落ちによる48時間労働（感覚）', stages: ['20s', '30s', '40s'], weight: 1.1, cat: 'stress', desc: 'インスリンの効きが「やる気のないバイト」並みに低下。', glucDelta: +90, duration: 14, effectType: 'bad', edu: '睡眠不足や過労はインスリン抵抗性を高め、血糖値が下がりにくくなります！' },
    { id: 'meeting', emoji: '📊', name: '誰も聞いていない会議（3時間）', stages: ['30s', '40s', '50s'], weight: 1.0, cat: 'stress', desc: '精神的苦痛で血糖がじわじわ上昇。眠気との戦い。', glucDelta: +60, duration: 15, effectType: 'bad', edu: '慢性的なストレスはコルチゾールを持続的に分泌させ、血糖を上昇させます。' },
    { id: 'gym', emoji: '💪', name: '週末だけの謎の筋トレ', stages: ['30s', '40s'], weight: 1.0, cat: 'exercise', desc: '急な過負荷でアドレナリンが爆発。', glucDelta: +30, duration: 8, effectType: 'neutral', edu: '無酸素運動では一時的にアドレナリンが出て血糖が上がりますが、その後の代謝はUPします。' },
    { id: 'deadline', emoji: '⏰', name: '締め切り3分前！！', stages: ['20s', '30s', '40s'], weight: 1.4, cat: 'stress', desc: 'コーヒー5杯目。手が震えて数値が乱高下！', glucDelta: +110, duration: 6, effectType: 'bad', edu: '極度の緊張とカフェインの過剰摂取はアドレナリン様作用で強烈なスパイクをもたらします。' },
    { id: 'backpain', emoji: '😩', name: '謎の腰痛', stages: ['40s', '50s', '60s'], weight: 1.0, cat: 'disease', desc: '痛くて動けない。血糖値が下げ止まる。', glucDelta: +70, duration: 12, effectType: 'bad', edu: '運動不足（安静）が続くと筋肉によるブドウ糖消費が減り血糖が上がりやすくなります。', hpDmg: 15 },
    { id: 'stomachache', emoji: '🚽', name: 'トイレとお友達（胃腸炎）', stages: ['10s', '30s', '50s'], weight: 0.8, cat: 'disease', desc: '何も食べられない。体力と血糖値が奈落へ共に落ちる。', glucDelta: -110, duration: 15, effectType: 'bad', edu: '胃腸炎で食事が取れないと血糖が極端に下がることも。グルカゴンが必要なサインです！', hpDmg: 20 },

    // --- 高齢層向け (60s, 70s, 80s) ---
    { id: 'metabolism', emoji: '🐢', name: '代謝の定時退社', stages: ['50s', '60s', '70s', '80s'], weight: 1.5, cat: 'aging', desc: '糖を燃やす細胞たちが「お疲れ様でしたー」と帰宅。', glucDelta: +100, duration: 15, effectType: 'bad', edu: '加齢とともに基礎代謝が低下し、同じ量を食べても血糖が非常に上がりやすくなります。' },
    { id: 'vessel', emoji: '🫀', name: '血管のサビ（熟成）', stages: ['60s', '70s', '80s'], weight: 1.4, cat: 'aging', desc: 'ホルモンが目的地にたどり着けない。', glucDelta: +90, duration: 18, effectType: 'bad', edu: '動脈硬化が進むとホルモンが体内を循環しにくくなります。血管の健康がカギ！' },
    { id: 'pancreas_tired', emoji: '😮‍💨', name: 'すい臓のストライキ', stages: ['60s', '70s', '80s'], weight: 1.5, cat: 'aging', desc: '大惨事。インスリン工場が閉鎖寸前！', glucDelta: +130, duration: 16, effectType: 'bad', edu: '長期的な血糖コントロール不良や加齢はすい臓β細胞を疲弊させ、インスリン分泌が著しく落ちます。' },
    { id: 'forget', emoji: '🤔', name: 'なぜこの部屋に来たか忘れる', stages: ['70s', '80s'], weight: 1.3, cat: 'aging', desc: '間脳の通信エラー。操作が効かなくなるぞ！', glucDelta: +40, duration: 8, effectType: 'bad', edu: '高齢になると視床下部（間脳）の機能が低下し、神経系のホルモン調節が鈍くなります。', brainMiss: true },
    { id: 'grandma', emoji: '👵', name: 'エンドレス餅', stages: ['60s', '70s', '80s'], weight: 1.0, cat: 'food', desc: 'お正月が終わらない。怒涛の糖質攻撃。', glucDelta: +140, duration: 14, effectType: 'bad', edu: '餅などは非常に糖質密度が高く、一気に食べると強烈な高血糖を引き起こします。' },
    { id: 'knee_pain', emoji: '🦵', name: '膝が笑っている（本当に）', stages: ['60s', '70s', '80s'], weight: 1.2, cat: 'aging', desc: '歩くのが億劫になる。運動量がゼロに。', glucDelta: +80, duration: 14, effectType: 'bad', edu: '関節痛による運動不足は高齢者の血糖コントロールを急激に悪化させます。', hpDmg: 20 },
    { id: 'grandchild', emoji: '👐', name: '孫からの肩たたき券', stages: ['60s', '70s', '80s'], weight: 1.0, cat: 'aging', desc: '極上の癒やし。自律神経が整い体力が大回復！', glucDelta: -20, duration: 5, effectType: 'good', edu: '精神的な満足感はストレスホルモンを減らし、自律神経を整えます。幸福感は健康の基礎！', hpHeal: 40 },

    // --- 全年代共通 (回復/特殊) ---
    { id: 'salad', emoji: '🥗', name: '申し訳程度のサラダボウル', weight: 0.8, cat: 'food', desc: '気休めの野菜。上昇は穏やか。', glucDelta: +20, duration: 6, effectType: 'good', edu: '食物繊維は糖の吸収を遅らせます。野菜を先に食べると血糖スパイクを抑えられます！' },
    { id: 'walk', emoji: '🚶', name: 'あてのない長距離散歩', weight: 1.0, cat: 'exercise', desc: '悟りを開きながら血糖値を安定させる。', glucDelta: -40, duration: 12, effectType: 'good', edu: '散歩などの軽い有酸素運動は血糖値を長時間かけて安定させる効果があります。' },
    { id: 'cat_video', emoji: '🐱', name: '猫動画による癒やし', weight: 0.8, cat: 'lifestyle', desc: '脳内麻薬（エンドルフィン）でホッとする。', glucDelta: -10, duration: 7, effectType: 'good', edu: 'リラックスすると副交感神経が優位になりホルモンバランスが整います！', hpHeal: 10 },
    { id: 'hero_mode', emoji: '🦸', name: '火事場の馬鹿力（物理）', weight: 0.3, cat: 'special', desc: '体力ギリギリで全ホルモンが限界突破のフルパワー！', glucDelta: 0, duration: 6, effectType: 'good', edu: '極度のストレス時には副腎からアドレナリンが大量分泌されます。これが「火事場の馬鹿力」！', superMode: true },
];

// ---- SHOP ITEMS DATABASE (50 items) ----
const SHOP_ITEMS = [
    // --- 初級 (500-1500) ---
    { id: 'multivitamin', emoji: '💊', name: 'マルチビタミンサプリ', cat: 'supplement', rank: '初級', price: 500, effect: 'HPの自然減少を5%緩和', effectFn: s => { s.effects.hpDecayReduce = (s.effects.hpDecayReduce || 0) + 0.05; } },
    { id: 'fiber', emoji: '🌾', name: '難消化性デキストリン', cat: 'supplement', rank: '初級', price: 600, effect: '食事スパイクを10%抑制', effectFn: s => { s.effects.spikeReduce = (s.effects.spikeReduce || 0) + 0.10; } },
    { id: 'pillow', emoji: '🛏', name: '安眠枕', cat: 'lifestyle', rank: '初級', price: 700, effect: '睡眠不足イベントの発生率-30%', effectFn: s => { s.effects.sleepEventReduce = true; } },
    { id: 'shoes', emoji: '👟', name: 'ウォーキングシューズ', cat: 'lifestyle', rank: '初級', price: 800, effect: '運動コマンドの効果+20%', effectFn: s => { s.effects.exerciseBoost = (s.effects.exerciseBoost || 0) + 0.20; } },
    { id: 'herb_tea', emoji: '🍵', name: 'ハーブティーセット', cat: 'supplement', rank: '初級', price: 750, effect: 'ストレスアドレナリン分泌-10%', effectFn: s => { s.effects.stressReduce = (s.effects.stressReduce || 0) + 0.10; } },
    { id: 'vegetable_first', emoji: '🥦', name: '野菜から食べる習慣', cat: 'lifestyle', rank: '初級', price: 500, effect: '食事スパイクを常時5%カット', effectFn: s => { s.effects.spikeReduce = (s.effects.spikeReduce || 0) + 0.05; } },
    { id: 'grip', emoji: '🏋', name: '握力計', cat: 'lifestyle', rank: '初級', price: 500, effect: '筋トレイベント効果+20%', effectFn: s => { s.effects.exerciseBoost = (s.effects.exerciseBoost || 0) + 0.10; } },
    { id: 'cooling_towel', emoji: '🧊', name: '冷感タオル', cat: 'lifestyle', rank: '初級', price: 600, effect: '猛暑イベントのHP消耗-30%', effectFn: s => { s.effects.heatReduce = true; } },
    { id: 'blue_light', emoji: '🕶', name: 'ブルーライトカット眼鏡', cat: 'lifestyle', rank: '初級', price: 800, effect: '夜間ストレス軽減', effectFn: s => { s.effects.stressReduce = (s.effects.stressReduce || 0) + 0.05; } },
    { id: 'health_app', emoji: '📱', name: '健康管理アプリ', cat: 'lifestyle', rank: '初級', price: 1000, effect: '血糖値グラフの更新が高精度に', effectFn: s => { s.effects.graphPrecision = true; } },
    { id: 'yoga_mat', emoji: '🧘', name: 'ヨガマット', cat: 'lifestyle', rank: '初級', price: 900, effect: 'リラックスイベント効果時間+50%', effectFn: s => { s.effects.relaxBoost = true; } },
    { id: 'low_sugar_choc', emoji: '🍫', name: '低糖質チョコレート', cat: 'supplement', rank: '初級', price: 1200, effect: '間食イベント血糖上昇-30%', effectFn: s => { s.effects.spikeReduce = (s.effects.spikeReduce || 0) + 0.15; } },
    // --- 中級 (2000-5000) ---
    { id: 'housekeeper_1', emoji: '🧹', name: 'プロの家政婦（週1）', cat: 'lifestyle', rank: '中級', price: 2000, effect: '食事イベントの25%が健康的な手料理に変化', effectFn: s => { s.effects.healthyMeal25 = true; } },
    { id: 'low_sugar_cooker', emoji: '🍳', name: '糖質オフ炊飯器', cat: 'lifestyle', rank: '中級', price: 2500, effect: 'すべての食事スパイク-15%', effectFn: s => { s.effects.spikeReduce = (s.effects.spikeReduce || 0) + 0.15; } },
    { id: 'trainer', emoji: '🏃', name: 'パーソナルトレーナー', cat: 'lifestyle', rank: '中級', price: 3000, effect: '運動イベントの血糖低下+30%', effectFn: s => { s.effects.exerciseBoost = (s.effects.exerciseBoost || 0) + 0.30; } },
    { id: 'subsidy', emoji: '🏛', name: '自治体の健康助成金', cat: 'government', rank: '中級', price: 2000, effect: 'ショップ購入価格-10%', effectFn: s => { s.effects.shopDiscount = (s.effects.shopDiscount || 0) + 0.10; } },
    { id: 'stress_check', emoji: '🧠', name: 'ストレスチェック制度', cat: 'government', rank: '中級', price: 2500, effect: '残業ストレスイベントを50%遮断', effectFn: s => { s.effects.stressReduce = (s.effects.stressReduce || 0) + 0.50; } },
    { id: 'smartwatch', emoji: '⌚', name: '高性能スマートウォッチ', cat: 'medical', rank: '中級', price: 3500, effect: '血糖値変動の予測ラインを表示', effectFn: s => { s.effects.predictLine = true; } },
    { id: 'checkup', emoji: '🏥', name: '定期健診パック', cat: 'medical', rank: '中級', price: 3000, effect: '病気イベントの継続時間-30%', effectFn: s => { s.effects.diseaseShorten = true; } },
    { id: 'organic', emoji: '🥕', name: 'オーガニック野菜便', cat: 'lifestyle', rank: '中級', price: 4000, effect: '最大HP+20', effectFn: s => { s.effects.maxHpBonus = (s.effects.maxHpBonus || 0) + 20; } },
    { id: 'air_cleaner', emoji: '💨', name: '空気清浄機', cat: 'lifestyle', rank: '中級', price: 2500, effect: '花粉・風邪イベントの影響-30%', effectFn: s => { s.effects.diseaseShorten = true; } },
    { id: 'massage_chair', emoji: '💺', name: 'マッサージチェア', cat: 'lifestyle', rank: '中級', price: 5000, effect: '休息時のHP回復速度x2', effectFn: s => { s.effects.hpRecovery = (s.effects.hpRecovery || 0) + 1; } },
    { id: 'delivery', emoji: '📦', name: '宅配弁当（糖質制限）', cat: 'lifestyle', rank: '中級', price: 3500, effect: '食事イベントの数値が安定化', effectFn: s => { s.effects.healthyMeal25 = true; s.effects.spikeReduce = (s.effects.spikeReduce || 0) + 0.10; } },
    { id: 'mattress', emoji: '🛌', name: '高反発マットレス', cat: 'lifestyle', rank: '中級', price: 4500, effect: '翌ターンのホルモン反応が安定', effectFn: s => { s.effects.stableHormone = true; } },
    { id: 'quit_smoking', emoji: '🚭', name: '禁煙外来', cat: 'medical', rank: '中級', price: 4000, effect: '血管老化スピードを遅延', effectFn: s => { s.effects.agingSlowdown = true; } },
    // --- 高級 (6000-15000) ---
    { id: 'nutritionist', emoji: '👩‍⚕️', name: 'プロの管理栄養士', cat: 'medical', rank: '高級', price: 6000, effect: '食事イベントの50%が黄金バランス食に', effectFn: s => { s.effects.healthyMeal50 = true; } },
    { id: 'housekeeper_2', emoji: '🏡', name: '専属住込み家政婦', cat: 'lifestyle', rank: '高級', price: 8000, effect: '食事スパイクイベントを完全無効', effectFn: s => { s.effects.noFoodSpike = true; } },
    { id: 'cgm', emoji: '📡', name: '医療用CGMセンサ', cat: 'medical', rank: '高級', price: 7000, effect: '血糖値推移がリアルタイムで完全可視化', effectFn: s => { s.effects.predictLine = true; s.effects.graphPrecision = true; } },
    { id: 'oxygen', emoji: '🫧', name: '高気圧酸素カプセル', cat: 'medical', rank: '高級', price: 9000, effect: '感染症からの回復が超速化', effectFn: s => { s.effects.diseaseShorten = true; s.effects.hpRecovery = (s.effects.hpRecovery || 0) + 2; } },
    { id: 'insulin_pen', emoji: '💉', name: '最新型インスリンペン', cat: 'medical', rank: '高級', price: 10000, effect: 'インスリン反応遅延ゼロ化', effectFn: s => { s.effects.instantHormone = true; } },
    { id: 'gene_test', emoji: '🧬', name: '遺伝子検査キット', cat: 'medical', rank: '高級', price: 8000, effect: 'ホルモン操作ミスが大幅に減少', effectFn: s => { s.effects.hormoneBoost = (s.effects.hormoneBoost || 0) + 0.15; } },
    { id: 'dock', emoji: '🔬', name: '人間ドック（最上級）', cat: 'medical', rank: '高級', price: 12000, effect: '老化による臓器機能低下を一定期間阻止', effectFn: s => { s.effects.agingSlowdown = true; s.effects.stableHormone = true; } },
    { id: 'doctor', emoji: '👨‍⚕️', name: '専属主治医の顧問', cat: 'medical', rank: '高級', price: 15000, effect: '病気イベント中のホルモンが倍速で効く', effectFn: s => { s.effects.hormoneBoost = (s.effects.hormoneBoost || 0) + 0.30; } },
    { id: 'counseling', emoji: '🧸', name: '社内カウンセリング', cat: 'government', rank: '高級', price: 7000, effect: 'ストレスによる血糖上昇を完全無効', effectFn: s => { s.effects.stressReduce = (s.effects.stressReduce || 0) + 1.0; } },
    { id: 'functional_sup', emoji: '⚗', name: '機能性医学サプリ', cat: 'supplement', rank: '高級', price: 9000, effect: '老化した細胞が一時的に若返る', effectFn: s => { s.effects.agingSlowdown = true; } },
    { id: 'inv_trust', emoji: '📈', name: '健康投資信託', cat: 'government', rank: '高級', price: 11000, effect: '装着中、じわじわスコアが自動加算', effectFn: s => { s.effects.autoScoreRate = (s.effects.autoScoreRate || 0) + 2; } },
    { id: 'private_gym', emoji: '🏋', name: 'プライベートジム', cat: 'lifestyle', rank: '高級', price: 13000, effect: '基礎代謝が激増し血糖が下がりやすく', effectFn: s => { s.effects.passiveGlucDrop = (s.effects.passiveGlucDrop || 0) + 0.3; } },
    // --- 伝説 (20000-50000) ---
    { id: 'national_sub', emoji: '🏆', name: '国の特別健康助成金', cat: 'government', rank: '伝説', price: 20000, effect: '全アイテムが50%OFF＆毎秒スコア+5', effectFn: s => { s.effects.shopDiscount = (s.effects.shopDiscount || 0) + 0.50; s.effects.autoScoreRate = (s.effects.autoScoreRate || 0) + 5; } },
    { id: 'bio_pancreas', emoji: '🫀', name: 'バイオ3Dプリンタ製すい臓', cat: 'medical', rank: '伝説', price: 25000, effect: 'すい臓疲弊のリセット＆放出量最大化', effectFn: s => { s.effects.hormoneBoost = (s.effects.hormoneBoost || 0) + 0.60; s.effects.agingSlowdown = true; } },
    { id: 'nanobot', emoji: '🤖', name: 'ナノマシン血管洗浄', cat: 'medical', rank: '伝説', price: 22000, effect: 'ホルモンが最速で目的地に到達', effectFn: s => { s.effects.instantHormone = true; s.effects.hormoneBoost = (s.effects.hormoneBoost || 0) + 0.20; } },
    { id: 'ai_nutrition', emoji: '🧠', name: 'AI搭載型自動栄養管理', cat: 'medical', rank: '伝説', price: 30000, effect: '食事のたびに血糖が自動最適化', effectFn: s => { s.effects.noFoodSpike = true; s.effects.spikeReduce = (s.effects.spikeReduce || 0) + 0.50; } },
    { id: 'immortal', emoji: '🧪', name: '不老不死の妙薬（試作品）', cat: 'medical', rank: '伝説', price: 35000, effect: '老化イベントが一切発生しなくなる', effectFn: s => { s.effects.noAgingEvents = true; } },
    { id: 'enlighten', emoji: '🧘', name: '精神の解脱（禅マスター）', cat: 'lifestyle', rank: '伝説', price: 28000, effect: '感情の起伏によるアドレナリン変動消失', effectFn: s => { s.effects.stressReduce = (s.effects.stressReduce || 0) + 2.0; } },
    { id: 'robot_house', emoji: '🤖', name: '全自動家政婦ロボット', cat: 'lifestyle', rank: '伝説', price: 40000, effect: '生活マイナスイベントをすべて無効', effectFn: s => { s.effects.noFoodSpike = true; s.effects.stressReduce = (s.effects.stressReduce || 0) + 2.0; } },
    { id: 'auto_pump', emoji: '⚙', name: '超伝導インスリンポンプ', cat: 'medical', rank: '伝説', price: 45000, effect: '微調整が完全自動化。恒常性を自動維持', effectFn: s => { s.effects.autoBalance = true; } },
    { id: 'brain_patch', emoji: '💫', name: '間脳アップグレードパッチ', cat: 'medical', rank: '伝説', price: 38000, effect: '操作ミス（間脳遅延）が100%消失', effectFn: s => { s.effects.noBrainMiss = true; } },
    { id: 'score_genius', emoji: '🌟', name: '健康寿命ギネス記録', cat: 'government', rank: '伝説', price: 50000, effect: 'スコア獲得倍率+100%', effectFn: s => { s.effects.scoreMultBonus = (s.effects.scoreMultBonus || 0) + 1.0; } },
    { id: 'god_mode', emoji: '🌈', name: 'ホメオスタシスの神', cat: 'legendary', rank: '伝説', price: 50000, effect: '全ステータスMAX。永遠に100を維持！', effectFn: s => { s.effects.autoBalance = true; s.effects.hormoneBoost = (s.effects.hormoneBoost || 0) + 1.0; s.effects.noFoodSpike = true; s.effects.stressReduce = (s.effects.stressReduce || 0) + 3.0; } },
];

export { state, STAGES, EVENTS, SHOP_ITEMS, HORMONE_COOLDOWN, HORMONE_POWER, SAFE_MIN, SAFE_MAX, DANGER_LOW, DANGER_HIGH, GLUCOSE_RANGE, HP_DANGER_RATE, BASE_SCORE_PER_SEC, TICK_MS };
