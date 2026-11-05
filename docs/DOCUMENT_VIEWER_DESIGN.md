# ZIP／CBZ 與 PDF 唯讀觀看

> 最後確認：2026-11-05。ZIP／CBZ／PDF 檢視的現行規則。程式：`src/DocumentViewer.tsx`、`electron/archive.ts`。

入口為內容區的檔案按鈕，或中央「檔案」總覽選取後的「開啟檢視器」。不修改原始文件、不解壓到媒體目錄、不為壓縮檔內部建立可攜記錄。

## ZIP／CBZ

`electron/archive.ts` 以隨機存取讀 ZIP central directory，將支援的圖片自然排序後交給既有漫畫閱讀器。頁面透過受控 `media://archive` 身分讀取；每次核對原檔路徑、大小、修改時間、local header、檔名、解壓大小、CRC 與影像簽名。只解析資料，不執行壓縮檔或遠端程式碼。

- 支援 store／deflate 及現有圖片解碼種類；內部資料夾作為頁面路徑，不向檔案系統解壓。
- 拒絕加密、不支援壓縮法、分卷、ZIP64、損壞／截斷目錄、重複路徑、符號連結、不安全相對路徑及超限圖片。目錄最多 20,000 項／8 MiB，單張解壓上限 64 MiB，另限制壓縮比例與總宣告大小。具體值以程式碼為準。
- 壓縮檔變更需重新開啟，失敗顯示錯誤並保留原檔。初版不寫入壓縮檔閱讀進度；跨壓縮檔保存進度、RAR／7z 與更多檔名編碼另排。

## PDF

PDF／ZIP 在全視窗的媒體檢視器開啟，旁邊是同資料夾的檔案佇列（`MediaViewer`），依 [統一媒體工作區](MEDIA_WORKSPACE.md#統一媒體工作區)；外側文件清單與 PDF／ZIP 內部頁序分開。下列原生 viewer／唯讀／授權限制照舊。

`DocumentViewer` 使用 Electron 內建 Chromium PDF viewer，沿用受控 Range 串流，提供原生頁碼、縮圖及縮放。主視窗仍保持 renderer sandbox、contextIsolation 及禁止 Node integration；僅啟用內建 PDF plugin，沒有新文件解碼依賴。文件 JavaScript 由原生 PDF viewer 封鎖。

焦點限制在檢視區，外層關閉／Esc 回到入口；離開卸載 iframe，不自動保存或改寫原 PDF。原生 PDF 工具列及其介面語言由 Chromium 提供，不是應用程式的可攜設定；PDF 內原文保持原樣。加密、表單、特殊字型與大型真實文件仍需樣本查收。

## 驗證

`tests/decided-media.test.ts`：受控 store／deflate、CRC、惡意路徑、重複／加密／超限／損壞與原檔不變。

`tests/decided-ui.ts`：實際 ZIP／CBZ 圖片解碼、原生 PDF 頁面與 viewer 載入、關閉與原檔比對。只驗受控資料，不將圖片副檔名或 iframe 存在當作已成功解碼。
