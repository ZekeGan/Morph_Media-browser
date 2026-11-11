# 執行與驗證

本頁只維護操作入口與驗證選擇。現況模組見 [ARCHITECTURE](ARCHITECTURE.md)，功能行為見 [任務索引](README.md)，待辦見 [WORK_ITEMS](WORK_ITEMS.md)。版本／套件以 package.json 與 lockfile 為準，避免多處抄錄。

## 命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | Electron＋Vite 開發 |
| `pnpm build` | `tsc --noEmit` 後建置 Electron／renderer |
| `pnpm start` | 預覽已建置應用 |
| `pnpm typecheck` | 單獨型別檢查；若本輪已 build 成功，不再重跑 |
| `pnpm exec tsx --test tests/<name>.test.ts` | 受影響資料測試 |
| `pnpm test` | 所有 `tests/*.test.ts`，適用跨模組風險／交付 |
| `pnpm format`／`pnpm format:check` | Prettier（設定見 prettier.config.cjs）；只涵蓋 src、shared、electron、tests、scripts 的 ts／tsx／mjs，不含 CSS、JSON 與文件。提交前跑 format:check |
| `pnpm test:workspace` | 現行完整 Electron UI：`tests/workspace-ui.ts`；runner 會自動確保建置為最新 |
| `pnpm dist`／`pnpm dist:dir` | 先 build，再用 electron-builder 產生 `release/morph <版本>/` 內的安裝程式（每個版本一個資料夾，舊版保留）與免安裝版（`dist:dir` 只產生未封裝資料夾）；設定在 package.json 的 `build`，圖示在 `build/`，未簽章 |
| `pnpm test:ui:all`／`:smoke`／`:changed` | 依序執行 `tests/*-ui.ts` 並計時；`:smoke` 為核心 6 項（約 1～2 分鐘），`:changed` 依改動檔（對比 origin/main 與工作樹）對應測試，對應表沒涵蓋的檔案會列出並改跑 smoke，也可加檔名片段如 `pnpm test:ui:all video`；任一失敗會自動重跑一次，第二次才過的標為 FLAKY（拖放類測試怕滑鼠干擾，跑測試時請勿操作滑鼠）；重跑仍失敗才非零結束；單一測試超過 4 分鐘（`UI_TEST_TIMEOUT` 秒數可改）視為卡住，標 TIMEOUT 並停掉其 Electron，不重跑。對應來自 [領域登錄表](areas.json)。GitHub Actions（`.github/workflows/ci.yml`，Windows）推送時跑 typecheck、format:check 與 `pnpm test`，不跑 UI 測試。提交前由 `.githooks/pre-commit` 自動跑型別檢查、格式檢查、UI 測試名稱檢查（`scripts/check-ui-names.mjs`：測試找的按鈕／文字須仍存在於程式或語系檔）、領域登錄表檢查（`node scripts/areas.mjs check`：每個原始檔都屬於某個領域）與所提交 Markdown 的連結檢查（`pnpm install` 會啟用）；CI 另有不阻擋合併的 UI smoke 工作。UI runner 啟動時會先印出 out/ 建置時間，並在 out/ 缺少或比 src／shared／electron／建置設定舊時自動先跑 `pnpm build`；也會先停掉本專案遺留的 Electron 行程；測試時應用程式視窗預設全透明、可點穿、不取得焦點也不進工作列（要看畫面設 `MEDIA_VIEWER_TEST_VISIBLE=1`（半透明、可點穿、不搶焦點））；原生訊息方塊（如「放棄未保存的變更」）由 `tests/support/app.ts` 的 `launchApp` 自動回答，`closeApp` 關閉時略過未保存提示，所有 UI 測試都用 `closeApp` 結束；要驗證提示本身的測試自行替換 stub；全數通過時會刪除該次在 `.test-output` 新增的產物（失敗時保留供檢查）；`pnpm clean:test` 清除過期產物並保留 `fixtures` |
| `pnpm shot <類型>` | `tests/support/shot.ts`：以內建範例資料（game／manga／album／other）開專案並截圖，可設 `--width`、`--height`、`--mode`、`--child`、`--settings`、`--out`；輸出於 `.test-output/shot/`，執行完自動清除暫存資料 |
| `pnpm detect <資料夾…> [--children]` | `tests/support/detect.ts`：唯讀執行遊戲引擎偵測並印出引擎與證據；`--children` 逐一檢查子資料夾（一整個遊戲資料夾）。不寫入、不建記錄、不啟動任何程式 |
| `node scripts/run-ui-tests.mjs <名稱> --repeat N` | 指定的 UI 測試各跑 N 次、不重試，量偶發失敗；每次都有逾時與 Electron 清理。要連跑測試一律用這個，不手寫迴圈直接 `tsx` |
| `pnpm verify:old <測試> [--ref <提交>]` | 在 `.test-output` 另開 git worktree，用目前的測試跑舊版程式（預設上一次提交），證明新測試抓得到舊錯誤；工作目錄不動，結束後移除 worktree（`node_modules` 以連結共用，先拆連結再刪） |
| `pnpm status`（`--short`） | 依 [需求清單](WORK_ITEMS.md) 印出每次回覆結尾的狀態區塊 |
| `pnpm stale` | 收尾時點名可能過時的內容：領域登錄表缺漏、程式在「最後確認」之後改過的規格卡、文件提到不存在的檔案、沒有程式使用的語系文字、清單殘留的完成項目、規格裡的「待實作」與過大的規格；只提示不阻擋（`--strict` 才失敗） |
| `node scripts/areas.mjs check／readme／which <檔案>` | 領域登錄表：檢查涵蓋、重產 [README](README.md) 定位表、查某個檔案屬於哪個領域與該跑哪些 UI 測試 |
| `node scripts/check-layers.mjs` | 分層引用檢查：`src/` 不得引用 `electron/`、Electron 或 Node 內建模組，`shared/` 不得引用 `src/`、`electron/`、Electron、Node、React 或 Mantine，`electron/` 不得引用 `src/`；`import type` 不受限。pre-commit 自動執行 |
| `pnpm shot:docs [名稱…]` | `tests/support/docs-shots.ts`：用 `demo-data.ts` 產生的自製示範收藏（自製封面、虛構標題）重拍文件截圖，寫入 `docs/images/`；需先 `pnpm build`，示範資料建在磁碟根目錄的 `Morph-Demo` 並於結束時刪除 |

不要臆造 lint／舊 UI script；需新命令先查 package.json。未改依賴且環境可用，不例行安裝或更新套件。

應用視窗聚焦時按 `F12` 可開啟／關閉 DevTools；開發與已建置版本均可使用。修改主程序後須重新啟動應用，長按不重複切換。

## 文件檢查

`node scripts/check-docs.mjs` 預設只查 CLAUDE、任務索引及 WORK_ITEMS；指定檔案可限定本輪範圍，例如 `node scripts/check-docs.mjs docs/EDITOR_DESIGN.md docs/SEARCH_DESIGN.md`。修改章節／檔名時，加上直接引用它的文件，不預設掃完整歷史。

[檢查器](../scripts/check-docs.mjs) 無額外依賴，檢查本機 Markdown 連結、章節／HTML anchor，以及索引連結的程式／測試路徑；略過 fenced code、行內程式範例及外站網址。支援一般 inline／reference 連結與 ATX 標題，是本儲存庫慣例的輕量檢查，不解析完整 Markdown、程式符號、語意矛盾或外站有效性。變更來源與主文件的關係沿用 [索引](README.md#按任務定位)，沒有另一套映射清單。

修改檢查器時跑 `node scripts/check-docs.mjs --self-test`，用系統暫存目錄的受控檔案驗證有效／失效連結、重複標題、舊 anchor、空白路徑與不存在的來源／測試；不啟動應用或讀寫收藏。純文件收尾再檢查相關 diff／空白即可，不執行產品測試。語意候選仍須核對核定需求、相關程式及證據，不能按日期或「未實作」關鍵字自動改規格。

## 驗證選擇

開發前先列本次驗收、完成條件與可能失敗的行為，再選能直接暴露它的檢查；依功能涉及範圍納入錯誤、非同步、離開／背景停止及保存／復原情境。簡單任務不另建計畫或測試框架。以下是依風險選擇，並非每輪累加全做。

| 改動 | 最小有效驗證 | 何時擴大 |
| --- | --- | --- |
| 只改文件／Agent 流程 | 改動範圍、有效本機連結、diff／空白；不啟動應用 | 涉及可執行設定時查其有效性 |
| 文案／低風險樣式 | 目標區域檢視；無畫面則明說未執行 | 尺寸、焦點、可捲動範圍改變才加相關尺寸／互動 |
| 共用型別／純邏輯 | 對應測試＋typecheck，或需要建置時以 build 取代 typecheck | 呼叫契約跨模組才補相關端 |
| 導覽／CELL／窗格互動 | 受影響模式與狀態保存的目標操作；需要打包程式時 build 一次 | 共用選取／歷史／模板改動才補其他模式 |
| main／preload／媒體協定 | build＋受控 Electron 路徑；來源／邊界與錯誤處理 | IPC／共用串流變更再加相關媒體 |
| 可攜寫入／身分／覆寫／遷移／清理 | 受控資料樹的成功及失敗／取消／復原路徑，確認原檔及無關資料保留 | 涵蓋專案或資料契約擴大，才跑完整資料回歸 |
| 跨模組／明確發版驗收 | build、完整資料測試、適用的現行 UI runner；發版必完成 [文案／語系關卡](#發行前文案與語系關卡)；完整步驟見 [RELEASING](RELEASING.md#定版步驟只在使用者說要發布時做) | 性能／平台／真實樣本有具體風險才另測 |

不要用只鏡像實作的測試替代行為驗證。儲存安全所需檢查不能因「最小」而刪減，詳見 [STORAGE_OPTIONS](STORAGE_OPTIONS.md)。

同批驗證依以下順序收斂，不為每個小改重跑完整流程：

1. **先確認測試前提**：沿用合法 fixture，核對 schema／識別碼、runner 選項與環境工具。UI 測試區分元素存在、可見與可互動；隱藏媒體元素查播放狀態，不等候可見；操作前確認所在模式／視窗尺寸確實提供該控制。
2. **開發中跑目標檢查，穩定後建置**：同批程式就緒再做必要 build，供依賴產物的 UI runner 共用。查明 build 是否包含型別檢查，不假設 bundler 已檢查型別；缺少時另跑 typecheck。只有後續程式變更影響產物時重建，純測試／文件變更不重建產品。
3. **失敗先分類再重跑**：分清產品錯誤、fixture／選擇器錯誤、環境／權限問題。修正對應原因後只重跑失敗項及新受影響情境；不要用加長等待、連續整套重跑掩蓋根因。涉及共用契約或安全風險仍按上表擴大。
4. **通過後收尾**：沿用本批相同程式版本下已通過的結果；新變更只重驗影響範圍，無法判定時才擴大。結果須分清受控案例、真實樣本與未驗範圍；缺少實際故障樣本不靠增加無關成功案例宣稱解決。

## 發行前文案與語系關卡

每次發行必做，文案契約由 [UI_RULES](UI_RULES.md#文案與語系一致性) 持有。一般開發先局部同步；發行前以版本相對上次發行的完整改動為範圍核對，另補既有未受檢查覆蓋的介面，不只看最後一次 commit。

1. 自動檢查（每次提交都跑）：`appearance.test.ts` 確認每個經過 tr() 的字串有五語系且佔位符一致（遞迴掃 src）；`scripts/check-i18n.mjs` 擋下畫面上不經 tr() 的中文，以及主程序新增、沒有翻譯鍵的訊息（主程序訊息以整句比對翻譯，帶數值的句子找不到鍵）；`pnpm stale` 點名沒有程式使用的翻譯。主程序既有缺口列在 `scripts/i18n-baseline.json`，翻譯或移除後用 `--update-baseline` 更新，只能變少。
2. 發行時人工抽查：用英文與日文截本版新增／改動的畫面，看截斷、換行、殘留中文與 Tooltip；資料名稱與使用者內容不得被翻譯。用受控資料，不操作實際收藏。
3. 收尾只在 WORK_ITEMS 保留未解差距與必要證據入口，不另產翻譯報告；缺漏或顯示問題未解時，發行驗收不得標為通過，未測情境明列限制。

## 測試定位與失敗處理

不維護逐檔清單（容易過時）；用下列方式找：

- **改了某個原始檔，要跑哪些 UI 測試**：`pnpm test:ui:changed` 依 [領域登錄表](areas.json) 挑選，並列出沒有歸入領域的檔案；新增原始檔時同批加進登錄表（pre-commit 會擋）。`node scripts/areas.mjs which <檔案>` 可單查。
- **某個功能有沒有測試**：`rg -l "<按鈕文字或函式名>" tests/`；資料測試是 `tests/*.test.ts`，UI 測試是 `tests/*-ui.ts`，共用 Electron 啟動與關閉在 `tests/support/app.ts`，資料 fixture 在 `tests/support/model-fixtures.ts`。
- **UI 測試找的按鈕還在不在**：`node scripts/check-ui-names.mjs`（pre-commit 已自動執行）。

需要額外參數或環境的測試：

| 測試 | 參數 |
| --- | --- |
| `video-player-ui` | `--list` 列出群組，`--group controls`／`subtitles`／`appearance` 只跑指定群組；`appearance` 群組寫出 `computed-styles.json`，設 `VIDEO_CSS_REFERENCE` 指向舊的 JSON 可比對樣式重整前後 |
| `audio-playback-ui` | `AUDIO_DEV_RENDERER=1` 用 Vite renderer 驗證 StrictMode；`AUDIO_SAMPLE` 指向經授權的唯讀樣本（只複製副本進測試樹） |
| `workspace-polish-ui` | `POLISH_SCOPE=layout`／`folders` 只跑其中一部分 |
| `gallery-performance-ui` | `GALLERY_BENCH_BASELINE=1` 只量測、略過新能力斷言 |
| `tests/performance.ts` | 性能工作按需執行，不是日常門檻；`POC_PERF_COUNT=10000` 放大實體掃描，結果 JSON 在 `.test-output/` |

資料與 UI 測試只使用自建測試樹及隔離的 userData，勿指向使用者收藏。UI runner 用專案根 `args: ['.']` 啟動，配合 `MEDIA_VIEWER_TEST_DATA`；檢查 runner 的媒體生成條件，勿把缺環境工具誤報為產品失敗。

`tests/support/video-fixture.ts` 供播放器與媒體 UI runner 共用受控 H.264／AAC 影片；首次需要 FFmpeg 產生，後續讀取 `.test-output/fixtures/` 並校驗 SHA-256，再複製至各案媒體樹。產生參數改變會使用新的快取目錄；校驗失敗會中止，不繼續使用損壞素材。共享快取不得作為測試修改對象。播放器的取消倒數／離開後不接續以 renderer 受控時鐘越過期限；自然接續仍保留一次實際 5 秒倒數，正式應用計時未改。

播放器 `appearance` 群組拍攝三主題的一般／窄視窗／全螢幕共九種狀態，並寫出該次輸出目錄的 `computed-styles.json`。樣式重整前可先跑一次留基準；重整後設定 `VIDEO_CSS_REFERENCE` 為該 JSON 的路徑，再執行同一群組，比對關鍵元素的計算樣式及窄視窗操作範圍。基準使用受控資料，不作固定產品數值或跨機器像素保證。

先辨別產品、環境或測試定位器失敗，保留失敗輸出／截圖，縮到相關情境再修正。未改應用來源不重複 build；修測試定位器先重跑失敗路徑。只有剩餘跨區風險或交付門檻才再跑整套。其他舊 UI 腳本是歷史材料，不列為現行必跑項。

需要反覆執行的長 UI runner，優先讓相關情境可獨立重跑；受控影音等昂貴素材可共用，但每案可變資料及 userData 仍須隔離。只在本次或後續重跑成本值得時調整測試結構，不為小修改例行重構測試。

非同步測試等待可觀察的完成狀態（metadata、字幕結果、圖片解碼／排版等），避免任意延遲。倒數等時間行為保留代表性的真實時間驗證，其餘案例可用受控時鐘或測試注入縮短等待，不改正式環境行為或降低原驗收要求。

開發時先跑受影響情境，最後按矩陣完成一次適用整合驗證。驗收與必要檢查全部通過即交付；只有新修改、失敗或具體剩餘風險才擴大／重跑，不在完成前臨時加入無關驗收。

## 驗證紀錄的使用

本輪交付只回報實際執行的檢查及限制；沒有跑的明寫「未執行」。[0.5.0](archive/RELEASE_0_5_0.md)、[前輪階段](archive/STAGES_2_3.md) 與 [POC 驗收](archive/POC_ACCEPTANCE.md) 是歷史證據，不能當本輪通過；原基準／備份資訊保存在 [整理前實作頁](history/agent-docs-before-cleanup.md#implementation)，不需每次讀取。

本輪新增目標 runner：`tests/workspace-toolbar-ui.ts`（CARD／TABLE／檔案工具列與浮層）、`tests/search-dialog-ui.ts`（條件保存／配對／刪除／ESC）、`tests/game-actions-ui.ts`（目標、參數、排序與選擇器取消）、`tests/cell-editor-ui.ts`（呈現、條件、複製、畫布與拖曳座標）；依受影響範圍選跑，不要求每輪全部執行。遊戲與 CELL 純邏輯在 game-actions.test／cells.test。
