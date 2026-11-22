/* =========================================================
   解壓遊戲：遊玩資料頁（game-data.html）
   - 輸入 4 位數密碼才看得到資料
     ⚠ 密碼寫在前端程式裡，懂程式的人看得到；只能擋一般玩家，不是真的加密
   - 統計數字、全部成績表（點欄位排序）、匯出 CSV、清除紀錄
   ========================================================= */
import { fmt, STAGE_TEXT, loadScores, saveScores, sortScores, syncAndLoad, isOnline, statusText, exportCSV } from './slapScores.js';

const PASSWORD = "0918";
const UNLOCK_KEY = "frogSlap3d.dataUnlocked";   // 這次開啟瀏覽器期間記住已解鎖（關掉分頁就要重新輸入）

const $ = id => document.getElementById(id);
const page = document.body;
const pinBox = $("pin"), pins = [...pinBox.querySelectorAll("input")], lockError = $("lockError");

let list = [];
let sortKey = "score", sortDir = -1;            // 預設：分數由高到低

/* ---------- 密碼 ---------- */
function isUnlocked() {
  try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) { return false; }
}
function setLocked(locked) {
  page.dataset.locked = locked ? "1" : "0";
  try { locked ? sessionStorage.removeItem(UNLOCK_KEY) : sessionStorage.setItem(UNLOCK_KEY, "1"); } catch (e) { /* 記不住也沒關係 */ }
  if (locked) { pins.forEach(p => { p.value = ""; p.classList.remove("is-filled"); }); pins[0].focus(); }
  else loadData();
}

// 一格只能打一個數字，打完自動跳下一格；刪除時跳回上一格；可以直接貼上 4 碼
pins.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(-1);
    input.classList.toggle("is-filled", input.value !== "");
    lockError.textContent = "";
    if (input.value && i < pins.length - 1) pins[i + 1].focus();
    if (pins.every(p => p.value)) check();
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !input.value && i > 0) pins[i - 1].focus();
  });
  input.addEventListener("paste", e => {
    const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, pins.length);
    if (!digits) return;
    e.preventDefault();
    pins.forEach((p, k) => { p.value = digits[k] || ""; p.classList.toggle("is-filled", !!p.value); });
    if (digits.length === pins.length) check();
    else pins[digits.length].focus();
  });
});

function check() {
  const code = pins.map(p => p.value).join("");
  if (code === PASSWORD) { setLocked(false); return; }
  lockError.textContent = code.length < pins.length ? "請輸入 4 位數密碼" : "密碼不對，再試一次";
  pinBox.classList.remove("is-wrong"); void pinBox.offsetWidth; pinBox.classList.add("is-wrong");
  pins.forEach(p => { p.value = ""; p.classList.remove("is-filled"); });
  pins[0].focus();
}
$("lockForm").addEventListener("submit", e => { e.preventDefault(); check(); });
$("lockBtn").addEventListener("click", () => setLocked(true));

/* ---------- 資料 ---------- */
async function loadData() {
  list = loadScores();                          // 先顯示本機的
  render();
  list = await syncAndLoad();                   // 有線上資料庫就再抓一次
  render();
}

function render() {
  // 統計數字
  const n = list.length;
  const players = new Set(list.map(r => r.name)).size;
  const avg = n ? list.reduce((s, r) => s + r.score, 0) / n : 0;
  const best = n ? Math.max(...list.map(r => r.score)) : 0;
  $("stGames").textContent = fmt(n);
  $("stPlayers").textContent = fmt(players);
  $("stAvg").textContent = fmt(avg);
  $("stBest").textContent = fmt(best);
  $("stStage2").textContent = `${fmt(list.filter(r => r.stage >= 2).length)} 場`;
  $("stStage3").textContent = `${fmt(list.filter(r => r.stage >= 3).length)} 場`;

  // 名次永遠照分數排；表格順序照目前選的欄位
  const rankOf = new Map(sortScores(list).map((r, i) => [r.id, i + 1]));
  const rows = list.slice().sort((a, b) => {
    const x = a[sortKey], y = b[sortKey];
    const c = typeof x === "string" ? x.localeCompare(y, "zh-Hant") : x - y;
    return c * sortDir || b.score - a.score;
  });

  const tbody = $("tbody");
  tbody.textContent = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    const cells = [
      ["rank", String(rankOf.get(r.id)).padStart(2, "0")],
      ["", r.name],                             // textContent 放名字，名字裡的符號不會被當成程式
      ["num score", fmt(r.score)],
      ["num", r.hits],
      ["num", r.maxCombo],
      ["", `${r.stage} ${STAGE_TEXT[r.stage]}`],
      ["time", r.t ? new Date(r.t).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"]
    ];
    cells.forEach(([cls, text]) => {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  $("emptyNote").hidden = n > 0;
  $("tblInfo").textContent = `點欄位名稱可以排序・${statusText()}`;

  // 標出目前排序的欄位
  document.querySelectorAll("th button[data-sort]").forEach(b => {
    const th = b.parentElement;
    const on = b.dataset.sort === sortKey;
    if (on) th.setAttribute("aria-sort", sortDir < 0 ? "descending" : "ascending"); else th.removeAttribute("aria-sort");
    b.textContent = b.textContent.replace(/ [↓↑]$/, "") + (on ? (sortDir < 0 ? " ↓" : " ↑") : "");
  });
}

// 點欄位名稱：同一欄再點一次就反過來排
document.querySelectorAll("th button[data-sort]").forEach(b => {
  b.addEventListener("click", () => {
    const k = b.dataset.sort;
    if (k === sortKey) sortDir = -sortDir;
    else { sortKey = k; sortDir = k === "name" ? 1 : -1; }
    render();
  });
});

$("exportBtn").addEventListener("click", () => {
  if (!exportCSV(list)) alert("還沒有任何成績可以匯出。");
});

// 清除紀錄：只清這台電腦上的；線上資料庫的要到 Firebase 後台刪
$("clearBtn").addEventListener("click", () => {
  const msg = isOnline()
    ? "確定要清除這台電腦上的成績嗎？（線上資料庫的成績要到 Firebase 後台刪除）這個動作無法復原。"
    : "確定要清除這台電腦上的所有成績嗎？這個動作無法復原。";
  if (!confirm(msg)) return;
  saveScores([]);
  loadData();
});

/* ---------- 啟動 ---------- */
setLocked(!isUnlocked());
