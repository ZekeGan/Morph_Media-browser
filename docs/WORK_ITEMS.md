# 需求清單

只放還沒結束的需求；完成並查收的需求刪除（內容在 [CHANGELOG](../CHANGELOG.md) 與 git 歷史）。核定規則由規格持有，按 [任務索引](README.md#按任務定位) 選讀；流程規則在 [CLAUDE.md](../CLAUDE.md)。`pnpm status` 依本頁印出狀態區塊。

**格式**：`- **R-編號** 標題 ｜大小｜風險｜資料影響｜領域：id（見 [areas.json](areas.json)）｜依賴：R-…｜取代：…`，下一行縮排寫補充（可省略）。

- **大小**：小／中／大。
- **風險**：一般／資料寫入／安全邊界（後兩者提交前獨立審查，同批合併審一次）。
- **資料影響**：無／設定（專案或本機設定）／新增欄位（選用，不升格式；畫面查收前標「暫定」）／改結構（升格式，附升級步驟、舊格式樣本與測試，需核定）。
- **狀態**就是所在的章節；編號從 R-201 起，不與歷史 R／T／UI-R 提案混用。

## 待你決定

## 待查收

- **R-301** 真實網站健康檢查 `pnpm check:sources` ｜小｜一般｜無｜領域：metadata｜依賴：R-300
  驗收：執行 `pnpm check:sources`，12 個來源各列一行 OK（附欄位數、有無封面、標題）；`pnpm check:sources bangumi=https://bgm.tv/subject/999999999` 列出 FAIL notFound。RELEASING 的發布關卡多了這一步。

- **R-297** 修正：Hitomi.la 資料取不到 ｜小｜安全邊界｜無｜領域：metadata｜依賴：無
  驗收：資料夾設定 →「資料」→ 從網站補充資訊，貼一個 Hitomi 作品網址（如 `https://hitomi.la/reader/<ID>.html`）→ 取得預覽，看到標題與欄位。

- **R-300** 來源錯誤分類 ｜小｜安全邊界｜無｜領域：metadata｜依賴：無
  驗收：貼一個不存在的作品（如 `https://bgm.tv/subject/999999999`）→ 顯示「來源找不到這個作品…」；拔網路再取得預覽 → 顯示「無法連線到來源網站…」；切英文介面同樣是英文句子。
## 進行中

## 已核定（未做）

- **R-256** 條漫模式 ｜大｜一般｜設定｜領域：reader｜依賴：R-253（已完成）— 使用者 2026-11-12 核定
  第三種頁面模式（工具列 `[▯ | ▯▯ | ▥]`，快捷鍵 V；D 仍只切單／雙頁）。頁面上下連續捲動、無間隙；寬度滑桿 30%～100%（Ctrl＋滾輪也可調），取代寬高適應與縮放；隱藏上下頁、首張獨立、閱讀方向。頁碼依畫面中央的頁，方向鍵／空白鍵往下捲一個畫面高。前幾頁高度超過寬度約 2.5 倍時提示「這本看起來是條漫 [切換到條漫] [不用]」，只提示一次、不自動切換。頁面模式與寬度依每本記在 R-253 的本機閱讀紀錄，沒記過的沿用上次寬度。

- **R-299** 補遊戲引擎辨識規則（先用合成資料） ｜中｜一般｜無｜領域：detection｜依賴：無｜取代：R-211 — 使用者 2026-11-12 核定
  新增規則：SRPG Studio、HSP（Hot Soup Processor）、Flash（`.swf`＋Projector）、Pixel Game Maker MV、QLIE、Malie、Entis／Cotopha、Escude、ExHIBIT、Light.vn、Visual Novel Maker（目前被列為 NW.js 候選）、Java（`.jar`）、Majiro、FVP。辨識特徵先依公開資料整理，接入前逐一查證；每種引擎用合成資料夾做正例與反例測試（`tests/game-detection.test.ts`），在 [GAME_ENGINE_DETECTION](GAME_ENGINE_DETECTION.md#尚未涵蓋) 列為「只用合成資料夾驗證」，與既有候選同等級。使用者之後提供真實樣本時用 `pnpm detect` 對照，再轉為已驗證。特徵不夠可靠的引擎只列候選、不推定。

- **R-302** 網站轉接器拆檔 ｜中｜安全邊界｜無｜領域：metadata｜依賴：R-300 — 使用者 2026-11-12 核定
  `electron/metadata-public.ts` 的 switch 拆成一站一個檔案，加一份共用的來源設定：允許的請求主機、封面主機白名單、額外標頭、User-Agent（同時把舊的 `MediaViewer/0.9.0` 改成現行名稱與版號）。行為不變，既有測試照過。排在 R-284 等新增網站之前。

- **R-303** 半批次補充資訊 ｜中｜資料寫入｜無｜領域：metadata、panel｜依賴：R-302 — 使用者 2026-11-12 核定
  選好多個資料夾後，依序一個一個跳出網址欄：貼網址 → 預覽 → 確認或略過 → 下一個。每筆仍由使用者貼網址與確認，不自動比對；寫入沿用單筆的填空、覆寫與人工值保護規則。可中途停止，結束時列出完成、略過、失敗各幾筆。

- **R-304** 右鍵選單加「從網址補充資訊」 ｜小｜一般｜無｜領域：metadata、browse｜依賴：R-303 — 使用者 2026-11-12 核定
  資料夾右鍵直接打開補充資訊；選了多個資料夾時進入 R-303 的半批次流程。

遊戲操作（2026-11-12 討論；現有動作：EXE、資料夾、檔案、網址、`.lnk`，見 [GAME_VIEWER_DESIGN](GAME_VIEWER_DESIGN.md#操作編輯與目標)）：

- **R-305** 開啟存檔資料夾 ｜中｜安全邊界｜新增欄位（暫定）｜領域：game、detection｜依賴：R-299 — 使用者 2026-11-12 核定
  依引擎推算存檔位置：Unity 讀 `*_Data/app.info` 的公司與產品名 → `AppData\LocalLow\公司\產品`；Ren'Py → `AppData\Roaming\RenPy\…`；RPG Maker → 遊戲內的 `save`／`www/save`；其他引擎查證後再加。推算不出來或路徑不存在時，讓使用者自己指定資料夾，存在遊戲記錄（新欄位標暫定）。只開啟資料夾，不讀寫存檔；路徑只能由 main 推算或使用者選擇，renderer 不能指定任意路徑。

- **R-306** 自動找出附帶程式與說明書 ｜小｜一般｜無｜領域：game｜依賴：無 — 使用者 2026-11-12 核定
  在 ROOT 第一層找 `config.exe`、`setup.exe`、`環境設定*.exe`、`*config*.exe` 與說明書（PDF、HTML、`readme*`、`manual*`），在「遊戲操作」列成建議，點一下才加入成動作；不自動加入、不執行。排除 `unins*.exe`、`vcredist*`、`dxsetup*` 這類安裝或移除程式。

- **R-307** Steam 遊戲用 Steam 啟動 ｜小｜安全邊界｜無｜領域：game｜依賴：無 — 使用者 2026-11-12 核定
  偵測到 `steam_appid.txt`，或資料夾已有 Steam 來源的 App ID 時，提供「用 Steam 啟動」動作（`steam://run/<appid>`），讓疊加介面、成就與 DRM 正常運作。App ID 只接受數字；沒裝 Steam 時顯示原因。

- **R-308** 遊玩時間與最後遊玩 ｜中｜資料寫入｜設定｜領域：game、storage｜依賴：無 — 使用者 2026-11-12 核定
  只記從 M:orph 啟動的程序：開始時間、結束時間、累計時間、最後遊玩日期，存在本機紀錄（不寫進可攜記錄）。程序結束才算一次；M:orph 中途關閉就不計入那一次。只監看自己啟動的程序，不掃描其他程序。卡片組件與排序可用「最後遊玩」「遊玩時間」。

- **R-309** Locale Emulator 直接整合 ｜小｜安全邊界｜設定｜領域：game｜依賴：無 — 使用者 2026-11-12 核定
  設定裡指定 `LEProc.exe` 路徑；每個遊戲的 EXE 動作可勾選「用日文語系啟動」，執行 `LEProc.exe -run <exe>`。現有的 `.lnk` 做法保留。

- **R-310** 開啟商店頁 ｜小｜一般｜無｜領域：game、metadata｜依賴：無 — 使用者 2026-11-12 核定
  資料夾有來源網址（Steam、DLsite 等）時，自動提供「開啟商店頁」動作；用系統瀏覽器開啟，只開 https。

## 已登記（未核定）

- **R-311** 修正：E-Hentai 封面拿不到（WebP） ｜小｜安全邊界｜無｜領域：metadata｜依賴：無
  `pnpm check:sources` 實測（2026-11-12）：E-Hentai／ExHentai 的 `thumb` 現在是 `https://ehgt.org/w/…/….webp`，`ehMetadata` 的封面格式只認 JPG／PNG，所以預覽一律「封面縮圖無法取得」。改為也接受 WebP（與 metadata-public 的格式判斷一致），測試補 WebP 固定回應。

- **R-294** 修正：音樂資料夾在右側資料夾內容不顯示專輯封面 ｜小｜一般｜無｜領域：media、panel｜依賴：無
  使用者回報（2026-11-12）：音樂類型的資料夾在右側「資料夾內容」裡看不到專輯封面。右側這時顯示的是統一媒體頁（`MediaBrowser`）；規格的封面優先序是「指定封面 → 音訊內嵌封面 → 同資料夾 cover／folder／front／album 圖片 → 佔位」（[MEDIA_WORKSPACE](MEDIA_WORKSPACE.md#統一媒體工作區)）。先重現並確認是哪一層沒接上（右側沒有封面區塊、內嵌封面沒讀、或候選圖片被「音樂」篩選排除），再修。

- **R-295** 多選影片／音樂加入播放佇列 ｜中｜一般｜無｜領域：media、gallery｜依賴：無
  使用者希望能一次選多個影片或音樂加入佇列。規格已訂（[跨專案影音佇列](MEDIA_WORKSPACE.md#跨專案影音佇列與迷你播放器)）：Ctrl／Shift 點擊或 Shift＋方向鍵多選，右鍵「加入播放佇列」依列表順序追加、不打斷目前播放、允許重複。程式目前在大視窗的「目前資料夾」TAB 有多選，檔案列表只在挑選模式下能多選；先確認使用者遇到的是哪個畫面，補齊缺口。

- **R-296** DLsite 補上社團名稱、作者與ジャンル ｜小｜安全邊界｜無｜領域：metadata｜依賴：無
  使用者回報（2026-11-12）：DLsite 匯入沒有作者。原因：目前讀的 `/product/info/ajax` 只有銷售資料與社團代碼。改為另讀 `/{site}/api/=/product.json?workno={ID}`（2026-11-12 以 RJ01017217 查證：免登入、回傳一筆的陣列，robots.txt 未禁止，Crawl-delay 10）：社團 `maker_name`（另有 `maker_name_en`）；作者在 `creaters` 物件，依職位分組的 `{id, name}` 陣列（查證到 `created_by`、`voice_by`，其他職位鍵名待用其他類型作品確認），每個職位存成一個標籤欄位；ジャンル `genres[].name`；系列 `series_name`；作品類型名稱 `work_type_string`；封面 `image_main.url`（`img.dlsite.jp`）。新端點沒有下載數，兩個請求並用或捨棄下載數要在實作時決定；既有欄位 ID 不變。測試補固定回應（含沒有 `creaters` 的作品）。
  
- **R-281** 主程序訊息翻譯 ｜大｜一般｜無｜領域：appearance、core｜依賴：R-277
  主程序有 507 句訊息（壓縮檔、備份、檔案總覽、匯入、清理等的錯誤與通知）沒有翻譯鍵，英文、日文、西班牙文、簡中介面仍顯示繁中。固定句子補進 messages.json（每句四種譯文）；帶數值的句子改成「翻譯鍵＋數值」送到畫面再組合。可分領域分批做，每批讓 `scripts/i18n-baseline.json` 變少。

網站來源（[C-134](DECISIONS.md#c-134網站來源改為可用使用者金鑰與有條件解析網頁2026-11-12)）：下列網站需要的資料與特殊處理依 2026-11-12 討論時的認識，未上網查證；每站接入前先確認條款、限流與端點。標「？」的是較不確定的。

- **R-283** 網頁解析基礎＋通用網頁來源 ｜中｜安全邊界｜無｜領域：metadata｜依賴：無
  主程序加 HTML 解析器（不執行 JS）與編碼轉換（EUC-JP、Shift_JIS）；新增「任何網址」來源，只讀 JSON-LD 與 OpenGraph 的標題、簡介、封面（封面主機無法事先白名單，需另定限制：只限 HTTPS、大小、影像簽名）。順便把請求的 User-Agent 從舊的 `MediaViewer/0.9.0` 改成現行名稱與版號。

- **R-284** 免金鑰 API 來源第一批 ｜大｜安全邊界｜無｜領域：metadata｜依賴：無
  可每站一小段轉接器，依需要拆批：
  - MangaDex（漫畫）：作品 ID 是 UUID；封面要另查 `cover_art` 再組網址；限流嚴。
  - Kitsu（動畫、漫畫）：JSON:API 格式，資料在 `included` 要另外組合。
  - MangaUpdates（漫畫、韓漫）：網址 ID 是 base36，API 要數字 ID，需轉換。
  - 小説家になろう（小說）：官方 API 用 ncode 查；R18（ノクターン等）走另一網域。可配合 R-282。
  - Pixiv 小說：沿用現有 Pixiv 做法，多一個 `/novel/` 路徑。
  - Apple Music（iTunes Lookup）、Deezer（音樂）：公開查詢，直接用。
  - Danbooru（插畫）：可選填帳號＋金鑰提高限額；有分級欄位；可能被 Cloudflare 擋。
  - Google Books（書籍）：金鑰選填（不填額度較少）。

- **R-285** 使用者自備金鑰＋TMDB ｜大｜安全邊界｜設定｜領域：metadata、appearance｜依賴：無
  應用程式設定新增「網站金鑰」分頁：每站一列（名稱、用途、輸入框遮罩＋顯示切換、狀態「可用／無法驗證／未設定」、測試、清除、「怎麼申請」連到使用說明）；金鑰用 Electron 內建的 safeStorage 加密存本機，只有 main 讀取。資料夾設定貼了需要金鑰的網址時，就地提示並「前往設定」跳到該列；金鑰失效同樣提示。以 TMDB（API Key 或 Read Access Token）驗證整套流程：圖片在 `image.tmdb.org` 需指定尺寸，條款要求標示資料來自 TMDB，限非商業用途。使用說明補各站申請步驟。分頁名稱待定（網站金鑰／外部服務／連線）。

- **R-286** 一般金鑰來源 ｜大｜安全邊界｜無｜領域：metadata｜依賴：R-285
  - MyAnimeList（動畫、漫畫）：Client ID，放請求標頭 `X-MAL-CLIENT-ID`。
  - OMDb（電影）：API Key（Email 啟用），免費每天 1000 次；可用 IMDb tt 編號查詢，間接支援 IMDb 網址。
  - Trakt（影集、電影）：Client ID；沒有圖片，封面要再向 TMDB 取。
  - RAWG（遊戲）：API Key；條款要求標示來源並附回連結。
  - Giant Bomb（遊戲）、Comic Vine（美漫）：API Key；須帶自訂 User-Agent；限流以小時計。
  - SteamGridDB（遊戲封面、橫幅、Logo）：API Key；只有圖片，可與 Steam App ID 搭配。
  - Last.fm（音樂）：API Key；封面品質不一。
  - Discogs（音樂）：個人權杖選填；不登入可讀資料，但圖片要帶權杖才拿得到。
  - Bangumi（已接入，加選填權杖）：使用者在 Bangumi 產生個人存取權杖，以 `Authorization: Bearer` 送出，才能讀成人（NSFW）作品；未登入時這類作品可能直接回 404（2026-11-12 一般作品實測正常，成人作品未實測）。沒填權杖時，404 提示改為「找不到作品，或是需要權杖的成人作品」並連到設定。

- **R-287** IGDB ｜中｜安全邊界｜設定｜領域：metadata｜依賴：R-285
  使用者準備 Twitch Client ID＋Secret（Twitch 帳號須開兩步驟驗證）。程式要換存取權杖並在約 60 天過期時自動更新；查詢語法是 Apicalypse（POST）；每秒最多 4 次；網址是 slug，要先查出 ID；圖片在 `images.igdb.com`。

- **R-288** TheTVDB ｜中｜安全邊界｜設定｜領域：metadata｜依賴：R-285
  API Key（＋訂閱 PIN？）；先登入換權杖，約一個月過期。

- **R-289** FANZA（DMM） ｜中｜安全邊界｜設定｜領域：metadata｜依賴：R-285
  使用者要先註冊 DMM 聯盟行銷取得 API ID＋Affiliate ID，門檻最高；條款要求顯示 Credit；FANZA／DMM 兩種站點與多個樓層，網址對應較複雜。

- **R-290** AniDB ｜中｜安全邊界｜設定｜領域：metadata｜依賴：R-285
  要由開發者先登記用戶端名稱＋版本（不是使用者金鑰）；約 2 秒一次的嚴格限流，違反會封 IP；回應是 gzip 壓縮的 XML；規定要快取，不重複查同一部。

- **R-291** 待查證的金鑰來源 ｜小｜一般｜無｜領域：metadata｜依賴：R-285
  只做研究，結果決定是否另登記：Spotify（Client ID＋Secret、權杖每小時過期，新應用權限收緊、條款可能限制儲存？）、Gelbooru（可能改為必須帳號 ID＋金鑰？）、DeviantArt（OAuth 用戶端憑證）、MobyGames（API 可能改為付費？）。

- **R-292** 網頁來源（不需年齡確認） ｜大｜安全邊界｜無｜領域：metadata｜依賴：R-283
  - VGMdb（遊戲、同人音樂）：頁面結構穩定。
  - 批評空間（galgame）：遊戲頁是純 HTML，結構多年未變。
  - カクヨム（小說）：頁面內嵌作品資料 JSON。
  - AO3（小說）：成人作品要帶 `view_adult=true`。
  - BOOTH（同人商店）：商品頁有 OpenGraph，可能另有 JSON 端點（之前驗證回 404）。

- **R-293** 網頁來源（需年齡確認） ｜中｜安全邊界｜設定｜領域：metadata、appearance｜依賴：R-283
  每站在設定提供「我已成年」勾選，勾選後才帶年齡確認 Cookie。Getchu（EUC-JP 編碼）、Melonbooks、虎之穴（改版較頻繁）。

## 擱置

- **R-282** 小說閱讀器 ｜大｜一般｜設定（若新增「小說」分類則為改結構）｜領域：reader、documents、detection、metadata｜依賴：R-253 — v1 之後再做（使用者 2026-11-12 預告）
  閱讀 TXT／EPUB 等文字作品：分頁或捲動排版、字型與字級、直排／橫排、閱讀進度記在本機閱讀紀錄。開工前要決定：是否新增「小說」分類（會動資料結構與偵測規則）、支援哪些格式、網站資料來源是否同批補（例如小說投稿站或書籍資料庫）。

- **R-243** 拆分 App／BrowseWorkspace 的狀態 ｜中｜一般｜無｜領域：browse、notices｜依賴：無
  App 有 27 個 useState，BrowseWorkspace 有 18 個 useEffect。使用者不再規劃大功能，原定「隨下一個大改需求一起做」的時機不會出現；程式運作正常，只在修改時有成本，擱置（2026-11-11）。
- **R-220** 讓程式能在 Mac 上執行（不含 Mac 遊戲啟動，見 C-130）｜大｜安全邊界｜無｜領域：core、files、storage — 使用者決定擱置（2026-11-10）
  ①已完成（2026-11-05）：macOS 上型別檢查與全部資料測試通過（只有 2 個本來就只屬 Windows 的測試跳過：隱藏屬性批次、寫入權限 ACL）；隱藏屬性在 Mac 不執行，`.media-viewer` 以點開頭本來就隱藏；路徑比較只在 Windows 不分大小寫（Mac 的 APFS 預設也不分，之後要留意）。下一步建議：CI 在 macOS 跑 UI smoke，看視窗、標題列按鈕與側鍵導覽。其餘步驟：②處理 Windows 專屬處：`process.platform` 判斷 6 處、隱藏屬性（`attrib`）、在檔案總管開啟、`.lnk` 捷徑與 Locale Emulator、以 EXE 為主的遊戲辨識；③electron-builder 產出 `.dmg`（未簽章會被 Gatekeeper 擋，正式簽章與公證需 Apple 開發者帳號）；④需要實機 Mac 查收。

## 發行前關卡

- **R-I18N 語系關卡**（每次發行必做）：自動檢查每次提交都跑；發行時只做英日文抽查本版新畫面，見 [執行關卡](IMPLEMENTATION.md#發行前文案與語系關卡)。母語審閱與授權審閱已於 2026-11-05 完成。

## 已知限制（不是需求）

每條行尾標「（領域：id｜確認：日期）」；該領域程式改動後 `pnpm stale` 會點名重看，首包大小由它和最近一次建置比對。

- 卡片上沒有直接編輯；編輯在資料夾設定，每個欄位各自寫入。（領域：cells、panel｜確認：2026-11-12）
- 窄版遊戲頁工具列（< 620px 篩選改為圖示選單）沒有自動化測試，只用截圖確認過寬版（game-actions-ui 的 620px 只檢查動作編輯器）。（領域：game｜確認：2026-11-12）
- 聲卡實際輸出、滑鼠側鍵實體裝置、其他平台與 Mac 原生啟動不在查收範圍；真實網站登入、遊戲／媒體變體需樣本，未知遊戲保留人工 ROOT／not-game，不重掃或清理真實收藏。（領域：media、detection｜確認：2026-11-12）
- 前端首包約 2.4 MB（主要是 React、Mantine、閱讀器與語系字典），拆包實測收益有限，暫不處理。（領域：core｜確認：2026-11-12）
- 大型資料夾：10,000 個檔案首頁 96 筆約 0.2 秒；一次列出全部約 2 秒（介面不這樣呼叫）。（領域：files、media｜確認：2026-11-12）

<a id="已交付"></a>
<a id="待實作"></a>
<a id="待查收"></a>
<a id="待查收與限制"></a>
<a id="統一媒體工作區執行順序"></a>
<a id="歷史驗證入口"></a>
