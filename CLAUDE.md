# CLAUDE.md

Windows 優先的資料夾檢視器（Electron + React + Vite，pnpm），POC 後續開發。使用者最新指示優先；`PLAN.md`、舊原型、設計預覽不是現行規格。本檔是工作規則的唯一來源；`AGENTS.md` 只是指向本檔的入口，不必再讀。

## 分支與授權

- 在 `main` 開發、推送 `origin/main`；**commit／push 須使用者明確授權**，不自行切回 `codex/ai`，不覆寫或刪除其他分支。
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

- **提交與版本號**：每批改動完成後 commit 並同步更新 package.json 版本與 CHANGELOG（新功能升次版號，純修正升修訂號）；推送須使用者核准，核准只涵蓋已提交的 commit。
- **R-I18N**：發行前語系關卡等使用者確認要發布才執行，一般開發只局部同步新字串。
- **UI／UX 規則**：新增與修改的介面都須有良好的 UX，沿用現有三主題、圖示、控制尺寸與焦點樣式，同類控制在各入口一致；完成前檢查窄窗、長文字、鍵盤焦點與三主題，不以「功能可用」代替。
- **測試同步**：功能被移除、取代或改版時，同一批 commit 要更新或刪除對應的 `tests/*`；不留標註「歷史」的失效測試。新 UI 測試優先用 `tests/support/app.ts`。

## 不可省略的限制

- 只檢視，不為瀏覽搬移／刪除使用者原始資料夾；不覆蓋或清理他人工作。
- 可攜記錄是資料來源，SQLite 只是可重建索引。身分、共用值／私有覆寫見 `docs/FOLDER_PROJECT_MODEL.md`；原子寫入、復原、清理範圍見 `docs/STORAGE_OPTIONS.md`。
- 遊戲 ROOT 可有自身記錄、內部保護邊界；導覽不得自動初始化缺失記錄（`WORKSPACE_REVISION.md`、`GAME_ENGINE_DETECTION.md`）。
- 掃描／寫入驗證只用受控測試資料；對使用者真實資料的批次寫入或遷移前須有備份與失敗復原路徑。
- Electron 保留 contextIsolation、sandbox、停用 nodeIntegration；renderer 不得任意讀路徑或執行命令（`docs/ARCHITECTURE.md`）。

## 命令與驗證

`pnpm dev`／`pnpm build`（含 tsc）／`pnpm typecheck`／`pnpm exec tsx --test tests/<name>.test.ts`／`pnpm test`（全部資料測試）／`pnpm test:workspace`（單一 Electron UI 流程，需相符建置）／`pnpm test:ui:changed`（依改動檔對應測試，平常用）／`pnpm test:ui:smoke`（核心 6 項，約 1～2 分鐘）／`pnpm test:ui:all`（全部，約 12 分鐘，發布前或使用者要求才跑；可加名稱片段篩選）／`pnpm shot <game|manga|album|other> [--width --mode --child --settings]`（內建範例資料一行截圖，檢查 UI 外觀用，取代臨時腳本）。格式用 `pnpm format`（提交前 `pnpm format:check`）；不臆造 lint 或其他 script；未改依賴不重裝。

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

- 實質改變才更新主規格；實作差距／待查收只寫 `WORK_ITEMS.md`，未決選項只寫 `OPEN_DECISIONS.md`，取捨寫 `DECISIONS.md`。清除過時狀態與失效入口，不另產報告。
- 回報：變更、實際檢查、限制；交接只留下一步需要的狀態、入口、驗證與阻礙。
