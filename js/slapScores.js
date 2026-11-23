/* =========================================================
   解壓遊戲：成績資料（遊戲頁 game.html 和遊玩資料頁 game-data.html 共用）
   - 成績一律先存在這台電腦的瀏覽器（localStorage）
   - ONLINE.DB_URL 有填的話，會同步到線上資料庫（做法見 whack-slap 的「線上排行榜設定.md」）
     沒網路時先存本機，連上後自動補傳
   ========================================================= */

// 線上排行榜：把 Firebase Realtime Database 的網址貼在 DB_URL；留空 = 只存在這台電腦
export const ONLINE = { DB_URL: "" };

export const STAGE_TEXT = ["", "正常", "臉腫起來了", "被打到好開心"];

const STORE_KEY = "frogSlap3d.scores.v1";      // 跟 whack-slap 分開存，兩個遊戲的成績不會混在一起
let memoryScores = [];                          // 瀏覽器不讓存檔時的備用
let onlineStatus = "off";                       // off = 只存本機 / ok = 已連線 / offline = 連不上

const dbBase = () => (ONLINE.DB_URL || "").trim().replace(/\/+$/, "");
export const isOnline = () => dbBase() !== "";
export const getOnlineStatus = () => onlineStatus;

// 1387 → 1,387
export const fmt = n => Math.round(n).toLocaleString("en-US");

// 整理成固定格式；格式不對的丟掉（資料庫是公開的，不能全部相信）
function normalize(r) {
  if (!r || typeof r !== "object") return null;
  const score = Number(r.score);
  if (!Number.isFinite(score)) return null;
  const t = Number(r.t);
  const stage = Number(r.stage);
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? "").slice(0, 12) || "無名氏",
    score,
    hits: Number(r.hits) || 0,
    maxCombo: Number(r.maxCombo) || 0,
    stage: stage >= 1 && stage <= 3 ? stage : 1,   // 這一場青蛙到達第幾階段（舊紀錄沒有就算 1）
    t: Number.isFinite(t) ? t : 0,
    synced: r.synced
  };
}

export function loadScores() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalize).filter(Boolean) : [];
  } catch (e) {
    return memoryScores;
  }
}

export function saveScores(list) {
  memoryScores = list;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* 存不了就只留在這次開啟的頁面 */ }
}

// 新增一場成績（先存本機）
export function addScore(rec) {
  const local = loadScores();
  local.push({ ...rec, synced: false });
  saveScores(local);
  return local;
}

// 分數高的在前；同分比連擊；再同分先玩的在前
export const sortScores = list =>
  list.slice().sort((a, b) => b.score - a.score || b.maxCombo - a.maxCombo || a.t - b.t);

// 有逾時的 fetch，避免網路卡住時整個畫面停住
async function fetchTimeout(url, opts = {}, ms = 7000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" }); }
  finally { clearTimeout(timer); }
}

// 上傳一筆成績（用 id 當資料庫的 key，重複上傳也不會變兩筆）
async function pushRecord(rec) {
  const body = JSON.stringify({ name: rec.name, score: rec.score, hits: rec.hits, maxCombo: rec.maxCombo, stage: rec.stage, t: rec.t });
  const r = await fetchTimeout(`${dbBase()}/scores/${encodeURIComponent(rec.id)}.json`, { method: "PUT", body });
  return r.ok || [400, 401, 403].includes(r.status);
}

async function fetchRemote() {
  const r = await fetchTimeout(`${dbBase()}/scores.json`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  if (!data || typeof data !== "object") return [];
  return Object.entries(data).map(([id, v]) => normalize({ ...v, id, synced: true })).filter(Boolean);
}

// 先把還沒上傳的補傳，再讀回所有人的成績；連不上就只用這台電腦的
export async function syncAndLoad() {
  const local = loadScores();
  if (!isOnline()) { onlineStatus = "off"; return local; }
  try {
    let changed = false;
    for (const rec of local) {
      if (rec.synced) continue;
      if (!(await pushRecord(rec))) throw new Error("upload failed");
      rec.synced = true;
      changed = true;
    }
    if (changed) saveScores(local);

    const remote = await fetchRemote();
    const map = new Map(remote.map(r => [r.id, r]));
    local.forEach(r => { if (!map.has(r.id)) map.set(r.id, r); });
    onlineStatus = "ok";
    return [...map.values()];
  } catch (e) {
    console.warn("線上排行榜連不上，先用這台電腦的紀錄：", e);
    onlineStatus = "offline";
    return local;
  }
}

export function statusText() {
  return onlineStatus === "ok" ? "線上排行榜"
       : onlineStatus === "offline" ? "連不上網路，成績先存在這台電腦，連上後會自動補傳"
       : "成績存在這台電腦";
}

// 匯出 CSV（Excel 打得開）
export function exportCSV(list) {
  const rows = sortScores(list);
  if (!rows.length) return false;
  const esc = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ["名次,名字,分數,打中次數,最高連擊,到達階段,時間"];   // 分數不加逗號，Excel 才能排序
  rows.forEach((r, i) => lines.push([
    i + 1, esc(r.name), r.score, r.hits, r.maxCombo, esc(`${r.stage} ${STAGE_TEXT[r.stage]}`), esc(new Date(r.t).toLocaleString("zh-TW"))
  ].join(",")));
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });   // 加 BOM，Excel 才不會亂碼
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "解壓遊戲成績.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}
