# 任務與文件索引

先依 [CLAUDE](../CLAUDE.md) 看 [當前工作](WORK_ITEMS.md) 與 Git 狀態，再用下表定位本次章節；不要求全讀主文件或全表來源。規格描述核定目標，實作差距／待查收以工作清單為準；例如待移除 CC 不代表程式已移除。

## 按任務定位

來源與測試欄只作導航：先找列出的符號，再依實際呼叫與風險擴大。測試名稱不是每次必跑清單，選擇見 [驗證矩陣](IMPLEMENTATION.md#驗證選擇)。

| 任務 | 必讀主章節 | 程式／符號入口 | 驗證入口 |
| --- | --- | --- | --- |
| 右側漫畫／遊戲／媒體共用 | [共用邊界](WORKSPACE_REVISION.md#右側組件共用邊界)、[詳情](WORKSPACE_REVISION.md#資料夾詳情)；改到專用操作才讀其主規格 | [BrowseWorkspace](../src/BrowseWorkspace.tsx)、[FolderContent](../src/FolderContent.tsx)、[MediaBrowser](../src/MediaBrowser.tsx)、[Gallery](../src/Gallery.tsx) | 按改動選 [pending UI](../tests/pending-ui.ts)、[來源 UI](../tests/media-scope-ui.ts)、[遊戲 UI](../tests/game-actions-ui.ts)，專用生命週期再擴大 |
| 模組／IPC／資料流 | [架構邊界](ARCHITECTURE.md#資料流與邊界)、[責任表](ARCHITECTURE.md#按問題找入口) | [main](../electron/main.ts)、[preload](../electron/preload.ts) | 依實際契約選 [驗證矩陣](IMPLEMENTATION.md#驗證選擇) |
| 建立、群組、左右欄 | [外框](WORKSPACE_REVISION.md#外框與專案區)、[建立](WORKSPACE_REVISION.md#建立與既有專案)、[介面細節](WORKSPACE_REVISION.md#工作區介面細節) | [DesktopShell](../src/DesktopShell.tsx)、[BrowseWorkspace](../src/BrowseWorkspace.tsx) | [workspace UI](../tests/workspace-ui.ts)、[workspace](../tests/workspace.test.ts) |
| CARD／TABLE／TREE、導覽 | [三模式](WORKSPACE_REVISION.md#三模式與開啟行為)、[CARD 控制](WORKSPACE_REVISION.md#card-專屬控制) | [BrowseWorkspace](../src/BrowseWorkspace.tsx)、[TreeView](../src/TreeView.tsx)、[browse](../shared/browse.ts) | [revision](../tests/revision.test.ts)、[workspace UI](../tests/workspace-ui.ts)、[共用導覽 UI](../tests/folder-navigation-ui.ts)；側鍵再查 main／preload 的 `folder:navigate` |
| 檔案模式／選資料夾 | [檔案總覽](WORKSPACE_REVISION.md#檔案總覽)、[介面細節](WORKSPACE_REVISION.md#工作區介面細節) | [FileOverview](../src/FileOverview.tsx)、[Explorer](../electron/explorer.ts) `overview` | [總覽 UI](../tests/file-overview-ui.ts)、[來源契約](../tests/decided-media.test.ts) |
| 統一媒體頁／佇列／隱藏檔 | [統一媒體](WORKSPACE_REVISION.md#統一媒體工作區)、[隱藏規則](WORKSPACE_REVISION.md#檔案顯示與隱藏規則)；音樂再看 [故障／封面](WORKSPACE_REVISION.md#音樂播放故障與選型) | [PlaybackProvider](../src/Playback.tsx)、[MediaBrowser](../src/MediaBrowser.tsx)、[Gallery](../src/Gallery.tsx)、[MediaViewer](../src/MediaViewer.tsx)、[AudioViewer](../src/AudioViewer.tsx)；後端 [Explorer](../electron/explorer.ts) `content`／`overview`／`audioCover` | 跨層用 [scope UI](../tests/media-scope-ui.ts)，音樂用 [audio UI](../tests/audio-playback-ui.ts)，共用生命週期用 [media UI](../tests/media-workspace-ui.ts)；依風險選 [來源契約](../tests/decided-media.test.ts)，非每步全跑 |
| 資料夾身分／共用與私有 | [身分與值](FOLDER_PROJECT_MODEL.md#身分與值) | [model](../shared/model.ts)、[Library](../electron/library.ts) | [model](../tests/model.test.ts)、[library](../tests/library.test.ts) |
| 保存、清理、刪除、移遷 | [儲存安全](STORAGE_OPTIONS.md#權威與寫入)、[必要驗證](STORAGE_OPTIONS.md#必要驗證)；按操作再讀清理／移除章節 | [files](../electron/files.ts) `atomicJson`、[Library](../electron/library.ts) | [library](../tests/library.test.ts) 成功／失敗／取消／復原 |
| CELL 拖放／方案／指定方案 | [畫布](EDITOR_DESIGN.md#資料與畫布)、[方案](EDITOR_DESIGN.md#方案管理)、[單筆指定](EDITOR_DESIGN.md#單一資料夾指定方案) | [Editor](../src/Editor.tsx)、[layouts](../shared/layouts.ts) `rowCells`／`removePreset` | [方案契約](../tests/decided.test.ts)、[decided UI](../tests/decided-ui.ts) |
| 新組件／欄位型別 | [CELL 契約](CELL_CATALOG.md#現行契約)、[組件與型別](CELL_CATALOG.md#新增組件與型別) | [fields](../shared/fields.ts)、[model](../shared/model.ts)、[Card](../src/Card.tsx)、[cells](../shared/cells.ts) | [CELL 驗證](../tests/cells.test.ts)、[model](../tests/model.test.ts)、[型別保存](../tests/decided.test.ts) |
| 刪除自訂欄位／影響預覽 | [欄位刪除](EDITOR_DESIGN.md#自訂欄位刪除)、[儲存安全](STORAGE_OPTIONS.md#清理與範圍) | [Editor](../src/Editor.tsx)、[Library](../electron/library.ts)、[Explorer](../electron/explorer.ts) `previewDeleteField`／`deleteField`、[maintenance](../electron/maintenance.ts) | [library](../tests/library.test.ts)、[型別保存](../tests/decided.test.ts)、[清理安全](../tests/maintenance.test.ts) |
| 搜尋畫面／樣式 | [介面](SEARCH_DESIGN.md#搜尋介面)、[樣式](SEARCH_DESIGN.md#搜尋對話框樣式) | [SearchDialog](../src/SearchDialog.tsx)、[style](../src/style.css) | [搜尋 UI](../tests/search-dialog-ui.ts) |
| 搜尋語法／保存／比較 | [語法](SEARCH_DESIGN.md#基本語法)、[保存](SEARCH_DESIGN.md#索引與保存)、[比較](SEARCH_DESIGN.md#欄位比較) | [query](../shared/query.ts) `parseQuery`／`restoreQuery`、[SearchIndex](../electron/search-index.ts) | [查詢契約](../tests/decided-media.test.ts)、[explorer](../tests/explorer.test.ts) |
| 相簿瀑布流／載入效能 | [圖片內容](ALBUM_VIEWER_DESIGN.md#圖片內容)、[效能](ALBUM_VIEWER_DESIGN.md#檔案與效能基線) | [Gallery](../src/Gallery.tsx)、[gallery](../shared/gallery.ts)、[Explorer](../electron/explorer.ts) `content`／`thumbnail` | [gallery](../tests/gallery.test.ts)、[效能 UI](../tests/gallery-performance-ui.ts) |
| 圖片縮放／貼合／資訊 | [圖片閱讀器](ALBUM_VIEWER_DESIGN.md#圖片閱讀器) | [Reader](../src/Reader.tsx) `changeZoom`、[reader](../shared/reader.ts) `spreadGeometry` | [reader](../tests/reader.test.ts)、[reader UI](../tests/reader-ui.ts) |
| 漫畫閱讀／配對／GIF | [閱讀器](MANGA_VIEWER_DESIGN.md#漫畫閱讀器)；配對／GIF 再讀對應章節 | [Reader](../src/Reader.tsx)、[Gallery](../src/Gallery.tsx)、[reader](../shared/reader.ts) | [reader UI](../tests/reader-ui.ts)、[來源 UI](../tests/media-scope-ui.ts) |
| 影片控制／自動播放／生命週期 | [播放控制](VIDEO_VIEWER_DESIGN.md#播放控制)、[播放生命週期](VIDEO_VIEWER_DESIGN.md#播放生命週期) | [VideoControls](../src/VideoControls.tsx)、[VideoViewer](../src/VideoViewer.tsx) | [播放器 UI](../tests/video-player-ui.ts) `controls`／`auto-next`／`lifecycle` |
| 字幕／播放設定／樣式 | [播放設定](VIDEO_VIEWER_DESIGN.md#播放設定)、[字幕](VIDEO_VIEWER_DESIGN.md#拖入字幕與同步設定) | [VideoSubtitleSettings](../src/VideoSubtitleSettings.tsx)、[播放器 CSS](../src/video-player.css)、[subtitles](../shared/subtitles.ts) | [播放器 UI](../tests/video-player-ui.ts) `subtitles`／`appearance` |
| ZIP／CBZ／PDF | [ZIP](DOCUMENT_VIEWER_DESIGN.md#zipcbz)、[PDF](DOCUMENT_VIEWER_DESIGN.md#pdf) | [DocumentViewer](../src/DocumentViewer.tsx)、[archive](../electron/archive.ts) | [文件契約](../tests/decided-media.test.ts)、[decided UI](../tests/decided-ui.ts) |
| 遊戲畫面／啟動動作 | [內容](GAME_VIEWER_DESIGN.md#1-已確認的遊戲內容頁)、[執行責任](GAME_VIEWER_DESIGN.md#5-路徑參數與執行責任) | [FolderContent](../src/FolderContent.tsx)、[Explorer](../electron/explorer.ts) | [explorer](../tests/explorer.test.ts)、[遊戲 UI](../tests/game-actions-ui.ts) |
| 遊戲 ROOT／偵測／內部保護 | [判斷規則](GAME_ENGINE_DETECTION.md#漏判誤判與-root-定位規則)、[驗收](GAME_ENGINE_DETECTION.md#驗收與演進) | [game-detection](../electron/game-detection.ts)、[Library](../electron/library.ts) `scan`／`visit` | [game-detection](../tests/game-detection.test.ts)、[library](../tests/library.test.ts) |
| 外部資料預覽／套用 | [分類來源](METADATA_ENRICHMENT.md#分類來源)、[套用與追溯](METADATA_ENRICHMENT.md#預覽套用與追溯) | [sources](../shared/sources.ts)、[metadata](../electron/metadata.ts) | [metadata](../tests/metadata.test.ts)、[來源契約](../tests/decided-media.test.ts) |
| 主題／語言／共用互動 | [外觀與語言](UI_RULES.md#全域外觀與語言)、[焦點與保存](UI_RULES.md#保存焦點與狀態) | [ApplicationSettings](../src/ApplicationSettings.tsx)、[locales](../shared/locales.ts)、[themes](../src/themes/ThemeProvider.tsx) | [appearance](../tests/appearance.test.ts)、[appearance UI](../tests/appearance-ui.ts) |
| 設定包備份／移轉 | [設定包](WORKSPACE_REVISION.md#設定包移轉)、[儲存限制](STORAGE_OPTIONS.md#權威與寫入) | [settings-package](../electron/settings-package.ts)、[WorkspaceStore](../electron/workspace.ts) | [decided](../tests/decided.test.ts)、[decided UI](../tests/decided-ui.ts) |

產品邊界見 [PRODUCT](PRODUCT.md)，找畫面可用 [畫面索引](UI_SCREEN_CATALOG.md)；兩者按需讀。音樂播放器等排程／未決細節見 [OPEN_DECISIONS](OPEN_DECISIONS.md)。

使用者文件：[使用指南](USER_GUIDE.zh-TW.md)（[English](USER_GUIDE.md)）；資料格式：[DATA_FORMAT](DATA_FORMAT.md)；貢獻者英文概覽：[OVERVIEW](OVERVIEW.md)。

## 維護分工

- 穩定執行／安全規則只在 CLAUDE；模組責任只在 ARCHITECTURE；命令、測試定位與文件檢查只在 IMPLEMENTATION。
- 核定行為只改對應主規格；PRODUCT 維護範圍與連結。程式及有效測試說明現況，不因需求尚未交付就回改核定目標。
- 實作差距／阻礙／待查收只在 WORK_ITEMS；未決選項／延後方向只在 OPEN_DECISIONS。重要取捨及被取代關係留 DECISIONS，不將完整功能與進度再抄一份。
- 新需求直接修改原規則並留待辦差距；完成後清除過時狀態及失效入口。章節採穩定名稱，改名時更新直接引用或保留舊 anchor。
- 收尾沿本表來源欄反查主文件及直接引用即可，不另建來源映射清單。機械問題用 [文件檢查](IMPLEMENTATION.md#文件檢查)，語意候選仍需核對需求及程式；不以日期／關鍵字自動判定矛盾。

## 工作流程

與技術無關的開發流程 PROMPT 見 [WORKFLOW_PROMPT](WORKFLOW_PROMPT.md)，可整段帶到其他專案使用。

## 歷史與探索

[DECISIONS](DECISIONS.md) 依決策 ID 追溯；舊 POC、階段、ROADMAP、DEV_LOG、RELEASE_0_5_0 等已封存於 [archive](archive/)（日常搜尋請排除 docs/archive），與主文件末尾的歷史區都不是日常前置 Context，歷史測試不算本輪驗證。版本／依賴查 [package.json](../package.json)；版本任務才更新 CHANGELOG。

[整理前快照](history/agent-docs-before-cleanup.md) 保留原文、不再追加。[視覺探索](design/README.md) 與 [風格比較](DESIGN_STYLE_OPTIONS.md) 未定案；歷史 R／T／UI-R 提案不因封存而變成已批准需求。不確定的重要限制先保留並標示待核對，不自行刪除。
