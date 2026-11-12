# 資料格式參考

> 最後確認：2026-11-12。可攜記錄與應用程式資料的格式；型別以 `shared/model.ts`、`shared/workspace.ts` 為準，升級在 `shared/upgrade.ts`。

M:orph 的資料以**可攜的 JSON 記錄**為準，SQLite 搜尋索引只是可重建的副本。此頁列出各檔案的位置與欄位，讓其他工具或貢獻者能讀懂；設計理由見 [資料模型](FOLDER_PROJECT_MODEL.md) 與 [儲存安全](STORAGE_OPTIONS.md)，型別定義的原始碼是 [shared/model.ts](../shared/model.ts)、[shared/explorer.ts](../shared/explorer.ts)、[shared/workspace.ts](../shared/workspace.ts)，驗證在同檔的 `validate*` 函式。

> 欄位以現行程式為準；`schemaVersion` 與應用程式版本號無關，目前都是 `1`。日後改格式時的自動升級規則見[格式升級與相容規則](#格式升級與相容規則)。

## 檔案位置

| 檔案 | 內容 |
| --- | --- |
| `<資料夾>/.media-viewer/folder.json` | 這個資料夾自己的記錄（屬性、覆寫、資產參照、細節） |
| `<資料夾>/.media-viewer/assets/` | 記錄參照的圖片與資產（以相對路徑參照） |
| `<資料夾>/.media-viewer/subtitles/`（若有） | 匯入的字幕，以記錄裡的相對路徑參照 |
| `<根資料夾>/.media-viewer/projects/<projectId>.json` | 專案定義（欄位、版面、掃描邊界、動作） |
| `<檔案>.bak` | 上一次的已知良好備份，寫入前建立，損毀時用來復原 |
| `%APPDATA%\media-viewer\` | 本機設定、專案連結清單、搜尋索引（`search.sqlite`）、復原包 `maintenance-backups`；不是資料來源，可重建 |

隱藏目錄與下列 `kind` 值沿用舊產品名稱 `media-viewer`，是資料格式的一部分，不隨 M:orph 改名。

## 資料夾記錄 `folder.json`

`kind: "media-viewer.folder"`、`schemaVersion: 1`。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `folderId` | 字串 | 資料夾的穩定身分，搬移資料夾後不變 |
| `revision` | 整數 | 每次寫入加一；寫入時要帶上讀到的版本，不符就拒絕（版本衝突，草稿保留） |
| `attributes` | 陣列 | 共用屬性，見下表 |
| `projectOverrides` | 物件 | `projectId → 屬性陣列`：只對某個專案有效的私有覆寫，必須刻意建立 |
| `assets` | 陣列 | `{ assetId, relativePath, originalName, mediaType }`，圖片與資產 |
| `details` | 物件（選用） | 遊戲邊界與動作目標、閱讀與播放進度、字幕等，見下 |

**屬性 `Attribute`**

| 欄位 | 說明 |
| --- | --- |
| `attributeId` | 屬性身分。匯入的來源屬性用 `<來源>-<鍵>`，例如 `eh-title`、`steam-store_url` |
| `key` | 來源或使用者的鍵名（如 `TITLE`、`TAGS`） |
| `type` | `string`、`tags`、`number`、`datetime`、`boolean`、`enum`、`url`、`date` |
| `value` | 依型別驗證；字串 ≤ 10000 字，標籤 ≤ 200 個、每個 ≤ 100 字 |
| `source` | `manual`，或匯入時的來源網址 |
| `sourceRecord`（選用） | `{ provider, url, fetchedAt }`，追溯匯入來源 |

**`details`（`FolderDetails`，`schemaVersion: 1`）** 常用欄位：

- `boundary`：遊戲邊界 `{ state: 'root' | 'not-game' | 'candidate', engines, evidence }`。
- `targets`：遊戲動作目標 `{ <actionId>: { kind: 'exe' | 'folder' | 'file-app' | 'url' | 'shortcut' | 'file', path, relative, args, localeEmulator? } }`；`shortcut` 只能是遊戲資料夾內最上層的 `.lnk`／`.url` 檔名；`file`（R-306）是遊戲資料夾內的說明文件（`relative: true`、沒有參數、副檔名限 pdf／html／htm／txt／md／rtf），用系統預設程式開啟；`localeEmulator`（R-309、R-319）只用於 `exe`：`true` 表示用 Locale Emulator 的預設（日文）啟動，GUID 字串表示用該設定檔啟動。`exe` 目標的檔案可以是 `.exe` 或 `.swf`（R-320，用應用程式設定的 Flash 播放程式開啟）。
- `saveFolder`（R-305）：使用者指定的存檔資料夾 `{ path, relative }`（遊戲外的只接受本機磁碟路徑，不接受網路路徑）；沒有時依引擎推算。
- `hiddenActions`：這個遊戲不在按鈕列顯示的動作 id。
- `shownExtras`（R-315）：這個遊戲按鈕列要顯示的自動操作，`steam`／`store`／`save` 的子集；沒有時都不顯示。
- `cellImages`：圖片組件各自選定的資產；`bannerAssetId`：封面資產。
- 刪除已保存圖片（`deleteImage`）：同一次原子寫入（含版本檢查）移除 `assets` 項目並清掉 `cellImages`／`bannerAssetId` 對它的引用；寫入成功後才刪除 `.media-viewer/assets/` 內的受管檔案（需通過 `safePath`、必須是一般檔案、且無其他項目共用同一路徑）。寫入失敗則檔案與記錄都保留；使用者原始媒體檔不會被觸碰。刪除後不保留副本，但 `.bak` 仍含舊記錄，不會復活檔案。
- `kind`：使用者手動指定的資料夾類型（`game`、`book`、`media`、`general`）；沒有時由程式偵測，不寫入記錄（見 [WORK_ITEMS](WORK_ITEMS.md) 的資料夾類型整合）。
- `reading`、`playback`、`subtitles`：漫畫閱讀偏好、影片續播進度與字幕設定。`reading` 的 `webtoon`、`webtoonWidth`（30～100）、`webtoonAsked`（R-256）記條漫模式、寬度與是否已回答過條漫提示。
- `novels`（R-282）：文字書的閱讀位置，以檔名為鍵 `{ chapter, position, percent, updated, bookmarks? }`；`position`、`percent` 是 0～1 的比例，書籤最多 500 個。

### 範例（簡化）

```json
{
  "kind": "media-viewer.folder",
  "schemaVersion": 1,
  "folderId": "f4c1-example",
  "revision": 3,
  "attributes": [
    { "attributeId": "eh-title", "key": "TITLE", "type": "string", "value": "Example", "source": "https://e-hentai.org/g/123/abcdef0123/" },
    { "attributeId": "my-note", "key": "note", "type": "string", "value": "用手動欄位", "source": "manual" }
  ],
  "projectOverrides": {},
  "assets": []
}
```

## 專案檔 `projects/<projectId>.json`

`kind: "media-viewer.project"`、`schemaVersion: 1`。

| 欄位 | 說明 |
| --- | --- |
| `projectId`、`rootFolderId`、`revision`、`name` | 身分與版本；`rootFolderId` 指向根資料夾的記錄 |
| `contentCells` | 內容模板，以資料夾類型為鍵（`book`、`game`、`media`、`general`；舊鍵 `manga`、`album`、`video`、`music`、`other` 仍可讀取）；舊 `mediaCategory`／`mediaSourceCategory` 已移除，讀到時忽略 |
| `kindLayouts` | 各資料夾類型套用的 CELL 版面方案 ID（資料夾自選的版面優先） |
| `depth` | `{ mode: 'through' | 'exact', level }` 掃描層級 |
| `fieldBindings` | 專案的欄位清單：`{ alias, attributeId, type, options?, optionColors?, trueLabel?, falseLabel? }`；`trueLabel`／`falseLabel`（R-234）只用於是／否欄位，各 1～20 字的顯示文字 |
| `fieldGroups`（選用） | 欄位群組：`{ groupId, name, memberIds }`，最多 100 個；成員 1～20 個、須在 `fieldBindings`、型別相同（文字與標籤可混用）、一個欄位只屬一個群組；名稱 1～100 字，不分大小寫不可與其他群組或欄位別名重複 |
| `groupSources`（選用） | 資料夾指定的群組來源：`{ <folderId>: { <groupId>: <attributeId> } }`，值須是該群組成員；只在本專案有效，成員移出或刪除時清除。讀取時（`shared/upgrade.ts` 的 `settleFieldGroups`）先整理舊版程式留下的不一致：已不存在、重複或型別不合的成員移出，空群組移除，與欄位同名的群組名稱加編號，指定來源與組件跟著調整，不因此拒絕整個專案 |
| `cells` | 預設卡片版面：組件陣列，見下 |
| `layoutPresets`、`activeLayoutId`、`folderLayouts` | 多個命名版面、目前使用的版面、各資料夾指定的版面 |
| `stylePresets`（選用） | 此專案的命名樣式：`{ id, name, style }`，最多 20 個、名稱不分大小寫不可重複；`style` 與組件的 `style` 同規則 |
| `contentCells` | 依內容類型的右側版面 |
| `actionTemplates` | 遊戲動作版型 `{ id, label, kind, color }` |
| `list`、`cardView`、`excludedRelativePaths`、`scanAll`、`traversal` | 列表、顯示範圍、排除與掃描設定 |
| `savedSearches` | 儲存的搜尋 |

**組件 `Cell`**：`cellId`、`kind`（`name`、`path`、`field-text`、`field-tags`、`field-number`、`field-date`、`field-boolean`、`field-enum`、`field-url`、`field-date-only`、`static-text`、`spacer`、`system-info`、`image`、`divider`、`open-folder`、`game-cover`、`game-launch`）、`grid`（12 欄、最多 100 列，組件不能重疊）、`style`，以及依型別的選用欄位：`attributeId`、`fallbackIds`（備用欄位，最多 5 個、同型別或文字／標籤相容顯示；舊設定，新設定用群組）、`groupId`（顯示欄位群組，此時 `attributeId` 為其成員之一、不可同時有 `fallbackIds`）、`condition`（顯示條件）、`wrap`／`scroll`、`unit`／`decimals`／`maximum`、`presentation`、`imageFit`、`imageIndex`、`actionId`／`fallbackActionIds`、`tagColors`／`tagPrefix`。完整樣式欄位見 [CELL 目錄](CELL_CATALOG.md#組件樣式2026-11-02-新增)。

**顯示條件與依條件文字（R-239）**：`condition` 的 `operator` 另有 `within`／`older`（`value` 為 1～36500 的天數，只用於日期與日期時間欄位，依今天計算「距今 N 天內／超過 N 天」；只有日期的值以本機日曆日比較，含時間的值以當下時間比較，未來的日期算「N 天內」）。`moreConditions`（1～4 個，需先有 `condition`）與 `conditionMode: "any"`（只在有 `moreConditions` 時）讓組件有多個條件：預設全部符合才顯示，`any` 為任一符合。`textRules`（只限版面文字，1～10 條 `{ when, text }`，文字最多 1000 字，空白表示符合時不顯示）由上往下比對，第一個符合的顯示其文字，都不符合時顯示 `text`。刪除欄位時，讀它的額外條件與文字規則會被移除，主條件讀它時組件照舊一併移除。舊版程式讀到 `within`／`older` 會把專案視為不合法，Alpha 期間不另做相容。

## 設定包

`kind: "media-viewer.settings"`、`schemaVersion: 1`、`exportedAt`、`prefs`（群組、收藏與專案排序、主題、語言、偏好；不含媒體路徑與登入資料）。匯入前先預覽差異並備份目前設定。

<a id="備份資料夾2026-11-04"></a>

## 備份資料夾

應用程式設定 › 備份的「建立備份」會在程式資料夾 `%APPDATA%\media-viewer\backups\` 建立 `M-orph-backup-<時間>/`（同一秒重複時加 `-2` 之類的編號），不改動任何專案，也不含媒體檔。備份只在使用者按「建立備份」時產生，留到使用者刪除（舊版曾在還原前自動建立 `label: "auto"` 的備份，仍照常列出）。還原專案只補上缺少的檔案、不覆蓋現有資訊，所以不另做備份；還原設定會整份取代，取代前設定包機制會先把目前設定存到 `workspace-backups`，視窗用它提供「回到還原之前」（只退回最近一次的設定還原）。「匯出…」把某一筆整個複製到使用者選的位置（不能在專案資料夾或程式備份資料夾裡）；「從檔案還原…」讀取別處的備份資料夾。

- `backup.json`：`kind: "morph.backup"`、`schemaVersion`（目前 `1`）、`createdAt`、`appVersion`、`label`（目前一律 `manual`；`auto` 是舊版還原前自動建立的；沒有時視為 `manual`）、`settings`（設定包的相對路徑）、`projects`（每個專案的 `projectId`、`name`、`root` 與匯出資料夾的相對路徑 `dir`）。
- `settings.json`：上一節的設定包。
- `projects/M-orph-export-<專案名>-<時間>/`：每個已連結、可讀取的專案各一份下一節的專案匯出資料夾；讀不到的專案列在建立結果裡，不中斷整份備份。

「從備份還原」先預覽：設定列出會改變的項目數；`backup.json` 裡的 `root` 只當提示：只有在那個本機資料夾裡已經有同一個專案的定義（`.media-viewer/projects/<projectId>.json`）時才算「找到」，網路或裝置路徑一律不自動檢查（避免開啟備份就連線到別人的主機）；其他情況都標為找不到，要使用者用「選擇新位置」親自指定。找到或指定後才用專案匯入的預覽檢查（含遊戲邊界與同一專案連結在別處的阻擋）。設定步驟失敗（例如預覽後設定又變動）時列在未還原清單，不影響已還原的專案；設定檔損壞時只剩專案可還原。建立備份的位置不能在任何已連結專案的資料夾裡。只還原勾選的項目，專案先、設定後（設定以取代方式套用，套用前先另存目前設定，可回到還原之前）。`backup.json` 的 `dir` 必須是備份資料夾內的相對路徑，否則整份拒絕；`root` 來自備份檔，只在使用者看過預覽並勾選後才寫入，而且只寫 `.media-viewer` 內本程式會建立的檔案。

## 專案匯出資料夾

備份裡的每個專案用這個格式。資料夾名稱 `M-orph-export-<專案名>-<時間>/`，不改動專案本身，也不含媒體檔：

- `manifest.json`：`kind: "media-viewer.project-export"`、`schemaVersion`（目前 `1`）、`exportedAt`、`appVersion`、`projectId`、`projectName`，以及 `files`（相對路徑、`sha256`、大小）。
- `files/<相對根資料夾的路徑>`：專案定義、各資料夾的 `folder.json`、圖片資產與字幕。`.bak` 與已移除專案的封存不匯出，只匯出根層的這個專案定義。

還原時每個專案依序預覽（逐檔驗證 `sha256`、列出新增／相同／內容不同）再套用：

- 路徑只允許 `.media-viewer` 內本程式會建立的檔案；目標資料夾不存在、或位於遊戲邊界內的項目會略過。
- 預設保留目標已有的內容；勾選覆寫只會替換內容不同的專案定義與資產，覆寫前先備份到本機 `import-backups`（含 `.bak`）。已有記錄的資料夾一律保留現有身分與內容。
- 專案的根資料夾身分會改成目標根的記錄；同一專案仍連結在另一個位置時不能匯入。任何一步失敗都會還原已寫入的檔案。
- **升級掛鉤：** 匯入時每筆記錄先經 `shared/project-export.ts` 的 `migrateRecord` 依 `schemaVersion` 逐版升級，再用目前的驗證函式檢查。日後資料模型改變（例如每個資料夾的類型），遞增 `EXPORT_VERSION` 並新增升級步驟，舊匯出就能匯入成新格式。

## 讀寫與相容規則

- **驗證**：讀取時逐欄驗證，不合法的記錄不會被採用，也不會被默默改寫。
- **原子寫入與備份**：先寫暫存檔，再取代原檔，並保留 `.bak`；損毀時只在身分相符時用備份復原。
- **版本衝突**：`revision` 不符的寫入一律拒絕，保留使用者草稿。
- **未知資料保留**：程式不認得的檔案與資料夾不會被清理；清理只移除 M:orph 自己建立的受管資料，並先預覽。
- **遊戲保護**：遊戲根目錄可以有自己的記錄，內部不建立記錄、不修改原始檔。
- **升級**：目前只有 `schemaVersion: 1`。日後改版會讀得懂舊版並自動遷移，規則見下節。

## 格式升級與相容規則

使用者的目標：資料結構在版本之間改變時，使用者不必做任何多餘操作，`%APPDATA%` 與資料夾裡的私有資料都自動轉換。階段與承諾範圍見 [RELEASING](RELEASING.md#階段)：Alpha 不承諾相容，**Beta 起必須符合本節**。決策見 [DECISIONS C-119](DECISIONS.md#c-119版本階段打-tag-與資料自動升級2026-11-04)。

> 實作：入口是 `shared/upgrade.ts`（`FORMAT_VERSION`、`UPGRADE_STEPS`、`upgradeFormat`、`NewerFormatError`）；目前所有格式都還是 v1，所以還沒有任何升級步驟。驗證函式依 `FORMAT_VERSION` 檢查，較新版本丟出 `NewerFormatError`。資料夾與專案記錄（含 `.bak`）一律經 `electron/files.ts` 的 `readJson` 讀取，讀到就已是最新格式，新增讀取路徑不必自己呼叫升級。測試在 `tests/upgrade.test.ts`，以暫時把某格式當成 v2 的方式走完整條升級與唯讀路徑。

**什麼時候要升 `schemaVersion`**

- 只新增選用欄位：不升版。舊資料照讀，缺的欄位用預設值。
- 改名、改型別、拆合或移除欄位、改變欄位語意：升版，並且必須附升級步驟。

**版本範圍**：資料夾記錄、專案記錄、`%APPDATA%` 的工作區與設定檔、設定包、專案匯出包各自有 `schemaVersion`，彼此獨立，也與應用程式版本號無關。搜尋索引是可重建副本，不遷移，版本不符就重建。

**升級鏈**：每一步是 v→v+1 的純函式（不做 I/O、重複執行結果相同），登記在 `shared/upgrade.ts` 的 `UPGRADE_STEPS`，所有舊版依序升到最新。專案匯出包（備份）的 `migrateRecord` 只處理**包裝格式**（`EXPORT_VERSION`）；包內每筆記錄接著走同一份 `UPGRADE_STEPS`，記錄格式只有一套升級鏈（[DECISIONS C-126](DECISIONS.md#c-126記錄升級只有一套匯出包只升包裝2026-11-05)）。

**升級時機**

| 位置 | 時機 | 做法 |
| --- | --- | --- |
| `%APPDATA%`（工作區、設定） | 啟動時一次 | 先把原檔複製成 `workspace-backups/before-upgrade-<時間>.json`（不參與自動清理），再以原子寫入替換 |
| 資料夾與專案的可攜記錄（含專案私有覆寫） | 讀取時在記憶體升級；該筆記錄**因其他原因要存檔時**才寫回新格式 | 瀏覽、掃描不寫入，不批次改寫使用者的收藏；寫回沿用原子寫入與 `.bak`，`.bak` 保留升級前的內容 |
| 專案匯出包、備份、設定包 | 匯入或還原時 | 先升包裝格式，再逐筆升記錄格式，全部驗證通過才寫入 |

資料可能在離線硬碟或隨身碟上，因此不做批次升級；各資料夾的版本可以暫時混用，但每一筆讀取後都以最新格式處理。

**遇到較新版本的資料**（隨身碟或同步資料夾在不同電腦的程式版本之間移動）：

- 記錄的 `schemaVersion` 高於本程式支援時，不當成損壞：「問題與復原」列在「需要更新程式」，不提供從備份恢復或重新連結。
- 對該記錄一律不寫入、不用 `.bak` 或預設值取代、不建立新身分，匯入或還原備份（即使勾選覆寫）也不覆蓋它；清理時該資料夾與其下所有資料夾的記錄保留；掃描不深入該資料夾，也不在其下建立記錄。
- `%APPDATA%` 檔案較新時，不寫入、不重設，提示更新程式。

**失敗與邊界**

- 升級或寫回失敗時，原檔保持不變，該筆記錄列入「問題與復原」，不用空預設蓋掉好資料。
- 只升級已存在且經允許路徑讀到的記錄。遊戲 ROOT 內部的保護邊界不變：升級不建立任何新記錄，也不因升級而進入遊戲內部。
- 升級過程不得修改使用者的原始媒體檔。

### 每次升格式版本的必備項目

1. 一份舊格式的樣本資料（`tests/` 下的 fixture），涵蓋共用值、專案私有覆寫與未知欄位。
2. 升級鏈測試：從每個舊版本一路升到最新、重複升級結果相同、未知欄位保留。
3. 失敗與取消測試：原檔與 `.bak` 保持，原始媒體檔不變。
4. 「較新版本資料」的唯讀行為測試。
5. 更新本頁欄位說明，並在 [CHANGELOG](../CHANGELOG.md) 註明這版改了格式。
6. 這批改動屬資料寫入／遷移，提交前走獨立代理審查（見 [CLAUDE](../CLAUDE.md)）。
