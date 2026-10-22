// ---- 天梯 / Elo leaderboard tab ------------------------------------------------------
// Data (elo/update.py -> data/elo/): top.json = current top 100 + each season's top 100 at
// season end; names.json = [[username, uid]] search index (players with 10+ games);
// p/<last 2 uid chars>.json = {uid: player} histories, loaded on demand.
(function () {
  "use strict";
  const SEASON_NAME = {
    7: { zh: "天机刻印", en: "Tianji Sigil" }, 8: { zh: "临渊织梦", en: "Dream Weave" },
    9: { zh: "天衍万象", en: "Heavenly Derivation" }, 10: { zh: "百家之道", en: "Hundred Schools" },
  };
  const TXT = {
    en: {
      tab: "Leaderboard · Elo", sub: "Skill rating from ranked + DaoXin games, comparable across rank tiers and seasons",
      current: "Current", search: "Search player…", noMatch: "No player found (players need 10+ games).",
      rank: "#", player: "Player", rating: "Rating", games: "Games", dx: "DaoXin", peak: "Peak",
      start: "Start", end: "End", season: "Season", last: "Last played", back: "← back to the leaderboard",
      curNote: "Top 100 of players with {g}+ games who played in the last {d} days, sorted by rating − 2×uncertainty.",
      seasonNote: "Top 100 at the end of {s} (players with {g}+ games that season), sorted by end rating − 2×uncertainty.",
      info: "Everyone starts at 3000. After each game, every real player in the lobby gains or loses rating by how their final placement compares with what their ratings predicted (Weng-Lin / Plackett–Luce model). Bots are ignored, ranked and DaoXin games share one rating, and there is no adjustment for character strength. Uncertainty (±) shrinks with games played and grows during inactivity and at each new season.",
      loading: "Loading…", unavailable: "Leaderboard data is not published yet.", history: "Rating by season",
    },
    zh: {
      tab: "天梯 · Elo", sub: "基于排位与道心对局的技术分，可跨段位、跨赛季比较",
      current: "当前", search: "搜索玩家…", noMatch: "未找到玩家（需至少 10 场对局）。",
      rank: "#", player: "玩家", rating: "分数", games: "场次", dx: "道心", peak: "最高",
      start: "开始", end: "结束", season: "赛季", last: "最近对局", back: "← 返回排行榜",
      curNote: "近 {d} 天内有对局、且总场次 ≥ {g} 的玩家前 100 名，按 分数 − 2×不确定度 排序。",
      seasonNote: "{s} 赛季结束时的前 100 名（该赛季场次 ≥ {g}），按赛季末分数 − 2×不确定度 排序。",
      info: "所有玩家从 3000 分开始。每局结束后，同局真实玩家按最终名次与分数预期的差距加减分（Weng-Lin / Plackett–Luce 模型）。不计入人机，排位与道心共用一个分数，不按角色强度调整。不确定度（±）随对局减少，长期不玩或进入新赛季时会增大。",
      loading: "加载中…", unavailable: "天梯数据尚未发布。", history: "各赛季分数",
    },
  };
  const E = { top: null, names: null, shards: {}, view: "current", player: null, q: "" };
  const lang = () => (typeof S !== "undefined" && S.lang === "en" ? "en" : "zh");   // S is app.js's const (not on window)
  const tx = (k, vars) => { let s = TXT[lang()][k] || k; for (const v in vars || {}) s = s.replace(`{${v}}`, vars[v]); return s; };
  const sname = (s) => (SEASON_NAME[s] || {})[lang()] || `S${s}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const day = (ts) => new Date(ts).toLocaleDateString(lang() === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric" });
  const host = () => document.getElementById("elo-content");

  async function loadTop() {
    if (E.top) return E.top;
    const r = await fetch("data/elo/top.json");
    if (!r.ok) throw new Error("no data");
    return (E.top = await r.json());
  }
  async function loadNames() {
    if (!E.names) E.names = await fetch("data/elo/names.json").then((r) => r.json());
    return E.names;
  }
  async function loadPlayer(uid) {
    const k = uid.slice(-2);
    if (!E.shards[k]) E.shards[k] = await fetch(`data/elo/p/${k}.json`).then((r) => r.json());
    return E.shards[k][uid];
  }

  function viewBar(top) {
    const views = ["current", ...Object.keys(top.seasons).sort((a, b) => b - a)];
    return `<div class="elo-bar"><div class="seg" id="elo-views">` +
      views.map((v) => `<button data-v="${v}" class="${E.view === v && !E.player ? "on" : ""}">${v === "current" ? tx("current") : sname(v)}</button>`).join("") +
      `</div><div class="elo-search"><input type="text" id="elo-q" placeholder="${tx("search")}" value="${esc(E.q)}" autocomplete="off">` +
      `<div id="elo-hits" class="elo-hits" hidden></div></div>` +
      `<button type="button" class="infobtn" id="elo-info-btn" aria-label="info">i</button><div id="elo-info" class="infopop" hidden>${tx("info")}</div></div>`;
  }

  function tableHTML(top) {
    const cur = E.view === "current";
    const rows = cur ? top.current : top.seasons[E.view] || [];
    const note = cur ? tx("curNote", { g: top.minGames, d: top.activeDays }) : tx("seasonNote", { s: sname(E.view), g: top.minGames });
    let h = `<p class="muted elo-note">${note}</p><div class="elo-tablewrap"><table class="elo-table"><thead><tr>` +
      `<th>${tx("rank")}</th><th class="l">${tx("player")}</th><th>${tx("rating")}</th>` +
      (cur ? `<th>${tx("games")}</th><th>${tx("dx")}</th>` : `<th>${tx("peak")}</th><th>${tx("games")}</th>`) + `</tr></thead><tbody>`;
    for (const r of rows) {
      h += `<tr data-uid="${r.uid}"><td class="rk">${r.r}</td><td class="l nm">${esc(r.name || "#" + r.uid.slice(-6))}</td>` +
        `<td><b>${r.rating}</b>${cur ? ` <span class="muted">±${r.sigma}</span>` : ""}</td>` +
        (cur ? `<td>${r.games.toLocaleString()}</td><td>${r.games ? Math.round(100 * r.dx / r.games) : 0}%</td>`
             : `<td>${r.peak}</td><td>${r.games.toLocaleString()}</td>`) + `</tr>`;
    }
    return h + `</tbody></table></div>`;
  }

  function chartSVG(p) {
    const ss = Object.keys(p.seasons).map(Number).sort((a, b) => a - b);
    if (!ss.length) return "";
    const vals = ss.flatMap((s) => [p.seasons[s].start, p.seasons[s].end, p.seasons[s].peak]);
    const lo = Math.min(...vals, 3000) - 50, hi = Math.max(...vals, 3000) + 50;
    const W = 560, H = 180, L = 48, R = 44, T = 12, B = 28, n = ss.length;
    const x = (i) => L + (n > 1 ? i * (W - L - R) / (n - 1) : (W - L - R) / 2);
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    let g = "";
    for (let v = Math.ceil(lo / 250) * 250; v <= hi; v += 250)
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="${v === 3000 ? 0.35 : 0.12}"${v === 3000 ? ' stroke-dasharray="3 3"' : ""}/>` +
        `<text x="${L - 6}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".6">${v}</text>`;
    const pts = ss.map((s, i) => `${x(i)},${y(p.seasons[s].end)}`).join(" ");
    let dots = "";
    ss.forEach((s, i) => {
      const se = p.seasons[s];
      dots += `<line x1="${x(i)}" x2="${x(i)}" y1="${y(se.start)}" y2="${y(se.peak)}" stroke="#5b8cff" stroke-opacity=".35" stroke-width="6" stroke-linecap="round"/>` +
        `<circle cx="${x(i)}" cy="${y(se.end)}" r="4" fill="#5b8cff"><title>${sname(s)}: ${tx("start")} ${se.start} · ${tx("end")} ${se.end} · ${tx("peak")} ${se.peak}</title></circle>` +
        `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".7">${sname(s)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" class="elo-chart" role="img">${g}<polyline points="${pts}" fill="none" stroke="#5b8cff" stroke-width="2"/>${dots}</svg>`;
  }

  function playerHTML(uid, p) {
    if (!p) return `<p class="muted">${tx("noMatch")}</p>`;
    const ss = Object.keys(p.seasons).map(Number).sort((a, b) => b - a);
    return `<button type="button" class="showmore elo-back" id="elo-back">${tx("back")}</button>` +
      `<div class="elo-card"><div class="elo-head"><h2>${esc(p.name || "#" + uid.slice(-6))}</h2>` +
      `<div class="kpis"><div class="kpi"><b>${p.rating}</b> <span class="muted">±${p.sigma}</span><span>${tx("rating")}</span></div>` +
      `<div class="kpi"><b>${p.games.toLocaleString()}</b><span>${tx("games")}</span></div>` +
      `<div class="kpi"><b>${p.games ? Math.round(100 * p.dx / p.games) : 0}%</b><span>${tx("dx")}</span></div>` +
      `<div class="kpi"><b>${day(p.last)}</b><span>${tx("last")}</span></div></div></div>` +
      `<div class="bsection"><h3>${tx("history")}</h3>${chartSVG(p)}</div>` +
      `<table class="elo-table elo-seasons"><thead><tr><th class="l">${tx("season")}</th><th>${tx("start")}</th><th>${tx("end")}</th><th>${tx("peak")}</th><th>${tx("games")}</th></tr></thead><tbody>` +
      ss.map((s) => { const se = p.seasons[s]; return `<tr><td class="l">${sname(s)}</td><td>${se.start}</td><td><b>${se.end}</b></td><td>${se.peak}</td><td>${se.games.toLocaleString()}</td></tr>`; }).join("") +
      `</tbody></table></div>`;
  }

  async function render() {
    const h = host(); if (!h) return;
    let top;
    try { top = await loadTop(); } catch (e) { h.innerHTML = `<div class="empty">${tx("unavailable")}</div>`; return; }
    let body;
    if (E.player) {
      h.innerHTML = viewBar(top) + `<div class="empty">${tx("loading")}</div>`;
      body = playerHTML(E.player, await loadPlayer(E.player).catch(() => null));
    } else body = tableHTML(top);
    h.innerHTML = viewBar(top) + `<div id="elo-body">${body}</div>`;
    wire(top);
    if (window.enter) window.enter(h);                  // entrance animations (app.js)
  }

  function openPlayer(uid) { E.player = uid; render(); window.scrollTo({ top: 0 }); }

  function wire(top) {
    const h = host();
    h.querySelectorAll("#elo-views button").forEach((b) => b.onclick = () => { E.view = b.dataset.v; E.player = null; render(); });
    h.querySelectorAll(".elo-table tbody tr[data-uid]").forEach((tr) => tr.onclick = () => openPlayer(tr.dataset.uid));
    const back = h.querySelector("#elo-back"); if (back) back.onclick = () => { E.player = null; render(); };
    const info = h.querySelector("#elo-info");
    h.querySelector("#elo-info-btn").onclick = (e) => { e.stopPropagation(); info.hidden = !info.hidden; };
    const q = h.querySelector("#elo-q"), hits = h.querySelector("#elo-hits");
    let timer = null;
    q.oninput = () => {
      E.q = q.value; clearTimeout(timer);
      timer = setTimeout(async () => {
        const s = q.value.trim().toLowerCase();
        if (!s) { hits.hidden = true; return; }
        hits.innerHTML = `<div class="muted">${tx("loading")}</div>`; hits.hidden = false;
        const names = await loadNames();
        const found = [];
        for (const [nm, uid] of names) { if (nm.toLowerCase().includes(s)) { found.push([nm, uid]); if (found.length >= 20) break; } }
        hits.innerHTML = found.length ? found.map(([nm, uid]) => `<div class="elo-hit" data-uid="${uid}">${esc(nm)}</div>`).join("")
          : `<div class="muted">${tx("noMatch")}</div>`;
        hits.querySelectorAll(".elo-hit").forEach((d) => d.onclick = () => { hits.hidden = true; openPlayer(d.dataset.uid); });
      }, 150);
    };
    document.addEventListener("click", (e) => { if (!e.target.closest(".elo-search")) hits.hidden = true; if (!e.target.closest("#elo-info")) info.hidden = true; }, { once: true });
  }

  window.EloTab = { render, tab: () => tx("tab"), sub: () => tx("sub") };
})();
