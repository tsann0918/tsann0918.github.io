// ===== 首頁互動 =====

// 取得青蛙舞台相關元素
const stage = document.getElementById('frog-stage');
const stageInner = document.getElementById('frog-stage-inner');
const bodyButtons = document.querySelectorAll('.body-button');
const popouts = document.querySelectorAll('.popout');

// 設計稿寬度（Figma 畫框寬 1728px）
const DESIGN_WIDTH = 1728;

// 依照舞台實際寬度，等比例縮放內部的設計稿座標
function resizeStage() {
  const scale = stage.clientWidth / DESIGN_WIDTH;
  stageInner.style.setProperty('--stage-scale', scale);
}

// 關閉所有對話框，並把按鈕圖片換回預設
function closeAllPopouts() {
  popouts.forEach(function (popout) {
    popout.classList.remove('is-open');
  });
  bodyButtons.forEach(function (button) {
    const img = button.querySelector('img');
    img.src = img.dataset.default;
    button.setAttribute('aria-expanded', 'false');
  });
}

// 點擊身體部位按鈕：切換對應的症狀對話框
bodyButtons.forEach(function (button) {
  button.setAttribute('aria-expanded', 'false');

  button.addEventListener('click', function (event) {
    // 避免觸發下方「點擊空白處關閉」
    event.stopPropagation();

    const part = button.dataset.part;
    const popout = document.querySelector('.popout[data-popout="' + part + '"]');
    const isOpen = popout.classList.contains('is-open');

    // 先全部關閉，再決定是否打開這一個
    closeAllPopouts();

    if (!isOpen) {
      popout.classList.add('is-open');
      const img = button.querySelector('img');
      img.src = img.dataset.active; // 換成 Active 狀態圖
      button.setAttribute('aria-expanded', 'true');
    }
  });
});

// 點擊對話框本身時不關閉
popouts.forEach(function (popout) {
  popout.addEventListener('click', function (event) {
    event.stopPropagation();
  });
});

// 點擊頁面其他地方時關閉對話框
document.addEventListener('click', closeAllPopouts);

// 按 Esc 鍵關閉對話框
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    closeAllPopouts();
  }
});

// 初始化並在視窗大小改變時重新計算縮放
resizeStage();
window.addEventListener('resize', resizeStage);
