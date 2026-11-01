<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/morph-mark-dark.svg">
    <img src="docs/brand/morph-mark-light.svg" alt="M:orph" width="96">
  </picture>
  <br>
  M:orph
</h1>

<p align="center"><strong>Media Browser</strong><br><em>資料不變，樣貌隨你。</em></p>

<p align="center">
  <a href="README.md">English</a> · 繁體中文 · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a>
</p>

M:orph 是以 Windows 為優先的桌面應用程式，用卡片、表格或樹狀圖瀏覽大量資料夾收藏：漫畫、相簿、影片、音樂與遊戲。你替「專案」指定一個根資料夾，應用程式就會把每個符合的子資料夾變成一筆記錄，讓你描述、搜尋，並用自己喜歡的方式排版。它只**檢視**你的資料：不會為了瀏覽而搬移、改名或刪除原始檔案。

**資料與呈現分開。** 你對資料夾的了解（名稱、標籤、評分、來源）跟著資料夾保存；外觀則是一份版面，設計一次就套用到整個專案。

> **人類負責主導專案，AI 負責程式開發。** 方向、需求、設計決策與審查由人類主導；程式由 AI 開發代理（OpenAI Codex，之後是 Anthropic 的 Claude Code）依此撰寫。
>
> 專案處於**早期開發階段**。目前版本：**0.37.2**（[變更紀錄](CHANGELOG.md)）。

---

## 功能

**瀏覽**

- 同一份資料有三種模式：**CARD**、**TABLE**、**TREE**，並按專案記住篩選、範圍與檢視設定。
- 右側面板不離開列表就能看選取的資料夾：詳情、檔案、子資料夾，以及內容的閱讀器或播放器。
- 可重建的本機索引，支援所有欄位搜尋（子字串、AND／OR／排除、數字與日期比較、儲存的搜尋）。

**設計卡片**

- 積木編輯器把**組件**放在網格上：名稱、路徑、文字、標籤、數字、評分、日期、單選、連結、圖片、分隔線，以及遊戲組件（封面、啟動按鈕）。
- 每個組件都能調整樣式：字級、粗細、斜體／底線／刪除線、對齊、顏色、內距、圓角、邊框、透明度、行距與字距，還有現成的樣式。標籤可依分類上色，單選選項可有自己的顏色。
- 長內容保持整齊：省略號、換行、標籤「+N」，或可捲動的組件。
- **備用欄位**：一個組件可以列出多個欄位（例如 Steam、DLsite 與你自己備註的名稱），顯示第一個有值的；搜尋也沿用同一條順序。
- 編輯器內用真實資料預覽、每個專案可有多個命名版面，也可依內容類型指定版面。

**檢視與播放**

- 相簿瀑布流與全螢幕圖片閱讀器；支援跨頁與由右至左的漫畫閱讀器；有字幕（SRT／VTT）、續播與跨專案音訊／影片佇列的影片播放器；應用程式內開啟 PDF、ZIP 與 CBZ。
- 影片無法解碼時，應用程式會說明原因（例如被改名的壓縮檔），並提供用系統播放器開啟。

**遊戲**

- 偵測遊戲資料夾（含許多日系視覺小說引擎）並保護其內部：應用程式不會在遊戲裡建立記錄。
- 每個遊戲各自的啟動動作：帶參數的 EXE、資料夾、檔案、網址，以及**捷徑**（讓 Locale Emulator 捷徑保留它自己的設定）。啟動組件可以由一個動作退到另一個動作，每個遊戲也能隱藏用不到的按鈕。

**補充資料**

- 貼上頁面網址就會自動辨識來源：E-Hentai／ExHentai、Steam、DLsite、VNDB、Bangumi、AniList、Hitomi、Pixiv、MusicBrainz、Open Library 與 Wikimedia Commons。先看預覽，再選擇要匯入的欄位。你不要求，就不會取得任何資料。其中部分網站含有成人內容，要不要使用由你自行決定，並請遵守各網站自己的條款。

**外觀與語言**

- 三種主題（深色、霧白玻璃、暖紙）與五種介面語言（繁體中文、簡體中文、英文、日文、西班牙文）。

---

## 資料怎麼保存

```text
資料夾 ──→ 可攜的資料夾記錄 ──┐
                              ├──→ 專案版面 → 畫面上的組件
專案根目錄 ──→ 可攜的設定 ────┘
                  │ 兩者都是資料來源
                  └──→ SQLite 搜尋索引（隨時可重建）
```

- 每個受管資料夾帶有隱藏的 `.media-viewer` 記錄，所以資料夾搬到別處或別台裝置，仍知道自己是什麼。你的原始檔案不會被動到。（這個資料夾名稱屬於資料格式，沿用產品改名前的名稱。）
- 寫入是原子且可復原的；清理只移除應用程式建立的內容，並先預覽。
- 值預設在專案間共用；私有覆寫必須刻意建立。
- Electron 啟用 context isolation 與 sandbox；renderer 不能任意讀取路徑或執行命令。

---

## 開始使用

需要 Node.js 24 與 pnpm 10。

```bash
pnpm install
pnpm dev
```

| 指令 | 用途 |
| --- | --- |
| `pnpm dev` | 開發模式執行 |
| `pnpm build` | 型別檢查並建置 |
| `pnpm typecheck` | 只做型別檢查 |
| `pnpm test` | 資料與邏輯測試 |
| `pnpm test:ui:changed` / `:smoke` / `:all` | Electron UI 測試（依改動／核心項目／全部） |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm shot <game\|manga\|album\|other>` | 用內建範例資料截圖 |

驗證方式見 [IMPLEMENTATION](docs/IMPLEMENTATION.md)。每次推送，GitHub Actions 會執行型別檢查、格式檢查與資料測試。

---

## 技術

Electron · React 18 · Vite 7 · TypeScript · Mantine 8 · Node SQLite（搜尋索引）· Playwright（UI 測試）

---

## 文件

設計文件主要以繁體中文撰寫。

- [文件索引](docs/README.md)：依任務找到對應文件。
- [產品範圍](docs/PRODUCT.md)與[架構](docs/ARCHITECTURE.md)。
- [目前工作與已知限制](docs/WORK_ITEMS.md)、[決策](docs/DECISIONS.md)。
- [貢獻指南](CONTRIBUTING.md)與[安全政策](SECURITY.md)（請私下回報漏洞）。
- 貢獻者與程式代理：請先讀 [CLAUDE.md](CLAUDE.md)（Claude Code）或 [AGENTS.md](AGENTS.md)（Codex）。早期 POC 資料封存在 [docs/archive](docs/archive/)，不是現行規格。

---

## 授權

版權所有 (C) 2024–2026 Zeke Gan。原始碼是自由軟體，採用 **GNU 通用公共授權條款第 3 版或（由你選擇）任何更新的版本**，見 [LICENSE](LICENSE) 與 [NOTICE.md](NOTICE.md)。修改後的版本必須以相同授權公開，並保留聲明。

**名稱與標誌不在此授權範圍內。** 修改後的版本不得使用「M:orph」名稱或 M:orph 標誌，也不能只換標誌或只改名就當作官方版本發布。見[名稱與標誌政策](TRADEMARK.md)。

M:orph 與它可讀取資料的各網站沒有任何關係；各網站的名稱屬於其擁有者。

---

## 作者

**Zeke Gan** — [GitHub](https://github.com/ZekeGan)
