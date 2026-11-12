# 任務與文件索引

先依 [CLAUDE](../CLAUDE.md) 看 [當前工作](WORK_ITEMS.md) 與 Git 狀態，再用下表定位本次章節；不要求全讀主文件或全表來源。規格描述核定目標，實作差距／待查收以工作清單為準；例如待移除 CC 不代表程式已移除。

## 按任務定位

下表由 [領域登錄表](areas.json) 產生（`node scripts/areas.mjs readme`），只讀本次任務那一列；程式欄是檔名樣式，先 `rg` 定位再讀。測試欄不是每次必跑清單，選擇見 [驗證矩陣](IMPLEMENTATION.md#驗證選擇)；`pnpm test:ui:changed` 會依同一份登錄表挑 UI 測試。

<!-- areas:start（由 node scripts/areas.mjs readme 產生，勿手改） -->

| 領域 | 規格 | 程式 | 測試（資料、UI） |
| --- | --- | --- | --- |
| 外框、專案欄、建立專案（`shell`） | [外框與專案區](WORKSPACE_REVISION.md#外框與專案區)、[建立與既有專案](WORKSPACE_REVISION.md#建立與既有專案)、[工作區介面細節](WORKSPACE_REVISION.md#工作區介面細節) | `src/shell/DesktopShell*` `src/shell/CreateProjectDialog*` `electron/workspace.ts` `shared/workspace.ts` | `workspace` `workspace-ui` `sidebar-peek-ui` `audio-playback-ui` |
| CARD／TABLE／TREE、導覽、工具列（`browse`） | [三模式與開啟行為](WORKSPACE_REVISION.md#三模式與開啟行為)、[card-專屬控制](WORKSPACE_REVISION.md#card-專屬控制) | `src/browse/BrowseWorkspace*` `src/browse/BrowseToolbar*` `src/browse/BrowsePanel*` `src/browse/BrowseNav*` `src/browse/FolderCards*` `src/browse/useCardSettings*` `src/browse/useTableColumns*` `src/browse/TreeView*` `src/browse/FolderTable*` `src/browse/ViewToggle*` `src/browse/KindBatchBar*` `src/browse/folderStats*` `src/browse/folderKind*` `src/browse/refresh*` `shared/browse*` `shared/kind*` | `browse` `revision` `folder-kind` `folder-navigation-ui` `workspace-toolbar-ui` `workspace-ui` `settings-dock-ui` `game-folder-page-ui` `image-delete-ui` |
| 右側面板與資料夾設定（`panel`） | [右側內容與覆蓋層](WORKSPACE_REVISION.md#右側內容與覆蓋層)、[右側組件共用邊界](MEDIA_WORKSPACE.md#右側組件共用邊界)、[資料夾詳情](MEDIA_WORKSPACE.md#資料夾詳情) | `src/panel/RightPanel*` `src/panel/FolderPanel*` `src/panel/FolderParts*` `src/panel/FolderContent*` `src/panel/FilePage*` `src/panel/FolderAdvanced*` `src/panel/FolderFieldInput*` `src/editor/fieldSources*` `src/panel/FolderImages*` `src/metadata/FolderSourceImport*` `src/panel/PanelSkeleton*` | `image-delete` `settings-dock-ui` `folder-navigation-ui` `game-folder-page-ui` `image-delete-ui` `panel-preview-ui` `pending-ui` |
| 檔案總覽、隱藏檔（`files`） | [檔案總覽](MEDIA_WORKSPACE.md#檔案總覽)、[檔案顯示與隱藏規則](MEDIA_WORKSPACE.md#檔案顯示與隱藏規則) | `src/files/FileOverview*` `src/files/useFileVisibility*` `electron/explorer-overview*` `electron/hidden*` | `decided-media` `file-probe` `file-overview-ui` `media-scope-ui` `folder-navigation-ui` |
| 統一媒體頁、播放佇列、音樂（`media`） | [統一媒體工作區](MEDIA_WORKSPACE.md#統一媒體工作區)、[跨專案影音佇列與迷你播放器](MEDIA_WORKSPACE.md#跨專案影音佇列與迷你播放器)、[音樂播放故障與選型](MEDIA_WORKSPACE.md#音樂播放故障與選型) | `src/media/MediaBrowser*` `src/media/MediaQueue*` `src/media/MediaViewer*` `src/media/AudioViewer*` `src/media/Playback*` `src/media/FileMenu*` `src/media/useVideoAudio*` `src/media/MediaThumb*` `src/media/fileLabels*` `src/media/FolderAlbumCover*` `src/media/playOrder*` `src/media/media-workspace.css` `shared/media*` `shared/explorer*` `electron/media-files*` `electron/explorer.ts` `electron/explorer-content*` `electron/explorer-source*` `electron/explorer-stream*` | `media-workspace` `explorer` `media-scope-ui` `media-workspace-ui` `audio-playback-ui` `media-feedback-ui` |
| 相簿瀑布流、圖片閱讀（`gallery`） | [圖片內容](ALBUM_VIEWER_DESIGN.md#圖片內容)、[檔案與效能基線](ALBUM_VIEWER_DESIGN.md#檔案與效能基線)、[圖片閱讀器](ALBUM_VIEWER_DESIGN.md#圖片閱讀器) | `src/gallery/Gallery*` `shared/gallery*` `shared/images*` `electron/image-url*` `electron/pinned-fetch*` | `gallery` `image-url` `pinned-fetch` `gallery-performance-ui` `media-scope-ui` `reader-ui` `image-nth-ui` |
| 漫畫閱讀器（`reader`） | [漫畫閱讀器](MANGA_VIEWER_DESIGN.md#漫畫閱讀器) | `src/reader/Reader*` `src/reader/Webtoon*` `shared/reader*` | `reader` `reader-ui` `webtoon-ui` `reader-next-ui` `media-scope-ui` |
| 小說閱讀器（`novel`） | [閱讀](NOVEL_READER.md#閱讀)、[閱讀紀錄](NOVEL_READER.md#閱讀紀錄) | `src/novel/*` `electron/novel*` `shared/novel*` | `novel` `novel-ui` |
| 影片播放與字幕（`video`） | [播放控制](VIDEO_VIEWER_DESIGN.md#播放控制)、[播放生命週期](VIDEO_VIEWER_DESIGN.md#播放生命週期)、[拖入字幕與同步設定](VIDEO_VIEWER_DESIGN.md#拖入字幕與同步設定) | `src/video/Video*` `src/video/video-player.css` `shared/subtitles*` | `video-player-ui` `video-failure-ui` |
| ZIP／CBZ／PDF（`documents`） | [zipcbz](DOCUMENT_VIEWER_DESIGN.md#zipcbz)、[pdf](DOCUMENT_VIEWER_DESIGN.md#pdf) | `src/documents/DocumentViewer*` `electron/archive*` | `decided-media` `reader-ui` `novel-ui` `decided-ui` |
| CELL 編輯器、方案、欄位刪除（`editor`） | [資料與畫布](EDITOR_DESIGN.md#資料與畫布)、[方案管理](EDITOR_DESIGN.md#方案管理)、[自訂欄位刪除](EDITOR_DESIGN.md#自訂欄位刪除) | `src/editor/Editor*` `src/editor/editorDrag*` `src/editor/editorKinds*` `src/editor/commonFields*` `src/editor/importedFieldLabels*` `src/editor/fieldSources*` `src/editor/FieldManager*` `src/editor/FieldGroup*` `src/editor/DisplaySource*` `src/editor/OptionTagsInput*` `src/editor/ConditionEditor*` `shared/fieldGroups*` `src/editor/fieldTypes*` `shared/layouts*` | `decided` `field-types` `field-groups` `date-fields` `cell-editor-ui` `field-edit-ui` `editor-fields-ui` `decided-ui` `yes-no-wording-ui` `condition-rules-ui` `date-field-ui` |
| 卡片組件與欄位型別（`cells`） | [現行契約](CELL_CATALOG.md#現行契約)、[新增組件與型別](CELL_CATALOG.md#新增組件與型別) | `src/cells/Card*` `src/cells/CellStyleEditor*` `src/cells/TagList*` `src/cells/EnumColors*` `src/cells/Fallback*` `src/cells/cells.css` `src/cells/cellStyle*` `shared/cells*` `shared/fields*` | `cells` `cell-fallback` `model` `conditions` `cell-editor-ui` `field-edit-ui` `cell-style-ui` `cell-scroll-ui` `image-nth-ui` `game-cover-cell-ui` `game-launch-cell-ui` `enum-add-option-ui` `editor-fields-ui` |
| 搜尋畫面、語法、索引（`search`） | [搜尋介面](SEARCH_DESIGN.md#搜尋介面)、[基本語法](SEARCH_DESIGN.md#基本語法)、[索引與保存](SEARCH_DESIGN.md#索引與保存) | `src/search/SearchDialog*` `src/search/search-dialog.css` `shared/query*` `shared/search*` `electron/search-index*` | `decided-media` `explorer` `search-dialog-ui` |
| 遊戲畫面與啟動動作（`game`） | [遊戲內容頁](GAME_VIEWER_DESIGN.md#遊戲內容頁)、[路徑參數與執行責任](GAME_VIEWER_DESIGN.md#路徑參數與執行責任) | `src/game/GameActions*` `src/game/GameExtras*` `src/game/useGameExtras*` `src/game/playtime*` `src/game/LocaleEmulatorSetting*` `src/game/FlashPlayerSetting*` `electron/game-extras*` `src/game/game-actions.css` `shared/launchArgs*` | `game-actions` `game-extras` `game-shortcut` `launch-args` `game-actions-ui` `game-launch-cell-ui` `game-folder-page-ui` |
| 遊戲 ROOT 偵測與內部保護（`detection`） | [漏判誤判與-root-定位規則](GAME_ENGINE_DETECTION.md#漏判誤判與-root-定位規則)、[驗收與演進](GAME_ENGINE_DETECTION.md#驗收與演進) | `electron/game-detection*` `electron/library-scan*` `src/game/BoundaryFlag*` | `game-detection` `library` `problems-ui` `game-folder-page-ui` |
| 外部資料預覽與套用（`metadata`） | [分類來源](METADATA_ENRICHMENT.md#分類來源)、[預覽套用與追溯](METADATA_ENRICHMENT.md#預覽套用與追溯) | `electron/metadata*` `electron/sources/*` `electron/keys*` `shared/keys*` `src/settings/SiteKeys*` `shared/sources*` `src/metadata/importSource*` `src/metadata/ImageUrlImport*` `src/metadata/FolderSourceImport*` | `metadata` `decided-media` `keys` `web-sources` `vndb-store` `remove-source` `date-fields` `media-feedback-ui` `keys-ui` `field-sources-ui` |
| 主題、語言、圖示與共用互動（`appearance`） | [全域外觀與語言](UI_RULES.md#全域外觀與語言)、[保存焦點與狀態](UI_RULES.md#保存焦點與狀態) | `src/settings/ApplicationSettings*` `src/themes/ThemeProvider*` `src/themes/themes.css` `src/i18n/*` `src/styles/style.css` `src/common/icons*` `src/common/IconLabel*` `src/common/BrandMark*` `src/common/HelpTip*` `shared/themes*` `shared/locales*` `shared/native-messages*` `shared/message*` | `appearance` `theme-contrast` `message` `appearance-ui` |
| 通知與錯誤提示（`notices`） | [保存焦點與狀態](UI_RULES.md#保存焦點與狀態) | `src/App.tsx` `src/notices/Toasts*` `src/notices/errors*` `src/notices/ErrorBoundary*` `shared/notifications*` | `error-message` `notifications-ui` `error-recovery-ui` |
| 資料夾身分、保存、清理、問題與復原（`storage`） | [身分與值](FOLDER_PROJECT_MODEL.md#身分與值)、[權威與寫入](STORAGE_OPTIONS.md#權威與寫入)、[必要驗證](STORAGE_OPTIONS.md#必要驗證) | `electron/library.ts` `electron/library-cleanup*` `electron/files*` `electron/maintenance*` `shared/model*` `src/storage/ProblemsDialog*` | `library` `maintenance` `model` `remove-dir` `folder-navigation-ui` `settings-dock-ui` `game-folder-page-ui` `cell-editor-ui` `media-scope-ui` `workspace-toolbar-ui` `problems-ui` `decided-ui` |
| 資料格式升級與相容（`upgrade`） | [格式升級與相容規則](DATA_FORMAT.md#格式升級與相容規則) | `shared/upgrade*` | `upgrade` `model` `compat` `problems-ui` |
| 備份與還原、設定包（`backup`） | [備份資料夾](DATA_FORMAT.md#備份資料夾)、[設定包移轉](WORKSPACE_REVISION.md#設定包移轉) | `electron/backup*` `electron/settings-*` `electron/library-export*` `shared/backup*` `shared/project-export*` `src/settings/ApplicationSettings*` | `backup` `project-export` `decided` `backup-ui` `decided-ui` |
| 專案設定與移除（`project`） | [專案設定與移除](WORKSPACE_REVISION.md#專案設定與移除)、[移除單一專案](STORAGE_OPTIONS.md#移除單一專案) | `src/settings/ProjectSettings*` `electron/library-removal*` `electron/library-field-removal*` | `maintenance` `library` `decided-ui` `problems-ui` |
| 主程序、IPC、啟動（`core`） | [資料流與邊界](ARCHITECTURE.md#資料流與邊界)、[按問題找入口](ARCHITECTURE.md#按問題找入口) | `electron/main.ts` `electron/ipc-requests.ts` `electron/library-dispatch.ts` `electron/preload.ts` `src/main.tsx` `src/index.html` `src/env.d.ts` | `ipc-requests` `folder-navigation-ui` `settings-dock-ui` `game-folder-page-ui` `cell-editor-ui` `media-scope-ui` `workspace-toolbar-ui` |

<!-- areas:end -->

其他（不屬於程式領域）：
- 文件截圖重拍、授權與名稱：[IMPLEMENTATION](IMPLEMENTATION.md) 的 `pnpm shot:docs`、[LICENSE](../LICENSE)
- 版本階段、tag、發布：[RELEASING](RELEASING.md)、[CHANGELOG](../CHANGELOG.md)
- 需求清單與狀態：[WORK_ITEMS](WORK_ITEMS.md)，`pnpm status` 印出狀態區塊

產品邊界見 [PRODUCT](PRODUCT.md)，找畫面可用 [畫面索引](UI_SCREEN_CATALOG.md)；兩者按需讀。音樂播放器等排程／未決細節見 [OPEN_DECISIONS](OPEN_DECISIONS.md)。

使用者文件：[使用指南](USER_GUIDE.zh-TW.md)（[English](USER_GUIDE.md)）；資料格式：[DATA_FORMAT](DATA_FORMAT.md)；貢獻者英文概覽：[OVERVIEW](OVERVIEW.md)。

## 維護分工

- 穩定執行／安全規則只在 CLAUDE；模組責任只在 ARCHITECTURE；命令、測試定位與文件檢查只在 IMPLEMENTATION。
- 核定行為只改對應主規格；PRODUCT 維護範圍與連結。程式及有效測試說明現況，不因需求尚未交付就回改核定目標。
- 實作差距／阻礙／待查收只在 WORK_ITEMS；未決選項／延後方向只在 OPEN_DECISIONS。重要取捨及被取代關係留 DECISIONS，不將完整功能與進度再抄一份。
- 新需求直接修改原規則並留待辦差距；完成後清除過時狀態及失效入口。章節採穩定名稱，改名時更新直接引用或保留舊 anchor。
- 每份規格頁首的「最後確認」是最後一次整理成現行規則、並核對日期／待實作／版本／首輪等可疑描述的日期，不代表每條規則都逐一對照過程式；該領域的程式在這日期之後改過，`pnpm stale` 會點名，改到時重新核對並更新日期。
- 領域、規格、程式、測試的對應只在 [areas.json](areas.json)；新增原始檔或改規格章節時同批更新它並重產本表。收尾跑 `pnpm stale` 點名可能過時的規格卡與失效參照，語意仍需核對需求及程式。

## 工作流程

與技術無關的開發流程 PROMPT 見 [WORKFLOW_PROMPT](WORKFLOW_PROMPT.md)，可整段帶到其他專案使用。

## 歷史與探索

[DECISIONS](DECISIONS.md) 依決策 ID 追溯；舊 POC、階段、ROADMAP、DEV_LOG、RELEASE_0_5_0 等已封存於 [archive](archive/)（日常搜尋請排除 docs/archive），與主文件末尾的歷史區都不是日常前置 Context，歷史測試不算本輪驗證。版本／依賴查 [package.json](../package.json)；版本任務才更新 CHANGELOG。

[整理前快照](history/agent-docs-before-cleanup.md) 保留原文、不再追加。[視覺探索](design/README.md) 與 [風格比較](DESIGN_STYLE_OPTIONS.md) 未定案；歷史 R／T／UI-R 提案不因封存而變成已批准需求。不確定的重要限制先保留並標示待核對，不自行刪除。
