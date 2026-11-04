# 外部資料預覽與匯入

目前已實作來源為漫畫的 **E-Hentai** 與遊戲的 **Steam**。2026-10-28 使用者另指定新增 **ExHentai** 與 **Hitomi.la**，兩者尚未實作。此頁持有來源流程與人工值保護；程式入口：[metadata](../electron/metadata.ts)、[Explorer](../electron/explorer.ts) 的 metadataPreview／applyMetadata。

## 目前能力

手動貼精確畫廊 URL → 驗證／取得公開 gdata → 預覽 → 選欄位與封面 → 明確套用至資料夾 → 保存可攜資料並更新畫面。來源欄位使用獨立 ID／來源 URL；人工欄位不混成同一值，遇既有 ID 的來源衝突拒絕。封面需要保存時複製受管資產，不能只依賴網路 URL。

保留標題、原語言標題、標籤等原語意；posted 是畫廊上傳時間，不當作品發行日。固定回應的測試證據不代表真實網站／帳號／收藏已驗收。

### E-Hentai／ExHentai 標籤與姊妹站

- 兩站視為同一來源：匯入一律寫入 `eh-` 欄位（來源網址仍記錄實際網站）；先前存在 `exh-` 的欄位在下次匯入時由 `eh-` 接手並移除舊欄位。
- 標籤是 `命名空間:名稱`。除完整的 `TAGS` 外，每個命名空間另成一個標籤欄位（`LANGUAGE`、`PARODY`、`CHARACTER`、`ARTIST`、`GROUP`、`COSPLAYER`、`FEMALE`、`MALE`、`MIXED`、`OTHER`、`RECLASS`），值不含命名空間前綴；沒有該命名空間的標籤就不產生欄位。未知命名空間只留在 `TAGS`。
- 取得範圍與公開頁面相同（公開 API；未登入、不讀網頁），登入後才看得到的標籤不會取得。

- **只貼網址（0.34.0）**：資料夾設定的「資料」分頁上方的「從網站補充資訊」（原獨立的「來源匯入」分頁，2026-11-03 併入）不再先選來源；由網址網域自動辨識（純數字視為 Steam App ID），辨識成功才可按「取得預覽」，未知網址就地顯示錯誤。不依分類限制來源。

## Steam

接受官方商店 App 網址或 App ID，預覽名稱、開發商、發行商、類型、簡介、商店日期及選用封面；匯入使用 steam- 命名空間，與 E-Hentai／人工值分開。日期保留 Steam 商店原文，不推定為作品首次發行日或購買日。

目前使用 [Steam 商店公開資料端點](https://store.steampowered.com/api/appdetails?appids=620&l=english)，不宣稱是有相容承諾的 Steamworks API。main 固定請求主機／路徑、限制大小／逾時／重新導向並驗證 App ID；封面只允許指定官方 CDN 與同 App 路徑，失敗可略過。不需要使用者交出帳號憑證。

<a id="分類來源"></a>

<a id="分類來源2026-10-28"></a>

## 分類來源

使用者已核定加入下列不需要 API 憑證的來源，選單依種類分組，並標示適合目前專案分類的網站。以精確作品網址預覽，不搜尋、模糊配對、合併跨站作品或下載作品內容。來源註冊在 shared/sources.ts；固定端點與映射在 electron/metadata.ts、electron/metadata-public.ts。

| 選單分類 | 來源 | 讀取方式與限制 |
| --- | --- | --- |
| 漫畫／動畫 | E-Hentai、ExHentai、Hitomi.la、Bangumi、AniList | E-H 系列沿用 [gdata](https://ehwiki.org/wiki/API)；Hitomi 僅解析公開 galleryinfo JSON，絕不執行遠端 JS；[Bangumi](https://bangumi.github.io/api/)／[AniList](https://docs.anilist.co/guide/auth/) 讀公開作品條目 |
| 遊戲 | Steam、VNDB | Steam 商店公開資料；[VNDB Kana](https://api.vndb.org/kana) 的公開視覺小說條目 |
| 音樂 | MusicBrainz | [公開發行版本資料](https://musicbrainz.org/doc/MusicBrainz_API)，不因此加入音樂播放器 |
| 書籍 | Open Library | [公開書目與作者](https://openlibrary.org/developers/api)，作者補讀最多三筆 |
| 圖片／插畫 | Pixiv、Wikimedia Commons | Pixiv 公開作品回應；[Commons API](https://commons.wikimedia.org/wiki/Commons:API/MediaWiki) 保留作者及授權，不推論私人照片身分 |

IGDB、TMDB 需要 API 憑證，本輪依使用者要求排除。沒有內建 key、登入／Cookie 收集或存取限制繞過。ExHentai、Hitomi、Pixiv 可能因登入、站方限制或公開回應變更而失敗；失敗保留原資料並顯示原因。公開端點不等於官方提供長期相容承諾，Hitomi／Pixiv 的內部端點尤其如此。

## 預覽、套用與追溯

- main 驗證精確主機及作品 ID，請求固定 API 端點，限制回應大小、逾時與重新導向；封面限白名單 HTTPS 主機及支援的影像簽名，取得失敗仍可預覽欄位。
- 預覽顯示候選值與已存在的來源值；預設只填空值，0／false 視為有值。明確勾選「覆寫已填來源欄位」才取代既有來源值，人工欄位分開保留。曾手動修改的來源欄位拒絕被來源再次覆寫。
- 屬性仍以來源前綴分開保存，可選 sourceRecord 記錄 provider、原網址與 fetchedAt；手動編輯會移除此擷取註記。schemaVersion 維持 1，不自動遷移收藏，也不把同名欄位視為相同身分。
- 來源日期保留原語意與顯示內容，不硬轉成首次發行日。封面寫入沿用可攜資產及原子保存；保存失敗移除本次新增的封面，保留原值及原資產。預設重複補空不重複加入同來源封面。
- 受控驗證入口：tests/metadata.test.ts、tests/decided-media.test.ts。涵蓋固定回應、無憑證、錯誤／過大／惡意主機、作品 ID、遠端 JS 不執行、預覽不寫入、填空／覆寫／人工保護與封面回滾。真實網站、登入資料與實際收藏未執行驗證，不能由固定回應測試宣稱全部實站可用。

## 不變限制與目標

- 外部資料提供候選，不替使用者決定作品身分；不以資料夾名稱直接認定作品。不自動批次模糊匹配或下載收藏。
- 來源 URL／ID 與語意應可追溯；來源資料隨資料夾攜帶。敏感憑證不進專案或可攜記錄，不把共用 secret 內建桌面應用。
- 再次匯入預設填空、預覽目前值並明確覆寫來源欄位，保護手填值；完整跨來源欄位映射、原始回應封存及批次匯入仍不在本輪範圍。
- 只有來源及使用方式明確可用時保存圖片；不能假設所有網站提供同樣 API、欄位或授權。來源 adapter 彼此隔離，不為加一站重寫整個資料模型。

## 後續候選

日本同人收藏新增來源候選，先研究可行性再接入；不代表下列商店已有 adapter 或穩定公開 API：

| 優先順序 | 來源 | 適用範圍與研究重點 |
| --- | --- | --- |
| 1 | 既有 VNDB、Bangumi、AniList | 先確認現有來源適用性；VNDB 著重視覺小說，Bangumi／AniList 補動畫、漫畫等作品資訊，不宣稱涵蓋全部同人作品 |
| 2 | [DLsite](https://www.dlsite.com/home/) | **已接入（2026-11-01）**：使用者貼上精確作品網址，main 讀取 DLsite 未文件化的公開 /product/info/ajax JSON（robots.txt 未禁止，每次僅一次使用者觸發的請求，不帶 Cookie、不繞過年齡確認）；取得標題、社團代碼、作品類型、發售日、年齡分級、價格、下載數與評分，封面限 img.dlsite.jp。端點無官方文件，欄位可能變動，失敗只顯示錯誤、不改原資料。**FANZA 已移除**（官方 API 需 API ID／affiliate ID，與免憑證限制衝突） |
| 3 | [BOOTH](https://booth.pm/)、[Melonbooks](https://www.melonbooks.co.jp/)、[虎之穴](https://ec.toranoana.jp/tora_r/ec)（2026-11-01 使用者決定不接入） | **本輪未接入**：BOOTH 的 JSON 端點無法於此環境驗證（測試商品回 404），待取得真實商品網址再查；Melonbooks 無 robots.txt 且需年齡確認 Cookie 才能取得商品頁，虎之穴只有 HTML，兩者皆無公開 API，不以程式送出年齡確認或解析 HTML，維持不接入直到條款與官方能力確認 |

沿用精確作品網址 → 預覽 → 確認套用；同人動畫可優先查原販售頁，一般動畫／漫畫搭配作品資料庫。保留來源命名空間，區分原版／漢化版、單行本／單話及本體／DLC；不依同名自動合併、覆寫人工資料或下載作品內容。進度只記於 [S16](WORK_ITEMS.md#已交付)。

新增來源依上方分類清單；需要憑證的網站保留在未啟用範圍。首次發行日、平台／版本日期與購買日分開。批次／CSV 對照、名稱候選人工審核、galleryinfo.txt／本地線索擷取是候選，尚未自動納入現行流程。批次若選入需可暫停、分別報成功／模糊／失敗，不能繞過寫入安全。

原 Steam／IGDB／E-Hentai 研究、SourceRecord 提案與完整例子見 [原稿](history/agent-docs-before-cleanup.md#metadata-enrichment)，不是現行能力或每輪必讀。新增來源前再驗證官方能力與要求，不依賴歷史研究推斷現況。
