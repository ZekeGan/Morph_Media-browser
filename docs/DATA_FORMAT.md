# 資料格式參考

M:orph 的資料以**可攜的 JSON 記錄**為準，SQLite 搜尋索引只是可重建的副本。此頁列出各檔案的位置與欄位，讓其他工具或貢獻者能讀懂；設計理由見 [資料模型](FOLDER_PROJECT_MODEL.md) 與 [儲存安全](STORAGE_OPTIONS.md)，型別定義的原始碼是 [shared/model.ts](../shared/model.ts)、[shared/explorer.ts](../shared/explorer.ts)、[shared/workspace.ts](../shared/workspace.ts)，驗證在同檔的 `validate*` 函式。

> 欄位以現行程式為準；`schemaVersion` 與應用程式版本號無關，目前都是 `1`。

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
- `targets`：遊戲動作目標 `{ <actionId>: { kind: 'exe' | 'folder' | 'file-app' | 'url' | 'shortcut', path, relative, args } }`；`shortcut` 只能是遊戲資料夾內最上層的 `.lnk`／`.url` 檔名。
- `hiddenActions`：這個遊戲不在按鈕列顯示的動作 id。
- `cellImages`：圖片組件各自選定的資產；`bannerAssetId`：封面資產。
- `reading`、`playback`、`subtitles`：漫畫閱讀偏好、影片續播進度與字幕設定。

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
| `mediaCategory` | `media`、`manga`、`game`（舊分類 `album`、`video`、`music`、`other` 仍可讀取） |
| `depth` | `{ mode: 'through' | 'exact', level }` 掃描層級 |
| `fieldBindings` | 專案的欄位清單：`{ alias, attributeId, type, options?, optionColors? }` |
| `cells` | 預設卡片版面：組件陣列，見下 |
| `layoutPresets`、`activeLayoutId`、`folderLayouts` | 多個命名版面、目前使用的版面、各資料夾指定的版面 |
| `contentCells` | 依內容類型的右側版面 |
| `actionTemplates` | 遊戲動作版型 `{ id, label, kind, color }` |
| `list`、`cardView`、`excludedRelativePaths`、`scanAll`、`traversal` | 列表、顯示範圍、排除與掃描設定 |
| `savedSearches` | 儲存的搜尋 |

**組件 `Cell`**：`cellId`、`kind`（`name`、`path`、`field-text`、`field-tags`、`field-number`、`field-date`、`field-boolean`、`field-enum`、`field-url`、`field-date-only`、`static-text`、`spacer`、`system-info`、`image`、`divider`、`open-folder`、`game-cover`、`game-launch`）、`grid`（12 欄、最多 100 列，組件不能重疊）、`style`，以及依型別的選用欄位：`attributeId`、`fallbackIds`（備用欄位，最多 5 個、同型別）、`condition`（顯示條件）、`wrap`／`scroll`、`unit`／`decimals`／`maximum`、`presentation`、`imageFit`、`imageIndex`、`actionId`／`fallbackActionIds`、`tagColors`／`tagPrefix`。完整樣式欄位見 [CELL 目錄](CELL_CATALOG.md#組件樣式2026-11-02-新增)。

## 設定包

`kind: "media-viewer.settings"`、`schemaVersion: 1`、`exportedAt`、`prefs`（群組、收藏與專案排序、主題、語言、偏好；不含媒體路徑與登入資料）。匯入前先預覽差異並備份目前設定。

## 讀寫與相容規則

- **驗證**：讀取時逐欄驗證，不合法的記錄不會被採用，也不會被默默改寫。
- **原子寫入與備份**：先寫暫存檔，再取代原檔，並保留 `.bak`；損毀時只在身分相符時用備份復原。
- **版本衝突**：`revision` 不符的寫入一律拒絕，保留使用者草稿。
- **未知資料保留**：程式不認得的檔案與資料夾不會被清理；清理只移除 M:orph 自己建立的受管資料，並先預覽。
- **遊戲保護**：遊戲根目錄可以有自己的記錄，內部不建立記錄、不修改原始檔。
- **升級**：目前只有 `schemaVersion: 1`。日後改版會讀得懂舊版並明確遷移（遷移前備份、失敗可復原），不會靜默改格式。
