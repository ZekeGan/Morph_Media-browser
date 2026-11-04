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
  <a href="README.md">English</a> · 繁體中文 · <a href="README.ja.md">日本語</a>
</p>

M:orph 是 Windows 上的資料夾收藏瀏覽器。漫畫、相簿、影片、音樂、遊戲，指定一個根資料夾，每個子資料夾就變成一筆可以描述、搜尋、排版的記錄，用卡片、表格或樹狀圖來看。

它只**檢視**你的資料，不會為了瀏覽而搬移、改名或刪除任何原始檔案。

<!-- TODO 截圖：主畫面（卡片模式，暗色），寬 1500，放在這裡 -->

## 為什麼用它

- **同一份資料，三種看法。** 卡片、表格、樹狀隨時切換，篩選與檢視設定按專案記住。
- **版面自己設計。** 用積木編輯器決定每張卡片放什麼、長什麼樣，設計一次，整個專案都套用。
- **資料跟著資料夾走。** 名稱、標籤、評分、來源都存在資料夾自己身上，搬到別的位置或別台電腦，它仍然知道自己是什麼。
- **不動你的原始檔。** 應用程式建立的內容都在隱藏記錄裡，清理時只移除它自己建立的東西，而且先預覽。

<!-- TODO 截圖：版面編輯器，或三個主題並排 -->

## 下載與安裝

> 第一個正式版本發布後，下載連結會放在這裡：**[Releases](https://github.com/ZekeGan/media-viewer/releases)**（目前尚未發布）。

- **安裝版**（`Morph-Setup-<版本>.exe`）：安裝後從開始選單啟動。
- **免安裝版**（`Morph-Portable-<版本>.exe`）：直接執行，不寫入系統。
- 目前的版本**沒有程式碼簽章**，第一次執行時 Windows 會出現藍色 SmartScreen 警告：點「其他資訊」，再點「仍要執行」。

第一次使用的步驟見[使用說明](docs/USER_GUIDE.zh-TW.md)。

## 功能

**瀏覽與搜尋**

- 右側面板不離開列表就能看選取的資料夾：詳情、檔案、子資料夾，以及內容的閱讀器或播放器。
- 搜尋所有欄位：子字串、AND／OR／排除、數字與日期比較，可儲存搜尋。索引在本機，隨時可重建。

**設計卡片**

- 把名稱、路徑、文字、標籤、數字、評分、日期、單選、連結、圖片等**組件**拖到網格上，每個組件都能調整字級、顏色、對齊、邊框等樣式。
- **備用欄位**：一個組件可以列出多個欄位（例如 Steam、DLsite 與你自己備註的名稱），顯示第一個有值的。
- 編輯器內用真實資料預覽；每個專案可有多個命名版面，也能依內容類型指定版面。

**檢視與播放**

- 相簿瀑布流與全螢幕圖片閱讀器；支援跨頁與由右至左的漫畫閱讀器。
- 影片播放器有字幕（SRT／VTT）、續播與跨專案佇列；音樂可連續播放。
- 直接開啟 PDF、ZIP 與 CBZ。影片無法解碼時會說明原因，並提供用系統播放器開啟。

**遊戲**

- 自動偵測遊戲資料夾（含許多日系視覺小說引擎），並保護其內部：不會在遊戲裡建立任何檔案。
- 每個遊戲各自設定啟動動作：帶參數的 EXE、資料夾、檔案、網址，以及捷徑（讓 Locale Emulator 捷徑保留它自己的設定）。

**補充資料**

- 貼上頁面網址就會自動辨識來源：E-Hentai／ExHentai、Steam、DLsite、VNDB、Bangumi、AniList、Hitomi、Pixiv、MusicBrainz、Open Library 與 Wikimedia Commons。先看預覽，再選擇要匯入的欄位；你不要求，就不會取得任何資料。
- 其中部分網站含有成人內容，要不要使用由你自行決定，並請遵守各網站自己的條款。

**外觀與語言**

- 三種主題：深色、霧白玻璃、暖紙。
- 介面語言有繁體中文、簡體中文、英文、日文、西班牙文。

## 資料怎麼保存

```text
資料夾 ──→ 可攜的資料夾記錄 ──┐
                              ├──→ 專案版面 → 畫面上的組件
專案根目錄 ──→ 可攜的設定 ────┘
                  │ 兩者都是資料來源
                  └──→ SQLite 搜尋索引（隨時可重建）
```

- 每個受管資料夾帶有隱藏的 `.media-viewer` 記錄（這個名稱屬於資料格式，沿用產品改名前的名稱）。
- 寫入是原子且可復原的。
- 值預設在專案間共用；私有覆寫必須刻意建立。

## 給開發者

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
| `pnpm dist` | 建置 Windows 安裝程式與免安裝版到 `release/morph <版本>/` |
| `pnpm shot <game\|manga\|album\|other>` | 用內建範例資料截圖 |

技術：Electron · React 19 · Vite 7 · TypeScript · Mantine 8 · Node SQLite · Playwright。Electron 啟用 context isolation 與 sandbox，renderer 不能任意讀取路徑或執行命令。

驗證方式見 [IMPLEMENTATION](docs/IMPLEMENTATION.md)；每次推送，GitHub Actions 會執行型別檢查、格式檢查與資料測試。

## 文件

設計文件主要以繁體中文撰寫。

- [使用說明](docs/USER_GUIDE.zh-TW.md)
- [文件索引](docs/README.md)：依任務找到對應文件。
- [產品範圍](docs/PRODUCT.md)與[架構](docs/ARCHITECTURE.md)。
- [目前工作與已知限制](docs/WORK_ITEMS.md)、[決策](docs/DECISIONS.md)、[變更紀錄](CHANGELOG.md)。
- [貢獻指南](CONTRIBUTING.md)與[安全政策](SECURITY.md)（請私下回報漏洞）。
- 貢獻者與程式代理：請先讀 [CLAUDE.md](CLAUDE.md)（Claude Code）或 [AGENTS.md](AGENTS.md)（Codex）。早期 POC 資料封存在 [docs/archive](docs/archive/)，不是現行規格。

## 專案狀態

專案**即將發布第一個版本**，目前版本 **0.39.0**。

**人類負責主導，AI 負責程式開發。** 方向、需求、設計決策與審查由人類主導；程式由 AI 開發代理（OpenAI Codex，之後是 Anthropic 的 Claude Code）依此撰寫。

## 授權

版權所有 (C) 2024–2026 Zeke Gan。原始碼是自由軟體，採用 **GNU 通用公共授權條款第 3 版或（由你選擇）任何更新的版本**，見 [LICENSE](LICENSE) 與 [NOTICE.md](NOTICE.md)。修改後的版本必須以相同授權公開，並保留聲明。

**名稱與標誌不在此授權範圍內。** 修改後的版本不得使用「M:orph」名稱或 M:orph 標誌，也不能只換標誌或只改名就當作官方版本發布。見[名稱與標誌政策](TRADEMARK.md)。

M:orph 與它可讀取資料的各網站沒有任何關係；各網站的名稱屬於其擁有者。

## 作者

**Zeke Gan** — [GitHub](https://github.com/ZekeGan)
