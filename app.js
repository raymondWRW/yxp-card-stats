"use strict";
const WIKI = "https://sharpobject.github.io/yxp_wiki/assets/cards/";
const STRIDE = 8; // [seasonIdx, charIdx, career, fam, level, round, wins, losses]

// ---- i18n ------------------------------------------------------------------
const UI = {
  en: {
    title: "Yi Xian Stats", subPre: "Win rate & popularity from",
    subMid: "card-battles ·", subPost: "cards shown", tier: "DaoXin tier",
    language: "Language", season: "Season", career: "Career", character: "Character",
    rounds: "Rounds", sortby: "Sort by", popularity: "Popularity", winrate: "Win rate",
    cardname: "Name", mingames: "Min games", search: "Search", nomatch: "No cards match these filters.",
    footData: "Data:", footArt: "card art:",
    footUpdated: "Data updated:", agoNow: "just now", agoHours: "{n} h ago", agoDays: "{n} days ago",
    footNote: "Win rate = round wins / rounds the card was on the player's board. Levels merged on tiles.",
    levels: "Levels", wrByRound: "Win rate by round", popByRound: "Popularity by round (games)",
    all: "All", none: "None", allSel: "All", nSel: "selected", searchPh: "card name…",
    sect: "Sect", baseLevel: "base", overall: "overall",
    notEnough: "Not enough data to calculate win rate at this Min games.",
    tabCards: "Cards · Tianji Sigil / Dream Weave", tabBuilds10: "Season · Hundred Schools", tabBuilds9: "Season · Heavenly Derivation", top4rate: "Top-4 win rate",
    avgplace: "Avg placement", sidejobs: "Side-jobs played", power: "Power profile",
    boards: "Popular boards", matchup: "Placement vs character", realm: "Realm",
    hhHigher: "finishes higher", youAbbr: "you", oppAbbr: "opp",
    games: "Games", topFinish: "Top-4 rate", placement: "Placement distribution",
    characters: "Characters", axisEarly: "Early", axisMid: "Mid", axisLate: "Late",
    ri_e: "Early (R{a}–{b}): average destiny damage taken per round in rounds {a}–{b}, ranked against the top 50 character+side-job strategies. Bigger = takes less damage.",
    ri_m: "Mid (R{c}–{d}): average destiny damage taken per round in rounds {c}–{d}, ranked against the top 50 strategies. Bigger = takes less damage.",
    ri_l: "Late (R{e}+): average destiny damage taken per round from round {e} on, ranked against the top 50 strategies. Bigger = takes less damage.",
    riNorm: "Normalized for extra destiny: destiny gained outside combat (fates, absorbed cards) and damage reductions (慈念曲, 龙鳞…) raise the player's effective starting destiny, and each round's damage (before reductions) is scaled to a 100-destiny pool.",
    ri_pop: "Popularity: percentile of total games played with this character+side-job (shared by its sub-strategies). Bigger = more popular.",
    ri_cx: "Simplicity (0–100): from R12 on, how small the effective card pool is and how few choices each slot has (percentile vs the top 50 strategies). Bigger = simpler deck.",
    ri_f: "First: average destiny damage taken per round when acting first. Bigger = takes less.",
    ri_s: "Second: average destiny damage taken per round when acting second. Bigger = takes less.",
    axisFirst: "First", axisSecond: "Second", axisPopularity: "Popularity", axisComplexity: "Simplicity", roundWR: "round WR",
    buildsNote: "Rank ≥ 3000 · top-4 placement = win. Absolute rates run high (winners record more) — compare characters relatively.",
    noBuildData: "Not enough games for this build yet.",
    selectCareer: "Pick a side-job below to see its build detail.",
    usedTimes: "used", vsReal: "vs real opponents",
    lateBoards: "Late-game boards vs", matchHint: "click an opponent →",
    powerNote: "destiny dmg taken per round by phase (number = actual, larger shape = takes less)",
    powerNote6: "early/mid/late: destiny dmg taken per round, ranked against the top 50 character+side-job strategies (larger shape = takes less) · popularity: percentile of total games played, shared by a combo's sub-strategies (bigger = more popular) · simplicity: percentile rank of needing a small card pool & few per-slot choices (R12+; bigger = simpler)",
    powerScore: "Power", powerTip: "skill-adjusted average placement (controls for player rank; 50 = average character; small samples regress toward 50)",
    showMore: "Show more boards", notEnoughBoards: "Not enough data (no board with 30+ games)",
    tier2: "Rank ≥", notAtTier: "This build doesn't exist at this rank tier (no games).",
    wheelchair: "Wheelchair index", strategies: "strategies",
    rerollsByRound: "Average rerolls held per round (median, with 25th / 75th percentile)", realmByRound: "Round each realm is reached",
    wheelchairNote: "character+side-job builds that place well while always playing the same board from R12 on — combines avg final placement, effective card-pool size, and per-slot variety (all recency-weighted)",
    infoTitle: "How each sort is calculated",
    infoPower: "Power: average placement adjusted for player rank (so a character isn't inflated just because strong players pick it), then compared with all characters: 50 = average, about ±12 per standard deviation, higher = stronger. Characters with few games are pulled toward 50.",
    infoPlace: "Avg placement: recency-weighted average final placement (1-8) of all games at the selected rank and above. Lower = better.",
    infoPop: "Popularity: share of all games played with this character (recency-weighted, all characters add up to 100%). n = raw number of games.",
    infoWc: "Wheelchair index (0-100): builds that place well AND play the same board from R12 on. Average of three percentiles: good final placement, small effective card pool, few card choices per slot.",
    wcPool: "eff. cards", wcSlot: "slot choices", wcWR: "R12+ WR",
    subBuilds10: "Hundred Schools · ranked builds (rank ≥ 3000) · recency-weighted (~4-day half-life)",
    subBuilds9: "Heavenly Derivation (ended) · DaoXin-ranked builds",
    buildsEmpty: "No ranked games recorded for this season yet — the site updates daily, check back soon.",
    arrangements: "arrangements",
    fates: "Fates", tianyan: "天衍 (Derivations)", daoyun: "道韵 (Dao Omen)",
    fatesHint: "top pick per phase by bucket · hover for all",
    tianyanHint: "top pick per phase · hover for all",
    daoyunHint: "most common pick (free pick ignored) · hover for all",
    fateName: "Fate", picks: "picks", pickRate: "pick %", winTop4: "top-4",
    loading: "Loading…", updating: "Matchup data is refreshing — check back shortly.",
  },
  zh: {
    title: "弈仙牌 数据", subPre: "数据来自", subMid: "次出战 ·", subPost: "张卡牌",
    tier: "道心段位", language: "语言", season: "赛季", career: "副职", character: "角色",
    rounds: "回合", sortby: "排序", popularity: "使用率", winrate: "胜率", cardname: "名称",
    mingames: "最少场次", search: "搜索", nomatch: "没有符合条件的卡牌。",
    footData: "数据：", footArt: "卡图：",
    footUpdated: "数据更新：", agoNow: "刚刚", agoHours: "{n} 小时前", agoDays: "{n} 天前",
    footNote: "胜率 = 该回合胜场 / 该卡在场上的回合数。卡面已合并等级。",
    levels: "等级", wrByRound: "各回合胜率", popByRound: "各回合使用次数",
    all: "全部", none: "清空", allSel: "全部", nSel: "项已选", searchPh: "卡牌名称…",
    sect: "门派", baseLevel: "基础", overall: "总体",
    notEnough: "当前最少场次下数据不足，无法计算胜率。",
    tabCards: "卡牌 · 天机刻印 / 临渊织梦", tabBuilds10: "赛季 · 百家之道", tabBuilds9: "赛季 · 天衍万象", top4rate: "前四胜率",
    avgplace: "平均名次", sidejobs: "搭配副职", power: "强度雷达",
    boards: "热门卡组", matchup: "对位名次", realm: "境界",
    hhHigher: "名次高于对方", youAbbr: "我", oppAbbr: "对方",
    games: "场次", topFinish: "前四率", placement: "名次分布",
    characters: "角色", axisEarly: "前期", axisMid: "中期", axisLate: "后期",
    ri_e: "前期（第{a}–{b}回合）：第{a}–{b}回合每回合承受的命元伤害，与热门前50角色流派比较。数值越大 = 承伤越低。",
    ri_m: "中期（第{c}–{d}回合）：第{c}–{d}回合每回合承受的命元伤害，与热门前50流派比较。数值越大 = 承伤越低。",
    ri_l: "后期（第{e}回合起）：第{e}回合起每回合承受的命元伤害，与热门前50流派比较。数值越大 = 承伤越低。",
    riNorm: "已按额外命元校正：战斗外获得的命元（天命、吸收卡牌等）与命元伤害减免（慈念曲、龙鳞等）计入有效初始命元，每回合（减免前的）伤害按 100 命元折算。",
    ri_pop: "人气：该角色+副职总出场量的百分位（分支流派共享）。数值越大 = 越热门。",
    ri_cx: "卡组简易程度（0–100）：12回合后有效卡池越小、各槽位选择越少得分越高（与热门前50流派比较的百分位）。数值越大 = 卡组越简单。",
    ri_f: "先手：先手时每回合承受的命元伤害。数值越大 = 承伤越低。",
    ri_s: "后手：后手时每回合承受的命元伤害。数值越大 = 承伤越低。",
    axisFirst: "先手", axisSecond: "后手", axisPopularity: "人气", axisComplexity: "简易", roundWR: "回合胜率",
    buildsNote: "段位分≥3000 · 前四视为胜。绝对胜率偏高（赢家上传更多）——请横向比较角色。",
    noBuildData: "该流派样本不足。",
    selectCareer: "选择下方副职查看具体流派。",
    usedTimes: "出现", vsReal: "对真实玩家",
    lateBoards: "后期对位卡组", matchHint: "点击对手 →",
    powerNote: "各阶段每回合承受命元伤害（数字为实际，形状越大承伤越低）",
    powerNote6: "前/中/后期：每回合承受命元伤害（形状越大承伤越低，与热门前50角色流派比较）· 人气：该角色+副职总出场量的百分位（越大越热门，分支共享） · 卡组简易程度：有效卡池小、槽位选择少的百分位得分（12回合后，0-100，越大越简单，与热门前50角色流派比较）",
    powerScore: "强度", powerTip: "经玩家段位校正的平均名次（50 = 平均水平；样本过小时回归至 50）",
    showMore: "显示更多卡组", notEnoughBoards: "数据不足（没有出现30次以上的卡组）",
    tier2: "段位分 ≥", notAtTier: "该流派在此段位不存在（无数据）。",
    wheelchair: "轮椅指数", strategies: "策略",
    rerollsByRound: "平均每回合持有换牌数（中位数，含25% / 75%分位）", realmByRound: "各境界达成回合（中位数）",
    wheelchairNote: "名次好且12回合后卡组固定的角色+副职流派——综合平均名次、有效卡池大小、各槽位选择多样性（均近期加权）",
    infoTitle: "各排序指标的计算方式",
    infoPower: "强度：先按玩家段位校正平均名次（避免因高手偏爱而虚高），再与全部角色比较：50 = 平均水平，每个标准差约 ±12 分，越高越强；对局少的角色会向 50 回归。",
    infoPlace: "平均名次：所选段位及以上所有对局最终名次（1–8）的近期加权平均，越低越好。",
    infoPop: "使用率：该角色对局数占全部对局的比例（近期加权，所有角色合计 100%）。n = 原始对局数。",
    infoWc: "轮椅指数（0–100）：名次好且 12 回合后始终打同一套卡组的流派得分高。取三项百分位的平均：最终名次好、有效卡池小、各槽位选择少。",
    wcPool: "有效卡池", wcSlot: "槽位选择", wcWR: "12+回合胜率",
    subBuilds10: "百家之道 · 排位流派（段位分≥3000）· 近期加权（约4天半衰期）",
    subBuilds9: "天衍万象（已结束）· 道心排位流派",
    buildsEmpty: "本赛季暂无排位对局数据——每日自动更新，敬请期待。",
    arrangements: "种排列",
    fates: "天命", tianyan: "天衍", daoyun: "道韵",
    fatesHint: "各阶段最热门选择",
    tianyanHint: "各阶段热门选择 · 悬停查看全部",
    daoyunHint: "最常见选择（忽略自在随心）· 悬停查看全部",
    fateName: "天命", picks: "次数", pickRate: "选取率", winTop4: "前四率",
    loading: "加载中…", updating: "对位数据更新中，请稍后刷新查看。",
  },
};
// season number -> {en,zh}
const SEASON_NAMES = {
  7: { en: "Tianji Sigil", zh: "天机刻印" },
  8: { en: "Dream Weave", zh: "临渊织梦" },
  9: { en: "Heavenly Derivation", zh: "天衍万象" },
};
// card sect_code -> character sect (charId leading digit) for normalization denom
const SECT_TO_LEAD = { sw: 1, he: 2, fe: 3, dx: 4 };
// card sect_code -> career number for side-job cards
const CAREER_CARD = { el: 1, fu: 2, mu: 3, pa: 4, fm: 5, pm: 6, ft: 7 };
// card sect_code -> {en,zh}
const SECT_CODE = {
  sw: { en: "Cloud Spirit Sword Sect", zh: "云灵剑宗" }, dx: { en: "Duan Xuan Sect", zh: "锻玄宗" },
  he: { en: "Heptastar Pavilion", zh: "七星阁" }, fe: { en: "Five Elements Alliance", zh: "五行道盟" },
  el: { en: "Elixirist", zh: "炼丹师" }, fu: { en: "Fuluist", zh: "符咒师" },
  mu: { en: "Musician", zh: "琴师" }, ft: { en: "Fortune Teller", zh: "命理师" },
  pm: { en: "Plant Master", zh: "灵植师" }, fm: { en: "Formation Master", zh: "阵法师" },
  pa: { en: "Painter", zh: "画师" }, no_marking: { en: "Neutral", zh: "无门派" },
  spiritual_pet: { en: "Spirit Pet", zh: "灵宠" }, talisman: { en: "Talisman", zh: "符箓" }, "": { en: "—", zh: "—" },
};
const t = (k) => (UI[S.lang][k] ?? UI.en[k] ?? k);

// ---- state -----------------------------------------------------------------
const S = {
  th: 4000, lang: "zh",
  seasons: new Set(), careers: new Set(), chars: new Set(),
  rlo: 1, rhi: 27, sort: "pop", minGames: 30, q: "",
  modalFam: null, modalLevels: new Set(),
};
const cache = {};
let NAMES = null, DATA = null;
const $ = (s) => document.querySelector(s);
let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

// ---- load ------------------------------------------------------------------
async function boot() {
  NAMES = await fetch("data/names.json").then((r) => r.json());
  wireStatic();
  wireBuilds();
  setBuildsSeason(10);       // the current season's Builds is the default landing view
  BS.active = true;
  await loadBuilds();
  applyLang();
}
let CARDS_INIT = false;      // cards data is loaded lazily on first Cards-tab open
async function loadThreshold(th) {
  S.th = th;
  if (!cache[th]) cache[th] = await fetch(`data/data_${th}.json`).then((r) => r.json());
  DATA = cache[th];
  const m = DATA.meta;
  // default selections = everything
  S.seasons = new Set(m.seasons.map((_, i) => i));
  S.careers = new Set(m.careers);
  S.chars = new Set(m.charIds);
  S.rlo = m.rounds[0]; S.rhi = m.rounds[1];
  buildSeason(); buildCareer(); buildCharacter(); buildRoundSlider();
  applyLang(); render();
}

// ---- generic multiselect ---------------------------------------------------
function multiselect(host, summaryFn, renderPanel) {
  host.innerHTML = `<button class="ms-btn"></button><div class="ms-panel" hidden></div>`;
  const btn = host.querySelector(".ms-btn");
  const panel = host.querySelector(".ms-panel");
  btn.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll(".ms-panel").forEach((p) => { if (p !== panel) p.hidden = true; });
    panel.hidden = !panel.hidden;
  };
  panel.onclick = (e) => e.stopPropagation();
  host._refresh = () => { btn.textContent = summaryFn(); renderPanel(panel); };
  host._refresh();
}
function summaryCount(set, total, allWord) {
  if (set.size === total) return allWord;
  return `${set.size} ${t("nSel")}`;
}
function tools(onAll, onNone) {
  const d = document.createElement("div");
  d.className = "ms-tools";
  d.innerHTML = `<button>${t("all")}</button><button>${t("none")}</button>`;
  d.children[0].onclick = onAll; d.children[1].onclick = onNone;
  return d;
}
function row(label, checked, onToggle, cls = "") {
  const r = document.createElement("label");
  r.className = "ms-row " + cls;
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = checked;
  cb.onchange = () => onToggle(cb.checked, cb);
  r.appendChild(cb);
  const s = document.createElement("span"); s.textContent = label; r.appendChild(s);
  return r;
}

// ---- season ----------------------------------------------------------------
function seasonName(s) {
  return SEASON_NAMES[s] ? SEASON_NAMES[s][S.lang] : `${t("season")} ${s}`;
}
function buildSeason() {
  const host = document.querySelector('[data-ms="season"]');
  const seasons = DATA.meta.seasons;
  multiselect(host,
    () => summaryCount(S.seasons, seasons.length, t("allSel")),
    (panel) => {
      panel.innerHTML = "";
      panel.appendChild(tools(
        () => { seasons.forEach((_, i) => S.seasons.add(i)); host._refresh(); schedule(); },
        () => { S.seasons.clear(); host._refresh(); schedule(); }));
      seasons.forEach((s, i) => panel.appendChild(row(
        seasonName(s), S.seasons.has(i),
        (on) => { on ? S.seasons.add(i) : S.seasons.delete(i); host._refresh(); schedule(); })));
    });
}

// ---- career ----------------------------------------------------------------
function careerName(c) { return NAMES.careers[c] ? NAMES.careers[c][S.lang] : "" + c; }
function buildCareer() {
  const host = document.querySelector('[data-ms="career"]');
  const careers = DATA.meta.careers;
  multiselect(host,
    () => summaryCount(S.careers, careers.length, t("allSel")),
    (panel) => {
      panel.innerHTML = "";
      panel.appendChild(tools(
        () => { careers.forEach((c) => S.careers.add(c)); host._refresh(); schedule(); },
        () => { S.careers.clear(); host._refresh(); schedule(); }));
      careers.forEach((c) => panel.appendChild(row(
        careerName(c), S.careers.has(c),
        (on) => { on ? S.careers.add(c) : S.careers.delete(c); host._refresh(); schedule(); })));
    });
}

// ---- character (grouped by sect) -------------------------------------------
function charName(id) { return NAMES.characters[id] ? NAMES.characters[id][S.lang] : "" + id; }
function sectName(n) { return NAMES.sects[n] ? NAMES.sects[n][S.lang] : "" + n; }
function buildCharacter() {
  const host = document.querySelector('[data-ms="character"]');
  const ids = DATA.meta.charIds;
  const bySect = {};
  ids.forEach((id) => { const s = +String(id)[0]; (bySect[s] = bySect[s] || []).push(id); });
  multiselect(host,
    () => summaryCount(S.chars, ids.length, t("allSel")),
    (panel) => {
      panel.innerHTML = "";
      panel.appendChild(tools(
        () => { ids.forEach((id) => S.chars.add(id)); host._refresh(); schedule(); },
        () => { S.chars.clear(); host._refresh(); schedule(); }));
      Object.keys(bySect).sort().forEach((s) => {
        const group = bySect[s];
        const allOn = group.every((id) => S.chars.has(id));
        const gr = row(sectName(+s), allOn, (on) => {
          group.forEach((id) => on ? S.chars.add(id) : S.chars.delete(id));
          host._refresh(); schedule();
        }, "group");
        gr.querySelector("input").indeterminate = !allOn && group.some((id) => S.chars.has(id));
        panel.appendChild(gr);
        group.forEach((id) => panel.appendChild(row(
          charName(id), S.chars.has(id),
          (on) => { on ? S.chars.add(id) : S.chars.delete(id); host._refresh(); schedule(); }, "child")));
      });
    });
}

// ---- round dual slider -----------------------------------------------------
function buildRoundSlider() {
  const [lo, hi] = DATA.meta.rounds;
  const rlo = $("#rlo"), rhi = $("#rhi");
  [rlo, rhi].forEach((el) => { el.min = lo; el.max = hi; });
  rlo.value = lo; rhi.value = hi; S.rlo = lo; S.rhi = hi;
  const upd = (e) => {
    let a = +rlo.value, b = +rhi.value;
    if (a > b) { if (e.target === rlo) { b = a; rhi.value = b; } else { a = b; rlo.value = a; } }
    S.rlo = a; S.rhi = b;
    $("#roundlbl").textContent = `${a}–${b}`;
    schedule();
  };
  rlo.oninput = upd; rhi.oninput = upd;
  $("#roundlbl").textContent = `${lo}–${hi}`;
}

// ---- aggregation -----------------------------------------------------------
function galleryAgg() {
  const f = DATA.facts, m = DATA.meta;
  const seasons = S.seasons, careers = S.careers;
  // map charIdx -> selected? + leading-digit (sect) precomputed
  const charSel = m.charIds.map((id) => S.chars.has(id));
  const charLead = m.charIds.map((id) => +String(id)[0]);
  const lo = S.rlo, hi = S.rhi;
  const nFam = DATA.cards.length;
  const wins = new Float64Array(nFam), losses = new Float64Array(nFam);
  const sectTotal = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const careerTotal = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  let total = 0;
  for (let i = 0; i < f.length; i += STRIDE) {
    const rd = f[i + 5];
    if (rd < lo || rd > hi) continue;
    if (!seasons.has(f[i])) continue;
    const ci = f[i + 1];
    if (!charSel[ci]) continue;
    const car = f[i + 2];
    if (!careers.has(car)) continue;
    const g = f[i + 6] + f[i + 7];
    const fam = f[i + 3];
    wins[fam] += f[i + 6]; losses[fam] += f[i + 7];
    total += g;
    sectTotal[charLead[ci]] += g;     // card-battles by this character's sect
    careerTotal[car] += g;            // card-battles by this career/side-job
  }
  return { wins, losses, total, sectTotal, careerTotal };
}
// denominator for the normalized popularity sort, picked by the card's faction
function factionDenom(card, agg) {
  const code = card.sect;
  if (SECT_TO_LEAD[code]) return agg.sectTotal[SECT_TO_LEAD[code]] || 0;
  if (CAREER_CARD[code]) return agg.careerTotal[CAREER_CARD[code]] || 0;
  return agg.total || 0; // neutral / pet / talisman -> overall
}

// ---- render gallery --------------------------------------------------------
function wrColor(wr) {
  const x = Math.max(0, Math.min(1, (wr - 0.4) / 0.2));
  return `rgb(${Math.round(232 + (54 - 232) * x)},${Math.round(85 + (196 - 85) * x)},${Math.round(78 + (107 - 78) * x)})`;
}
// avg placement color: lower is better (3.0 green → 4.5 red), 1st place = 1, 8th = 8.
function placeColorF(p) {
  const x = Math.max(0, Math.min(1, (p - 3.0) / 1.5));
  return `rgb(${Math.round(54 + (232 - 54) * x)},${Math.round(196 + (85 - 196) * x)},${Math.round(107 + (78 - 107) * x)})`;
}
function cardName(c) { return (S.lang === "zh" && c.cn) ? c.cn : (c.en || c.cn || "#" + c.img); }
function sectLabel(code) { return (SECT_CODE[code] || { en: code, zh: code })[S.lang]; }

function render() {
  if (!DATA) return;          // cards data not loaded yet (Builds is the default view)
  const A = galleryAgg();
  const { wins, losses, total } = A;
  let rows = [];
  for (let i = 0; i < DATA.cards.length; i++) {
    const g = wins[i] + losses[i];
    if (g < S.minGames) continue;
    const c = DATA.cards[i];
    if (S.q) {
      const q = S.q.toLowerCase();
      if (!(c.en.toLowerCase().includes(q) || (c.cn || "").includes(S.q))) continue;
    }
    // normalized popularity score = appearances / faction's total appearances (after filter)
    const denom = factionDenom(c, A);
    rows.push({ c, g, wr: g ? wins[i] / g : 0, score: denom ? g / denom : 0 });
  }
  if (S.sort === "wr") rows.sort((a, b) => b.wr - a.wr || b.g - a.g);
  else if (S.sort === "name") rows.sort((a, b) => cardName(a.c).localeCompare(cardName(b.c)));
  else rows.sort((a, b) => b.score - a.score || b.g - a.g);

  $("#gamecount").textContent = total.toLocaleString();
  $("#cardcount").textContent = rows.length.toLocaleString();
  const grid = $("#grid"); grid.innerHTML = "";
  $("#empty").hidden = rows.length > 0;
  const frag = document.createDocumentFragment();
  for (const r of rows) frag.appendChild(tile(r));
  grid.appendChild(frag);
  enter(grid);
}
function tile(r) {
  const c = r.c, col = wrColor(r.wr), name = cardName(c);
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <img loading="lazy" src="${WIKI}${c.img}_${S.lang}.webp"
      onerror="this.onerror=null;this.src='${WIKI}${c.img}_en.webp'" alt="${name}">
    <div class="nm">${name}</div>
    <div class="sect">${sectLabel(c.sect)}</div>
    <div class="stats"><span class="wr" style="color:${col}">${(r.wr * 100).toFixed(1)}%</span>
      <span class="pop">n=${r.g.toLocaleString()}</span></div>
    <div class="bar"><i style="width:${(r.wr * 100).toFixed(1)}%;background:${col}"></i></div>`;
  el.onclick = () => openModal(c.i);
  return el;
}

// ---- card detail modal -----------------------------------------------------
function openModal(fam) {
  S.modalFam = fam;
  S.modalLevels = new Set(Object.keys(DATA.cards[fam].lv).map(Number));
  $("#modal").hidden = false;
  renderModal();
}
function closeModal() { $("#modal").hidden = true; S.modalFam = null; }

function modalAgg() {
  // for the selected card, respect season/career/char filters (NOT round range),
  // include only selected levels; return per-round [w,l] and overall.
  const f = DATA.facts, m = DATA.meta, fam = S.modalFam;
  const charSel = m.charIds.map((id) => S.chars.has(id));
  const [lo, hi] = m.rounds;
  const perW = new Float64Array(hi + 1), perL = new Float64Array(hi + 1);
  let tw = 0, tl = 0;
  for (let i = 0; i < f.length; i += STRIDE) {
    if (f[i + 3] !== fam) continue;
    if (!S.seasons.has(f[i])) continue;
    if (!charSel[f[i + 1]]) continue;
    if (!S.careers.has(f[i + 2])) continue;
    if (!S.modalLevels.has(f[i + 4])) continue;
    const rd = f[i + 5];
    perW[rd] += f[i + 6]; perL[rd] += f[i + 7];
    tw += f[i + 6]; tl += f[i + 7];
  }
  return { perW, perL, tw, tl, lo, hi };
}
function renderModal() {
  if (S.modalFam == null) return;
  const c = DATA.cards[S.modalFam];
  $("#mImg").src = `${WIKI}${c.img}_${S.lang}.webp`;
  $("#mImg").onerror = function () { this.onerror = null; this.src = `${WIKI}${c.img}_en.webp`; };
  $("#mName").textContent = cardName(c);
  $("#mSect").textContent = sectLabel(c.sect);

  // level chips
  const chips = $("#mLevels"); chips.innerHTML = "";
  Object.keys(c.lv).map(Number).sort().forEach((lv) => {
    const on = S.modalLevels.has(lv);
    const chip = document.createElement("label");
    chip.className = "lchip" + (on ? "" : " off");
    chip.innerHTML = `<input type="checkbox" ${on ? "checked" : ""}>
      <span>${lv === 0 ? t("baseLevel") : "Lv" + lv}</span>`;
    chip.querySelector("input").onchange = (e) => {
      e.target.checked ? S.modalLevels.add(lv) : S.modalLevels.delete(lv);
      if (S.modalLevels.size === 0) { S.modalLevels.add(lv); e.target.checked = true; } // keep >=1
      renderModal();
    };
    chips.appendChild(chip);
  });

  const { perW, perL, tw, tl, lo, hi } = modalAgg();
  const tot = tw + tl;
  $("#mTot").innerHTML = `<b style="color:${wrColor(tot ? tw / tot : 0)}">${(tot ? tw / tot * 100 : 0).toFixed(1)}%</b>
    ${t("overall")} · n=${tot.toLocaleString()}`;

  // charts
  const rounds = [];
  for (let r = lo; r <= hi; r++) rounds.push(r);
  const maxPop = Math.max(1, ...rounds.map((r) => perW[r] + perL[r]));

  // Win rate by round: only show a round's win rate if it has >= Min games samples.
  const minG = S.minGames;
  const wrHost = $("#chartWR");
  const anyQual = rounds.some((r) => perW[r] + perL[r] >= minG);
  if (!anyQual) {
    wrHost.innerHTML = `<div class="chart-empty">${t("notEnough")}</div>`;
  } else {
    drawChart(wrHost, rounds, (r) => {
      const g = perW[r] + perL[r];
      if (g < minG) return { h: 0, label: r, tip: `R${r}: n=${g} (< ${minG})`, color: "#556", faded: true };
      const wr = perW[r] / g;
      return { h: wr, label: r, tip: `R${r}: ${(wr * 100).toFixed(1)}% (n=${g})`, color: wrColor(wr), faded: false };
    }, true);
  }
  // Popularity by round: always show all rounds (a count is not sample-skewed).
  drawChart($("#chartPop"), rounds, (r) => {
    const g = perW[r] + perL[r];
    return { h: g / maxPop, label: r, tip: `R${r}: ${g.toLocaleString()}`, color: "#5b8cff", faded: g === 0 };
  }, false);
  enter($("#modal"));
}
// ---- entrance animations -------------------------------------------------------
// The CSS plays an entrance keyframe on every freshly inserted chip / row / bar; this
// only hands each item of a group an increasing --d (indexed per parent, capped so a
// long list doesn't keep trickling in) so they rise one after another, not all at once.
const STAGGER = [[".cchip", 22, 30], [".card", 14, 24], [".sjrow", 35, 14], [".board", 40, 12],
                 [".mcell", 18, 30], [".fphase", 45, 10], [".pb", 30, 8], [".col", 12, 40], [".realmtbl tr", 40, 8]];
function enter(host) {
  if (!host) return;
  for (const [sel, step, cap] of STAGGER) {
    const seen = new Map();                       // parent -> items counted so far
    host.querySelectorAll(sel).forEach((el) => {
      const p = el.parentElement, i = seen.get(p) || 0; seen.set(p, i + 1);
      el.style.setProperty("--d", Math.min(i, cap) * step + "ms");
    });
  }
}

function drawChart(host, items, fn, isWr) {
  host.innerHTML = "";
  for (const it of items) {
    const d = fn(it);
    const col = document.createElement("div");
    col.className = "col";
    const pct = Math.max(0, Math.min(1, d.h)) * 100;
    col.innerHTML = `<div class="tip">${d.tip}</div>
      <i style="height:${pct}%;background:${d.color};opacity:${d.faded ? .15 : 1}"></i>
      <span>${d.label}</span>`;
    host.appendChild(col);
  }
  if (isWr) { // 50% reference line via a faint marker is skipped for simplicity
  }
}

// line chart: median rerolls held per round (solid) + 25th / 75th percentile (lighter lines).
// Fixed y-scale 0-20. Older data (no percentiles) draws the median line only.
function drawLineChart(host, pts, big) {
  const k = big ? 2 : 1;                        // zoomed popup: same drawing at 2x scale
  const W = 600 * k, H = 150 * k * (big ? 1.6 : 1), L = 24 * k, R = 8 * k, T = 8 * k, B = 20 * k, YMAX = 20, FS = 9 * k;
  const x = (i) => L + (pts.length > 1 ? i * (W - L - R) / (pts.length - 1) : (W - L - R) / 2);
  const y = (v) => T + (1 - Math.min(YMAX, Math.max(0, v)) / YMAX) * (H - T - B);
  const line = (k, color, op, wd) => {
    const ps = pts.filter((p) => p[k] != null && p.w > 0.001);
    if (ps.length < 1) return "";
    const d = ps.map((p) => `${x(pts.indexOf(p)).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
    return `<polyline class="lc-line lc-${k}" pathLength="1" points="${d}" fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="${wd}" stroke-linejoin="round" stroke-linecap="round"/>`;
  };
  let g = "";
  for (let v = 0; v <= YMAX; v += 5) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".12"/>`
      + `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" font-size="${FS}" fill="currentColor" fill-opacity=".6">${v}</text>`;
  }
  pts.forEach((p, i) => { g += `<text x="${x(i)}" y="${H - 6 * k}" text-anchor="middle" font-size="${FS}" fill="currentColor" fill-opacity=".6">${p.r}</text>`; });
  const C = "#5b8cff";
  const zh = S.lang === "zh", unit = zh ? "张换牌" : "rerolls";
  let dots = "", hits = "";
  pts.forEach((p, i) => {
    if (!(p.w > 0.001)) return;
    [["hi", .45], ["lo", .45], ["med", 1]].forEach(([key, op]) => {
      if (p[key] == null) return;
      dots += `<circle class="lc-dot" cx="${x(i)}" cy="${y(p[key])}" r="${3 * k}" fill="${C}" fill-opacity="${op}" pointer-events="none"/>`;
    });
    const cw = (W - L - R) / Math.max(1, pts.length - 1);
    const tip = `<b>R${p.r}</b>` + (p.hi != null ? `<br>${zh ? "75%分位" : "P75"}: ${p.hi} ${unit}` : "")
      + `<br>${zh ? "中位数" : "Median"}: ${p.med} ${unit}` + (p.lo != null ? `<br>${zh ? "25%分位" : "P25"}: ${p.lo} ${unit}` : "");
    hits += `<rect class="lc-hit" x="${x(i) - cw / 2}" y="${T}" width="${cw}" height="${H - T - B}" fill="transparent" data-i="${i}" data-tip="${tip.replace(/"/g, "&quot;")}"/>`;
  });
  const hasQ = pts.some((p) => p.lo != null);
  const legend = `<div class="lc-legend"><span style="color:${C}">●</span> ${S.lang === "zh" ? "中位数" : "Median"}`
    + (hasQ ? ` &nbsp; <span style="color:${C};opacity:.45">●</span> ${S.lang === "zh" ? "25% / 75% 分位" : "25th / 75th percentile"}` : "") + `</div>`;
  host.classList.add("linechart");
  if (!big) {                                   // click the small chart -> zoomed popup
    host.onclick = () => openChartPopup(pts);
  }
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}${line("hi", C, .4, 1.5 * k)}${line("lo", C, .4, 1.5 * k)}${line("med", C, 1, 2.5 * k)}${dots}${hits}</svg>${legend}<div class="lc-tip" hidden></div>`;
  const tipEl = host.querySelector(".lc-tip");
  host.onmousemove = (e) => {
    const r = e.target.closest && e.target.closest(".lc-hit");
    if (!r) { tipEl.hidden = true; return; }
    tipEl.innerHTML = r.dataset.tip; tipEl.hidden = false;
    const hb = host.getBoundingClientRect();
    let lx = e.clientX - hb.left + 12; if (lx + tipEl.offsetWidth > hb.width) lx = e.clientX - hb.left - tipEl.offsetWidth - 12;
    tipEl.style.left = lx + "px"; tipEl.style.top = Math.max(0, e.clientY - hb.top - tipEl.offsetHeight - 8) + "px";
  };
  host.onmouseleave = () => { tipEl.hidden = true; };
}

// zoomed popup: click the backdrop, the ✕ button or press Esc to close
function openChartPopup(pts) {
  closeChartPopup();
  const ov = document.createElement("div");
  ov.id = "chartPopup"; ov.className = "popup-bg";
  ov.innerHTML = `<div class="popup-box"><button class="popup-x" aria-label="close">✕</button>`
    + `<h3>${t("rerollsByRound")}</h3><div class="chart linechart"></div></div>`;
  ov.addEventListener("click", (e) => { if (!e.target.closest(".popup-box") || e.target.closest(".popup-x")) closeChartPopup(); });
  document.body.appendChild(ov);
  drawLineChart(ov.querySelector(".chart"), pts, true);
  document.addEventListener("keydown", chartPopupKey);
}
function closeChartPopup() {
  const ov = document.getElementById("chartPopup"); if (ov) ov.remove();
  document.removeEventListener("keydown", chartPopupKey);
}
function chartPopupKey(e) { if (e.key === "Escape") closeChartPopup(); }

// ---- language --------------------------------------------------------------
function applyLang() {
  document.documentElement.lang = S.lang === "zh" ? "zh" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("#search").placeholder = t("searchPh");
  renderUpdated();
  // refresh dynamic controls' labels
  ["season", "career", "character"].forEach((k) => {
    const h = document.querySelector(`[data-ms="${k}"]`); if (h && h._refresh) h._refresh();
  });
  render();
  if (S.modalFam != null) renderModal();
  if (BS.active) renderBuilds();
}

// ---- wiring ----------------------------------------------------------------
function seg(id, fn) {
  $("#" + id).addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    [...e.currentTarget.children].forEach((b) => b.classList.remove("on"));
    e.target.classList.add("on"); fn(e.target.dataset.v);
  });
}
function wireStatic() {
  seg("threshold", (v) => loadThreshold(+v));
  seg("lang", (v) => { S.lang = v; applyLang(); });
  $("#sort").addEventListener("change", (e) => { S.sort = e.target.value; render(); });
  $("#mingames").addEventListener("input", (e) => {
    S.minGames = +e.target.value; $("#minlbl").textContent = e.target.value; schedule();
    if (S.modalFam != null) renderModal();
  });
  $("#search").addEventListener("input", (e) => { S.q = e.target.value.trim(); schedule(); });
  $("#modalClose").addEventListener("click", closeModal);
  $(".modal-bg").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  document.addEventListener("click", () => document.querySelectorAll(".ms-panel").forEach((p) => p.hidden = true));
}

// ============================================================================
//  BUILDS VIEW (per season, hsreplay-style)
// ============================================================================
const WIKI_ROOT = "https://sharpobject.github.io/yxp_wiki/assets/";
const charAvatar = (id) => `${WIKI_ROOT}characters/${id}-avatar.webp`;
const sidejobBadge = (c) => `${WIKI_ROOT}side-jobs/side_job_badge_${c}.webp`;
const RADAR_AXES_V5 = [["e", "axisEarly"], ["m", "axisMid"], ["l", "axisLate"], ["f", "axisFirst"], ["s", "axisSecond"]];
const RADAR_AXES_V6 = [["e", "axisEarly"], ["m", "axisMid"], ["l", "axisLate"], ["pop", "axisPopularity"], ["cx", "axisComplexity"]];
const radarAxes = () => (BS.v6 ? RADAR_AXES_V6 : RADAR_AXES_V5);
// ---- 强度雷达's comparison population: the top 50 character+side-job combos by RAW
// games at rank>=4000 (tierBands(4000) = bands B+C -- the same definition the strategy
// -discovery tooling used), each expanded into its NAMED sub-strategies (其他 excluded;
// an unsplit combo stays as itself). This fixes "compare vs every build in the game",
// whose long tail of niche chars/careers/variants was skewing the 先手率/简易程度
// percentiles. The SET is tier-filter-independent (stable cast); values compared within
// it still respect the viewer's tier filter like every other axis.
function radarPopulation() {
  if (BS.radarPop) return BS.radarPop;
  const combos = [];
  for (const key in BS.data.tiers) {
    if (key.indexOf("|") >= 0) continue;              // plain char_career keys only
    const tk = BS.data.tiers[key]; let graw = 0;
    for (const bd of tierBands(4000)) if (tk[bd]) graw += tk[bd].graw;
    combos.push([key, graw]);
  }
  combos.sort((a, b) => b[1] - a[1]);
  const keys = [];
  for (const [combo] of combos.slice(0, 50)) {
    const vars = (BS.variants[combo] || []).filter((v) => v !== "其他");
    if (vars.length) vars.forEach((v) => keys.push(`${combo}|${v}`));
    else keys.push(combo);
  }
  return BS.radarPop = keys;
}
const comboOf = (key) => { const i = key.indexOf("|"); return i < 0 ? key : key.slice(0, i); };
// 人气: this build's parent character+side-job's total weighted games at the current
// tier filter (shared identically by every one of its named sub-strategies -- splitting
// into variants doesn't dilute the combo's own popularity).
function comboPopularity(combo) {
  const tk = BS.data.tiers[combo]; if (!tk) return 0;
  let g = 0; for (const bd of tierBands(BS.tier)) if (tk[bd]) g += tk[bd].g;
  return g;
}
// 卡组简易程度 / 人气 are both 0-100 RANK scores against radarPopulation() (not raw
// magnitude) -- a handful of extreme-variety decks or a few blockbuster-popular combos
// are heavy-tailed, and percentile rank is immune to that by construction.
function cxPools() {
  BS.cxCache = BS.cxCache || {};
  if (BS.cxCache[BS.tier]) return BS.cxCache[BS.tier];
  const tier = String(BS.tier), pools = [], slots = [];
  for (const key of radarPopulation()) {
    const e = BS.data.wc && BS.data.wc[key] && BS.data.wc[key][tier];
    if (e) { pools.push(e[3]); slots.push(e[4]); }
  }
  pools.sort((a, b) => a - b); slots.sort((a, b) => a - b);
  return BS.cxCache[BS.tier] = { pools, slots };
}
function cxScore(key) {
  const e = BS.data.wc && BS.data.wc[key] && BS.data.wc[key][String(BS.tier)];
  if (!e) return null;
  const { pools, slots } = cxPools();
  const pct = (arr, v) => { let c = 0; for (const x of arr) if (x <= v) c++; return c / arr.length; };
  return Math.round(100 * ((1 - pct(pools, e[3])) + (1 - pct(slots, e[4]))) / 2);
}
function popPool() {
  BS.popCache = BS.popCache || {};
  if (BS.popCache[BS.tier]) return BS.popCache[BS.tier];
  const vals = radarPopulation().map((k) => comboPopularity(comboOf(k)));
  vals.sort((a, b) => a - b);
  return BS.popCache[BS.tier] = vals;
}
function popScore(key) {
  const v = comboPopularity(comboOf(key));
  const vals = popPool(); if (!vals.length) return null;
  let c = 0; for (const x of vals) if (x <= v) c++;
  return Math.round(100 * c / vals.length);
}

// One independent view state per season tab; BS always points at the active season's.
const newBS = (season) => ({ season, active: false, data: null, screen: "list", char: null, career: null, variant: "", sort: "power", realm: null, power: {}, boardsShowAll: false, mShowAll: false, tier: 3000, loaded: false });
const BS_SEASONS = {};
let BS = newBS(10); BS_SEASONS[10] = BS;
function setBuildsSeason(season) {
  if (BS_SEASONS[season] !== BS) { BS.active = false; BS = BS_SEASONS[season] || (BS_SEASONS[season] = newBS(season)); }
}
const BOARD_MIN = 30;   // a board needs >= this many raw occurrences to show by default

// "Data updated" footer line. Prefers the pipeline's generation stamp (meta.generated,
// UTC ISO); falls back to the file's Last-Modified header (= when Pages last deployed it).
function renderUpdated() {
  const el = $("#updated"); if (!el) return;
  const d = BS.updatedAt ? new Date(BS.updatedAt) : null;
  if (!d || isNaN(d)) { el.textContent = ""; return; }
  const h = Math.max(0, Math.round((Date.now() - d) / 36e5));
  const rel = h < 1 ? t("agoNow") : h < 48 ? t("agoHours").replace("{n}", h) : t("agoDays").replace("{n}", Math.round(h / 24));
  const abs = d.toLocaleString(S.lang === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  el.textContent = `${t("footUpdated")} ${abs} (${rel})`;
}
async function loadBuilds() {
  if (!BS.data) {
    // light file: meta + chars + tiers — drives the leaderboard, loads instantly
    const res = await fetch(`data/season${BS.season}.json`);
    BS.data = await res.json();
    BS.updatedAt = (BS.data.meta && BS.data.meta.generated) || res.headers.get("Last-Modified") || null;
    renderUpdated();
    // strategy-split combos: "char_career|variant" tier keys -> combo -> [variants]
    BS.variants = {};
    for (const key in BS.data.tiers) {
      const i = key.indexOf("|");
      if (i < 0) continue;
      const combo = key.slice(0, i);
      (BS.variants[combo] = BS.variants[combo] || []).push(key.slice(i + 1));
    }
    const isRest = (v) => v === "其他" || v === "白板";     // catch-all variants sort last
    for (const combo in BS.variants) BS.variants[combo].sort((a, b) => isRest(a) - isRest(b));
    computePower(BS.tier);
  }
  renderBuilds();
}
// Heavy file (builds + families) is fetched only when the user first opens a build detail.
async function ensureBuilds() {
  if (BS.loaded) return;
  // builds are required (throws -> caller catches -> can retry on next click)
  const bd = await fetch(`data/season${BS.season}_builds.json`).then((r) => r.json());
  BS.data.builds = bd.builds; BS.data.families = bd.families;
  // v2 data: radar = destiny received (lower = better), matchup = placement head-to-head.
  // v3 data: build stats split by DaoXin band -> the build page gets a tier filter.
  // Until the daily pipeline republishes in the newest format, gate the new renderings.
  BS.v2 = (bd.v || 1) >= 2;
  BS.v3 = (bd.v || 1) >= 3;
  BS.v5 = (bd.v || 1) >= 5;                // curves are per-tier medians since v5
  BS.rsplit = bd.rs || [7, 13];
  BS.dnorm = !!bd.dn;                      // e/m/l damage normalised for extra destiny (destiny_profile)
  BS.v6 = (bd.v || 1) >= 6;                // radar = e/m/l dmg + first-rate + complexity since v6
  if (!BS.v3) {                          // v3 percentile pools are built per-tier on demand
    const axv = {}; RADAR_AXES_V5.forEach(([k]) => axv[k] = []);
    for (const id in BS.data.builds) {
      const b = BS.data.builds[id]; if (b.g < 20) continue;
      RADAR_AXES_V5.forEach(([k]) => axv[k].push(b.radar[k]));
    }
    RADAR_AXES_V5.forEach(([k]) => axv[k].sort((a, b) => a - b));
    BS.axv = axv;
  }
  try {                                            // fates are optional (may not be deployed yet)
    const fd = await fetch(`data/season${BS.season}_fates.json`).then((r) => r.json());
    BS.data.fates = fd.fates; BS.data.derivations = fd.derivations; BS.data.fnames = fd.names; BS.data.dnames = fd.dnames;
    BS.data.daoyun = fd.daoyun; BS.data.ynames = fd.ynames;
    BS.fv3 = (fd.v || 1) >= 3;           // selection rows are per-DaoXin-band since v3
    BS.iconBase = (fd.meta && fd.meta.iconBase) || "https://sharpobject.github.io/yxp_wiki/assets/fates/";
  } catch (e) { /* no fate data yet — the Fates/天衍 sections just won't render */ }
  BS.loaded = true;
}
// Power = standardized, SKILL-ADJUSTED average placement (recency-weighted).
// Controls for player skill (rank score): each character's placement is re-baselined to
// an average-skill pilot, removing the "only strong mains still play it" inflation.
//   b   = within-character slope of placement vs rank  = Σ_c(swrp - swr·AP_c) / Σ_c(swr² - swr²/sw)
//   adj = AP_c − b·(R_c − R̄)      (R_c = avg rank, R̄ = global avg rank)
//   Power = 50 + 12·k·(mean(adj) − adj_c)/sd(adj),  k = g/(g+K)  (small-sample shrinkage)
function computePower(tier) {
  const rows = [];
  let gSwr = 0, gSw = 0;
  for (const id of Object.keys(BS.data.chars).map(Number)) {
    const s = charStatTier(id, tier); if (!s || !s.swr) continue;
    const sw = s.g, AP = s.avg, R = s.swr / sw;   // weighted games, avg placement, avg rank
    rows.push({
      id, AP, R, g: sw,
      num: s.swrp - s.swr * AP,                    // within-char Σ(w·rank·place) covariance term
      den: s.swr2 - s.swr * s.swr / sw,            // within-char Σ(w·rank²) variance term
    });
    gSwr += s.swr; gSw += sw;
  }
  const Rbar = gSw ? gSwr / gSw : 0;
  let n = 0, dn = 0; for (const r of rows) { n += r.num; dn += r.den; }
  const b = dn ? n / dn : 0;                      // skill slope (placement per rank point)
  const adj = rows.map((r) => r.AP - b * (r.R - Rbar));   // skill-adjusted placement
  const m = adj.reduce((a, x) => a + x, 0) / (adj.length || 1);
  const sd = Math.sqrt(adj.reduce((a, x) => a + (x - m) ** 2, 0) / (adj.length || 1)) || 1;
  BS.power = {};
  // Sample-size shrinkage: pull each character's Power toward 50 (the average) by
  // k = g/(g+K). A thin sample (e.g. a ~20-weighted-game character at the 6k tier) collapses
  // to ~50 instead of topping the list on noise; well-sampled characters are barely touched.
  // K=410 weighted games = empirical-Bayes σ²/τ² (per-game placement variance over the
  // between-character signal variance), estimated from the data-rich 3k/4k tiers.
  const K = 410;
  rows.forEach((r, i) => {
    const k = r.g / (r.g + K);
    BS.power[r.id] = Math.max(1, Math.min(99, Math.round(50 + 12 * k * (m - adj[i]) / sd)));
  });
}
function powerColor(p) {
  const x = Math.max(0, Math.min(1, (p - 35) / 30));
  return `rgb(${Math.round(232 + (54 - 232) * x)},${Math.round(85 + (196 - 85) * x)},${Math.round(78 + (107 - 78) * x)})`;
}
const avgPlace = (place, g) => g ? place.reduce((s, n, i) => s + (i + 1) * n, 0) / g : 0;
// Aggregate a character from its career-1..7 builds (excludes career 0 = no side-job).
// DaoXin tier -> which non-overlapping bands to sum (cumulative thresholds).
function tierBands(tier) { return tier >= 6000 ? ["C"] : tier >= 4000 ? ["B", "C"] : ["A", "B", "C"]; }
// Character stats at a DaoXin tier (sum the chosen bands across careers 1-7).
function charStatTier(id, tier) {
  const bands = tierBands(tier);
  let g = 0, graw = 0, swr = 0, swr2 = 0, swrp = 0; const place = new Array(8).fill(0); const careers = {};
  for (let cr = 1; cr <= 7; cr++) {
    const t = BS.data.tiers[`${id}_${cr}`]; if (!t) continue;
    let cg = 0, cgraw = 0; const cp = new Array(8).fill(0);
    for (const bd of bands) {
      const e = t[bd]; if (!e) continue;
      cg += e.g; cgraw += e.graw; for (let i = 0; i < 8; i++) cp[i] += e.place[i];
      swr += e.swr; swr2 += e.swr2; swrp += e.swrp;
    }
    if (cg > 0) { g += cg; graw += cgraw; for (let i = 0; i < 8; i++) place[i] += cp[i]; careers[cr] = [cg, cgraw, avgPlace(cp, cg)]; }
  }
  if (!g) return null;
  return { id, g, graw, avg: avgPlace(place, g), place, careers, swr, swr2, swrp };
}
const buildKey = (char, career, v) => `${char}_${career}` + (v ? `|${v}` : "");
const buildStat = (char, career, v) => BS.data.builds[buildKey(char, career, v)];
// Power per character+side-job build: same skill-adjusted placement idea as the
// character Power (see computePower), but each build is its own row, and both the
// shrinkage prior K and the display scale are ESTIMATED PER TIER from the data:
//   σ² = weighted mean within-build per-game placement variance (noise per game)
//   τ² = g-weighted between-build variance of adjusted placement, minus its expected
//        sampling noise (method of moments) -> true skill spread
//   K = σ²/τ²,  score = 50 + 12·k·(m − adj)/√τ²,  k = g/(g+K)
// Scaling by √τ² (true spread) instead of the noise-inflated observed spread keeps
// thin tiers (6000+) readable instead of compressing everything to ~50.
function computeBuildPower(tier) {
  BS.bpowerCache = BS.bpowerCache || {};
  if (BS.bpowerCache[tier]) return BS.bpowerCache[tier];
  const bands = tierBands(tier);
  const rows = [];
  let gSwr = 0, gSw = 0;
  for (const key in BS.data.tiers) {
    if (key.endsWith("_0")) continue;              // skip no-side-job records
    // for strategy-split combos use the variant rows, not the double-counting aggregate
    if (!key.includes("|") && BS.variants && BS.variants[key]) continue;
    const tk = BS.data.tiers[key];
    let g = 0, swr = 0, swr2 = 0, swrp = 0; const place = new Array(8).fill(0);
    for (const bd of bands) {
      const e = tk[bd]; if (!e) continue;
      g += e.g; swr += e.swr; swr2 += e.swr2; swrp += e.swrp;
      for (let i = 0; i < 8; i++) place[i] += e.place[i];
    }
    if (!g || !swr) continue;
    const AP = avgPlace(place, g), R = swr / g;
    const v = place.reduce((s, p, i) => s + p * ((i + 1) - AP) ** 2, 0) / g;  // within-build per-game variance
    rows.push({ key, AP, R, g, v, num: swrp - swr * AP, den: swr2 - swr * swr / g });
    gSwr += swr; gSw += g;
  }
  const Rbar = gSw ? gSwr / gSw : 0;
  let n = 0, dn = 0; for (const r of rows) { n += r.num; dn += r.den; }
  const b = dn ? n / dn : 0;
  const adj = rows.map((r) => r.AP - b * (r.R - Rbar));
  const G = rows.reduce((s, r) => s + r.g, 0), B = rows.length;
  const m = rows.reduce((s, r, i) => s + adj[i] * r.g, 0) / (G || 1);          // g-weighted mean
  const varW = rows.reduce((s, r, i) => s + r.g * (adj[i] - m) ** 2, 0) / (G || 1);
  const sigma2 = rows.reduce((s, r) => s + r.v * r.g, 0) / (G || 1);
  const denom = Math.max(0.1, 1 - rows.reduce((s, r) => s + r.g * r.g, 0) / ((G || 1) ** 2));
  const tau2 = Math.max((varW - sigma2 * (B - 1) / (G || 1)) / denom, 0.005);
  const K = Math.min(2000, Math.max(10, sigma2 / tau2));
  const sd = Math.sqrt(tau2);
  const out = {};
  rows.forEach((r, i) => {
    const k = r.g / (r.g + K);
    out[r.key] = Math.max(1, Math.min(99, Math.round(50 + 12 * k * (m - adj[i]) / sd)));
  });
  return BS.bpowerCache[tier] = out;
}

// ---- v3 band-split helpers -------------------------------------------------
// v3 build data splits every stat by DaoXin band (0/1/2 = 3000-3999 / 4000-5999 / 6000+).
const BAND_IDX = { 3000: [0, 1, 2], 4000: [1, 2], 6000: [2] };
function sumBands(s3, idxs) {
  const n = s3[0].length, o = new Array(n).fill(0);
  for (const i of idxs) for (let j = 0; j < n; j++) o[j] += s3[i][j];
  return o;
}
// Collapse a v3 band-split build into the flat shape the renderers consume, keeping only
// the bands covered by the selected tier. v2 data is already flat and returned as-is.
// `key` is the full build key incl. strategy variant (e.g. "4000003_1|玄奶").
function collapseBuild(b, key) {
  if (!BS.v3) return b;
  const idxs = BAND_IDX[BS.tier] || [0, 1, 2];
  const radar = {}; for (const k in b.radar) { const [num, den] = sumBands(b.radar[k], idxs); radar[k] = den ? num / den : 0; }
  if (BS.v6) { radar.cx = cxScore(key); radar.pop = popScore(key); }
  const cb = (lst) => lst.map(([fidxs, s3, vars, imgs]) => {
    const [raw, w, ww] = sumBands(s3, idxs);
    const cvars = vars.map(([vf, vs3, vimgs]) => { const [vr, vw, vww] = sumBands(vs3, idxs); return [vf, vr, vw, vww, vimgs]; }).filter((v) => v[1] > 0);
    return [fidxs, raw, w, ww, cvars, imgs];
  }).filter((e) => e[1] > 0);
  const boards = {}; for (const r in b.boards) boards[r] = cb(b.boards[r]);
  const mboards = {}; for (const oc in b.mboards || {}) { const l = cb(b.mboards[oc]); if (l.length) mboards[oc] = l; }
  const matchup = b.matchup.map(([oc, s3]) => { const [raw, wg, wh, myS, oppS] = sumBands(s3, idxs); return [oc, raw, wg, wh, myS, oppS]; })
    .filter((m) => m[1] > 0).sort((x, y) => y[1] - x[1]);
  // games / placement distribution at this tier come from the light file's band split
  const tk = BS.data.tiers[key] || {};
  let g = 0, graw = 0; const place = new Array(8).fill(0);
  for (const bd of tierBands(BS.tier)) {
    const e = tk[bd]; if (!e) continue;
    g += e.g; graw += e.graw; for (let i = 0; i < 8; i++) place[i] += e.place[i];
  }
  // per-round median curves (v5): precomputed per tier -> pick the tier's rows directly
  // [w, medianRerolls, medianRealm]. (v4 sum-format curves are skipped.)
  let curve = null;
  if (BS.v5 && b.curve) curve = b.curve[{ 3000: 0, 4000: 1, 6000: 2 }[BS.tier] || 0];
  return { g, graw, place, radar, matchup, boards, mboards, curve };
}
// selection rows: v3+ [oid, perBand [sel, off, placew, selRaw?, offRaw?]] ->
// flat [oid, sel, off, placew, selRaw?, offRaw?] (raw fields exist since v5)
function collapseSelRows(rows) {
  if (!BS.fv3) return rows;
  const idxs = BAND_IDX[BS.tier] || [0, 1, 2];
  return rows.map(([oid, s3]) => [oid, ...sumBands(s3, idxs)])
    .filter((r) => r[1] > 0 || r[2] > 0).sort((x, y) => y[1] - x[1]);
}
// radar percentile pool for the current tier (v3: built on demand and cached per tier)
function getAxv() {
  if (!BS.v3) return BS.axv;
  BS.axvCache = BS.axvCache || {};
  if (BS.axvCache[BS.tier]) return BS.axvCache[BS.tier];
  const idxs = BAND_IDX[BS.tier] || [0, 1, 2];
  const axv = {}; radarAxes().forEach(([k]) => axv[k] = []);
  // v6 (current season): e/m/l are compared only within the top-50 combo population
  // (see radarPopulation()); the frozen season-9 tab keeps comparing against every
  // build, unchanged.
  const ids = BS.v6 ? radarPopulation() : Object.keys(BS.data.builds);
  for (const id of ids) {
    const b = BS.data.builds[id]; if (!b) continue;
    const tk = BS.data.tiers[id]; if (!tk) continue;
    let g = 0; for (const bd of tierBands(BS.tier)) if (tk[bd]) g += tk[bd].g;
    if (g < 20) continue;
    radarAxes().forEach(([k]) => {
      if (k === "cx" || k === "pop") return;   // rank scores already computed, no pool needed here
      const [num, den] = sumBands(b.radar[k], idxs); if (den) axv[k].push(num / den);
    });
  }
  radarAxes().forEach(([k]) => axv[k].sort((a, b) => a - b));
  return BS.axvCache[BS.tier] = axv;
}

// ---- 轮椅指数 (wheelchair index) --------------------------------------------
// Ranks character+side-job builds by "strong AND repetitive from round 12 on".
// Data per build/tier: [w_rounds, raw_rounds, wr, poolEff, slotEff, avgPlace, games]
// (entropy-based effective counts, recency-weighted). Score = mean of three
// percentiles: good FINAL PLACEMENT, small effective card pool, few choices per slot.
function wheelchairRows() {
  const wc = BS.data.wc; if (!wc) return null;
  const tier = String(BS.tier);
  const rows = [];
  for (const key in wc) {
    const e = wc[key][tier]; if (!e) continue;
    const [, raw, wr, pool, slot, avgPl] = e;
    if (e.length < 7 || raw < 1000 || !avgPl) continue;  // sample gate + needs placement data
    // split combos are keyed "char_career|variant" (e.g. 屠馗's 百杀/崩拳/其他)
    const [combo, variant] = key.split("|");
    const [ch, cr] = combo.split("_").map(Number);
    if (!cr) continue;                             // skip the rare no-side-job records
    rows.push({ ch, cr, variant: variant || "", wr, pool, slot, avgPl, raw });
  }
  if (!rows.length) return null;                   // old data without placement -> "updating"
  const pct = (arr, v) => { let c = 0; for (const x of arr) if (x <= v) c++; return c / arr.length; };
  const pls = rows.map((r) => r.avgPl).sort((a, b) => a - b);
  const pools = rows.map((r) => r.pool).sort((a, b) => a - b);
  const slots = rows.map((r) => r.slot).sort((a, b) => a - b);
  for (const r of rows) {
    r.score = Math.round(100 * ((1 - pct(pls, r.avgPl)) + (1 - pct(pools, r.pool)) + (1 - pct(slots, r.slot))) / 3);
  }
  return rows.sort((a, b) => b.score - a.score || b.raw - a.raw);
}
// Strategy-variant display labels. Data keys carry the raw pipeline label; some are
// renamed for display per combo (so already-published data reads right), and every
// label gets an English name.
// Season-9 era only: that pipeline emitted catch-all labels these map to display names.
// Season-10 labels come from user-named signatures and already read right (其他 is real).
const VAR_RENAME = {                    // "char_career" or "char" -> {rawLabel: displayLabel}
  "4000003_1": { "其他": "崩拳" },     // 叶冥冥+炼丹师: the non-玄奶 line is 崩拳
  "1000006": { "其他": "白板" },       // 黎承云 (all side-jobs): the non-融剑 line is 白板
};
const VAR_EN = {
  "其他": "Other", "白板": "Vanilla", "崩拳": "Crash Fist", "百杀": "Realm Killing Palms",
  "玄奶": "Mystic Heal", "融剑": "Sword Fusion", "符防": "Talisman Guard",
  "符剑意": "Talisman Sword Intent", "田土": "Earth Field", "混元": "Primordial",
  "逆克": "Overcome", "定魂": "Soulstat",
  "纯水": "Mono Water", "纯火": "Mono Fire", "纯木": "Mono Wood", "纯土": "Mono Earth", "纯金": "Mono Metal",
  "狂剑": "Unrestrained Sword", "云剑": "Cloud Sword", "多段": "Multi-hit", "火木": "Fire & Wood", "答辩": "World Smash",
  "木火": "Wood & Fire", "金水": "Metal & Water", "无极": "Limitless",
};
function wcVarLabel(v, ch, cr) {
  const rn = BS.season === 9 ? ((ch != null && VAR_RENAME[`${ch}_${cr}`]) || (ch != null && VAR_RENAME[String(ch)]) || null) : null;
  const disp = (rn && rn[v]) || v;
  return S.lang === "en" ? (VAR_EN[disp] || disp) : disp;
}
function renderWheelchairList(host) {
  const rows = wheelchairRows();
  if (!rows) { host.innerHTML = `<div class="empty">${t("updating")}</div>`; return; }
  let html = `<div class="wcnote">${t("wheelchairNote")}</div><div class="cgrid">`;
  rows.forEach((r, i) => {
    const vtag = r.variant ? ` <span class="wcvar">${wcVarLabel(r.variant, r.ch, r.cr)}</span>` : "";
    html += `<div class="cchip wc" data-ch="${r.ch}" data-cr="${r.cr}" data-v="${r.variant}"
        title="${t("avgplace")} ${r.avgPl.toFixed(2)} · ${t("wcWR")} ${(r.wr * 100).toFixed(1)}% · ${t("wcPool")} ${r.pool.toFixed(1)} · ${t("wcSlot")} ${r.slot.toFixed(2)} · n=${r.raw.toLocaleString()}">
      <span class="rank">#${i + 1}</span>
      <img loading="lazy" src="${charAvatar(r.ch)}" onerror="this.style.visibility='hidden'">
      <img class="sjbadge" src="${sidejobBadge(r.cr)}" onerror="this.style.visibility='hidden'">
      <div class="cn">${charName(r.ch)}${vtag}</div><div class="cs">${careerName(r.cr)}</div>
      <div class="big" style="color:${powerColor(r.score)}">${r.score}</div>
      <div class="sub2">${t("avgplace")} ${r.avgPl.toFixed(2)} · ${t("wcPool")} ${r.pool.toFixed(0)} · ${t("wcSlot")} ${r.slot.toFixed(1)}</div></div>`;
  });
  host.innerHTML = html + `</div>`;
  host.querySelectorAll(".cchip.wc").forEach((el) => el.onclick = async () => {
    BS.char = +el.dataset.ch; BS.career = +el.dataset.cr; BS.variant = el.dataset.v || ""; BS.realm = null;
    BS.boardsShowAll = false; BS.mShowAll = false;
    BS.screen = "build"; renderBuilds();
    try { await ensureBuilds(); } catch (e) { console.error("build data load failed", e); }
    renderBuilds();
  });
}

function renderBuilds() {
  if (!BS.data) return;
  if (BS.screen === "list" && !Object.keys(BS.data.chars || {}).length) {
    // the season is configured but has no ranked games yet (right after a rollover)
    renderCrumbs();
    $("#bsort-ctl").style.display = "none"; $("#tier-ctl").style.display = "none";
    $("#builds-content").innerHTML = `<div class="empty">${t("buildsEmpty")}</div>`;
    return;
  }
  // the wheelchair sort needs wc data (published with the newest pipeline)
  const wcOpt = document.querySelector('#bsort option[value="wheelchair"]');
  if (wcOpt) wcOpt.hidden = !BS.data.wc;
  $("#bsort-ctl").style.display = BS.screen === "list" ? "" : "none";
  // the build page supports the tier filter only with v3 (band-split) data
  $("#tier-ctl").style.display = (BS.screen === "build" && !BS.v3) ? "none" : "";
  renderCrumbs();
  const host = $("#builds-content");
  if (BS.screen === "list") (BS.sort === "wheelchair" ? renderWheelchairList : renderCharList)(host);
  else if (BS.screen === "char") renderCharDetail(host);
  else renderBuildDetail(host);
  enter(host);
}
function renderCrumbs() {
  const c = $("#crumbs"); c.innerHTML = "";
  const add = (label, fn, cur) => { const s = document.createElement(cur ? "span" : "a"); s.textContent = label; s.className = cur ? "cur" : ""; if (fn) s.onclick = fn; c.appendChild(s); };
  const sep = () => { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; c.appendChild(s); };
  add(t("characters"), BS.screen !== "list" ? () => { BS.screen = "list"; renderBuilds(); } : null, BS.screen === "list");
  if (BS.char != null && BS.screen !== "list") { sep(); add(charName(BS.char), BS.screen === "build" ? () => { BS.screen = "char"; renderBuilds(); } : null, BS.screen === "char"); }
  if (BS.screen === "build") { sep(); add(careerName(BS.career) + (BS.variant ? ` · ${wcVarLabel(BS.variant, BS.char, BS.career)}` : ""), null, true); }
}
function renderCharList(host) {
  const rows = Object.keys(BS.data.chars).map((id) => charStatTier(+id, BS.tier)).filter((r) => r && r.g > 0);
  if (BS.sort === "place") rows.sort((a, b) => a.avg - b.avg);
  else if (BS.sort === "pop") rows.sort((a, b) => b.g - a.g);
  else rows.sort((a, b) => (BS.power[b.id] || 0) - (BS.power[a.id] || 0));
  // 使用率 = recency-weighted share of the field at this tier (sums to 100% across characters),
  // so the displayed popularity matches the recency-weighted ordering instead of a raw count.
  const totG = rows.reduce((s, r) => s + r.g, 0) || 1;
  const grid = document.createElement("div"); grid.className = "cgrid";
  for (const r of rows) {
    const pw = BS.power[r.id] || 0;
    const pct = r.g / totG * 100;
    const big = BS.sort === "place" ? r.avg.toFixed(2) : BS.sort === "pop" ? pct.toFixed(1) + "%" : pw;
    const sub = BS.sort === "place" ? t("avgplace") : BS.sort === "pop" ? t("popularity") : "";
    // n (raw games): shown with the 使用率 label; the 强度 view shows no label / n
    const subTxt = BS.sort === "power" ? "" : `${sub} · n=${r.graw.toLocaleString()}`;
    const el = document.createElement("div"); el.className = "cchip";
    el.innerHTML = `<img loading="lazy" src="${charAvatar(r.id)}" onerror="this.style.visibility='hidden'">
      <div class="cn">${charName(r.id)}</div><div class="cs">${sectName(+String(r.id)[0])}</div>
      <div class="big" style="color:${BS.sort === 'power' ? powerColor(pw) : 'var(--text)'}">${big}</div>
      ${subTxt ? `<div class="sub2">${subTxt}</div>` : ""}`;
    el.onclick = () => { BS.char = r.id; BS.screen = "char"; renderBuilds(); };
    grid.appendChild(el);
  }
  host.innerHTML = ""; host.appendChild(grid);
}
function placeBarsHTML(place, g) {
  const mx = Math.max(1, ...place); let s = '<div class="placebars">';
  for (let i = 0; i < 8; i++) {
    s += `<div class="pb" title="#${i + 1}: ${place[i]} (${g ? (100 * place[i] / g).toFixed(0) : 0}%)">
      <i style="height:${place[i] / mx * 100}%;background:${i < 4 ? 'var(--good)' : 'var(--bad)'}"></i><span>${i + 1}</span></div>`;
  }
  return s + "</div>";
}
function renderCharDetail(host) {
  const id = BS.char, c = charStatTier(id, BS.tier);
  const careers = Object.keys(c.careers).map(Number).sort((a, b) => c.careers[b][0] - c.careers[a][0]);
  const maxg = Math.max(1, ...careers.map((cr) => c.careers[cr][0]));
  let html = `<div class="bh"><img class="av" src="${charAvatar(id)}" onerror="this.style.visibility='hidden'">
    <div class="htxt"><h2>${charName(id)}</h2><div class="meta">${sectName(+String(id)[0])}</div>
      <div class="kpis">
        <div class="kpi"><b style="color:${powerColor(BS.power[id] || 0)}">${BS.power[id] || 0}</b><span>${t("powerScore")}</span></div>
        <div class="kpi"><b>${c.avg.toFixed(2)}</b><span>${t("avgplace")}</span></div>
        <div class="kpi"><b>${c.graw.toLocaleString()}</b><span>${t("games")}</span></div>
      </div></div></div>`;
  html += `<div class="bsection"><h3>${t("placement")}</h3>${placeBarsHTML(c.place, c.g)}</div>`;
  html += `<div class="bsection"><h3>${t("sidejobs")} <span style="color:var(--muted);font-size:12px">— ${t("selectCareer")}</span></h3>`;
  const bpow = computeBuildPower(BS.tier);
  // per-variant stats at the current tier, straight from the light file's band split
  const variantStat = (vkey) => {
    const tk = BS.data.tiers[vkey] || {};
    let g = 0, graw = 0; const place = new Array(8).fill(0);
    for (const bd of tierBands(BS.tier)) {
      const e = tk[bd]; if (!e) continue;
      g += e.g; graw += e.graw; for (let i = 0; i < 8; i++) place[i] += e.place[i];
    }
    return { g, graw, avg: avgPlace(place, g) };
  };
  for (const cr of careers) {
    const [gw, graw, avg] = c.careers[cr];
    const combo = `${id}_${cr}`;
    const vars = (BS.variants || {})[combo];
    const bp = bpow[combo] || 0;
    html += `<div class="sjrow${vars ? " split" : ""}" data-career="${cr}"><img src="${sidejobBadge(cr)}" onerror="this.style.visibility='hidden'">
      <div class="nm">${careerName(cr)}${vars ? ` <span class="wcvar">${t("strategies")} ▾</span>` : ""}</div><div class="barwrap"><i style="width:${100 * gw / maxg}%"></i></div>
      <div class="rt" title="${t("powerTip")}">${vars ? "" : `${t("powerScore")} <b style="color:${powerColor(bp)}">${bp}</b> · `}${graw.toLocaleString()} ${t("games")} · ${t("avgplace")} <b>${avg.toFixed(2)}</b></div></div>`;
    if (vars) {
      const vstats = vars.map((v) => ({ v, ...variantStat(`${combo}|${v}`) })).filter((s) => s.graw > 0);
      html += `<div class="sjvars" hidden>`;
      for (const s of vstats) {
        const vp = bpow[`${combo}|${s.v}`] || 0;
        // bar on the same scale as the character's side-job rows (maxg), so a
        // strategy's share is directly comparable with the rows above it
        html += `<div class="sjrow vchild" data-career="${cr}" data-variant="${s.v}">
          <span class="wcvar">${wcVarLabel(s.v, id, cr)}</span><div class="barwrap"><i style="width:${Math.min(100, 100 * s.g / maxg)}%"></i></div>
          <div class="rt" title="${t("powerTip")}">${t("powerScore")} <b style="color:${powerColor(vp)}">${vp}</b> · ${s.graw.toLocaleString()} ${t("games")} · ${t("avgplace")} <b>${s.avg.toFixed(2)}</b></div></div>`;
      }
      html += `</div>`;
    }
  }
  html += `</div>`;
  host.innerHTML = html;
  host.querySelectorAll(".sjrow").forEach((r) => r.onclick = async () => {
    if (r.classList.contains("split")) {           // parent row of a split combo -> toggle its strategies
      const v = r.nextElementSibling;
      if (v && v.classList.contains("sjvars")) v.hidden = !v.hidden;
      return;
    }
    BS.career = +r.dataset.career; BS.variant = r.dataset.variant || ""; BS.realm = null;
    BS.boardsShowAll = false; BS.mShowAll = false;
    BS.screen = "build"; renderBuilds();           // immediate feedback (shows "Loading…")
    try { await ensureBuilds(); } catch (e) { console.error("build data load failed", e); }
    renderBuilds();                                // full render once data is in
  });
}
function radarSVG(b) {
  const R = 76, cx = 145, cy = 110;
  // shape = percentile of this build vs the comparison population (relative strength).
  // Damage axes (destiny dmg RECEIVED per round) are inverted — taking little damage
  // reads big; 人气 and 卡组简易程度 point outward as-is (bigger = more popular / simpler).
  const AX = radarAxes();
  const axv = getAxv();
  const INV = { e: 1, m: 1, l: 1, f: 1, s: 1 };
  const vals = AX.map(([k]) => {
    const v = b.radar[k];
    if (k === "cx" || k === "pop") return v == null ? 0 : v / 100;   // already rank scores
    const arr = axv[k];
    if (!arr || !arr.length || v == null) return 0;
    let c = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] <= v) c++;
    const p = c / arr.length;
    return BS.v2 && INV[k] ? 1 - p : p;
  });
  const ang = (i) => (-90 + i * 72) * Math.PI / 180;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
  let svg = `<svg width="290" height="224" viewBox="0 0 290 224">`;
  [0.33, 0.66, 1].forEach((rr) => { svg += `<polygon points="${AX.map((_, i) => pt(i, rr).join(",")).join(" ")}" fill="none" stroke="#2c3445"/>`; });
  AX.forEach(([k, lk], i) => {
    const [x, y] = pt(i, 1); svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#2c3445"/>`;
    const [lx, ly] = pt(i, 1.28);
    // damage axes: actual dmg/round; pop/cx: 0-100 rank score; v1 legacy: WR%
    const v = b.radar[k];
    const lab = !BS.v2 ? Math.round((v || 0) * 100) + "%"
      : (k === "cx" || k === "pop") ? (v == null ? "–" : v.toFixed(0))
      : (v || 0).toFixed(1);
    svg += `<text x="${lx}" y="${ly}" fill="#94a0b4" font-size="11" text-anchor="middle">
      <tspan x="${lx}">${t(lk)}</tspan><tspan x="${lx}" dy="12" fill="#cfd8e6" font-weight="700">${lab}</tspan></text>`;
    // ⓘ next to the axis name: click for what this index means
    const ix = lx + (t(lk).length * (S.lang === "zh" ? 11 : 6) / 2) + 9, iy = ly - 4;
    svg += `<g class="rinfo" data-k="${k}" style="cursor:pointer"><circle cx="${ix}" cy="${iy}" r="7" fill="#222938" stroke="#5b8cff"/>`
      + `<text x="${ix}" y="${iy + 3.5}" font-size="10" font-style="italic" font-weight="700" fill="#cfd8e6" text-anchor="middle">i</text></g>`;
  });
  svg += `<polygon class="rshape" points="${vals.map((v, i) => pt(i, Math.max(0.04, v)).join(",")).join(" ")}" fill="rgba(91,140,255,.35)" stroke="#5b8cff" stroke-width="2"/>`;
  return svg + `</svg>`;
}
function cardImgs(fidxs, imgs) {
  const fam = BS.data.families;
  // imgs (v2) = per-slot most common card LEVEL id for this board; fall back to the
  // family's representative art on older data.
  return fidxs.map((i, j) => { const f = fam[i]; const nm = (S.lang === "zh" ? f.cn : f.en) || f.cn || ""; const im = (imgs && imgs[j]) || f.img; return `<img title="${nm}" loading="lazy" src="${WIKI}${im}_${S.lang}.webp" onerror="this.onerror=null;this.src='${WIKI}${im}_en.webp'">`; }).join("");
}
function boardRowHTML(fidxs, raw, wc, ww, cls, hint, imgs) {
  const wr = wc ? ww / wc : 0;
  return `<div class="board ${cls || ""}"><div class="cards">${cardImgs(fidxs, imgs)}</div>
    <div class="bstat"><span class="wr" style="color:${wrColor(wr)}">${(wr * 100).toFixed(0)}%</span> ${t("roundWR")}<br>
    <span class="muted">${t("usedTimes")} ${raw.toLocaleString()}×${hint || ""}</span></div></div>`;
}
// Boards are merged by card-SET; entry = [reprFamlist, raw, w_count, w_wins, variations, imgs].
// Threshold on merged raw occurrences; multi-arrangement boards expand to their variations.
function boardListHTML(list, showAll) {
  const shown = showAll ? list : list.filter((x) => x[1] >= BOARD_MIN);
  const hidden = list.length - shown.length;
  let html = "";
  if (!shown.length) {
    html += `<div class="empty" style="padding:12px">${t("notEnoughBoards")}</div>`;
  } else {
    for (const [fidxs, raw, wc, ww, vars, imgs] of shown) {
      const multi = vars && vars.length > 1;
      const hint = multi ? ` · <span class="varhint">▸ ${vars.length} ${t("arrangements")}</span>` : "";
      html += boardRowHTML(fidxs, raw, wc, ww, multi ? "expandable" : "", hint, imgs);
      if (multi) {
        html += `<div class="board-vars" hidden>`;
        for (const [vf, vraw, vwc, vww, vimgs] of vars) html += boardRowHTML(vf, vraw, vwc, vww, "vrow", "", vimgs);
        html += `</div>`;
      }
    }
  }
  if (!showAll && hidden > 0) html += `<button class="showmore">${t("showMore")} (${hidden})</button>`;
  return html;
}
function wireExpand(box) {
  box.querySelectorAll(".board.expandable").forEach((el) => el.onclick = () => {
    const v = el.nextElementSibling;
    if (v && v.classList.contains("board-vars")) { v.hidden = !v.hidden; el.classList.toggle("open"); }
  });
}
function matchupHTML(b) {
  // v2: matchup = head-to-head FINAL PLACEMENT vs each character (same lobby, real
  // >=3000 opponents). % = share of games this build finished above that character.
  if (!BS.v2) return `<div class="empty" style="padding:14px">${t("updating")}</div>`;
  const rows = b.matchup.filter((m) => m[1] >= 8).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<div class="empty" style="padding:14px">${t("noBuildData")}</div>`;
  let s = '<div class="mgrid">';
  for (const [oc, raw, wg, whigh, myS, oppS] of rows) {
    const rate = wg ? whigh / wg : 0, my = wg ? myS / wg : 0, op = wg ? oppS / wg : 0;
    const has = b.mboards && b.mboards[oc] ? "" : " nob";
    s += `<div class="mcell${has}" data-opp="${oc}" title="${t("avgplace")}: ${t("youAbbr")} ${my.toFixed(2)} · ${t("oppAbbr")} ${op.toFixed(2)}">
      <img src="${charAvatar(oc)}" onerror="this.style.visibility='hidden'">
      <div><div class="mn">${charName(oc)}</div><div class="mwr" style="color:${wrColor(rate)}">${(rate * 100).toFixed(0)}%</div>
      <div class="mnn">${my.toFixed(2)}/${op.toFixed(2)} · n=${raw}</div></div></div>`;
  }
  return s + '</div><div id="matchupDetail" class="matchup-detail"></div>';
}
function renderMatchupDetail(b, oc) {
  const box = $("#matchupDetail"); if (!box) return;
  document.querySelectorAll(".mcell").forEach((c) => c.classList.toggle("on", +c.dataset.opp === oc));
  const m = b.matchup.find((x) => x[0] === oc);   // [oc, raw, w_games, w_higher, w_selfPlace, w_oppPlace]
  const wg = m ? m[2] : 0, rate = wg ? m[3] / wg : 0, my = wg ? m[4] / wg : 0, op = wg ? m[5] / wg : 0;
  const mb = (b.mboards || {})[oc] || [];
  let html = `<div class="mdh"><img src="${charAvatar(oc)}" onerror="this.style.visibility='hidden'">
    <span><b>${t("lateBoards")} ${charName(oc)}</b> · <span style="color:${wrColor(rate)}">${(rate * 100).toFixed(0)}% ${t("hhHigher")}</span>
    · ${t("avgplace")} ${t("youAbbr")} ${my.toFixed(2)} / ${t("oppAbbr")} ${op.toFixed(2)} (n=${m ? m[1] : 0})</span></div>`;
  html += boardListHTML(mb, BS.mShowAll);
  box.innerHTML = html;
  wireExpand(box); enter(box);
  const sm = box.querySelector(".showmore"); if (sm) sm.onclick = () => { BS.mShowAll = true; renderMatchupDetail(b, oc); };
}
function renderBoards(b) {
  const box = $("#boardsBox"); if (!box) return;
  const realms = Object.keys(b.boards).filter((r) => b.boards[r].length).map(Number).sort((a, b) => a - b);
  if (!realms.length) { box.innerHTML = `<div class="empty" style="padding:14px">${t("noBuildData")}</div>`; return; }
  if (BS.realm == null || !realms.includes(BS.realm)) BS.realm = realms[realms.length - 1];
  let html = `<div class="realmtabs">` + realms.map((r) => `<button class="${r === BS.realm ? 'on' : ''}" data-r="${r}">${(S.lang === "zh" ? REALM_ZH : REALM_EN)[r - 1] || (t("realm") + " " + r)}</button>`).join("") + `</div>`;
  html += boardListHTML(b.boards[BS.realm], BS.boardsShowAll);
  box.innerHTML = html;
  wireExpand(box); enter(box);
  box.querySelectorAll(".realmtabs button").forEach((btn) => btn.onclick = () => { BS.realm = +btn.dataset.r; BS.boardsShowAll = false; renderBoards(b); });
  const sm = box.querySelector(".showmore"); if (sm) sm.onclick = () => { BS.boardsShowAll = true; renderBoards(b); };
}
function renderBuildDetail(host) {
  if (!BS.data.builds) { host.innerHTML = `<div class="empty">${t("loading")}</div>`; return; }
  const key = buildKey(BS.char, BS.career, BS.variant);
  let b = buildStat(BS.char, BS.career, BS.variant);
  if (!b || b.g < 1) { host.innerHTML = `<div class="empty">${t("noBuildData")}</div>`; return; }
  b = collapseBuild(b, key);
  if (!b.graw) { host.innerHTML = `<div class="empty">${t("notAtTier")}</div>`; return; }
  const avg = avgPlace(b.place, b.g);
  const bp = computeBuildPower(BS.tier)[key] || 0;
  const vtag = BS.variant ? ` <span class="wcvar" style="font-size:14px">${wcVarLabel(BS.variant, BS.char, BS.career)}</span>` : "";
  host.innerHTML = `<div class="bh"><img class="av" src="${charAvatar(BS.char)}" onerror="this.style.visibility='hidden'">
    <div class="htxt"><h2>${charName(BS.char)} · ${careerName(BS.career)}${vtag}</h2><div class="meta">${sectName(+String(BS.char)[0])}</div>
      <div class="kpis">
        <div class="kpi" title="${t("powerTip")}"><b style="color:${powerColor(bp)}">${bp}</b><span>${t("powerScore")}</span></div>
        <div class="kpi"><b>${avg.toFixed(2)}</b><span>${t("avgplace")}</span></div>
        <div class="kpi"><b>${b.graw.toLocaleString()}</b><span>${t("games")}</span></div>
      </div></div>
      <div class="bh-sel">${fatesSectionHTML(key)}</div></div>
    <div class="bcols">
      <div><div class="bsection"><h3>${t("power")} </h3>${radarSVG(b)}</div>
        <div class="bsection"><h3>${t("placement")}</h3>${placeBarsHTML(b.place, b.g)}</div>
        ${b.curve ? `<div class="bsection"><h3>${t("rerollsByRound")}</h3><div id="chartRC" class="chart"></div></div>
        <div class="bsection"><h3>${t("realmByRound")}</h3><div id="chartLV" class="chart"></div></div>` : ""}</div>
      <div><div class="bsection"><h3>${t("boards")}</h3><div id="boardsBox"></div></div>
        <div class="bsection"><h3>${t("matchup")} <span style="color:var(--muted);font-size:12px">(${t("vsReal")}) · % = ${t("hhHigher")} · ${t("matchHint")}</span></h3>${matchupHTML(b)}</div></div>
    </div>`;
  renderBoards(b);
  if (b.curve) renderCurves(b);
  host.querySelectorAll(".mcell").forEach((c) => c.onclick = () => { BS.mShowAll = false; renderMatchupDetail(b, +c.dataset.opp); });
}
// per-round curves on the build page: avg rerolls held + avg realm level (recency-weighted)
function renderCurves(b) {
  let last = 0;
  b.curve.forEach((c, i) => { if (c[0] > 0.001) last = i + 1; });
  if (!last) return;
  const val = (r, j) => b.curve[r - 1][j];   // precomputed weighted medians
  // rerolls: FIXED y-scale 0-20 so bar heights read directly; past R13 it's ~0, so stop there
  const rcRounds = []; for (let r = 1; r <= Math.min(last, 13); r++) rcRounds.push(r);
  drawLineChart($("#chartRC"), rcRounds.map((r) => ({
    r, w: b.curve[r - 1][0], med: val(r, 1), lo: b.curve[r - 1][3], hi: b.curve[r - 1][4],
  })));
  // realm timing table: first round where the median realm reaches each level
  const zh = S.lang === "zh", names = zh ? REALM_ZH : REALM_EN;
  const reach = {};
  for (let r = 1; r <= last; r++) {
    const c = b.curve[r - 1]; if (!(c[0] > 0.001)) continue;
    for (let L = 1; L <= c[2]; L++) if (reach[L] == null) reach[L] = r;
  }
  const lv = $("#chartLV"); lv.className = "";
  const maxL = Math.max(5, ...Object.keys(reach).map(Number));
  let tb = `<table class="realmtbl"><tr><th>${t("realm")}</th><th>${zh ? "达成回合（中位数）" : "Round reached (median)"}</th></tr>`;
  for (let L = 1; L <= maxL; L++) tb += `<tr><td>${names[L - 1] || (t("realm") + " " + L)}</td><td>${reach[L] != null ? (zh ? "第 " + reach[L] + " 回合" : "R" + reach[L]) : "–"}</td></tr>`;
  lv.innerHTML = tb + `</table>`;
}
// ---- Fates & 天衍 -----------------------------------------------------------
const FBUCKET_COLOR = { innate: "#c9a227", cultivation: "#5b8cff", other: "#36c46b" };
const KIND_COLOR = { deriv: "#5b8cff", daoyun: "#b06fd8" };
function fname(oid) { const e = (BS.data.fnames || {})[oid] || {}; return (S.lang === "zh" ? e.cn : e.en) || e.cn || ("#" + oid); }
function dname(oid) { const e = (BS.data.dnames || {})[oid] || {}; return (S.lang === "zh" ? e.cn : e.en) || e.cn || ("#" + oid); }
function yname(oid) { const e = (BS.data.ynames || {})[oid] || {}; return (S.lang === "zh" ? e.cn : e.en) || e.cn || ("#" + oid); }
function selIconURL(oid, kind) {
  if (kind === "daoyun") return `${WIKI}${oid}_${S.lang}.webp`;   // 道韵 options are cards -> card art
  let e = ((kind === "fate" ? BS.data.fnames : BS.data.dnames) || {})[oid] || {};
  if (kind === "fate" && BS.fateIconBy && e.cn && BS.fateIconBy[e.cn]) e = BS.fateIconBy[e.cn];   // same name as a phase-1 fate -> phase-1 icon
  // the wiki serves .webp only now; older data JSON may still carry .png icon names
  return e.icon ? (BS.iconBase + e.icon.replace(/\.png$/i, ".webp")) : "";
}
function selIcon(oid, kind, cls) {
  const u = selIconURL(oid, kind);
  return u ? `<img class="${cls}" src="${u}" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="${cls} noimg"></span>`;
}
// kind: "fate" (天命) | "deriv" (天衍) | "daoyun" (道韵)
// phase labels: 天命 1-4 = realm names; 道韵 = 第N次; 天衍 keeps its number
const REALM_ZH = ["练气", "筑基", "金丹", "元婴", "化神"];
const REALM_EN = ["Meditation", "Foundation", "Virtuoso", "Immortality", "Incarnation"];
function ordLabel(kind, n) {
  const zh = S.lang === "zh";
  if (kind === "fate") return (zh ? REALM_ZH : REALM_EN)[n] || n;           // fate phases 1-4 -> 筑基..化神
  if (kind === "daoyun") return zh ? `第${n}次` : (n === 1 ? "1st" : n === 2 ? "2nd" : n + "th");
  return n;
}
function fatePhaseHTML(rows, ord, kind) {
  rows = collapseSelRows(rows);
  if (!rows.length) return "";
  const N = BS.data.fnames || {};
  const nm = kind === "fate" ? fname : kind === "deriv" ? dname : yname;
  let pick;
  if (kind === "fate") {              // highest-appeared fate of the highest-selected bucket
    const bt = {};
    for (const [oid, ch] of rows) { const bk = (N[oid] || {}).bucket || "other"; bt[bk] = (bt[bk] || 0) + ch; }
    const topB = Object.keys(bt).sort((a, b) => bt[b] - bt[a])[0];
    pick = rows.find((r) => ((N[r[0]] || {}).bucket || "other") === topB) || rows[0];
  } else if (kind === "daoyun") {     // most-chosen real pick — the free 自在随心 is skipped
    const Y = BS.data.ynames || {};
    pick = rows.find((r) => r[1] > 0 && !(Y[r[0]] || {}).free) || rows[0];
  } else { pick = rows[0]; }          // most-chosen derivation
  const [oid, ch, , pw] = pick; const avgPl = ch ? pw / ch : 0;
  const col = kind === "fate" ? (FBUCKET_COLOR[(N[oid] || {}).bucket] || "#888") : KIND_COLOR[kind];
  let pop = `<div class="fpop"><table><tr><th>${t(kind === "daoyun" ? "daoyun" : "fateName")}</th><th>${t("picks")}</th><th>${t("pickRate")}</th><th>${t("avgplace")}</th></tr>`;
  for (const [o, c, of_, pw2, craw, ofraw] of rows) {
    if (c <= 0 && of_ <= 0) continue;
    const bc = kind === "fate" ? (FBUCKET_COLOR[(N[o] || {}).bucket] || "#888") : KIND_COLOR[kind];
    // counts & pick-rate are RAW (fall back to weighted on pre-v5 data); placement stays weighted
    const cnt = craw != null ? craw : Math.round(c);
    const rate = craw != null ? (ofraw > 0 ? Math.round(craw / ofraw * 100) + "%" : "–")
                              : (of_ > 0 ? Math.round(c / of_ * 100) + "%" : "–");
    pop += `<tr><td>${selIcon(o, kind, "ricon")}<span class="bdot" style="background:${bc}"></span>${nm(o)}</td><td>${cnt.toLocaleString()}</td>`
      + `<td>${rate}</td><td style="color:${placeColorF(c ? pw2 / c : 0)}">${c ? (pw2 / c).toFixed(2) : "–"}</td></tr>`;
  }
  pop += `</table></div>`;
  return `<div class="fphase"><div class="flabel">${ordLabel(kind, ord)}</div>
    <div class="fchip" style="border-color:${col}">${selIcon(oid, kind, "cicon")}<span class="fchip-t">${nm(oid)}</span>
      <span class="fstat" style="color:${placeColorF(avgPl)}">${avgPl.toFixed(2)}</span></div>${pop}</div>`;
}
function fatesSectionHTML(key) {
  const F = (BS.data.fates || {})[key], D = (BS.data.derivations || {})[key], Y = (BS.data.daoyun || {})[key];
  if (!F && !D && !Y) return "";
  let h = "";
  if (F) {
    h += `<div class="bsection"><h3>${t("fates")} <span class="muted" style="font-size:12px">${t("fatesHint")}</span></h3><div class="fphases">`;
    const sids = Object.keys(F).sort((a, b) => +a - +b);
    BS.fateIconBy = {};                    // fate name -> its phase-1 entry (icon)
    for (const r of collapseSelRows(F[sids[0]] || [])) { const fe = (BS.data.fnames || {})[r[0]]; if (fe && fe.cn && fe.icon && !BS.fateIconBy[fe.cn]) BS.fateIconBy[fe.cn] = fe; }
    sids.forEach((sid, i) => { h += fatePhaseHTML(F[sid], i + 1, "fate"); });
    h += `</div></div>`;
  }
  if (D) {
    h += `<div class="bsection"><h3>${t("tianyan")} <span class="muted" style="font-size:12px">${t("tianyanHint")}</span></h3><div class="fphases">`;
    Object.keys(D).sort((a, b) => +a - +b).forEach((sid, i) => { h += fatePhaseHTML(D[sid], i + 1, "deriv"); });
    h += `</div></div>`;
  }
  if (Y) {
    h += `<div class="bsection"><h3>${t("daoyun")} <span class="muted" style="font-size:12px">${t("daoyunHint")}</span></h3><div class="fphases">`;
    Object.keys(Y).sort((a, b) => +a - +b).forEach((sid, i) => { h += fatePhaseHTML(Y[sid], i + 1, "daoyun"); });
    h += `</div></div>`;
  }
  return h;
}
function wireBuilds() {
  document.querySelectorAll("#tabbar .tab").forEach((tb) => tb.onclick = () => {
    document.querySelectorAll("#tabbar .tab").forEach((x) => x.classList.remove("on")); tb.classList.add("on");
    const isB = tb.dataset.tab.startsWith("builds");
    $("#view-cards").hidden = isB; $("#view-builds").hidden = !isB;
    $("#sub-cards").hidden = isB; $("#sub-builds").hidden = !isB;   // tab-appropriate subtitle
    if (isB) {
      setBuildsSeason(+tb.dataset.tab.slice(6));
      BS.active = true;
      const sb = $("#sub-builds"); sb.dataset.i18n = "subBuilds" + BS.season; sb.textContent = t("subBuilds" + BS.season);
      renderUpdated();                     // footer reflects the selected season's data stamp
      loadBuilds();
    } else {
      BS.active = false;
      if (!CARDS_INIT) { CARDS_INIT = true; loadThreshold(4000); }
    }
  });
  // ⓘ next to the sort box: explains how every sort index is calculated (current one highlighted)
  const sinfo = $("#sortinfo");
  const fillSortInfo = () => {
    const cur = $("#bsort").value;
    sinfo.innerHTML = `<b>${t("infoTitle")}</b>` + [["power", "infoPower"], ["place", "infoPlace"], ["pop", "infoPop"], ["wheelchair", "infoWc"]]
      .map(([k, key]) => `<p class="${k === cur ? "cur" : ""}">${t(key)}</p>`).join("");
  };
  $("#sortinfo-btn").addEventListener("click", (e) => { e.stopPropagation(); fillSortInfo(); sinfo.hidden = !sinfo.hidden; });
  document.addEventListener("click", (e) => { if (!e.target.closest("#sortinfo")) sinfo.hidden = true; });
  // radar axis ⓘ: popover explaining that index
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".rpop").forEach((p) => p.remove());
    const g = e.target.closest && e.target.closest(".rinfo"); if (!g) return;
    e.stopPropagation();
    const p = document.createElement("div"); p.className = "rpop"; const sp = BS.rsplit || [7, 13];   // phase boundaries come from the data (S9 frozen = 7/13, S10 = 9/13)
    p.textContent = t("ri_" + g.dataset.k).replace(/\{a\}/g, 1).replace(/\{b\}/g, sp[0]).replace(/\{c\}/g, sp[0] + 1).replace(/\{d\}/g, sp[1]).replace(/\{e\}/g, sp[1] + 1) + (BS.dnorm && "eml".includes(g.dataset.k) ? " " + t("riNorm") : "");
    document.body.appendChild(p);
    const r = g.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(r.left + scrollX - 20, scrollX + innerWidth - p.offsetWidth - 8)) + "px";
    p.style.top = (r.bottom + scrollY + 8) + "px";
  });
  $("#bsort").addEventListener("change", (e) => { BS.sort = e.target.value; renderBuilds(); });
  seg("tier", (v) => { BS.tier = +v; computePower(BS.tier); renderBuilds(); });
}

boot();
