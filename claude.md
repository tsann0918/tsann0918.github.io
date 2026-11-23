# 專案結構

## 檔案結構

- html檔案放在根目錄
- css檔案放在`/css`資料夾
- javascrip檔案放在`/js`資料夾
- 圖片檔案，如.png.svg檔案放在`/img`資料夾
- 3D相關檔案，如obj,mtl檔案放在`/img`資料夾（青蛙貼布模型在`/img/3d`）

## 技術規範

- html,css,javascript使用原生語語法
- 3D優先使用three.js
- js要有中文註解
- 每次更動前，先討論並獲得許可
- 更改以不修改原有架構為主

## 3D素材（青蛙貼布）

- 做任何 3D 或動畫相關修改前，先讀 `docs/frog-3d/給Claude Code的說明.md`
- 袋子模型：`img/3d/frog_pouch.glb`；四層貼布共用程式：`js/patch.js`
- `docs/frog-3d/reference/` 是參考範例，網站頁面不要連到它，也不要修改
- 3D 畫布一律透明背景，使用網站本身的背景
