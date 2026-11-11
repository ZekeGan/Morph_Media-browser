# 版本、發布與資料相容

本頁是版本階段、打 tag 與發布步驟的唯一來源。資料格式升級的技術規則在 [DATA_FORMAT](DATA_FORMAT.md#格式升級與相容規則)，備份與復原的範圍在 [STORAGE_OPTIONS](STORAGE_OPTIONS.md)。決策依據見 [DECISIONS C-119](DECISIONS.md#c-119版本階段打-tag-與資料自動升級2026-11-04)。

## 階段

| 階段 | 版本號 | 打 tag | 公開發布 | 資料相容承諾 |
| --- | --- | --- | --- | --- |
| Alpha（現在） | `0.x.y` | 不打 | 不放 Releases，只自己使用 | 不保證，格式可以直接改 |
| Beta | `0.x.y-beta.N` | 只在使用者確認「這版可以給人用」時打 | 打 tag 後才發布，標成 Pre-release | 開始承諾：格式變動必須附自動升級 |
| 正式版 | `1.0.0` 起 | 每個發布版都打 | 正式 Release | 完整承諾 |

- **進入 Beta 只由使用者宣告。** 使用者明確說「這一版是 Beta」之前，任何版本（包含 0.40.0）都按 Alpha 處理，我不自行判斷或建議改走 Beta 流程。
- 進入 Beta 之前，[資料自動升級機制](DATA_FORMAT.md#格式升級與相容規則)必須已實作並通過測試；這是使用者宣告時我要提醒的前置條件，不是自動觸發條件。
- Alpha 版仍照一般規則定版與升版號（見下），只是不打 tag、不上 Releases。

## 日常開發（所有階段）

- 每批改動完成後 commit，變更寫進 [CHANGELOG](../CHANGELOG.md) 最上方的 Unreleased，不逐批升版本號、不打 tag。
- Beta 期間介面與細節仍會改，一樣只累積在 Unreleased；tag 數量等於「真的發布的次數」，不是批次數。

## 定版步驟（只在使用者說要發布時做）

1. **查收完成。** [WORK_ITEMS](WORK_ITEMS.md) 的「待查收」已清空或使用者明確同意帶著發布。
2. **決定版本號。** 新功能升次版號，純修正升修訂號；Beta 加 `-beta.N`。次版號或主版號升級，推送前先問使用者。
3. **整理 CHANGELOG。** Unreleased 改成版本標題與日期，更新 Version guide 表，重新開一個空的 Unreleased。
4. **改 `package.json` 版本。** 同批檢查 README 與文件中寫死的版本號。
5. **發布關卡。**
   - `pnpm build`、`pnpm test`、`pnpm test:ui:all`。`pnpm test` 含舊版資料檢查（`tests/compat.test.ts`）：`tests/compat/<版本>/` 裡每個已發布版本產生的樣本，在這一版都要讀出相同的專案、資料夾記錄與本機設定，而且開啟時不改寫任何檔案。
   - [文案與語系關卡](IMPLEMENTATION.md#發行前文案與語系關卡)。
   - 網站來源健康檢查：`pnpm check:sources` 對每個來源實際請求一個已知作品（需要網路，只讀、不寫入資料夾）。失敗時依錯誤類型處理：「連不上」先查主機是否搬家，「找不到作品」換範例（`pnpm check:sources <來源>=<網址>`），「格式變更」修轉接器；修不了就在 CHANGELOG 註明該來源暫時失效。
   - 若這版改了任何 `schemaVersion`：[升級驗收](DATA_FORMAT.md#每次升格式版本的必備項目)全部通過。
   - 文件現況審閱：先跑 `pnpm stale`（規格卡與已知限制的確認日期、文件提到的檔名與函式名、首包大小）；再讓一個代理只讀規格的現況描述與已知限制，對照程式列出可能過時的句子。它只點名，刪改由我處理、使用者查收。
   - 授權、名稱與隱私清理（[WORKFLOW_PROMPT](WORKFLOW_PROMPT.md#9-發布前關卡只在使用者說要發布時執行) 第 4～7 項）。
6. **打包。** `pnpm dist`，輸出在 `release/morph <版本>/`；接著 `pnpm check:packaged`，用暫時的資料夾啟動打包後的程式，確認首頁出現、狀態列是這個版本、沒有錯誤。
7. **安裝驗證。** 實際安裝、啟動、解除安裝；免安裝版直接執行。用上一個發布版建立的資料升級開啟一次，確認資料還在、沒有要求使用者做額外操作。
8. **保存這一版的舊資料樣本。** `pnpm compat:sample` 寫出 `tests/compat/<版本>/`，與版本改動一起提交；之後每一版都會用它檢查。
9. **commit、推送。** 版本改動單獨一個 commit。次版號以上先問使用者。
10. **打 tag 與發布（只有 Beta 之後）。** 在該 commit 打 `v<版本>` tag 並推送，再用打包出的兩個檔案建立 GitHub Release（Beta 勾選 Pre-release），內文取自 CHANGELOG。已發布的 tag 不移動、不刪除；發現問題就發下一個 `beta.N`。

## `release/` 資料夾

- 保留最近兩個版本的資料夾，其餘在定版時刪除。
- 刪除前確認該版本的檔案要不要保留（Beta 之後，Releases 頁面是官方版本的唯一來源）。
- `release/` 不進 git。

## 與資料相容的關係

- Alpha 不承諾相容，但不代表可以隨意破壞使用者現有資料：對使用者真實資料的寫入仍須有備份與失敗復原路徑。
- Beta 起，每一次升 `schemaVersion` 都要符合[格式升級規則](DATA_FORMAT.md#格式升級與相容規則)，並列入定版步驟第 5 項的驗收。
