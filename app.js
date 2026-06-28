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
    footNote: "Win rate = round wins / rounds the card was on the player's board. Levels merged on tiles.",
    levels: "Levels", wrByRound: "Win rate by round", popByRound: "Popularity by round (games)",
    all: "All", none: "None", allSel: "All", nSel: "selected", searchPh: "card name…",
    sect: "Sect", baseLevel: "base", overall: "overall",
    notEnough: "Not enough data to calculate win rate at this Min games.",
    tabCards: "Cards · Tianji Sigil / Dream Weave", tabBuilds: "Builds · Heavenly Derivation", top4rate: "Top-4 win rate",
    avgplace: "Avg placement", sidejobs: "Side-jobs played", power: "Power profile",
    boards: "Popular boards", matchup: "Destiny dmg vs character", realm: "Realm",
    destinyNet: "net/round", dealt: "dealt", received: "received",
    games: "Games", topFinish: "Top-4 rate", placement: "Placement distribution",
    characters: "Characters", axisEarly: "Early", axisMid: "Mid", axisLate: "Late",
    axisFirst: "First", axisSecond: "Second", roundWR: "round WR",
    buildsNote: "Season 9 · DaoXin ≥ 3000 · top-4 placement = win. Absolute rates run high (winners record more) — compare characters relatively.",
    noBuildData: "Not enough games for this build yet.",
    selectCareer: "Pick a side-job below to see its build detail.",
    usedTimes: "used", vsReal: "vs real opponents",
    lateBoards: "Late-game boards vs", matchHint: "click an opponent →",
    powerNote: "round win rate by phase (% = actual, shape = relative)",
    powerScore: "Power", powerTip: "skill-adjusted average placement (controls for player rank; 50 = average character)",
    showMore: "Show more boards", notEnoughBoards: "Not enough data (no board with 30+ games)",
    tier2: "DaoXin ≥",
    subBuilds: "Heavenly Derivation (S9) · DaoXin-ranked builds · recency-weighted (~4-day half-life)",
    arrangements: "arrangements",
    fates: "Fates", tianyan: "天衍 (Derivations)",
    fatesHint: "top pick per phase by bucket · hover for all",
    tianyanHint: "top pick per phase · hover for all",
    fateName: "Fate", picks: "picks", pickRate: "pick %", winTop4: "top-4",
    loading: "Loading…",
  },
  zh: {
    title: "弈仙牌 数据", subPre: "数据来自", subMid: "次出战 ·", subPost: "张卡牌",
    tier: "道心段位", language: "语言", season: "赛季", career: "副职", character: "角色",
    rounds: "回合", sortby: "排序", popularity: "使用率", winrate: "胜率", cardname: "名称",
    mingames: "最少场次", search: "搜索", nomatch: "没有符合条件的卡牌。",
    footData: "数据：", footArt: "卡图：",
    footNote: "胜率 = 该回合胜场 / 该卡在场上的回合数。卡面已合并等级。",
    levels: "等级", wrByRound: "各回合胜率", popByRound: "各回合使用次数",
    all: "全部", none: "清空", allSel: "全部", nSel: "项已选", searchPh: "卡牌名称…",
    sect: "门派", baseLevel: "基础", overall: "总体",
    notEnough: "当前最少场次下数据不足，无法计算胜率。",
    tabCards: "卡牌 · 天机刻印 / 临渊织梦", tabBuilds: "流派 · 天衍万象", top4rate: "前四胜率",
    avgplace: "平均名次", sidejobs: "搭配副职", power: "强度雷达",
    boards: "热门卡组", matchup: "对位命运伤害", realm: "境界",
    destinyNet: "每回合净值", dealt: "造成", received: "承受",
    games: "场次", topFinish: "前四率", placement: "名次分布",
    characters: "角色", axisEarly: "前期", axisMid: "中期", axisLate: "后期",
    axisFirst: "先手", axisSecond: "后手", roundWR: "回合胜率",
    buildsNote: "第9赛季 · 道心≥3000 · 前四视为胜。绝对胜率偏高（赢家上传更多）——请横向比较角色。",
    noBuildData: "该流派样本不足。",
    selectCareer: "选择下方副职查看具体流派。",
    usedTimes: "出现", vsReal: "对真实玩家",
    lateBoards: "后期对位卡组", matchHint: "点击对手 →",
    powerNote: "各阶段回合胜率（% 为实际，形状为相对）",
    powerScore: "强度", powerTip: "经玩家段位校正的平均名次（50 = 平均水平）",
    showMore: "显示更多卡组", notEnoughBoards: "数据不足（没有出现30次以上的卡组）",
    tier2: "道心 ≥",
    subBuilds: "天衍万象（第9赛季）· 道心排位流派 · 近期加权（约4天半衰期）",
    arrangements: "种排列",
    fates: "天命", tianyan: "天衍",
    fatesHint: "各阶段最高桶的热门选择 · 悬停查看全部",
    tianyanHint: "各阶段热门选择 · 悬停查看全部",
    fateName: "天命", picks: "次数", pickRate: "选取率", winTop4: "前四率",
    loading: "加载中…",
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
  BS.active = true;          // Season-9 Builds is the default landing view
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
// net destiny per round color: diverging around 0 (−3 red → +3 green).
function destinyColor(net) {
  const x = Math.max(0, Math.min(1, (net + 3) / 6));
  return `rgb(${Math.round(232 + (54 - 232) * x)},${Math.round(85 + (196 - 85) * x)},${Math.round(78 + (107 - 78) * x)})`;
}
const sgn = (n) => (n >= 0 ? "+" : "") + n.toFixed(1);
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
}
function tile(r) {
  const c = r.c, col = wrColor(r.wr), name = cardName(c);
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <img loading="lazy" src="${WIKI}${c.img}_${S.lang}.png"
      onerror="this.onerror=null;this.src='${WIKI}${c.img}_en.png'" alt="${name}">
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
  $("#mImg").src = `${WIKI}${c.img}_${S.lang}.png`;
  $("#mImg").onerror = function () { this.onerror = null; this.src = `${WIKI}${c.img}_en.png`; };
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

// ---- language --------------------------------------------------------------
function applyLang() {
  document.documentElement.lang = S.lang === "zh" ? "zh" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $("#search").placeholder = t("searchPh");
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
//  BUILDS VIEW (Season 9, hsreplay-style)
// ============================================================================
const WIKI_ROOT = "https://sharpobject.github.io/yxp_wiki/assets/";
const charAvatar = (id) => `${WIKI_ROOT}characters/${id}-avatar.png`;
const sidejobBadge = (c) => `${WIKI_ROOT}side-jobs/side_job_badge_${c}.png`;
const RADAR_AXES = [["e", "axisEarly"], ["m", "axisMid"], ["l", "axisLate"], ["f", "axisFirst"], ["s", "axisSecond"]];

const BS = { active: false, data: null, screen: "list", char: null, career: null, sort: "power", realm: null, power: {}, boardsShowAll: false, mShowAll: false, tier: 3000 };
const BOARD_MIN = 30;   // a board needs >= this many raw occurrences to show by default

async function loadBuilds() {
  if (!BS.data) {
    // light file: meta + chars + tiers — drives the leaderboard, loads instantly
    BS.data = await fetch("data/season9.json").then((r) => r.json());
    computePower(BS.tier);
  }
  renderBuilds();
}
let BUILDS_LOADED = false;
// Heavy file (builds + families) is fetched only when the user first opens a build detail.
async function ensureBuilds() {
  if (BUILDS_LOADED) return;
  // builds are required (throws -> caller catches -> can retry on next click)
  const bd = await fetch("data/season9_builds.json").then((r) => r.json());
  BS.data.builds = bd.builds; BS.data.families = bd.families;
  const axv = {}; RADAR_AXES.forEach(([k]) => axv[k] = []);
  for (const id in BS.data.builds) {
    const b = BS.data.builds[id]; if (b.g < 20) continue;
    RADAR_AXES.forEach(([k]) => axv[k].push(b.radar[k]));
  }
  RADAR_AXES.forEach(([k]) => axv[k].sort((a, b) => a - b));
  BS.axv = axv;
  try {                                            // fates are optional (may not be deployed yet)
    const fd = await fetch("data/season9_fates.json").then((r) => r.json());
    BS.data.fates = fd.fates; BS.data.derivations = fd.derivations; BS.data.fnames = fd.names; BS.data.dnames = fd.dnames;
    BS.iconBase = (fd.meta && fd.meta.iconBase) || "https://sharpobject.github.io/yxp_wiki/assets/fates/";
  } catch (e) { /* no fate data yet — the Fates/天衍 sections just won't render */ }
  BUILDS_LOADED = true;
}
// Power = standardized, SKILL-ADJUSTED average placement (recency-weighted).
// Controls for player skill (rank score): each character's placement is re-baselined to
// an average-skill pilot, removing the "only strong mains still play it" inflation.
//   b   = within-character slope of placement vs rank  = Σ_c(swrp - swr·AP_c) / Σ_c(swr² - swr²/sw)
//   adj = AP_c − b·(R_c − R̄)      (R_c = avg rank, R̄ = global avg rank)
//   Power = 50 + 12·(mean(adj) − adj_c)/sd(adj)
function computePower(tier) {
  const rows = [];
  let gSwr = 0, gSw = 0;
  for (const id of Object.keys(BS.data.chars).map(Number)) {
    const s = charStatTier(id, tier); if (!s || !s.swr) continue;
    const sw = s.g, AP = s.avg, R = s.swr / sw;   // weighted games, avg placement, avg rank
    rows.push({
      id, AP, R,
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
  rows.forEach((r, i) => { BS.power[r.id] = Math.max(1, Math.min(99, Math.round(50 + 12 * (m - adj[i]) / sd))); });
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
const buildStat = (char, career) => BS.data.builds[`${char}_${career}`];

function renderBuilds() {
  if (!BS.data) return;
  $("#bsort-ctl").style.display = BS.screen === "list" ? "" : "none";
  $("#tier-ctl").style.display = BS.screen === "build" ? "none" : "";  // tier filter not on build page
  renderCrumbs();
  const host = $("#builds-content");
  if (BS.screen === "list") renderCharList(host);
  else if (BS.screen === "char") renderCharDetail(host);
  else renderBuildDetail(host);
}
function renderCrumbs() {
  const c = $("#crumbs"); c.innerHTML = "";
  const add = (label, fn, cur) => { const s = document.createElement(cur ? "span" : "a"); s.textContent = label; s.className = cur ? "cur" : ""; if (fn) s.onclick = fn; c.appendChild(s); };
  const sep = () => { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; c.appendChild(s); };
  add(t("characters"), BS.screen !== "list" ? () => { BS.screen = "list"; renderBuilds(); } : null, BS.screen === "list");
  if (BS.char != null && BS.screen !== "list") { sep(); add(charName(BS.char), BS.screen === "build" ? () => { BS.screen = "char"; renderBuilds(); } : null, BS.screen === "char"); }
  if (BS.screen === "build") { sep(); add(careerName(BS.career), null, true); }
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
    const sub = BS.sort === "place" ? t("avgplace") : BS.sort === "pop" ? t("popularity") : t("powerScore");
    const el = document.createElement("div"); el.className = "cchip";
    el.innerHTML = `<img loading="lazy" src="${charAvatar(r.id)}" onerror="this.style.visibility='hidden'">
      <div class="cn">${charName(r.id)}</div><div class="cs">${sectName(+String(r.id)[0])}</div>
      <div class="big" style="color:${BS.sort === 'power' ? powerColor(pw) : 'var(--text)'}">${big}</div>
      <div class="sub2">${sub} · n=${r.graw.toLocaleString()}</div>`;
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
  for (const cr of careers) {
    const [gw, graw, avg] = c.careers[cr];
    html += `<div class="sjrow" data-career="${cr}"><img src="${sidejobBadge(cr)}" onerror="this.style.visibility='hidden'">
      <div class="nm">${careerName(cr)}</div><div class="barwrap"><i style="width:${100 * gw / maxg}%"></i></div>
      <div class="rt">${graw.toLocaleString()} ${t("games")} · ${t("avgplace")} <b>${avg.toFixed(2)}</b></div></div>`;
  }
  html += `</div>`;
  host.innerHTML = html;
  host.querySelectorAll(".sjrow").forEach((r) => r.onclick = async () => {
    BS.career = +r.dataset.career; BS.realm = null;
    BS.boardsShowAll = false; BS.mShowAll = false;
    BS.screen = "build"; renderBuilds();           // immediate feedback (shows "Loading…")
    try { await ensureBuilds(); } catch (e) { console.error("build data load failed", e); }
    renderBuilds();                                // full render once data is in
  });
}
function radarSVG(b) {
  const R = 76, cx = 130, cy = 110;
  // shape = percentile of this build's round WR vs all builds (relative strength)
  const vals = RADAR_AXES.map(([k]) => {
    const arr = BS.axv[k]; if (!arr || !arr.length) return 0.5;
    const v = b.radar[k]; let c = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] <= v) c++;
    return c / arr.length;
  });
  const ang = (i) => (-90 + i * 72) * Math.PI / 180;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
  let svg = `<svg width="260" height="224" viewBox="0 0 260 224">`;
  [0.33, 0.66, 1].forEach((rr) => { svg += `<polygon points="${RADAR_AXES.map((_, i) => pt(i, rr).join(",")).join(" ")}" fill="none" stroke="#2c3445"/>`; });
  RADAR_AXES.forEach(([k, lk], i) => {
    const [x, y] = pt(i, 1); svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#2c3445"/>`;
    const [lx, ly] = pt(i, 1.28);
    const wr = Math.round((b.radar[k] || 0) * 100);     // actual round win rate on this axis
    svg += `<text x="${lx}" y="${ly}" fill="#94a0b4" font-size="11" text-anchor="middle">
      <tspan x="${lx}">${t(lk)}</tspan><tspan x="${lx}" dy="12" fill="#cfd8e6" font-weight="700">${wr}%</tspan></text>`;
  });
  svg += `<polygon points="${vals.map((v, i) => pt(i, Math.max(0.04, v)).join(",")).join(" ")}" fill="rgba(91,140,255,.35)" stroke="#5b8cff" stroke-width="2"/>`;
  return svg + `</svg>`;
}
function cardImgs(fidxs) {
  const fam = BS.data.families;
  return fidxs.map((i) => { const f = fam[i]; const nm = (S.lang === "zh" ? f.cn : f.en) || f.cn || ""; return `<img title="${nm}" loading="lazy" src="${WIKI}${f.img}_${S.lang}.png" onerror="this.onerror=null;this.src='${WIKI}${f.img}_en.png'">`; }).join("");
}
function boardRowHTML(fidxs, raw, wc, ww, cls, hint) {
  const wr = wc ? ww / wc : 0;
  return `<div class="board ${cls || ""}"><div class="cards">${cardImgs(fidxs)}</div>
    <div class="bstat"><span class="wr" style="color:${wrColor(wr)}">${(wr * 100).toFixed(0)}%</span> ${t("roundWR")}<br>
    <span class="muted">${t("usedTimes")} ${raw.toLocaleString()}×${hint || ""}</span></div></div>`;
}
// Boards are merged by card-SET; entry = [reprFamlist, raw, w_count, w_wins, variations].
// Threshold on merged raw occurrences; multi-arrangement boards expand to their variations.
function boardListHTML(list, showAll) {
  const shown = showAll ? list : list.filter((x) => x[1] >= BOARD_MIN);
  const hidden = list.length - shown.length;
  let html = "";
  if (!shown.length) {
    html += `<div class="empty" style="padding:12px">${t("notEnoughBoards")}</div>`;
  } else {
    for (const [fidxs, raw, wc, ww, vars] of shown) {
      const multi = vars && vars.length > 1;
      const hint = multi ? ` · <span class="varhint">▸ ${vars.length} ${t("arrangements")}</span>` : "";
      html += boardRowHTML(fidxs, raw, wc, ww, multi ? "expandable" : "", hint);
      if (multi) {
        html += `<div class="board-vars" hidden>`;
        for (const [vf, vraw, vwc, vww] of vars) html += boardRowHTML(vf, vraw, vwc, vww, "vrow");
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
  const rows = b.matchup.filter((m) => m[1] >= 8).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<div class="empty" style="padding:14px">${t("noBuildData")}</div>`;
  let s = '<div class="mgrid">';
  for (const [oc, raw, wrnd, wwin, dealt, recv] of rows) {
    const dl = wrnd ? dealt / wrnd : 0, rc = wrnd ? recv / wrnd : 0, net = dl - rc;
    const has = b.mboards && b.mboards[oc] ? "" : " nob";
    s += `<div class="mcell${has}" data-opp="${oc}" title="${t("dealt")} ${dl.toFixed(1)} · ${t("received")} ${rc.toFixed(1)} /${t("roundWR")}">
      <img src="${charAvatar(oc)}" onerror="this.style.visibility='hidden'">
      <div><div class="mn">${charName(oc)}</div><div class="mwr" style="color:${destinyColor(net)}">${sgn(net)}</div>
      <div class="mnn">${dl.toFixed(1)}/${rc.toFixed(1)} · n=${raw}</div></div></div>`;
  }
  return s + '</div><div id="matchupDetail" class="matchup-detail"></div>';
}
function renderMatchupDetail(b, oc) {
  const box = $("#matchupDetail"); if (!box) return;
  document.querySelectorAll(".mcell").forEach((c) => c.classList.toggle("on", +c.dataset.opp === oc));
  const m = b.matchup.find((x) => x[0] === oc);   // [oc, raw, w_rounds, w_wins, dealt, recv]
  const wrnd = m ? m[2] : 0, dl = wrnd ? m[4] / wrnd : 0, rc = wrnd ? m[5] / wrnd : 0, net = dl - rc;
  const mb = (b.mboards || {})[oc] || [];
  let html = `<div class="mdh"><img src="${charAvatar(oc)}" onerror="this.style.visibility='hidden'">
    <span><b>${t("lateBoards")} ${charName(oc)}</b> · <span style="color:${destinyColor(net)}">${t("destinyNet")} ${sgn(net)}</span>
    · ${t("dealt")} ${dl.toFixed(1)} / ${t("received")} ${rc.toFixed(1)} (n=${m ? m[1] : 0})</span></div>`;
  html += boardListHTML(mb, BS.mShowAll);
  box.innerHTML = html;
  wireExpand(box);
  const sm = box.querySelector(".showmore"); if (sm) sm.onclick = () => { BS.mShowAll = true; renderMatchupDetail(b, oc); };
}
function renderBoards(b) {
  const box = $("#boardsBox"); if (!box) return;
  const realms = Object.keys(b.boards).filter((r) => b.boards[r].length).map(Number).sort((a, b) => a - b);
  if (!realms.length) { box.innerHTML = `<div class="empty" style="padding:14px">${t("noBuildData")}</div>`; return; }
  if (BS.realm == null || !realms.includes(BS.realm)) BS.realm = realms[realms.length - 1];
  let html = `<div class="realmtabs">` + realms.map((r) => `<button class="${r === BS.realm ? 'on' : ''}" data-r="${r}">${t("realm")} ${r}</button>`).join("") + `</div>`;
  html += boardListHTML(b.boards[BS.realm], BS.boardsShowAll);
  box.innerHTML = html;
  wireExpand(box);
  box.querySelectorAll(".realmtabs button").forEach((btn) => btn.onclick = () => { BS.realm = +btn.dataset.r; BS.boardsShowAll = false; renderBoards(b); });
  const sm = box.querySelector(".showmore"); if (sm) sm.onclick = () => { BS.boardsShowAll = true; renderBoards(b); };
}
function renderBuildDetail(host) {
  if (!BS.data.builds) { host.innerHTML = `<div class="empty">${t("loading")}</div>`; return; }
  const b = buildStat(BS.char, BS.career);
  if (!b || b.g < 1) { host.innerHTML = `<div class="empty">${t("noBuildData")}</div>`; return; }
  const avg = avgPlace(b.place, b.g);
  host.innerHTML = `<div class="bh"><img class="av" src="${charAvatar(BS.char)}" onerror="this.style.visibility='hidden'">
    <div class="htxt"><h2>${charName(BS.char)} · ${careerName(BS.career)}</h2><div class="meta">${sectName(+String(BS.char)[0])}</div>
      <div class="kpis">
        <div class="kpi"><b>${avg.toFixed(2)}</b><span>${t("avgplace")}</span></div>
        <div class="kpi"><b>${b.graw.toLocaleString()}</b><span>${t("games")}</span></div>
      </div></div>
      <div class="bh-sel">${fatesSectionHTML(`${BS.char}_${BS.career}`)}</div></div>
    <div class="bcols">
      <div><div class="bsection"><h3>${t("power")} <span class="muted" style="font-size:12px">${t("powerNote")}</span></h3>${radarSVG(b)}</div>
        <div class="bsection"><h3>${t("placement")}</h3>${placeBarsHTML(b.place, b.g)}</div></div>
      <div><div class="bsection"><h3>${t("boards")}</h3><div id="boardsBox"></div></div>
        <div class="bsection"><h3>${t("matchup")} <span style="color:var(--muted);font-size:12px">(${t("vsReal")}) · ${t("matchHint")}</span></h3>${matchupHTML(b)}</div></div>
    </div>`;
  renderBoards(b);
  host.querySelectorAll(".mcell").forEach((c) => c.onclick = () => { BS.mShowAll = false; renderMatchupDetail(b, +c.dataset.opp); });
}
// ---- Fates & 天衍 -----------------------------------------------------------
const FBUCKET_COLOR = { innate: "#c9a227", cultivation: "#5b8cff", other: "#36c46b" };
function fname(oid) { const e = (BS.data.fnames || {})[oid] || {}; return (S.lang === "zh" ? e.cn : e.en) || e.cn || ("#" + oid); }
function dname(oid) { const e = (BS.data.dnames || {})[oid] || {}; return (S.lang === "zh" ? e.cn : e.en) || e.cn || ("#" + oid); }
function selIconURL(oid, isFate) {
  const e = ((isFate ? BS.data.fnames : BS.data.dnames) || {})[oid] || {};
  return e.icon ? (BS.iconBase + e.icon) : "";
}
function selIcon(oid, isFate, cls) {
  const u = selIconURL(oid, isFate);
  return u ? `<img class="${cls}" src="${u}" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="${cls} noimg"></span>`;
}
function fatePhaseHTML(rows, ord, isFate) {
  const N = BS.data.fnames || {};
  const nm = isFate ? fname : dname;     // fates use the fate map; 天衍 derivations use the FateStrategy registry
  let pick;
  if (isFate) {                       // highest-appeared fate of the highest-selected bucket
    const bt = {};
    for (const [oid, ch] of rows) { const bk = (N[oid] || {}).bucket || "other"; bt[bk] = (bt[bk] || 0) + ch; }
    const topB = Object.keys(bt).sort((a, b) => bt[b] - bt[a])[0];
    pick = rows.find((r) => ((N[r[0]] || {}).bucket || "other") === topB) || rows[0];
  } else { pick = rows[0]; }          // most-chosen derivation
  const [oid, ch, , pw] = pick; const avgPl = ch ? pw / ch : 0;
  const col = isFate ? (FBUCKET_COLOR[(N[oid] || {}).bucket] || "#888") : "#5b8cff";
  let pop = `<div class="fpop"><table><tr><th>${t("fateName")}</th><th>${t("picks")}</th><th>${t("pickRate")}</th><th>${t("avgplace")}</th></tr>`;
  for (const [o, c, of_, pw2] of rows) {
    if (c <= 0 && of_ <= 0) continue;
    const bc = isFate ? (FBUCKET_COLOR[(N[o] || {}).bucket] || "#888") : "#5b8cff";
    pop += `<tr><td>${selIcon(o, isFate, "ricon")}<span class="bdot" style="background:${bc}"></span>${nm(o)}</td><td>${Math.round(c)}</td>`
      + `<td>${of_ > 0 ? Math.round(c / of_ * 100) + "%" : "–"}</td><td style="color:${placeColorF(c ? pw2 / c : 0)}">${c ? (pw2 / c).toFixed(2) : "–"}</td></tr>`;
  }
  pop += `</table></div>`;
  return `<div class="fphase"><div class="flabel">${ord}</div>
    <div class="fchip" style="border-color:${col}">${selIcon(oid, isFate, "cicon")}<span class="fchip-t">${nm(oid)}</span>
      <span class="fstat" style="color:${placeColorF(avgPl)}">${avgPl.toFixed(2)}</span></div>${pop}</div>`;
}
function fatesSectionHTML(key) {
  const F = (BS.data.fates || {})[key], D = (BS.data.derivations || {})[key];
  if (!F && !D) return "";
  let h = "";
  if (F) {
    h += `<div class="bsection"><h3>${t("fates")} <span class="muted" style="font-size:12px">${t("fatesHint")}</span></h3><div class="fphases">`;
    Object.keys(F).sort((a, b) => +a - +b).forEach((sid, i) => { h += fatePhaseHTML(F[sid], i + 1, true); });
    h += `</div></div>`;
  }
  if (D) {
    h += `<div class="bsection"><h3>${t("tianyan")} <span class="muted" style="font-size:12px">${t("tianyanHint")}</span></h3><div class="fphases">`;
    Object.keys(D).sort((a, b) => +a - +b).forEach((sid, i) => { h += fatePhaseHTML(D[sid], i + 1, false); });
    h += `</div></div>`;
  }
  return h;
}
function wireBuilds() {
  document.querySelectorAll("#tabbar .tab").forEach((tb) => tb.onclick = () => {
    document.querySelectorAll("#tabbar .tab").forEach((x) => x.classList.remove("on")); tb.classList.add("on");
    const isB = tb.dataset.tab === "builds";
    $("#view-cards").hidden = isB; $("#view-builds").hidden = !isB; BS.active = isB;
    $("#sub-cards").hidden = isB; $("#sub-builds").hidden = !isB;   // tab-appropriate subtitle
    if (isB) loadBuilds();
    else if (!CARDS_INIT) { CARDS_INIT = true; loadThreshold(4000); }
  });
  $("#bsort").addEventListener("change", (e) => { BS.sort = e.target.value; renderBuilds(); });
  seg("tier", (v) => { BS.tier = +v; computePower(BS.tier); renderBuilds(); });
}

boot();
