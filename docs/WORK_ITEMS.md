# 需求清單

只放還沒結束的需求；完成並查收的需求刪除（內容在 [CHANGELOG](../CHANGELOG.md) 與 git 歷史）。核定規則由規格持有，按 [任務索引](README.md#按任務定位) 選讀；流程規則在 [CLAUDE.md](../CLAUDE.md)。`pnpm status` 依本頁印出狀態區塊。

**格式**：`- **R-編號** 標題 ｜大小｜風險｜資料影響｜領域：id（見 [areas.json](areas.json)）｜依賴：R-…｜取代：…`，下一行縮排寫補充（可省略）。

- **大小**：小／中／大。
- **風險**：一般／資料寫入／安全邊界（後兩者提交前獨立審查，同批合併審一次）。
- **資料影響**：無／設定（專案或本機設定）／新增欄位（選用，不升格式；畫面查收前標「暫定」）／改結構（升格式，附升級步驟、舊格式樣本與測試，需核定）。
- **狀態**就是所在的章節；編號從 R-201 起，不與歷史 R／T／UI-R 提案混用。

## 待你決定


## 待查收

- **R-241** library 請求分派移出 main.ts，IPC 參數在入口逐項驗證 ｜中｜安全邊界｜無｜領域：core｜依賴：無
  驗收：開程式後建立／開啟專案、改欄位值、播放影片、搜尋、切換群組與主題都照常；`pnpm exec tsx --test tests/ipc-requests.test.ts` 通過。
  `dispatch` 搬到 electron 同層模組；`library:request`、`explorer:request`、`workspace:update` 在入口檢查請求形狀（動作名稱在允許清單、各欄位型別正確），不符合就拒絕。行為與回應不變。
- **R-240** 外部匯入的日期存成日期，文字與日期可互轉 ｜中｜資料寫入｜設定｜領域：metadata、editor、cells、search｜依賴：無
  ①匯入：E-Hentai 上傳時間存成「日期時間」，Steam（`12 Nov, 2020`）與其他來源的發售日轉成 `YYYY-MM-DD` 的「日期」；只有年份或年月等解讀不了的值照舊存文字，不補日期。專案裡該欄位已被使用者改成文字時，新匯入照文字存。②管理欄位：日期／日期時間可改成文字（顯示原值；讀這個欄位的大於／小於／距今條件會移除，改之前預覽數量）。③文字改日期：所有已存的值都要能解讀成日期才允許，否則列出不符合的值並拒絕；不改寫資料夾記錄，讀取時解讀。只有年份（`1999`）算解讀不了。
  驗收：①管理欄位選一個日期欄位 →「改成文字」，看到影響說明（會移除的日期比較條件數量）後確認；②選一個文字欄位 →「改成…」→「日期」，有讀不成日期的值時會列出並不能確認；③從 Steam 或 Bangumi 匯入發售日，資料夾設定裡該欄位是日期；只有年份的來源照文字存。
- **R-247** 資料夾設定存值時檢查欄位型別 ｜小｜資料寫入｜無｜領域：panel、storage｜依賴：無
  `saveValues` 對尚無值的數字／日期欄位直接建立文字屬性，規格要求型別不符時保留並標示、不默默轉換。
- **R-244** 拖入字幕路徑的來源（核對後不需改程式） ｜小｜安全邊界｜無｜領域：video、core｜依賴：無
  `explorer:subtitleDrop` 收 renderer 給的路徑，任何位置 5MB 以內的 .srt／.vtt 都能讀回畫面，違反「renderer 不得任意讀路徑」。方向：只接受受管資料夾內的檔案，或改由 main 端在拖放時取得路徑。
  核對結果：preload 用 `webUtils.getPathForFile` 從使用者實際拖入的 File 取得路徑，renderer 沒有直接 IPC，只能交出 File，無法指定任意路徑字串；代理的回報高估了風險。只在 ARCHITECTURE 補上這條說明。驗收：看 ARCHITECTURE「資料流與邊界」最後新增的一句。
- **R-248** 分層引用檢查 ｜小｜一般｜無｜領域：core｜依賴：無
  pre-commit 加一項：`src/` 不得引用 `electron/`，`shared/` 不得引用 Node、Electron 或 React。參考 VS Code 的分層規則（[C-133](DECISIONS.md#c-133架構與文件檢查結論2026-11-11)）。
  完成：`scripts/check-layers.mjs`，pre-commit 自動執行；用刻意違規的暫存檔確認能抓到 5 種越界（Node、Electron、React、跨資料夾、動態 import），`import type` 不擋。驗收：`node scripts/check-layers.mjs` 印出無越界。
- **R-246** 外部匯入在「只填空值」時跳過手動改過的來源欄位 ｜小｜資料寫入｜無｜領域：metadata｜依賴：無
  現在只要勾選的欄位中有一個曾手動修改（`source: manual`），整批匯入就以「既有欄位來源衝突」失敗；規格的意思是該欄位保留、其他照填。
  驗收：在資料夾設定手動改一個已匯入的來源欄位（例如 Bangumi 標題），再從同一網址用「只填空值」匯入：不再出現「既有欄位來源衝突」，手改的值保留，其他欄位照填；勾「覆寫」時仍會拒絕。
- **R-245** 清理不得改寫遊戲 ROOT 內的記錄 ｜小｜資料寫入｜無｜領域：storage、detection｜依賴：無
  使用者決定（2026-11-11）：ROOT 內殘留記錄一律整筆刪除。只清私有覆寫會改寫記錄，在預覽與執行時都拒絕；整筆刪除照舊可用。重新掃描後 ROOT 內的資料夾本來就不列出，這條只擋掃描前已列出的情況。驗收：`pnpm exec tsx --test --test-name-pattern R-245 tests/game-detection.test.ts` 通過。
- **R-242** 文件整理：規格只寫現行規則，出處移到決策紀錄 ｜中｜一般｜無｜領域：shell、browse、panel、editor、storage、core｜依賴：無
  ①規格裡「已移除／不再」等變更語句改寫成現狀描述，「本輪」等出處移出規格；②遊戲與漫畫規格的章節去掉編號與「本輪圖」，連動 areas.json；③ARCHITECTURE 補上漏列的模組與 `workspace-backups/`，外部來源規格補 DLsite。驗收：看 GAME_VIEWER_DESIGN、MANGA_VIEWER_DESIGN 的章節名稱與 ARCHITECTURE 的模組表。不改檔名：決策紀錄只增不改，裡面的舊連結會失效。

## 進行中

## 已核定（未做）

順序（2026-11-11 核定）：R-240＋R-247（已完成，待查收）→ R-244＋R-246（已完成，待查收；R-244 核對後不需改程式）→ R-248＋R-249（搬移會改到每個檔案，排最後；R-248 已完成）。

- **R-249** src 依功能分資料夾 ｜中｜一般｜無｜領域：shell、browse、panel、files、media、gallery、reader、video、documents、editor、cells、search、game、metadata、appearance、notices、storage、project｜依賴：R-248
  依 areas.json 領域分（`src/browse/`、`src/editor/`、`src/media/`、`src/video/`、`src/game/`、`src/search/`、`src/panel/` 等，共用放 `src/common/`）；功能的 css 跟元件放一起，全域樣式放 `src/styles/`。只搬檔案與改引用，不改行為；連動 areas.json、ARCHITECTURE 與規格連結。

## 已登記（未核定）

- **R-250** `file-overview-ui` 捲動檢查時好時壞 ｜小｜一般｜無｜領域：files｜依賴：無
  捲動後只等 100ms 就檢查畫面內有沒有檔案，電腦忙時會失敗：2026-11-11 新舊版輪流各跑 3 次都只過 1～2 次，與 R-240 無關。方向：改成等到條件成立（有逾時）而不是固定等待。

## 擱置

- **R-243** 拆分 App／BrowseWorkspace 的狀態 ｜中｜一般｜無｜領域：browse、notices｜依賴：無
  App 有 27 個 useState，BrowseWorkspace 有 18 個 useEffect。使用者不再規劃大功能，原定「隨下一個大改需求一起做」的時機不會出現；程式運作正常，只在修改時有成本，擱置（2026-11-11）。
- **R-220** 讓程式能在 Mac 上執行（不含 Mac 遊戲啟動，見 C-130）｜大｜安全邊界｜無｜領域：core、files、storage — 使用者決定擱置（2026-11-10）
  ①已完成（2026-11-05）：macOS 上型別檢查與全部資料測試通過（只有 2 個本來就只屬 Windows 的測試跳過：隱藏屬性批次、寫入權限 ACL）；隱藏屬性在 Mac 不執行，`.media-viewer` 以點開頭本來就隱藏；路徑比較只在 Windows 不分大小寫（Mac 的 APFS 預設也不分，之後要留意）。下一步建議：CI 在 macOS 跑 UI smoke，看視窗、標題列按鈕與側鍵導覽。其餘步驟：②處理 Windows 專屬處：`process.platform` 判斷 6 處、隱藏屬性（`attrib`）、在檔案總管開啟、`.lnk` 捷徑與 Locale Emulator、以 EXE 為主的遊戲辨識；③electron-builder 產出 `.dmg`（未簽章會被 Gatekeeper 擋，正式簽章與公證需 Apple 開發者帳號）；④需要實機 Mac 查收。
- **R-211** Majiro、FVP 遊戲引擎辨識 ｜小｜一般｜無｜領域：detection — 等真正的樣本（目前資料夾是空的）。

## 發行前關卡

- **R-I18N 語系關卡**（每次發行必做）：依 [文案契約](UI_RULES.md#文案與語系一致性) 與 [執行關卡](IMPLEMENTATION.md#發行前文案與語系關卡) 補齊介面文字。母語審閱與授權審閱已於 2026-11-05 完成。

## 已知限制（不是需求）

- 卡片上沒有直接編輯；編輯在資料夾設定，每個欄位各自寫入。
- 窄版遊戲頁工具列（< 620px 篩選改為圖示選單）沒有自動化測試，只用截圖確認過寬版。
- 聲卡實際輸出、滑鼠側鍵實體裝置、其他平台與 Mac 原生啟動不在查收範圍；真實網站登入、遊戲／媒體變體需樣本，未知遊戲保留人工 ROOT／not-game，不重掃或清理真實收藏。
- 前端首包約 1.7 MB（主要是 React、Mantine 與語系字典），實測收益有限，暫不處理。
- 大型資料夾：10,000 個檔案首頁 96 筆約 0.2 秒；一次列出全部約 2 秒（介面不這樣呼叫）。
- 完全移除須影響預覽、樹外備份、未知資料保留與失敗復原；復原包在 `userData/maintenance-backups`，見 [儲存安全](STORAGE_OPTIONS.md)。

<a id="已交付"></a>
<a id="待實作"></a>
<a id="待查收"></a>
<a id="待查收與限制"></a>
<a id="統一媒體工作區執行順序"></a>
<a id="歷史驗證入口"></a>
