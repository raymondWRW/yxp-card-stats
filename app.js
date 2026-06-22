"use strict";
const WIKI = "https://sharpobject.github.io/yxp_wiki/assets/cards/";
const STRIDE = 8; // [seasonIdx, charIdx, career, fam, level, round, wins, losses]

// ---- i18n ------------------------------------------------------------------
const UI = {
  en: {
    title: "Yi Xian Card Explorer", subPre: "Win rate & popularity from",
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
    tabCards: "Cards · S7–8", tabBuilds: "Builds · S9", top4rate: "Top-4 win rate",
    avgplace: "Avg placement", sidejobs: "Side-jobs played", power: "Power profile",
    boards: "Popular boards", matchup: "Matchup vs character", realm: "Realm",
    games: "Games", topFinish: "Top-4 rate", placement: "Placement distribution",
    characters: "Characters", axisEarly: "Early", axisMid: "Mid", axisLate: "Late",
    axisFirst: "First", axisSecond: "Second", roundWR: "round WR",
    buildsNote: "Season 9 · DaoXin ≥ 3000 · top-4 placement = win. Absolute rates run high (winners record more) — compare characters relatively.",
    noBuildData: "Not enough games for this build yet.",
    selectCareer: "Pick a side-job below to see its build detail.",
    usedTimes: "used", vsReal: "vs real opponents",
  },
  zh: {
    title: "弈仙牌 卡牌数据", subPre: "数据来自", subMid: "次出战 ·", subPost: "张卡牌",
    tier: "道心段位", language: "语言", season: "赛季", career: "副职", character: "角色",
    rounds: "回合", sortby: "排序", popularity: "使用率", winrate: "胜率", cardname: "名称",
    mingames: "最少场次", search: "搜索", nomatch: "没有符合条件的卡牌。",
    footData: "数据：", footArt: "卡图：",
    footNote: "胜率 = 该回合胜场 / 该卡在场上的回合数。卡面已合并等级。",
    levels: "等级", wrByRound: "各回合胜率", popByRound: "各回合使用次数",
    all: "全部", none: "清空", allSel: "全部", nSel: "项已选", searchPh: "卡牌名称…",
    sect: "门派", baseLevel: "基础", overall: "总体",
    notEnough: "当前最少场次下数据不足，无法计算胜率。",
    tabCards: "卡牌 · S7–8", tabBuilds: "流派 · S9", top4rate: "前四胜率",
    avgplace: "平均名次", sidejobs: "搭配副职", power: "强度雷达",
    boards: "热门卡组", matchup: "对位胜率", realm: "境界",
    games: "场次", topFinish: "前四率", placement: "名次分布",
    characters: "角色", axisEarly: "前期", axisMid: "中期", axisLate: "后期",
    axisFirst: "先手", axisSecond: "后手", roundWR: "回合胜率",
    buildsNote: "第9赛季 · 道心≥3000 · 前四视为胜。绝对胜率偏高（赢家上传更多）——请横向比较角色。",
    noBuildData: "该流派样本不足。",
    selectCareer: "选择下方副职查看具体流派。",
    usedTimes: "出现", vsReal: "对真实玩家",
  },
};
// season number -> {en,zh}
const SEASON_NAMES = {
  7: { en: "Tianji Sigil", zh: "天机刻印" },
  8: { en: "Dream Weave", zh: "临渊织梦" },
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
  th: 4000, lang: "en",
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

const BS = { active: false, data: null, screen: "list", char: null, career: null, sort: "wr", realm: null, range: null };

async function loadBuilds() {
  if (!BS.data) {
    BS.data = await fetch("data/season9.json").then((r) => r.json());
    // For each radar axis, keep all builds' values sorted -> radar shows each
    // build's PERCENTILE on that axis, i.e. strength relative to other builds.
    const axv = {}; RADAR_AXES.forEach(([k]) => axv[k] = []);
    for (const id in BS.data.builds) {
      const b = BS.data.builds[id]; if (b.g < 20) continue;
      RADAR_AXES.forEach(([k]) => axv[k].push(b.radar[k]));
    }
    RADAR_AXES.forEach(([k]) => axv[k].sort((a, b) => a - b));
    BS.axv = axv;
  }
  renderBuilds();
}
const avgPlace = (place, g) => g ? place.reduce((s, n, i) => s + (i + 1) * n, 0) / g : 0;
// Aggregate a character from its career-1..7 builds (excludes career 0 = no side-job).
function charStat(id) {
  let g = 0, top4 = 0; const place = new Array(8).fill(0); const careers = {};
  for (let cr = 1; cr <= 7; cr++) {
    const b = BS.data.builds[`${id}_${cr}`]; if (!b || !b.g) continue;
    g += b.g; top4 += b.top4;
    for (let i = 0; i < 8; i++) place[i] += b.place[i];
    careers[cr] = [b.g, b.top4];
  }
  if (!g) return null;
  return { id, g, top4, wr: top4 / g, avg: avgPlace(place, g), place, careers };
}
const buildStat = (char, career) => BS.data.builds[`${char}_${career}`];

function renderBuilds() {
  if (!BS.data) return;
  $("#buildsNote").textContent = t("buildsNote");
  $("#bsort-ctl").style.display = BS.screen === "list" ? "" : "none";
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
  const rows = Object.keys(BS.data.chars).map((id) => charStat(+id)).filter((r) => r && r.g > 0);
  if (BS.sort === "place") rows.sort((a, b) => a.avg - b.avg);
  else if (BS.sort === "pop") rows.sort((a, b) => b.g - a.g);
  else rows.sort((a, b) => b.wr - a.wr);
  const grid = document.createElement("div"); grid.className = "cgrid";
  for (const r of rows) {
    const big = BS.sort === "place" ? r.avg.toFixed(2) : BS.sort === "pop" ? r.g.toLocaleString() : (r.wr * 100).toFixed(1) + "%";
    const sub = BS.sort === "place" ? t("avgplace") : BS.sort === "pop" ? t("games") : t("topFinish");
    const el = document.createElement("div"); el.className = "cchip";
    el.innerHTML = `<img loading="lazy" src="${charAvatar(r.id)}" onerror="this.style.visibility='hidden'">
      <div class="cn">${charName(r.id)}</div><div class="cs">${sectName(+String(r.id)[0])}</div>
      <div class="big" style="color:${BS.sort === 'wr' ? wrColor(r.wr) : 'var(--text)'}">${big}</div>
      <div class="sub2">${sub} · n=${r.g.toLocaleString()}</div>`;
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
  const id = BS.char, c = charStat(id);
  const careers = Object.keys(c.careers).map(Number).sort((a, b) => c.careers[b][0] - c.careers[a][0]);
  const maxg = Math.max(1, ...careers.map((cr) => c.careers[cr][0]));
  let html = `<div class="bh"><img class="av" src="${charAvatar(id)}" onerror="this.style.visibility='hidden'">
    <div class="htxt"><h2>${charName(id)}</h2><div class="meta">${sectName(+String(id)[0])}</div>
      <div class="kpis">
        <div class="kpi"><b style="color:${wrColor(c.wr)}">${(c.wr * 100).toFixed(1)}%</b><span>${t("topFinish")}</span></div>
        <div class="kpi"><b>${c.avg.toFixed(2)}</b><span>${t("avgplace")}</span></div>
        <div class="kpi"><b>${c.g.toLocaleString()}</b><span>${t("games")}</span></div>
      </div></div></div>`;
  html += `<div class="bsection"><h3>${t("placement")}</h3>${placeBarsHTML(c.place, c.g)}</div>`;
  html += `<div class="bsection"><h3>${t("sidejobs")} <span style="color:var(--muted);font-size:12px">— ${t("selectCareer")}</span></h3>`;
  for (const cr of careers) {
    const [g, top4] = c.careers[cr]; const wr = g ? top4 / g : 0;
    html += `<div class="sjrow" data-career="${cr}"><img src="${sidejobBadge(cr)}" onerror="this.style.visibility='hidden'">
      <div class="nm">${careerName(cr)}</div><div class="barwrap"><i style="width:${100 * g / maxg}%"></i></div>
      <div class="rt">${g.toLocaleString()} ${t("games")} · <b style="color:${wrColor(wr)}">${(wr * 100).toFixed(0)}%</b></div></div>`;
  }
  html += `</div>`;
  host.innerHTML = html;
  host.querySelectorAll(".sjrow").forEach((r) => r.onclick = () => { BS.career = +r.dataset.career; BS.screen = "build"; BS.realm = null; renderBuilds(); });
}
function radarSVG(b) {
  const R = 86, cx = 120, cy = 108;
  const vals = RADAR_AXES.map(([k]) => {
    const arr = BS.axv[k]; if (!arr || !arr.length) return 0.5;
    const v = b.radar[k]; let c = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] <= v) c++;
    return c / arr.length;   // percentile among all builds on this axis
  });
  const ang = (i) => (-90 + i * 72) * Math.PI / 180;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
  let svg = `<svg width="240" height="216" viewBox="0 0 240 216">`;
  [0.33, 0.66, 1].forEach((rr) => { svg += `<polygon points="${RADAR_AXES.map((_, i) => pt(i, rr).join(",")).join(" ")}" fill="none" stroke="#2c3445"/>`; });
  RADAR_AXES.forEach(([k, lk], i) => {
    const [x, y] = pt(i, 1); svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#2c3445"/>`;
    const [lx, ly] = pt(i, 1.2); svg += `<text x="${lx}" y="${ly}" fill="#94a0b4" font-size="11" text-anchor="middle" dominant-baseline="middle">${t(lk)}</text>`;
  });
  svg += `<polygon points="${vals.map((v, i) => pt(i, Math.max(0.04, v)).join(",")).join(" ")}" fill="rgba(91,140,255,.35)" stroke="#5b8cff" stroke-width="2"/>`;
  return svg + `</svg>`;
}
function matchupHTML(b) {
  const rows = b.matchup.filter((m) => m[1] >= 8).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return `<div class="empty" style="padding:14px">${t("noBuildData")}</div>`;
  let s = '<div class="mgrid">';
  for (const [oc, rn, w] of rows) {
    const wr = rn ? w / rn : 0;
    s += `<div class="mcell"><img src="${charAvatar(oc)}" onerror="this.style.visibility='hidden'">
      <div><div class="mn">${charName(oc)}</div><div class="mwr" style="color:${wrColor(wr)}">${(wr * 100).toFixed(0)}%</div><div class="mnn">n=${rn}</div></div></div>`;
  }
  return s + "</div>";
}
function renderBoards(b) {
  const box = $("#boardsBox"); if (!box) return;
  const realms = Object.keys(b.boards).filter((r) => b.boards[r].length).map(Number).sort((a, b) => a - b);
  if (!realms.length) { box.innerHTML = `<div class="empty" style="padding:14px">${t("noBuildData")}</div>`; return; }
  if (BS.realm == null || !realms.includes(BS.realm)) BS.realm = realms[realms.length - 1];
  const fam = BS.data.families;
  let html = `<div class="realmtabs">` + realms.map((r) => `<button class="${r === BS.realm ? 'on' : ''}" data-r="${r}">${t("realm")} ${r}</button>`).join("") + `</div>`;
  for (const [fidxs, n, wins] of b.boards[BS.realm]) {
    const wr = n ? wins / n : 0;
    const imgs = fidxs.map((i) => { const f = fam[i]; const nm = (S.lang === "zh" ? f.cn : f.en) || f.cn || ""; return `<img title="${nm}" loading="lazy" src="${WIKI}${f.img}_${S.lang}.png" onerror="this.onerror=null;this.src='${WIKI}${f.img}_en.png'">`; }).join("");
    html += `<div class="board"><div class="cards">${imgs}</div>
      <div class="bstat"><span class="wr" style="color:${wrColor(wr)}">${(wr * 100).toFixed(0)}%</span> ${t("roundWR")}<br>
      <span style="color:var(--muted)">${t("usedTimes")} ${n.toLocaleString()}×</span></div></div>`;
  }
  box.innerHTML = html;
  box.querySelectorAll(".realmtabs button").forEach((btn) => btn.onclick = () => { BS.realm = +btn.dataset.r; renderBoards(b); });
}
function renderBuildDetail(host) {
  const b = buildStat(BS.char, BS.career);
  if (!b || b.g < 1) { host.innerHTML = `<div class="empty">${t("noBuildData")}</div>`; return; }
  const wr = b.g ? b.top4 / b.g : 0, avg = avgPlace(b.place, b.g);
  host.innerHTML = `<div class="bh"><img class="av" src="${charAvatar(BS.char)}" onerror="this.style.visibility='hidden'">
    <div class="htxt"><h2>${charName(BS.char)} · ${careerName(BS.career)}</h2><div class="meta">${sectName(+String(BS.char)[0])}</div>
      <div class="kpis">
        <div class="kpi"><b style="color:${wrColor(wr)}">${(wr * 100).toFixed(1)}%</b><span>${t("topFinish")}</span></div>
        <div class="kpi"><b>${avg.toFixed(2)}</b><span>${t("avgplace")}</span></div>
        <div class="kpi"><b>${b.g.toLocaleString()}</b><span>${t("games")}</span></div>
      </div></div></div>
    <div class="bcols">
      <div><div class="bsection"><h3>${t("power")}</h3>${radarSVG(b)}</div>
        <div class="bsection"><h3>${t("placement")}</h3>${placeBarsHTML(b.place, b.g)}</div></div>
      <div><div class="bsection"><h3>${t("boards")}</h3><div id="boardsBox"></div></div>
        <div class="bsection"><h3>${t("matchup")} <span style="color:var(--muted);font-size:12px">(${t("vsReal")})</span></h3>${matchupHTML(b)}</div></div>
    </div>`;
  renderBoards(b);
}
function wireBuilds() {
  document.querySelectorAll("#tabbar .tab").forEach((tb) => tb.onclick = () => {
    document.querySelectorAll("#tabbar .tab").forEach((x) => x.classList.remove("on")); tb.classList.add("on");
    const isB = tb.dataset.tab === "builds";
    $("#view-cards").hidden = isB; $("#view-builds").hidden = !isB; BS.active = isB;
    if (isB) loadBuilds();
    else if (!CARDS_INIT) { CARDS_INIT = true; loadThreshold(4000); }
  });
  $("#bsort").addEventListener("change", (e) => { BS.sort = e.target.value; renderBuilds(); });
}

boot();
