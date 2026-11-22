// ===== 部位詳細頁互動（eye / organ / arm 三頁共用） =====
// 每頁 HTML 結構相同，只有文字內容不同，所以這支程式可以直接共用。

// 取得頁面元素
const symptomButtons = document.querySelectorAll('.symptom-nav-item');
const sectionTabs = document.querySelectorAll('.section-tabs .tag');
const symptomContents = document.querySelectorAll('.symptom-content');
const panelTitle = document.getElementById('panel-title');
const panelHeader = document.getElementById('panel-header');

// 目前選到的症狀（第幾個）與分頁名稱
let currentSymptom = 0;
let currentSection = 'symptoms';

// 依照目前的症狀與分頁，更新畫面
function render() {
  // 1. 左側症狀選單：標示目前選到的那一個
  symptomButtons.forEach(function (button, index) {
    const isActive = index === currentSymptom;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // 2. 面板標題：直接使用左側按鈕上的文字
  panelTitle.textContent = symptomButtons[currentSymptom].textContent.trim();

  // 3. 分頁標籤：標示目前選到的分頁
  sectionTabs.forEach(function (tab) {
    const isActive = tab.dataset.section === currentSection;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // 4. 就醫警訊時標題列變粉紅
  panelHeader.classList.toggle('is-warning', currentSection === 'warning');

  // 5. 只顯示「目前症狀」裡的「目前分頁」內容
  symptomContents.forEach(function (content, index) {
    const isActiveSymptom = index === currentSymptom;
    content.classList.toggle('is-active', isActiveSymptom);

    content.querySelectorAll('.section-content').forEach(function (section) {
      section.classList.toggle('is-active', isActiveSymptom && section.dataset.section === currentSection);
    });
  });
}

// 點左側症狀：切換症狀，分頁回到「常見症狀」
symptomButtons.forEach(function (button, index) {
  button.addEventListener('click', function () {
    currentSymptom = index;
    currentSection = 'symptoms';
    render();
  });
});

// 點上方分頁標籤：切換分頁
sectionTabs.forEach(function (tab) {
  tab.addEventListener('click', function () {
    currentSection = tab.dataset.section;
    render();
  });
});

// 點「看更多 →」快捷卡：跳到對應分頁（成因分析／舒緩方法）
document.querySelectorAll('.quick-card').forEach(function (card) {
  card.addEventListener('click', function () {
    currentSection = card.dataset.goto;
    render();
  });
});

// 網址可指定一開始顯示第幾個症狀，例如 eye-detail.html?symptom=2
const params = new URLSearchParams(window.location.search);
const startSymptom = parseInt(params.get('symptom'), 10);
if (startSymptom >= 0 && startSymptom < symptomButtons.length) {
  currentSymptom = startSymptom;
}

// 初始化畫面
render();
