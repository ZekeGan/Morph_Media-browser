# CLAUDE.md

Windows 優先的資料夾檢視器（Electron + React + Vite，pnpm），POC 後續開發。使用者最新指示優先；`PLAN.md`、舊原型、設計預覽不是現行規格。本檔是工作規則的唯一來源；`AGENTS.md` 只是指向本檔的入口，不必再讀。

## 分支與授權

- 在 `main` 開發、推送 `origin/main`，不自行切回 `codex/ai`，不覆寫或刪除其他分支。**提交每批都做；推送（2026-11-02 使用者核定）**：一般批次檢查全過後直接推送，**只有主要升版（次版號或主版號改變，例如 0.1.1 → 0.2.0）才先問使用者**；強制推送、改寫歷史、動其他分支一律須明確授權。
- 列入 `docs/WORK_ITEMS.md` ≠ 授權開發。未審核的 R／T／UI-R 提案不是核定需求；使用者一次授權整批時，依影響與驗證成本由小到大自動接續，不逐批再問。
- 只有需求實質歧義、缺必要資料或破壞性操作才停下詢問；其餘獨立工作繼續。保留工作樹內所有既有未提交變更。

## 起手式（省 Context）

1. 讀 `docs/WORK_ITEMS.md` 的「待實作」「待查收與限制」，跳過 `<details>`、已交付階段、歷史；再 `git status --short`，只讀相關 diff。
2. 用 `docs/README.md` 的「按任務定位」表，**只取該任務那一列**（先 `rg` 列名／章節，再 `Read` 指定 offset／limit），不整份讀索引或主規格。
3. 大檔一律按章節或符號讀：`WORKSPACE_REVISION.md`、`GAME_ENGINE_DETECTION.md`、`VIDEO_VIEWER_DESIGN.md`、`DECISIONS.md`；程式端如 `library.ts`、`BrowseWorkspace.tsx`、`FolderPanel.tsx`、`explorer.ts`、`App.tsx`。先 `rg` 定位，再讀完整相關函式、必要型別、直接依賴與呼叫端。
4. 搜尋排除歷史／探索區，避免雜訊：`rg -g "!docs/{archive,history,design}" -g "!graphify-out" -g "!.test-output" …`。封存區只在追溯決策時才讀（`DECISIONS.md` 依 ID）。
5. 工具輸出先限相關符號與錯誤，避免整檔／完整日誌；不足再擴讀缺少的上下文。

## 程式結構查詢（graphify）

- 結構性問題（入口、依賴、呼叫端、影響範圍、兩模組關係）先查 `graphify-out/graph.json`：`graphify explain "X"`、`graphify path "A" "B"`、`graphify query "問題"`；結果被截斷時加 `--budget`，或縮小問題。
- 找字串、確切行號、非程式檔仍用 `rg`。圖譜是結構近似，`INFERRED` 邊需回原始碼核對後才能當依據。
- 程式碼改動後執行 `graphify update .`（不用 LLM）；文件改動才用 `/graphify --update`。
- `graphify-out/` 已列入 `.gitignore`，不提交。
- 若 `graphify-out/graph.json` 不存在，不自動建置，直接用 `rg` 並在回報中說明。

## 修改原則

- 最小必要修改，沿用現有風格；不加未要求的功能、設定、單次用抽象；不順手重構或刪既有問題（另提）。每段 diff 須對應本次需求。
- 修錯先重現並定位根因，再用可觀察行為驗證。簡化不等於移除真實 I/O、非同步、資料衝突與復原處理。
- 核定需求決定目標，程式決定現況，差距留 `WORK_ITEMS.md`，不擅改需求遷就實作；不確定的重要規則保留並標疑點。

- **提交與版本號**：每批改動完成後 commit，變更寫進 CHANGELOG 最上方的「Unreleased」，**不逐批升版本號**。使用者說要發布（或我建議里程碑且使用者同意）時，才把 Unreleased 定版並升 package.json 版本：新功能升次版號、純修正升修訂號；次版號／主版號升級的推送前先問。提交前的自動檢查（型別、格式、文件連結）由 `.githooks/pre-commit` 執行，不為提交另跑高耗時測試。
- **語系**：每批新增或修改的介面文字，同一批就補齊其他語系（外觀語系測試會擋）；發行前再請母語者審閱。
- **UI／UX 規則**：新增與修改的介面都須有良好的 UX，沿用現有三主題、圖示、控制尺寸與焦點樣式，同類控制在各入口一致；完成前檢查窄窗、長文字、鍵盤焦點與三主題，不以「功能可用」代替。**檢查方式固定，不必再問**：用 `pnpm shot` 至少看暗色寬窗與寬 900 窄窗各一張；動到版型、樣式或工具列時，再加 `--theme glass`、`--theme paper` 各一張；純圖示控制須有提示（tooltip）與 `aria-label`。
- **每批收尾固定步驟（不必詢問，做完再回報）**：①更新 CHANGELOG 的 Unreleased；②動到介面時，同批更新受影響的 UI 測試，並跑 `pnpm test:ui:changed`（以未提交改動為準，所以提交前跑）；失敗先分類（產品／測試／環境）再修；③補齊語系；④寫入 `WORK_ITEMS.md` 的「待查收」（使用者查收後清空）；⑤回報附 30 秒驗收清單與關鍵畫面截圖。使用者只說「先討論」時只討論、不改檔案。
- **查收暫停（自動執行）**：待查收累積超過約 5 批，或一次大主題結束時，停下新功能：補齊 CHANGELOG、跑 `pnpm test:ui:smoke` 與 `pnpm test:ui:all`、檢查三主題與窄窗，再把查收清單交給使用者；使用者確認通過後清空「待查收」。若 Unreleased 含新功能且待查收已清空，主動建議發布（升次版號，推送前先問）。
- **高風險審查**：只有資料寫入／身分／清理／遷移，以及安全邊界（IPC、路徑處理、外部程式啟動、網路取得）的改動，提交前用獨立代理審查一次（只給它該次差異與要查的風險，不做一般審查）；其他改動不用，以節省 token。
- **檔案編輯**：含反斜線或跳脫字元的內容，用檔案編輯工具或腳本檔寫入，不用 heredoc 或命令列拼接；格式化工具改到無關檔案時加進 `.prettierignore`，不靠還原。
- **開新對話**：重大主題結束或對話變長時，先把決策寫進文件與記憶，再主動提示使用者開新對話。
- **測試同步**：功能被移除、取代或改版時，同一批 commit 要更新或刪除對應的 `tests/*`（含按鈕、分頁、標題等無障礙名稱）；不留標註「歷史」的失效測試，也不留改了卻從沒跑過的 UI 測試。新 UI 測試優先用 `tests/support/app.ts`。

## 不可省略的限制

- 只檢視，不為瀏覽搬移／刪除使用者原始資料夾；不覆蓋或清理他人工作。
- 可攜記錄是資料來源，SQLite 只是可重建索引。身分、共用值／私有覆寫見 `docs/FOLDER_PROJECT_MODEL.md`；原子寫入、復原、清理範圍見 `docs/STORAGE_OPTIONS.md`。
- 遊戲 ROOT 可有自身記錄、內部保護邊界；導覽不得自動初始化缺失記錄（`WORKSPACE_REVISION.md`、`GAME_ENGINE_DETECTION.md`）。
- 掃描／寫入驗證只用受控測試資料；對使用者真實資料的批次寫入或遷移前須有備份與失敗復原路徑。
- Electron 保留 contextIsolation、sandbox、停用 nodeIntegration；renderer 不得任意讀路徑或執行命令（`docs/ARCHITECTURE.md`）。

## 命令與驗證

`pnpm dev`／`pnpm build`（含 tsc）／`pnpm typecheck`／`pnpm exec tsx --test tests/<name>.test.ts`／`pnpm test`（全部資料測試）／`pnpm test:workspace`（單一 Electron UI 流程；runner 會在 out/ 缺少或比原始碼舊時自動先 build）／`pnpm test:ui:changed`（依改動檔對應測試，平常用）／`pnpm test:ui:smoke`（核心 6 項，約 1～2 分鐘）／`pnpm test:ui:all`（全部，約 12 分鐘，發布前或使用者要求才跑；可加名稱片段篩選）／`pnpm shot <game|manga|album|other> [--width --mode --child --settings]`（內建範例資料一行截圖，檢查 UI 外觀用，取代臨時腳本）／`pnpm shot:docs [名稱片段]`（用自製示範資料重拍 `docs/images/` 的文件截圖，需先 `pnpm build`；介面大改後重拍）。格式用 `pnpm format`（提交前 `pnpm format:check`）；不臆造 lint 或其他 script；未改依賴不重裝。

依風險選最小有效驗證（完整表：`docs/IMPLEMENTATION.md#驗證選擇`）：

| 改動 | 驗證 |
| --- | --- |
| 純文件 | 連結檢查 `node scripts/check-docs.mjs [檔案…]` ＋ diff，不啟動應用 |
| 純邏輯／型別 | 對應測試 ＋ typecheck（已 build 則免） |
| UI／導覽／CELL | `pnpm shot` 看畫面；需要時 `pnpm test:ui:changed`；穩定後 build 一次 |
| main／preload／IPC／媒體 | build ＋ 受控 Electron 路徑 |
| 可攜寫入／身分／清理／遷移 | 受控資料樹成功、失敗、取消、復原，確認原檔保留 |
| 發版 | build ＋ `pnpm test` ＋ UI runner ＋ **R-I18N 文案語系關卡** |

失敗先分類（產品／fixture／環境）再只重跑受影響項，不以加長等待或整套重跑掩蓋根因。回報須分清實際執行、未執行與限制；歷史測試不算本輪驗證。

## 收尾

- 模組責任或資料流改變時，同批更新 `docs/ARCHITECTURE.md` 的 mermaid 圖（README.zh-TW.md 的簡化圖只在大方向改變時動）。
- 實質改變才更新主規格；實作差距／待查收只寫 `WORK_ITEMS.md`，未決選項只寫 `OPEN_DECISIONS.md`，取捨寫 `DECISIONS.md`。清除過時狀態與失效入口，不另產報告。
- 回報：變更、實際檢查、限制；交接只留下一步需要的狀態、入口、驗證與阻礙。
- 修改本檔的流程規則時，一併檢查 `docs/WORKFLOW_PROMPT.md`（本檔的通用版，供其他專案使用）是否要同步。
