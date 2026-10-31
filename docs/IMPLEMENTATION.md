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
| `pnpm test:workspace` | 現行完整 Electron UI：`tests/workspace-ui.ts`；需相符建置 |
| `pnpm test:ui:all`／`:smoke`／`:changed` | 依序執行 `tests/*-ui.ts` 並計時；`:smoke` 為核心 6 項（約 1～2 分鐘），`:changed` 依改動檔（對比 origin/main 與工作樹）對應測試，未對應的 UI／主程序改動退回 smoke，也可加檔名片段如 `pnpm test:ui:all video`；任一失敗即非零結束。對應表在 `scripts/run-ui-tests.mjs` |
| `pnpm shot <類型>` | `tests/support/shot.ts`：以內建範例資料（game／manga／album／other）開專案並截圖，可設 `--width`、`--height`、`--mode`、`--child`、`--settings`、`--out`；輸出於 `.test-output/shot/`，執行完自動清除暫存資料 |

`test:ui` 與 `test:workspace` 是同一 runner，選一個即可。不要臆造 lint／舊 UI script；需新命令先查 package.json。未改依賴且環境可用，不例行安裝或更新套件。

應用視窗聚焦時按 `F12` 可開啟／關閉 DevTools；開發與已建置版本均可使用。修改主程序後須重新啟動應用，長按不重複切換。

## 文件檢查

`node scripts/check-docs.mjs` 預設只查 AGENTS、任務索引及 WORK_ITEMS；指定檔案可限定本輪範圍，例如 `node scripts/check-docs.mjs docs/EDITOR_DESIGN.md docs/SEARCH_DESIGN.md`。修改章節／檔名時，加上直接引用它的文件，不預設掃完整歷史。

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
| 跨模組／明確發版驗收 | build、完整資料測試、適用的現行 UI runner；發版必完成 [文案／語系關卡](#發行前文案與語系關卡) | 性能／平台／真實樣本有具體風險才另測 |

不要用只鏡像實作的測試替代行為驗證。儲存安全所需檢查不能因「最小」而刪減，詳見 [STORAGE_OPTIONS](STORAGE_OPTIONS.md)。

同批驗證依以下順序收斂，不為每個小改重跑完整流程：

1. **先確認測試前提**：沿用合法 fixture，核對 schema／識別碼、runner 選項與環境工具。UI 測試區分元素存在、可見與可互動；隱藏媒體元素查播放狀態，不等候可見；操作前確認所在模式／視窗尺寸確實提供該控制。
2. **開發中跑目標檢查，穩定後建置**：同批程式就緒再做必要 build，供依賴產物的 UI runner 共用。查明 build 是否包含型別檢查，不假設 bundler 已檢查型別；缺少時另跑 typecheck。只有後續程式變更影響產物時重建，純測試／文件變更不重建產品。
3. **失敗先分類再重跑**：分清產品錯誤、fixture／選擇器錯誤、環境／權限問題。修正對應原因後只重跑失敗項及新受影響情境；不要用加長等待、連續整套重跑掩蓋根因。涉及共用契約或安全風險仍按上表擴大。
4. **通過後收尾**：沿用本批相同程式版本下已通過的結果；新變更只重驗影響範圍，無法判定時才擴大。結果須分清受控案例、真實樣本與未驗範圍；缺少實際故障樣本不靠增加無關成功案例宣稱解決。

## 發行前文案與語系關卡

每次發行必做，文案契約由 [UI_RULES](UI_RULES.md#文案與語系一致性) 持有。一般開發先局部同步；發行前以版本相對上次發行的完整改動為範圍核對，另補既有未受檢查覆蓋的介面，不只看最後一次 commit。

1. 對照手改文案與字典，保留最新核定語意；盤點原始 JSX、字串／變數／分支、巢狀 src 目錄及應用的 main／preload／shared 原生文案。同步新增／改名 key、五語系譯文與佔位符，確認舊引用沒有殘留，不盲刪靜態搜尋未命中的 key。
2. 沿用並補足既有語系檢查。現行 appearance.test.ts 只掃 src 頂層的 tr 字串常值，不能單獨作為完整覆蓋證明；需補遞迴定位、未經翻譯的介面文字與動態／原生路徑的必要檢查，不靠寬鬆 fallback 或大範圍豁免讓檢查通過。
3. 以五語系操作實際畫面，涵蓋本版新增／改動及靜態檢查未覆蓋入口的選單、面板、讀取／空白／錯誤、Tooltip、可存取名稱與原生提示。查插值、切換／保存／重開、截斷／換行與必要窄窗，確認資料名稱及使用者內容不被誤翻；用受控資料，不為驗收操作實際收藏。
4. 收尾只在 WORK_ITEMS 保留未解差距與必要證據入口，不另產翻譯報告。缺漏、錯誤語意、殘留 key／舊語言或顯示問題未解時，發行驗收不得標為通過；未測情境明列限制，歷史五語系測試不代表新文案已驗收。

## 測試定位與失敗處理

影音轉換使用 `tests/media-conversion.test.ts` 驗證四種來源分類的預覽不寫入、模板映射、原子備份、過期拒絕、重開與分類恢復；`tests/media-conversion-ui.ts` 驗證實際預覽／取消／轉換／恢復入口，均限受控資料。


| 入口 | 涵蓋 |
| --- | --- |
| `tests/library.test.ts` | 可攜讀寫、清理／復原、重疊專案、副本／遷移、取消與路徑限制 |
| `tests/model.test.ts` | 可攜 folder／project／details 的接受／拒絕、CELL／字幕／路徑邊界、第一個錯誤順序、既有 null 相容性與輸入不變；資料 fixture 在 `tests/support/model-fixtures.ts` |
| `tests/explorer.test.ts` | 型別值／覆寫、搜尋、媒體串流、字幕、遊戲動作與來源固定回應 |
| `tests/image-url.test.ts` | 遊戲封面圖片網址：內網／憑證／重新導向／非圖片／超限拒絕、預覽不寫入、版本衝突與過期 token 保留原封面 |
| `tests/decided.test.ts`／`tests/decided-media.test.ts` | 系統語言、型別／方案、設定匯出入／失敗復原、免憑證來源、唯讀 ZIP、總覽來源及穩定查詢 |
| `tests/decided-ui.ts` | 實際欄位／方案／來源選單、面板偏好、虛擬總覽／即時語言、ZIP 解碼／原生 PDF、原生設定匯出／取消／匯入／復原；受控原檔不變 |
| `tests/workspace.test.ts` | UI 設定、排序、併發及失敗保留 |
| `tests/file-overview-ui.ts` | `pnpm exec tsx tests/file-overview-ui.ts`：圖片／影片各 1,200 檔，重現連續捲動導致 renderer 卸載；驗證三種展示、篩選、尺寸、重新整理、實際可視卡片及原檔／記錄保留 |
| `tests/appearance.test.ts` | 介面字典覆蓋、插值不改使用者內容、預設 CELL 與自訂配色保留 |
| `tests/appearance-ui.ts` | `pnpm exec tsx tests/appearance-ui.ts`：隔離資料驗證三主題／五語言、預覽取消、保存重開、三模式、隱藏側欄與窄視窗；截圖在 `.test-output/appearance-*/screens/` |
| `tests/notifications-ui.ts` | `pnpm exec tsx tests/notifications-ui.ts`：受控舊資料的真實成功／部分完成／全部失敗通知，名稱不影響等級、成功自動收起、警告／錯誤保留、取消、英文 IPC 例外與草稿保留；同時比對原檔及匯入備份 |
| `tests/revision.test.ts` | 模式／方案、有效記錄與遊戲邊界、小數尺寸、Windows 保留目錄大小寫 |
| `tests/workspace-ui.ts` | 目前外框／瀏覽／媒體整合；測試資料與截圖在 `.test-output/` |
| `tests/folder-navigation-ui.ts` | `pnpm exec tsx tests/folder-navigation-ui.ts`：左右共用歷史／停用狀態、資料夾圖示、原生命令加 DOM 序列不重複導覽、跨模式／縮放／專案隔離、可見浮層阻擋、缺失記錄拒絕與原檔／可攜記錄比對；原生命令採受控事件注入，不代表各實體滑鼠驅動已驗收 |
| `tests/error-recovery-ui.ts` | 未被捕捉的非同步失敗顯示為錯誤提示：白話訊息、下一步建議與可展開的技術細節；中斷類錯誤（AbortError）不打擾使用者 |
| `tests/error-message.test.ts` | IPC 前綴移除與系統錯誤（權限、佔用、空間不足、找不到、離線、版本衝突）分類 |
| `tests/browse.test.ts` | CARD 單層開專案落點（列出根的子資料夾、無子資料夾時顯示根）、末層資料夾顯示自己的卡片、TABLE 維持子資料夾清單 |
| `tests/video-failure-ui.ts` | 偽裝成影片的 ZIP 播放失敗時，播放器說明原因並提供「用系統預設播放器開啟」「在檔案總管顯示」（不實際點擊外部開啟） |
| `tests/file-probe.test.ts` | 以檔頭位元組辨識 ZIP／RAR／7z／網頁／空檔／一般媒體 |
| `tests/game-launch-cell-ui.ts` | 「啟動遊戲」組件：未綁定啟動檔時停用、已綁定時可用，並出現在遊戲專案的編輯器組件列（不實際啟動） |
| `tests/panel-preview-ui.ts` | 單擊資料夾在右側面板預覽（中央不進入），雙擊才進入 |
| `tests/field-edit-ui.ts` | CELL 編輯器欄位改名（清單與設定面板兩處）、重複名稱拒絕、單選比較值選項、字級／對齊／換行、數字單位、大於小於條件選項與設定區塊收合 |
| `tests/game-cover-cell-ui.ts` | 遊戲封面組件在卡片與編輯器各種格位大小下填滿容器，含填滿方式 |
| `tests/game-folder-page-ui.ts` | 遊戲專案內非遊戲根資料夾使用共用的詳情／子資料夾／檔案頁 |
| `tests/settings-dock-ui.ts` | 資料夾設定一律停靠右側面板：分頁切換、窄窗、關閉圖示與重啟 |
| `tests/gallery-performance-ui.ts` | `pnpm exec tsx tests/gallery-performance-ui.ts`：1,200 張受控圖片的首批／首圖時間、捲動幀距、DOM／請求上界、相簿與漫畫翻組及開啟；`GALLERY_BENCH_BASELINE=1` 僅供比較，略過新能力斷言 |
| `tests/gallery.test.ts` | 圖庫可見範圍、鍵盤焦點保留、比例到達後欄位穩定與調寬 |
| `tests/media-feedback-ui.ts` | `pnpm exec tsx tests/media-feedback-ui.ts`：音樂篩選後的封面自動展示／選擇／壞圖復原、影片佇列清單／圖片切換及鍵盤提示、相同影片元件保留、漫畫舊檔案偏好回退；受控素材與可攜記錄逐位元比對，不代表音樂發聲驗收 |
| `tests/media-workspace-ui.ts` | `pnpm exec tsx tests/media-workspace-ui.ts`：混合列表三種展示的不支援檔案限制／資訊與所在資料夾、預設收合佇列／過渡／焦點／減少動態效果、241 張圖虛擬清單與閱讀狀態、影音與 PDF 元件保留／卸載、損壞影片錯誤及 PDF／CBZ；隔離資料比對原檔與記錄 |
| `tests/media-scope-ui.ts` | `pnpm exec tsx tests/media-scope-ui.ts`：目前／子資料夾範圍、三種排列搭配來源分組及收合、同名檔案／來源佇列、關閉還原及明確前往來源；比對原檔／專案與非閱讀資料 |
| `tests/audio-playback-ui.ts` | `pnpm exec tsx tests/audio-playback-ui.ts`：FFmpeg 有聲 MP3／ID3 封面，驗證新舊入口、既有內容版面、有限時長／Range／非零 PCM、播放與暫停後繼續、音量 0～100／靜音、封面與卸載。`AUDIO_DEV_RENDERER=1` 啟動隔離 Vite renderer 驗證 StrictMode；`AUDIO_SAMPLE` 指向經授權唯讀檔案時，只將副本寫入測試樹並比對原檔不變；含封面的樣本適用完整封面斷言；並驗證跨專案持續播放、最小化、混合影音／重複追加、拖排／移除、迷你播放器貼邊及縮窗。不代表未提供樣本或聲卡輸出驗收 |
| `tests/video-player-ui.ts` | `pnpm exec tsx tests/video-player-ui.ts` 執行全部；`--list` 列出群組，`--group controls`／`subtitles`／`appearance` 選擇重跑，可重複傳入 `--group`。各組獨立建立媒體樹、專案及 userData，保留原檔逐位元比較；涵蓋控制列、字幕／全螢幕、主題及窄視窗（由資料夾頁點檔案進入試播面板；接續與離開／隱藏等生命週期已由 `audio-playback-ui` 的播放佇列涵蓋，原 auto-next／lifecycle 組隨舊內嵌播放器設計移除） |
| `tests/reader-ui.ts` | 閱讀器專項：`pnpm exec tsx tests/reader-ui.ts`；視窗／最大化與全螢幕還原、無上下留白、縮小下限／細節放大／平移、沉浸隱藏、固定 RTL 圖示、頁碼框與翻頁焦點；同樣使用隔離資料與 FFmpeg 測試圖片 |
| `tests/workspace-polish-ui.ts` | `pnpm exec tsx tests/workspace-polish-ui.ts`：受控直／橫／長圖、舊原尺寸偏好、連續縮放錨點／平移／貼合，281 個資料夾的長路徑／同名搜尋及鍵盤選取，遊戲舊檢視偏好回退，側欄開合／調寬／減少動態效果，三主題五語言的方案工具列與搜尋樣式；比對原檔及專案記錄。`POLISH_SCOPE=layout`／`folders` 分別只跑樣式語言／資料夾選單及遊戲回退，不代表完整閱讀器／側欄驗證 |
| `tests/performance.ts` | `pnpm exec tsx tests/performance.ts`：受控實體 1,000 資料夾的首次建立／重掃與 snapshot；另以 20 專案、1,000／10,000 筆模擬記錄分測首次建索引、snapshot、未變同步、SQL 與完整 main 搜尋請求。後四項暖身 3 次、取 24 次的中位數／p95，不含 IPC／UI；JSON 保存在 `.test-output/performance-*.json`。`POC_PERF_COUNT=10000` 可放大實體掃描。僅性能工作按需執行，不作日常門檻 |

資料與 UI 測試只使用自建測試樹及隔離的 userData，勿指向使用者收藏。UI runner 用專案根 `args: ['.']` 啟動，配合 `MEDIA_VIEWER_TEST_DATA`；檢查 runner 的媒體生成條件，勿把缺環境工具誤報為產品失敗。

`tests/support/video-fixture.ts` 供播放器與媒體 UI runner 共用受控 H.264／AAC 影片；首次需要 FFmpeg 產生，後續讀取 `.test-output/fixtures/` 並校驗 SHA-256，再複製至各案媒體樹。產生參數改變會使用新的快取目錄；校驗失敗會中止，不繼續使用損壞素材。共享快取不得作為測試修改對象。播放器的取消倒數／離開後不接續以 renderer 受控時鐘越過期限；自然接續仍保留一次實際 5 秒倒數，正式應用計時未改。

播放器 `appearance` 群組拍攝三主題的一般／窄視窗／全螢幕共九種狀態，並寫出該次輸出目錄的 `computed-styles.json`。樣式重整前可先跑一次留基準；重整後設定 `VIDEO_CSS_REFERENCE` 為該 JSON 的路徑，再執行同一群組，比對關鍵元素的計算樣式及窄視窗操作範圍。基準使用受控資料，不作固定產品數值或跨機器像素保證。

先辨別產品、環境或測試定位器失敗，保留失敗輸出／截圖，縮到相關情境再修正。未改應用來源不重複 build；修測試定位器先重跑失敗路徑。只有剩餘跨區風險或交付門檻才再跑整套。其他舊 UI 腳本是歷史材料，不列為現行必跑項。

需要反覆執行的長 UI runner，優先讓相關情境可獨立重跑；受控影音等昂貴素材可共用，但每案可變資料及 userData 仍須隔離。只在本次或後續重跑成本值得時調整測試結構，不為小修改例行重構測試。

非同步測試等待可觀察的完成狀態（metadata、字幕結果、圖片解碼／排版等），避免任意延遲。倒數等時間行為保留代表性的真實時間驗證，其餘案例可用受控時鐘或測試注入縮短等待，不改正式環境行為或降低原驗收要求。

開發時先跑受影響情境，最後按矩陣完成一次適用整合驗證。驗收與必要檢查全部通過即交付；只有新修改、失敗或具體剩餘風險才擴大／重跑，不在完成前臨時加入無關驗收。

`tests/pending-ui.ts` 驗證本批方案繼承、工具列、群組拖放／減少動畫、共用 TOP、圖片點開、漫畫來源邊界與刪除確認／取消；`tests/maintenance.test.ts` 驗證欄位／完全移除的指紋、範圍、備份、失敗復原及未知資料保留。兩者只用隔離資料。

## 驗證紀錄的使用

本輪交付只回報實際執行的檢查及限制；沒有跑的明寫「未執行」。[0.5.0](archive/RELEASE_0_5_0.md)、[前輪階段](archive/STAGES_2_3.md) 與 [POC 驗收](archive/POC_ACCEPTANCE.md) 是歷史證據，不能當本輪通過；原基準／備份資訊保存在 [整理前實作頁](history/agent-docs-before-cleanup.md#implementation)，不需每次讀取。

本輪新增目標 runner：`tests/workspace-toolbar-ui.ts`（CARD／TABLE／檔案工具列與浮層）、`tests/search-dialog-ui.ts`（條件保存／配對／刪除／ESC）、`tests/game-actions-ui.ts`（目標、參數、排序與選擇器取消）、`tests/cell-editor-ui.ts`（呈現、條件、複製、畫布與拖曳座標）；依受影響範圍選跑，不要求每輪全部執行。遊戲與 CELL 純邏輯在 game-actions.test／cells.test。
