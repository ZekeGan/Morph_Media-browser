# CLAUDE.md

M:orph：Windows 優先的資料夾檢視器（Electron＋React＋Vite，pnpm）。使用者最新指示優先；本檔是工作規則的唯一來源（`AGENTS.md` 只是入口）。命令與驗證細節在 [IMPLEMENTATION](docs/IMPLEMENTATION.md)，發布在 [RELEASING](docs/RELEASING.md)。

## 授權與分支

- 在 `main` 開發並推送 `origin/main`；不動其他分支、不強推、不改寫歷史。每批都提交；檢查全過就推送，只有次版號／主版號升級才先問。
- 只有需求有實質歧義、缺必要資料或破壞性操作才停下詢問；保留工作樹內既有未提交變更。使用者說「先討論」時只討論、不改檔案。

## 需求流程

1. **登記**：使用者提出需求時，寫進 [需求清單](docs/WORK_ITEMS.md)（格式見該頁），不實作。補齊大小、風險、資料影響、領域、依賴、取代；只有大型或會寫入資料時多回一句預估。
2. **核定**：使用者核定「建議下一批」，即核定該批裡的需求；未核定的不開發。一次核定多批時，依下列順序自動接續，不逐批再問。
3. **排序**：先做被依賴的 → 領域重疊的合成一批（程式讀一次、測試跑一次）→ 資料寫入／安全邊界的集中一批（只審一次）→ 小、低風險的先做 → 使用者標「急」的插到最前面 → 會改資料結構的排在相關畫面查收之後。
4. **暫定 → 轉正**：畫面還在變時只做程式＋截圖（`pnpm shot`）＋smoke；新資料欄位在 DATA_FORMAT 標「暫定」。使用者查收畫面通過時同批轉正：補 UI 測試、取消暫定。能放專案或本機設定的就不寫進資料夾記錄；同期多個改結構的需求合併成一次升版。
5. **狀態區塊**：每次回覆結尾附 `pnpm status` 的內容（有改檔或狀態變動時用完整區塊，純問答用 `--short` 的一行），讓使用者不必問「還剩什麼」。

## 起手式（省 Context）

- 讀 `pnpm status`（或 WORK_ITEMS 的相關章節）與 `git status --short`；再從 [docs/README.md](docs/README.md) 的定位表**只取該領域那一列**。
- 大檔按章節或符號讀（先 `rg` 再 `Read` 指定範圍）；搜尋排除 `-g "!docs/{archive,history,design,decisions}" -g "!graphify-out" -g "!.test-output"`。決策只在追溯原因時讀：先看 [DECISIONS](docs/DECISIONS.md) 索引，再開對應月份的一段。
- 結構問題（呼叫端、依賴、影響範圍）先查 `graphify explain|path|query`（INFERRED 邊需回原始碼核對）；程式改動後跑 `graphify update .`。`graphify-out/` 不提交。

## 修改原則

- 最小必要修改、沿用現有風格；不加未要求的功能或抽象，不順手重構（另登記需求）。修錯先重現並找根因。
- 規格寫目標，程式是現況，差距進需求清單；規格只寫現行規則，日期與理由寫進決策紀錄，未決選項寫 [OPEN_DECISIONS](docs/OPEN_DECISIONS.md)。新 UI 測試用 `tests/support/app.ts`。
- 新增或修改的介面：同批補齊五種語系；沿用三主題、圖示、控制尺寸與焦點樣式；純圖示控制要有 tooltip 與 `aria-label`。用 `pnpm shot` 看暗色寬窗與寬 900 窄窗；動到版型或樣式再加 `--theme glass`、`--theme paper`。
- 含反斜線或跳脫字元的內容用檔案編輯工具或腳本檔寫入，不用 heredoc 或命令列拼接；格式化工具改到無關檔案時加進 `.prettierignore`。

## 每批收尾（不必詢問，做完再回報）

1. 新增原始檔或改規格章節時，同批更新 [docs/areas.json](docs/areas.json) 並跑 `node scripts/areas.mjs readme`。
2. 功能被取代或移除時，同批刪掉對應的程式、測試（含無障礙名稱）、語系文字與規格段落。
3. 跑 `pnpm stale`，處理它點名的項目；改到的規格卡更新頁首「最後確認」日期。
4. 動到介面時跑 `pnpm test:ui:changed`（提交前）；失敗先分類（產品／測試／環境）再修。
5. CHANGELOG 的 Unreleased 寫一行；需求移到「待查收」並附驗收步驟。
6. 提交、推送；回報附 30 秒驗收清單、關鍵截圖與狀態區塊。

- **查收暫停**：待查收超過約 5 項或一個大主題結束時，先停下新功能，跑 `pnpm test:ui:smoke` 與 `pnpm test:ui:all`、檢查三主題與窄窗，再交查收清單。使用者確認後刪除那些需求；Unreleased 含新功能時主動建議發布。
- **高風險審查**：資料寫入、身分、清理、遷移，以及安全邊界（IPC、路徑、外部程式、網路）的改動，提交前用獨立代理審查一次（只給該次差異與要查的風險）。
- **版本**：不逐批升版；使用者說要發布才定版（新功能升次版號、純修正升修訂號）。目前是 Alpha：不打 tag、不上 Releases；只有使用者明確說「這版是 Beta」才進入 Beta。改 `schemaVersion` 須符合 [DATA_FORMAT](docs/DATA_FORMAT.md#格式升級與相容規則)。
- 模組責任或資料流改變時，同批更新 `docs/ARCHITECTURE.md` 的 mermaid 圖。修改本檔流程規則時，檢查 `docs/WORKFLOW_PROMPT.md` 是否要同步。
- 重大主題結束或對話變長時，先把決策寫進文件，再提示使用者開新對話。

## 不可省略的限制

- 只檢視，不為瀏覽搬移或刪除使用者原始資料夾；不覆蓋或清理他人工作。
- 可攜記錄是資料來源，SQLite 只是可重建索引（[FOLDER_PROJECT_MODEL](docs/FOLDER_PROJECT_MODEL.md)、[STORAGE_OPTIONS](docs/STORAGE_OPTIONS.md)）。
- 遊戲 ROOT 內部受保護，導覽不得自動初始化缺失記錄（[GAME_ENGINE_DETECTION](docs/GAME_ENGINE_DETECTION.md)）。
- 掃描與寫入驗證只用受控測試資料；真實收藏只做唯讀檢查（`pnpm detect`），批次寫入或遷移前須有備份與復原路徑。
- Electron 保留 contextIsolation、sandbox、停用 nodeIntegration；renderer 不得任意讀路徑或執行命令（[ARCHITECTURE](docs/ARCHITECTURE.md)）。

## 常用命令

`pnpm dev`／`pnpm build`（含 tsc）／`pnpm exec tsx --test tests/<name>.test.ts`／`pnpm test`／`pnpm test:ui:changed`（平常用）／`pnpm test:ui:smoke`／`pnpm test:ui:all`（發布前）／`pnpm shot <game|manga|album|other>`／`pnpm detect <資料夾> [--children]`／`pnpm status`／`pnpm stale`。提交前的型別、格式、UI 名稱、領域登錄表與文件連結檢查由 `.githooks/pre-commit` 自動執行。依風險選最小有效驗證：[驗證選擇](docs/IMPLEMENTATION.md#驗證選擇)；回報分清實際執行、未執行與限制。
