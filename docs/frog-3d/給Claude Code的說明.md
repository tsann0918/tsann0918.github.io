# 青蛙貼布 3D 交接包（給 Claude Code 讀）

這份說明描述「FROGet 青蛙貼布」網站要用的 3D 素材與參考實作。請先讀完這份說明，再讀 `docs/frog-3d/reference/` 裡的頁面，最後才動網站的程式。所有修改都要遵守專案根目錄的 CLAUDE.md（原生 HTML/CSS/JS、three.js、js 寫中文註解、改動前先討論並取得同意、不改原有架構）。

## 檔案

| 路徑 | 內容 |
|---|---|
| `img/3d/frog_pouch.glb` | 夾鏈袋模型（含正反面貼圖、易撕條、6 片貼布、形變 `Open`＝袋口張開） |
| `docs/frog-3d/source/pouch_texture.png` | 袋子貼圖（左半正面、右半背面，280 × 225 mm） |
| `docs/frog-3d/source/袋子貼圖模板.svg` | 換貼圖用的設計模板 |
| `docs/frog-3d/source/青蛙貼布夾鏈袋.blend` | Blender 原始檔（不需要在網站用） |
| `js/patch.js` | `makeFourLayerPatch(THREE, RoundedBoxGeometry)`：四層貼布（白 → 綠凸點 → 藍電路 → 白），回傳 `{ group, layers, setExplode(e, gap), bumps, spots, BUMP_BASE, materials, size }` |
| `docs/frog-3d/reference/entrance-animation.html` | 登場動畫參考實作：袋子右下角飛入、3D 翻轉、撕開、抽出貼布（含調整面板，正式版要拿掉） |
| `docs/frog-3d/reference/layers-scroll-fx.html` | 四層分解＋五大程序特效（平面插圖風，定案版），有「自動播放／跟著捲動」兩種模式 |
| `docs/frog-3d/reference/layers-scroll-fx-transparent.html` | 同上，但 3D 畫布背景透明，粉色是頁面 CSS 背景的示意——**整合到網站時以這個寫法為準** |

本機預覽：在網站根目錄執行 `npx serve .` 或 `python3 -m http.server`，再開 `/docs/frog-3d/reference/…html`。`docs/` 只放參考資料，網站頁面不會連到它。不能直接雙擊用 `file://` 開，模型會載入失敗。

技術：three.js 0.170（ES module，從 jsDelivr 載入），沒有打包工具也能跑。

## 規格一：登場動畫（定案參數）

- 播放速度 1.6×、飛入 1.7 秒、停頓 0、撕開 1.0 秒、轉正＋開袋＋抽出 0.9 秒、翻轉 3 圈、透視視角 75°、俯視 0°、左右 0°、畫面大小 1.0×
- 故事時間（未乘速度）：飛入 0 → 1.7 秒；撕開 1.7 → 2.7；易撕條捲好後彈掉 2.7 → 3.05；轉正 3.1 → 3.42；袋口張開 3.34 → 3.66；貼布抽出 3.6 → 4.0；Q 彈到 4.8
- 動畫完全由「時間 t」計算（`apply(t)`），所以可以任意跳到某個時間點，也可以只播其中一段（例如只播飛入 0 → 1.7）
- 參考實作的飛行起點、終點是用畫面比例算的（`screenToWorld`），整合時要改成網站上指定元素的位置

## 規格二：四層分解＋五大程序（平面插圖風，定案）

- 粉色漸層背景 #eac5d1 → #e9a4ba → #e884a2
- 五大程序與層的對應：
  1. 深層吸收：下方 9 條水藍→白的線匯入白色底層（只用線，沒有箭頭頭部）
  2. 疼痛搜集：白底水藍框的 F 圓圈從底層升起，在底層與藍層之間漂浮，聚到中心後被藍層吸收
  3. 射線轉換：兩組分子各自自轉，兩分子＋中間閃電整組繞貼布法線公轉（軌道平行貼布）
  4. 能量匯集：綠層凸起由下往上依序變亮
  5. 定向發射：白色外層上四條分岔線匯到中心，往上射出光柱
- 故事時間軸（秒）：分解 0–1.2 → 吸收 1.2–3.4 → 搜集 3.0–5.6 → 轉換 5.3–7.4 → 匯集 7.1–8.9 → 發射 8.6–10.8 → 收合 11.2–12.4，自動模式 13 秒循環
- 捲動模式：進度 p（0~1）對應故事時間 `p × 10.2`，捲到底停在光柱射出。各程序開始時的 p 值：

| 程序 | 開始 p | 結束 p |
|---|---|---|
| 分解 | 0.00 | 0.12 |
| 1 深層吸收 | 0.12 | 0.33 |
| 2 疼痛搜集 | 0.29 | 0.55 |
| 3 射線轉換 | 0.52 | 0.73 |
| 4 能量匯集 | 0.70 | 0.87 |
| 5 定向發射 | 0.84 | 1.00 |

- 對外 API：`window.frogPatch.setProgress(0~1)`（整合時請改成模組回傳的方法）

## 整合注意

- 兩個 3D 區塊在畫面外時要暫停渲染（IntersectionObserver），避免手機發燙
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`
- `prefers-reduced-motion: reduce` 時直接顯示最終畫面，不播動畫
- **背景一律用網站本身的背景**：兩個 3D 畫布都要透明——`new THREE.WebGLRenderer({ alpha: true })`、不設定 `scene.background`，
  並且呼叫 `makeFourLayerPatch(THREE, RoundedBoxGeometry, { transparentBackground: true })`。
  這個選項會把藍色層從 transmission（透光）改成一般半透明；transmission 在透明畫布上會透出一片空白，所以透明背景時一定要開。
  參考頁面裡的漸層背景（登場動畫的 #e9f1e2、分層頁的粉色漸層）只是預覽用，不要搬進網站
- 四層的層名目前是暫定的（白色外層／綠色凸點層／藍色電路層／白色底層）

---

# 給使用者：建議的下指令順序

一次只做一步，每一步做完都在瀏覽器確認，沒問題再 commit，然後進行下一步。

## 第 0 步：讓它先看懂（不改檔案）

```
請先讀 docs/frog-3d/給Claude Code的說明.md，
再讀 docs/frog-3d/reference/ 裡的 html，然後看我的網站專案結構。
附圖是網站的版面。告訴我你打算怎麼把兩段 3D 動畫整合進網站、會新增或修改哪些檔案，先不要改任何檔案。
```

## 第 1 步：把參考頁面拆成可重用的模組

```
把 docs/frog-3d/reference/entrance-animation.html 拆成 js/pouchEntrance.js，
匯出 createPouchEntrance(canvasContainer, options)，回傳 { playFlyIn(), seek(t), dispose() }。
參數固定用說明檔裡的定案值，拿掉調整面板、時間軸、鏡頭標籤等所有 UI。
兩個模組的 3D 畫布背景都要透明，讓我網站本身的背景透出來（做法見說明檔「整合注意」：alpha、不設 scene.background、transparentBackground: true）。
再把 docs/frog-3d/reference/layers-scroll-fx.html 拆成 js/layersFx.js，
以 docs/frog-3d/reference/layers-scroll-fx-transparent.html 為準，匯出 createLayersFx(canvasContainer)，回傳 { setProgress(p), onStage(callback), dispose() }，
onStage 在進入每個程序時呼叫 callback(程序編號 0~5)，拿掉所有 UI。
兩個模組都要：畫面外時暫停渲染、pixelRatio 上限 1.5、視窗縮放時正確更新。
模型路徑用 img/3d/frog_pouch.glb，共用程式用 js/patch.js。
做一個 demo 頁讓我確認兩個模組都能單獨運作。
```

## 第 2 步：商品介紹區——袋子飛入、停在中間、滑到定位、介紹文字滑入

```
在「青蛙貼布」商品介紹區（左邊商品圖、右邊標題「青蛙貼布／痛感轉移！立即有感」、說明和兩顆按鈕）做以下動畫，用 GSAP：
1. 區塊第一次進入畫面時，3D 袋子從畫面右下角飛入，翻轉 3 圈後停在畫面正中央（只播 pouchEntrance 的飛入段 0~1.7 秒，不撕開）。
2. 停 0.3 秒後，袋子平滑移動並縮放到左欄商品圖的位置與大小（用該元素的 getBoundingClientRect 對齊），時間 0.8 秒、ease 用 power3.inOut。
3. 袋子開始移動的同時，右欄文字由右往左滑入並淡入：標籤 → 標題 → 副標 → 說明 → 按鈕，每個間隔 0.08 秒，位移 40px。
4. 動畫結束後，3D 袋子留在商品圖的位置（可以加很慢的左右擺動），原本的商品圖藏起來。
5. 只播一次；prefers-reduced-motion 時直接顯示最終狀態；手機版也要對齊正確。
完成後開本機伺服器，用瀏覽器截圖給我看動畫開始、中間、結束三個畫面。
```

## 第 3 步：四層構造區——貼布隨捲動分層，同時觸發說明文字

```
在「四層構造，由下往上把痛送走」區塊：
1. 用 GSAP ScrollTrigger 把區塊 pin 住，捲動距離約 4 個螢幕高，scrub: 0.5，
   把捲動進度 0~1 傳給 layersFx.setProgress(p)。
2. 區塊裡的五張說明卡對應五大程序：
   深層吸收＝【填卡片標題】、疼痛搜集＝【填】、射線轉換＝【填】、能量匯集＝【填】、定向發射＝【填】。
   進度到達說明檔表格的「開始 p」時，那張卡滑入（左側的卡從左、右側的卡從右，位移 40px、淡入 0.4 秒），
   正在進行的那張完全不透明，已經播過的卡降到 50% 不透明度但保留在畫面上。
3. 往回捲動時要能倒著播，卡片也要跟著退回。
4. 手機版（寬度 < 768px）：貼布在上、卡片在下方一次只顯示目前那一張，隨捲動切換。
5. prefers-reduced-motion 時：貼布直接停在完全分解的畫面，五張卡全部顯示。
完成後用瀏覽器截圖給我看 p＝0、0.3、0.6、1 四個時間點。
```

## 第 4 步：收尾檢查

```
檢查整個首頁：兩段 3D 在畫面外會暫停、手機（iPhone 尺寸）和桌機都對齊正確、
沒有 console 錯誤、Lighthouse 效能分數，有問題就修，最後列出你改了哪些地方。
```

## 小技巧

- 附上網站截圖，並直接說「在哪一個檔案、哪一個區塊」
- 不滿意時具體描述，例如「文字太早出現，等袋子開始移動 0.2 秒後再出現」，比「感覺怪怪的」有用很多
- 要調時間或位置時，請它把數值集中在檔案最上方的設定物件，之後自己就能改
