# 當前工作與交接

只記差距、待查收與下一步；核定規則由主文件持有，按 [任務索引](README.md#按任務定位) 選讀。列入清單不等於授權開發；歷史驗證不當成本輪結果。

## 授權狀態（2026-10-31）

- **已授權至 S13**：S12 → S9＋S11（含佇列入口移到頂部工具列）→ S10＋S13，自動內部分批，只驗受影響範圍。2026-10-31 已實作並於 2026-11-01 推送。
- **已核定**：S9 未入列單曲獨立試播，不改既有佇列、不默默接到首項；S11 混合佇列圖片模式維持佇列內容／順序，只改呈現。
- **2026-11-01 已實作（待使用者查收）**：B1～B4、S15、S16（DLsite；BOOTH／Melonbooks／虎之穴本輪未接入，見 [來源](METADATA_ENRICHMENT.md#後續候選)）、S17、S20～S22。S18、S19 仍待建議確認。
- **2026-11-01 核定**：S15、S16（不含 FANZA）、S17、S20～S22、B1～B4 全部開工；B2 兩個 TAB 共用同一個檢視偏好；B4 佇列顯示「共 N 項」、目前資料夾顯示「N 個檔案」；R-I18N 等確認發布前才執行；Git 推送已核准（僅限已提交至 2026-11-01 的 commit，其後新 commit 的推送仍待核准）。
- **實作規則（2026-11-01 使用者核定）**：每批改動完成後必須 commit 並更新版本號（package.json 與 CHANGELOG；新功能升次版號，純修正升修訂號）。
- **UI／UX 規則（同日核定）**：新增項目與修改舊項目都必須以良好的 UI／UX 為前提，沿用現有三主題、圖示、控制尺寸與焦點樣式，同類控制在各入口一致；不得只求功能可用。

## 待實作

### 最新回饋

0.9.0 內容見 [CHANGELOG](../CHANGELOG.md#090--2026-10-30)；S1～S8 已交付。主規格：[跨專案影音佇列](WORKSPACE_REVISION.md#跨專案影音佇列與迷你播放器)、[資料夾詳情](WORKSPACE_REVISION.md#資料夾詳情)、[右側共用邊界](WORKSPACE_REVISION.md#右側組件共用邊界)。

| 編號（S9～S13 已實作） | 目標 | 入口 | 驗收 |
| --- | --- | --- | --- |
| S12 修正 | 迷你播放器貼近頂部拖曳會移動原生視窗；重現並檢查 Topbar drag region 與播放器命中區，不靠提高圖層遮蓋 | Playback、DesktopShell／Topbar 樣式、Electron 視窗設定 | 拖曳只改播放器位置、視窗 bounds 不變、控制可點擊 |
| S9 | 移除列表／卡片與「目前資料夾」TAB 常駐＋，改右鍵／多選加入；單擊只播放，不再默默追加；未入列單曲獨立試播 | Gallery、MediaBrowser、Playback | 各入口一致、多選依列表排序、跨專案與重複追加、鍵盤選單、單擊不改佇列、播放生命週期；拖入佇列為後續擴充 |
| S11 | 依兩張截圖重作雙 TAB、列表與播放狀態視覺層級；與 S9 合併；佇列入口改移到頂部工具列，不再遮擋返回頂部，並移除重複的「播放已加入的音樂」入口；全域混合佇列保留影片清單／圖片切換 | Playback、media-workspace.css、頂部工具列 | 三主題、長檔名／同名來源、窄窗、鍵盤焦點、拖排／移除、播放狀態不重設 |
| S10 | 依已核定設計精簡右側資訊為預設收合的折疊區，取代重複完整卡片；整合位置／自訂資料與設定入口；只改展示，不變更儲存或 CELL 定義 | MediaBrowser、內容樣式、資料 TAB 開啟流程 | 預設收合、長路徑／窄窗、複製與開啟路徑、0／false、自訂欄位與私有覆寫、鍵盤、三主題 |
| S13 | 與 S10 同批，只抽出 FolderContent／MediaBrowser 實際重複的詳情、子資料夾列表與狀態呈現；保留漫畫圖庫／獨立 CELL、遊戲封面／操作／欄位 TABLE、媒體瀏覽控制 | BrowseWorkspace、FolderContent、MediaBrowser、Gallery | 三類專用操作、來源／邊界、切換及失敗、三主題與窄窗 |
| B1 | 頂部工具列佇列數字徽章被遮擋（截圖：徽章上緣被裁切、與圖示重疊）；調整徽章位置、尺寸與對比，三主題、兩位數以上與窄窗都完整可見 | DesktopShell、media-workspace.css（.playback-toggle） | 1／9／99+ 的徽章完整顯示、不被 Topbar 裁切、不遮擋設定與其他按鈕 |
| B2 | 「播放佇列」與「目前資料夾」兩個 TAB 都提供清單／圖片檢視切換（目前只有播放佇列有）；兩 TAB 共用同一組切換控制與縮圖樣式，是否共用同一偏好見待討論 | Playback、media-workspace.css | 兩 TAB 清單／圖片一致、右鍵／多選／選取框在圖片檢視仍可用、長檔名、窄窗、三主題 |
| B3 | 「自動接續」核取方塊改為圖示按鈕，放在佇列面板工具列（與清單／圖片切換同列），以 aria-pressed 與提示呈現開關，預設仍關閉 | Playback（aside 底部 Checkbox）、icons.tsx（已有 auto-next 圖示） | 開關狀態可辨、鍵盤可操作、提示文字、三主題、既有自動接續行為與測試不變 |
| B4 | 佇列面板左上角只顯示孤立數字（3），使用者不知意義；改為明確標示，如「共 3 項」或帶單位的文字，並區分「佇列」與「目前資料夾」的數量 | Playback（.playback-queue-head） | 文字含單位、五語系、0／1／多筆、與 TAB 標籤不重複 |
| S20 | Gallery 選取摘要不再重複顯示「檔名 · MIME · 大小」，列表下方資訊只保留一份 | Gallery | 選取後摘要唯一、列表／瀑布流一致、長檔名、三主題 |
| S21 | 卡片改用友善類型名稱，並提供右鍵資訊 | Card、Gallery | 類型文字五語系、右鍵／鍵盤可開啟、三主題 |
| S22 | Reader extraTools 的資料夾文字對齊：定位容器高度、行高與繼承的 small padding，不擴張成整條工具列重排 | Reader | 與相鄰工具對齊、窄窗、三主題 |
| S15 | 遊戲更換封面新增圖片網址來源，下載後存為可攜資產；沿用預覽與確認，失敗／取消保留原封面。主規格 [圖片網址匯入](GAME_VIEWER_DESIGN.md#圖片網址匯入) | FolderContent、FolderPanel 圖片來源、main／Explorer 既有下載流程 | 受控下載、保存／取消／復原、離線重開、遊戲邊界；不新增下載依賴 |
| S16 | 日本同人來源研究與接入，順序：既有 VNDB／Bangumi／AniList 適用範圍 → DLsite → BOOTH／Melonbooks／虎之穴；**FANZA 已核定移除**。逐站確認官方能力與使用限制，無公開 API 者只做精確網址單頁讀取。依 [來源候選](METADATA_ENRICHMENT.md#後續候選) | shared/sources.ts、electron/metadata.ts、metadata-public.ts | 精確網址、來源／版本識別、預覽與人工值保護、封面安全、失敗不改原資料 |
| S17 | 積木編輯器於專案屬性為遊戲時，新增「當前封面圖片」基礎組件（2026-11-01 使用者再次提出，與原 S17 為同一項），與一般圖片組件區分。依 [組件規格](CELL_CATALOG.md#遊戲封面圖片組件) | Editor、Card、shared/model.ts | 模式限制、缺圖、編輯預覽、保存重開、舊方案相容 |

S14 已移除，不重新列入。

### S16 備註

- FANZA 已於 2026-11-01 移除：官方 DMM Affiliate API 需 API ID 與 affiliate ID，與免憑證限制衝突，不再研究。

### 發行前必要關卡

- **R-I18N（必做；2026-11-01 核定等到確認發布前才執行）**：使用者已手改部分介面文字但未同步 i18n；發行前依 [文案契約](UI_RULES.md#文案與語系一致性) 與 [執行關卡](IMPLEMENTATION.md#發行前文案與語系關卡) 補齊，保留最新文字。現行 appearance 語系測試因手改的「這不是遊戲目錄」缺字典項目失敗，不能宣稱全語系通過。

### 其他待辦

| 編號 | 目標 | 狀態 |
| --- | --- | --- |
| S18 | CELL 群組（一層、雙擊進入內層編輯），見 [CELL](CELL_CATALOG.md#其他後續項目) | 2026-11-01 已實作（0.13.0），待查收 |
| S19 | 資料夾設定可停靠為右側面板分頁（規則見 [停靠](WORKSPACE_REVISION.md#資料夾設定停靠2026-11-01-核定)） | 2026-11-01 已實作（0.12.0），待查收 |

## 待查收與限制

- **0.13.5 待查收**：`pnpm test:ui:all` 24 個 UI 測試全數通過（約 12 分鐘）；appearance-ui 單次曾耗時 219 秒，疑為機器負載，未定位。測試已改為目前 UI（根資料夾卡片優先、右側面板子資料夾、試播佇列、內嵌 CARD 控制）。新增專案預設為單層第 1 層（自 0.5.0 起），DECISIONS 2026-10-27「建立預設全部」已被取代，待你確認是否要改回。
- **0.13.4 待查收**：影片專案右側面板寬度為 0 的版面錯誤已修（`.mixed-media-browser` 寬度、`.video-panel` 僅在內嵌播放器時套用）；舊 editing-ui／stages-ui／shell-ui 與影片 auto-next／lifecycle 組已移除（對應舊內嵌播放器設計），appearance-ui／video-player-ui／file-overview-ui 已改為目前 UI。影片專案現在不再有「專案層自動播放／自動接續」入口，此設定欄位是否保留待決。
- **0.13.0 待查收**：遊戲專案的非遊戲 ROOT 資料夾改用統一資料夾頁（game-folder-page-ui）；RightPanel／overlay-frame／FileMenu／ViewToggle 為結構重構，回歸測試通過；S18 群組以 model／cells 測試與 cell-group-ui 驗證（拖曳縮放群組時的最小高度未做 UI 自動化，請實測）。Prettier 已於 0.13.2 加入（`pnpm format`／`format:check`）；其餘 20 多個舊 UI 測試仍各自複製啟動程式，只有新測試使用 tests/support/app.ts。
- **0.14.0 待查收（UI 測試未重跑）**：設定一律停靠右側面板並跟隨目前資料夾（移除抽屜與停靠切換）；複製路徑改由主程序（copyPath）；漫畫頁移除重複的預設名稱／路徑區塊；遊戲頁間距、框線與欄位表對齊其他資料夾頁；遊戲「邊界的資料夾」篩選移到上方工具列右側。已改寫但本批未執行的測試：settings-dock-ui、decided-ui、workspace-ui、workspace-toolbar-ui、folder-navigation-ui、game-actions-ui、pending-ui、appearance-ui。folder-navigation-ui 仍假設設定開啟時鍵盤／滑鼠上一頁被擋下，與「設定跟隨資料夾」的互動待實測後決定。邊界篩選的工具列位置待你確認。
- **0.12.0 S19 待查收**：settings-dock-ui 驗證預設抽屜、停靠／取消停靠、分頁切換、窄窗退回與重啟保存；未驗證有未保存草稿時切換分頁的確認（沿用 closeConfig 既有確認），請實測。
- **0.11.1**：遊戲封面組件縮放後圖片不貼合容器——原因是 object-fit: contain 在非原比例容器留空白，且佔位框固定 80px；改為預設填滿裁切並新增 imageFit 選項，game-cover-cell-ui 以 12×3／4×2／8×6 驗證卡片與編輯器。
- **0.11.0 待查收**：B1～B4（徽章、兩 TAB 共用檢視、自動接續圖示鈕、共 N 項）以 audio-playback-ui 截圖確認；S15 後端以 image-url.test.ts 驗證（內網拒絕、版本衝突與過期保留原封面），**設定面板「圖片網址」介面尚無 Electron 自動化**（不為測試在正式程式加入關閉安全檢查的開關），請用真實 HTTPS 圖片網址實測；S16 DLsite 為未文件化端點，僅以假回應測試，**尚未對真實作品驗證**；S17 組件在編輯器的拖放與保存重開僅型別／驗證層測試，尚未目視；S20～S22 未逐一截圖。pending-ui 的群組拖曳步驟偶發逾時（不同行失敗，與本批無關，疑為拖放時序）。
- **S12／S9／S11／S10／S13 已實作（未提交）**：S12 成因為迷你播放器未宣告 -webkit-app-region: no-drag，位於 Topbar 的 drag region 上時由作業系統接管拖曳；已加 no-drag。Playwright 無法產生 OS 層視窗拖曳，只驗計算樣式與視窗 bounds，**實體滑鼠拖曳仍待使用者查收**。S9：單擊不再追加，右鍵／Ctrl／Shift 點擊多選／Shift＋方向鍵加入，新增 QueueMenu；未入列單曲試播。S11：入口移至頂部工具列、佇列清單／圖片兩種呈現。S10／S13：FolderParts 的 FolderDetails（預設收合）與 SubfolderList，漫畫維持 Card 資訊 CELL。三主題與窄窗尚未逐一截圖查收。通過：tsc、build、audio-playback-ui（連跑 3 次通過，批次中曾有 1 次未重現的失敗）、pending-ui、folder-navigation-ui。
- **測試整理（2026-11-01 使用者授權去留）**：media-ui.ts 為舊影片專案頁自動播放測試，已移除（搜尋、漫畫、遊戲改指向 search-dialog-ui／media-scope-ui／game-actions-ui）；media-workspace-ui 移除影片舊檢視器佇列斷言（影片改走全域播放）；media-scope-ui 暴露窄版缺少展示方式切換，已在「更多檔案選項」補上。仍待處理：appearance 語系測試因「這不是遊戲目錄」失敗，留待 R-I18N；Windows 唯讀 ACL 測試失敗屬環境，未調查。
- 「前往此資料夾」圖示已交付（共用 open／visit／歷史路徑），導覽 UI 證據 .test-output/folder-navigation-oolKsP/；新按鈕沿用既有五語系文案。
- MP3 StrictMode 音源清理已修正，聲卡輸出仍待查收；側鍵實體滑鼠／驅動及其他平台待查收。
- CARD 即時保存、TABLE 欄位、遊戲操作、Ghost、單檔圖片／漫畫、PDF 共用外框及隱藏檔已有受控交付，依具體回饋接續，不全面重做。
- 真實網站／登入、遊戲／媒體變體、跨設備硬故障需樣本與環境；遊戲未知變體保留人工 ROOT／not-game，不重掃或清理真實收藏。Mac 原生啟動未交付。
- 完全移除須影響預覽、樹外備份、未知資料保留與失敗復原；復原包在 userData/maintenance-backups，見 [儲存安全](STORAGE_OPTIONS.md)。workspace:update 小數尺寸路徑已修，原操作未取得，不宣稱所有成因排除。

## 未來計畫

- **影片片段切圖**（2026-11-01 列入未來計畫）：觸發、生成與快取限制待定，見 [影片](VIDEO_VIEWER_DESIGN.md#未來影片片段預覽)。
- **V1 未來計畫**：Mac 原生遊戲與 plist 主目標（目前不支援，Windows 目錄測試不代表可啟動）。
- 其他延後：更多解碼器、富文字／公式／腳本、雲端同步，依 [OPEN_DECISIONS](OPEN_DECISIONS.md) 排程，不自動併入。

## 交接

只更新下一步需要的差距、入口、驗證及阻礙。0.9.0 前完整舊交接：`git show 4ae0424:docs/WORK_ITEMS.md`；歷史驗證與封存文件見 [archive](archive/)、[整理前快照](history/agent-docs-before-cleanup.md#work-items)。

<a id="統一媒體工作區執行順序"></a>
<a id="歷史驗證入口"></a>
