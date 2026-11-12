# 外部資料預覽與匯入

> 最後確認：2026-11-12（R-297、R-300～R-302、R-296、R-311、R-283、R-284、R-292）。從網站補充資料夾資訊的現行規則。程式：`shared/sources.ts`、`electron/metadata.ts`、`electron/metadata-public.ts`、`electron/sources/`、`src/metadata/FolderSourceImport.tsx`、`electron/explorer-source.ts`；測試：`tests/metadata.test.ts`、`tests/date-fields.test.ts`。

已接入的來源以 `shared/sources.ts` 為準（目前：E-Hentai、ExHentai、Hitomi.la、Bangumi、AniList、DLsite、Steam、VNDB、MusicBrainz、Open Library、Pixiv、Wikimedia Commons）。此頁持有來源流程與人工值保護；程式入口：[metadata](../electron/metadata.ts)、[Explorer](../electron/explorer.ts) 的 metadataPreview／applyMetadata。

## 目前能力

手動貼精確畫廊 URL → 驗證／取得公開 gdata → 預覽 → 選欄位與封面 → 明確套用至資料夾 → 保存可攜資料並更新畫面。來源欄位使用獨立 ID／來源 URL；人工欄位不混成同一值，遇既有 ID 的來源衝突拒絕。封面需要保存時複製受管資產，不能只依賴網路 URL。

保留標題、原語言標題、標籤等原語意；posted 是畫廊上傳時間，不當作品發行日。固定回應的測試證據不代表真實網站／帳號／收藏已驗收。

### E-Hentai／ExHentai 標籤與姊妹站

- 兩站視為同一來源：匯入一律寫入 `eh-` 欄位（來源網址仍記錄實際網站）；先前存在 `exh-` 的欄位在下次匯入時由 `eh-` 接手並移除舊欄位。
- 標籤是 `命名空間:名稱`。除完整的 `TAGS` 外，每個命名空間另成一個標籤欄位（`LANGUAGE`、`PARODY`、`CHARACTER`、`ARTIST`、`GROUP`、`COSPLAYER`、`FEMALE`、`MALE`、`MIXED`、`OTHER`、`RECLASS`），值不含命名空間前綴；沒有該命名空間的標籤就不產生欄位。未知命名空間只留在 `TAGS`。
- 取得範圍與公開頁面相同（公開 API；未登入、不讀網頁），登入後才看得到的標籤不會取得。

- **只貼網址**：資料夾設定的「資料」分頁上方的「從網站補充資訊」不再先選來源；由網址網域自動辨識（純數字視為 Steam App ID），辨識成功才可按「取得預覽」，未知網址就地顯示錯誤。不依分類限制來源。

## Steam

接受官方商店 App 網址或 App ID，預覽名稱、開發商、發行商、類型、簡介、商店日期及選用封面；匯入使用 steam- 命名空間，與 E-Hentai／人工值分開。日期保留 Steam 商店原文，不推定為作品首次發行日或購買日。

目前使用 [Steam 商店公開資料端點](https://store.steampowered.com/api/appdetails?appids=620&l=english)，不宣稱是有相容承諾的 Steamworks API。main 固定請求主機／路徑、限制大小／逾時／重新導向並驗證 App ID；封面只允許指定官方 CDN 與同 App 路徑，失敗可略過。不需要使用者交出帳號憑證。

<a id="分類來源"></a>

<a id="分類來源2026-10-28"></a>

## 分類來源

已接入下列不需要 API 憑證的來源（需要金鑰的見 R-285 起），選單依種類分組，並標示適合目前專案分類的網站。以精確作品網址預覽，不搜尋、模糊配對、合併跨站作品或下載作品內容。來源註冊在 shared/sources.ts；固定端點與映射：E-Hentai、Steam 在 electron/metadata.ts；其他網站一站一個轉接器在 electron/sources/，每站允許的請求主機、封面主機、是否帶 Referer 與 User-Agent（`Morph/<版本> (M:orph; …)`，產品名稱不能含冒號）集中在 electron/sources/config.ts，請求主機不在名單內就不送出；共用請求流程在 electron/metadata-public.ts，回應大小限制與錯誤分類在 electron/metadata-common.ts。新增網站時加一個轉接器檔與一筆設定。

| 選單分類 | 來源 | 讀取方式與限制 |
| --- | --- | --- |
| 漫畫／動畫 | E-Hentai、ExHentai、Hitomi.la、Bangumi、AniList、MangaDex、Kitsu、MangaUpdates | MangaDex 讀 `/manga/<UUID>`，封面另由 `cover_art` 組成 `uploads.mangadex.org` 網址；Kitsu 的 API 只接受 `Accept: application/vnd.api+json`，類型在 `included`；MangaUpdates 網址是 base36，換成數字 ID 查 API。E-H 系列沿用 [gdata](https://ehwiki.org/wiki/API)，封面縮圖在 `ehgt.org`（JPG、PNG 或 WebP）；Hitomi 僅解析公開 galleryinfo JSON，絕不執行遠端 JS；[Bangumi](https://bangumi.github.io/api/)／[AniList](https://docs.anilist.co/guide/auth/) 讀公開作品條目 |
| 同人／商店 | DLsite、BOOTH | BOOTH 讀商品頁旁的 `<商品>.json`（社團、分類、標籤、價格、成人標記），封面限 `booth.pximg.net`。DLsite：商品頁的作品 ID（RJ 等）。先讀 `/{站}/api/=/product.json?workno=` 取名稱：社團 `MAKER_NAME`、作品類型名稱、系列、ジャンル（`GENRES`）、作者依職位各成一個標籤欄位（`CREATED_BY`、`SCENARIO_BY`、`ILLUST_BY`、`VOICE_BY`、`MUSIC_BY`…，鍵名照來源）；再讀 `product/info/ajax` 補價格、下載數、評分，這個請求失敗不影響匯入。封面限 `img.dlsite.jp` |
| 遊戲 | Steam、VNDB | Steam 商店公開資料；[VNDB Kana](https://api.vndb.org/kana) 的公開視覺小說條目 |
| 音樂 | MusicBrainz、Apple Music、Deezer | [公開發行版本資料](https://musicbrainz.org/doc/MusicBrainz_API)，不因此加入音樂播放器；Apple Music 用 iTunes Lookup（專輯＋曲目，封面換成 600×600）；Deezer 讀公開專輯 API |
| 書籍 | Open Library、Google Books、小説家になろう、カクヨム | [公開書目與作者](https://openlibrary.org/developers/api)，作者補讀最多三筆；Google Books 讀 `volumes/<ID>`（不填金鑰時共用匿名額度，常遇到 429，金鑰見 R-285）；なろう用官方小說 API（R18 的 novel18 走 `novel18api`）；カクヨム讀作品頁內嵌的 Next.js 資料，不執行頁面程式 |
| 網頁 | 其他任何 HTTPS 網址（R-283） | 只讀頁面自己宣告的 JSON-LD、OpenGraph／Twitter、`<title>`：標題、簡介、作者、日期、關鍵字、網站名稱與封面。只接受不含帳號密碼的 HTTPS、不允許本機與內網位址（轉址也逐次檢查，最多三次）、2 MB、15 秒；依標頭或 `<meta charset>` 解碼（含 Shift_JIS、EUC-JP）；以只往前的掃描讀標籤，不執行頁面程式。封面主機無法事先列名單，一律經圖片網址匯入的安全下載（HTTPS、非內網、大小與影像格式檢查）。 |
| 圖片／插畫 | Pixiv、Wikimedia Commons、Danbooru | Pixiv 公開作品回應（插畫 `/artworks/<ID>` 與小說 `/novel/show.php?id=`）；Danbooru 讀 `posts/<ID>.json`，標籤依作者／原作／角色／一般分欄，分級存進年齡分級；[Commons API](https://commons.wikimedia.org/wiki/Commons:API/MediaWiki) 保留作者及授權，不推論私人照片身分 |

接入規則（[C-134](DECISIONS.md#c-134網站來源改為可用使用者金鑰與有條件解析網頁2026-11-12)）：

- **使用者自備金鑰**：需要 API 憑證的網站只在使用者於應用程式設定填入自己的金鑰後啟用；金鑰只存本機並加密、只有 main 讀取，不寫進可攜記錄或專案。不內建任何金鑰；沒填金鑰時就地提示並連到設定。
- **網頁解析**：沒有 API 的網站可讀商品頁 HTML，只在使用者按下時請求一次；不執行遠端 JS、不開隱藏瀏覽器視窗；依序讀 JSON-LD、內嵌資料、OpenGraph，最後才用選擇器；依網頁宣告的編碼解碼。遵守 robots.txt 與網站條款，不繞過機器人防護。
- **年齡確認**：只有使用者對該網站明確勾選「我已成年」後才帶年齡確認 Cookie；不收集或保存登入 Cookie。

ExHentai、Hitomi、Pixiv、DLsite 可能因登入、站方限制或公開回應變更而失敗；失敗保留原資料並顯示原因。公開端點不等於官方提供長期相容承諾，Hitomi、Pixiv、DLsite 的內部端點尤其如此。

失敗原因分四種，各是一句固定訊息（五種語系）：

| 類型 | 判定 | 使用者看到 |
| --- | --- | --- |
| 連不上 | 網域解析失敗、連線被拒、逾時、重新導向、HTTP 5xx／429 等 | 無法連線到來源網站；網站可能暫時無法使用或已更換網址 |
| 找不到作品 | HTTP 404／410，或回應裡沒有這個 ID（含身分不符） | 來源找不到這個作品；請確認網址或 ID 是否正確 |
| 需要權限 | HTTP 401／403，或來源明確回報需要登入（Pixiv `error`） | 來源需要金鑰、登入或成人內容權限才能取得這個作品 |
| 格式變更 | 回應不是預期的 JSON／galleryinfo，或缺少標題 | 來源資料格式已變更，無法解析；未執行遠端程式 |

Hitomi 的作品資料主機是 `ltn.gold-usergeneratedcontent.net`（2026-11 起取代已沒有 DNS 記錄的 `ltn.hitomi.la`）；這個主機名稱可能再換，Hitomi 出現「連不上」時先查主機是否搬家。

## 預覽、套用與追溯

- main 驗證精確主機及作品 ID，請求固定 API 端點，限制回應大小、逾時與重新導向；封面限白名單 HTTPS 主機及支援的影像簽名，取得失敗仍可預覽欄位。
- 預覽顯示候選值與已存在的來源值；預設只填空值，0／false 視為有值。明確勾選「覆寫已填來源欄位」才取代既有來源值，人工欄位分開保留。曾手動修改的來源欄位不會被來源再次覆寫：只填空值時跳過該欄位、其他欄位照填；勾選覆寫時整批拒絕並說明衝突。
- 屬性仍以來源前綴分開保存，可選 sourceRecord 記錄 provider、原網址與 fetchedAt；手動編輯會移除此擷取註記。schemaVersion 維持 1，不自動遷移收藏，也不把同名欄位視為相同身分。
- 日期存成日期：E-Hentai 的圖庫公開時間存成「日期時間」（換算成本機時間），各來源的發售日（Steam 的 `12 Nov, 2020`、`2020/11/12`、`2020年11月12日`、英文月份等）存成來源寫的那一天 `YYYY-MM-DD`。只有年份、年月或「TBA」等讀不成完整日期的值照原樣存文字，不補日子。專案裡該欄位已是「文字」時，新匯入照文字存。日期仍是來源寫的語意，不改稱首次發行日。封面寫入沿用可攜資產及原子保存；保存失敗移除本次新增的封面，保留原值及原資產。預設重複補空不重複加入同來源封面。
- 受控驗證入口：tests/metadata.test.ts、tests/decided-media.test.ts。涵蓋固定回應、無憑證、錯誤／過大／惡意主機、作品 ID、遠端 JS 不執行、預覽不寫入、填空／覆寫／人工保護與封面回滾。登入資料與實際收藏未執行驗證，不能由固定回應測試宣稱全部實站可用；實站是否還能用，由 `pnpm check:sources`（`scripts/check-sources.ts`）對每個來源請求一個已知作品，列出成功或上面的錯誤類型，只在手動或發布前執行。

## 不變限制與目標

- 外部資料提供候選，不替使用者決定作品身分；不以資料夾名稱直接認定作品。不自動批次模糊匹配或下載收藏。
- 來源 URL／ID 與語意應可追溯；來源資料隨資料夾攜帶。敏感憑證不進專案或可攜記錄，不把共用 secret 內建桌面應用。
- 再次匯入預設填空、預覽目前值並明確覆寫來源欄位，保護手填值；完整跨來源欄位映射、原始回應封存及批次匯入不在範圍內。
- 只有來源及使用方式明確可用時保存圖片；不能假設所有網站提供同樣 API、欄位或授權。來源 adapter 彼此隔離，不為加一站重寫整個資料模型。

## 未接入的來源

候選網站與各自需要的資料、特殊處理登記在 [需求清單](WORK_ITEMS.md#已登記未核定) R-283～R-293；接入前再驗證官方能力、條款與限流。以下網站不接入：

| 網站 | 原因 |
| --- | --- |
| IMDb | 沒有公開 API、條款禁止抓取；以 OMDb 的 tt 編號間接對應 |
| Twitter／X | API 需付費 |
| Fanbox、Fantia | 只能用登入 Cookie 取得 |
| AO3 | 對程式請求一律回 418「暫時拒絕」（2026-11-12 實測），屬擋機器人保護，不繞過 |
| VGMdb | 回 Cloudflare 驗證頁（2026-11-12 實測），不繞過 |
| itch.io | API 只能查自己的作品 |

沿用精確作品網址 → 預覽 → 確認套用；同人動畫可優先查原販售頁，一般動畫／漫畫搭配作品資料庫。保留來源命名空間，區分原版／漢化版、單行本／單話及本體／DLC；不依同名自動合併、覆寫人工資料或下載作品內容。

首次發行日、平台／版本日期與購買日分開。批次／CSV 對照、名稱候選人工審核、galleryinfo.txt／本地線索擷取是候選，尚未自動納入現行流程。批次若選入需可暫停、分別報成功／模糊／失敗，不能繞過寫入安全。

原 Steam／IGDB／E-Hentai 研究、SourceRecord 提案與完整例子見 [原稿](history/agent-docs-before-cleanup.md#metadata-enrichment)，不是現行能力或每輪必讀。新增來源前再驗證官方能力與要求，不依賴歷史研究推斷現況。
