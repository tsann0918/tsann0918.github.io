// ===== 問答頁互動 =====

// 取得頁面元素
const orbWrap = document.getElementById('orb-wrap');   // 液態球外層（上面有縮放用的 CSS 變數）
const askInput = document.getElementById('ask-input'); // 輸入框（表單）
const askText = document.getElementById('ask-text');   // 文字輸入區

// ----- 打字時球與光暈的縮放循環 -----
// 每一步的倍率：只有「原本大小」和「放大」（球 +5%、光暈 +10%）兩步，輪流切換
const PULSE_STEPS = [
  { orb: 1.00, glow: 1.00 },
  { orb: 1.05, glow: 1.10 }
];

// 每按幾次按鍵變化一次
const KEYS_PER_STEP = 2;

let keyCount = 0;  // 已經按了幾次鍵
let stepIndex = 0; // 目前在循環的第幾步

// 前進到循環的下一步，並把倍率寫進 CSS 變數（過渡動畫由 liquid.css 負責）
function nextPulseStep() {
  stepIndex = (stepIndex + 1) % PULSE_STEPS.length; // 取餘數，超過最後一步就回到 0
  const step = PULSE_STEPS[stepIndex];
  orbWrap.style.setProperty('--orb-scale', step.orb);
  orbWrap.style.setProperty('--glow-scale', step.glow);
}

// 在輸入區按下任意按鍵：每累積兩次就變化一次
askText.addEventListener('keydown', function () {
  keyCount = keyCount + 1;
  if (keyCount % KEYS_PER_STEP === 0) {
    nextPulseStep();
  }
});

// ----- 輸入框狀態與高度 -----
// 依內容切換狀態：沒有文字是 empty，有文字是 typing
function updateState() {
  askInput.dataset.state = askText.value.trim() === '' ? 'empty' : 'typing';
}

// 讓輸入區高度跟著內容長高（最小高度由 CSS 的 min-height 控制）
function autoGrow() {
  askText.style.height = 'auto';
  askText.style.height = askText.scrollHeight + 'px';
}

askText.addEventListener('input', function () {
  updateState();
  autoGrow();
});

// ----- 送出 -----
askInput.addEventListener('submit', function (event) {
  event.preventDefault(); // 不要重新整理頁面

  // 沒有內容就不送出
  if (askText.value.trim() === '') {
    return;
  }

  // 按鈕變粉紅（送出狀態）。answer 頁完成後，在這裡接著跳轉過去
  askInput.dataset.state = 'sending';
});

// 初始化
updateState();
autoGrow();
