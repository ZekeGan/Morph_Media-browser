# 遊戲引擎辨識規畫

> 本頁持有辨識證據／邊界策略，不承擔畫面或工作進度。導覽能否進入依 [現行工作區](WORKSPACE_REVISION.md)，內容／動作見 [遊戲](GAME_VIEWER_DESIGN.md)；未採用候選不能自行升為已實作。


日期：2026-10-26。來源：C-80 使用者要求納入 Unity、RPG Maker、Unreal、Godot 及其他常見引擎，其他採推薦。**以下是設計覆蓋清單，不等於所有引擎版本均已支援；現有有限探測實作查 electron/game-detection.ts，真實版本樣本仍待驗收。** Windows 優先；2026-10-27 使用者另要求納入 Mac 封裝辨識與執行條件，規則見下節，Windows 可辨識／保護 App 結構候選；macOS 原生啟動及實機驗證仍未完成。

## 現行修正範圍（2026-10-28）

- 自動結果一律是候選，不自動宣告遊戲 ROOT。Unreal 可結合同名外層啟動器、內層 Binaries/Win64 與 Content/Paks 的 PAK／IoStore；不依賴 EXE 版本資訊。多款集合不跨作品拼接；改名啟動器與部署歸屬不明時停止供人工確認。
- Unity／Godot 檢查檔案型別及同名資源；不完整 Unity 部署先列未知候選。MV／MZ 結合核心檔與資料目錄；其餘現有引擎只覆蓋程式內的有限組合，不代表涵蓋所有發行版。
- EXE＋resources/app.asar 只列封裝應用候選，引擎保持未知；不拆包、不以說明／存檔檔名推定 Tyrano。一般應用可明確標記「這不是遊戲」後重新掃描。候選／人工入口位於各分類資料夾設定的進階頁。
- NW.js：同層一般 EXE、NW 資源檔（`nw.pak`／`nw_100_percent.pak`／`nw_200_percent.pak`）與執行環境（`nw.dll`／`nw_elf.dll`／`chrome_elf.dll`／`icudt.dll` 之一，或成對 `libEGL.dll`／`libGLESv2.dll`）只列引擎未知的應用候選，先停止深入。無外露腳本、改名 EXE、內嵌／`package.nw` 均不需解包；單一資源或 DLL 不成立，普通 NW 工具也不自動確認為遊戲。沒有這些外露組合的單檔形式仍需人工 ROOT。
- WOLF：保留 EXE＋`Data.wolf`；新增一般 EXE＋同一 `Data/BasicData` 內的 `Game.dat` 與 `DataBase.dat` 候選。涵蓋未封包及同時帶任意名稱 `.wolf` 的混合結構，不依賴 EXE／素材封包固定名稱，不讀取版本資訊或深入 AutoBackup。缺任一基本資料、跨路徑拼接或單獨 `.wolf` 不推定 WOLF；編輯器／工具仍須人工判定是否為遊戲。
- Tyrano 解包桌面版：外層有一般 EXE 檔案，且同一個 `resources/app` 或真實的 `resources/app.asar` 目錄內同時有 `package.json`、`index.html`、`tyrano/tyrano.js`、`tyrano/plugins/kag/kag.js`、`data/system/Config.tjs` 與 `data/scenario` 中至少一個一般 `.ks` 檔案，列 TyranoScript 候選並在外層 ROOT 停止。標記不跨包裝層拼接、不依賴資料夾／EXE／劇本固定名稱、不執行內容。僅有應用入口而缺少遊戲標記者保留未知候選；真正 ASAR 檔案存在時，不拿旁邊 app 目錄推定封包內引擎。
- 每次探測最多 64 個目錄、12,000 筆目錄項目、相對深度 5；只讀目錄名稱與型別，資源／EXE／plist 內容讀取量為 0。超限暫停為候選；權限／路徑錯誤停止分支。連結不跟隨，取消不排入後續分支。
- 任意 .app（含未知引擎、binary／破損 plist）都作為不可寫入的程式 bundle，根及內部不建檔、不深入；Unity dylib／Data／執行檔只提供結構候選。沒有解析 plist 或驗證主機可啟動性；不宣稱完成下方全部 Mac 規則。
- 人工 ROOT／not-game 優先；唯讀遍歷偏好獨立保存，確認時保留候選證據。建立／載入巢狀專案與共同寫入入口也檢查上層保護；沒有記錄的祖先亦檢查，不再僅探測最近四層。已連結的舊內部專案停止寫入。歷史內部記錄原樣保留，不自動清理。
- 雙擊／Breadcrumbs 導覽與掃描採相同停止規則：未明確啟用唯讀遍歷時，遊戲 ROOT 不發布任何內部子資料夾到 CARD／TABLE／TREE；連唯讀佔位也不列出。導覽新發現邊界時，移除本專案記憶體快照中的舊子層，磁碟歷史記錄保留。明確啟用唯讀遍歷才允許列出受保護內部。
- 受控案例涵蓋七款回報的結構、同名偽造／缺標記、混合引擎、集合、精確深度、人工設定、歷史記錄、重掃、權限／超限與 junction。真實版本、plist 主目標解析、多平台共同作品歸屬及 macOS 原生啟動仍待樣本／環境；不可將目錄測試當成遊戲啟動驗證。

## 目的與邊界

### 新增實際漏判（2026-10-27，部分已修正）

使用者明確指定下列 ROOT。本次僅唯讀檢查指定層級、記錄時間、執行檔版本資訊並呼叫唯讀 detectGame，沒有呼叫實際收藏的 Library.scan／visit，也沒有清理或修改遊戲內容。

| 個案／指定 ROOT | 本次證據與現行結果 | 待修範圍 |
| --- | --- | --- |
| TyranoDataSample | EXE＋resources/app.asar 檔案，目前回傳封裝候選；指定 resources/app/data/sound 層本次無 .media-viewer。 | 不把先前存在的記錄或引擎未知等同本次仍新增；以受控掃描／寫入稽核驗證，保留使用者指定 ROOT。 |
| 発育測定…／game | game.exe、nw.pak、Chromium DLL／locales，沒有外露 js／www／data；EXE 無版本資訊，2026-10-27 診斷時未命中。 | 已補受控 NW.js／內嵌結構候選並停止，不強猜引擎或解包 EXE；ROOT 是內層 game，不是外包裝。實際 ROOT 未重掃。 |
| 妹幻想…V1.4.5＋DLC | GamePro.exe 產品名稱／描述明載 WOLF RPG Editor；Data 下有多個 .wolf，BasicData 有 Game.dat／DataBase.dat 等。2026-10-27 診斷時只認根的 Data.wolf，未命中；AutoBackup2 有記錄。 | 已補受控未封包／混合封包組合；不要求固定 Game.exe／Data.wolf 名稱，不深入 AutoBackup 才判根。實際 ROOT 未重掃。 |
| ふたりぐらしver1.312 | resources/app.asar 是真實目錄；小型入口檔引用 Tyrano／KAG 核心，具 Config.tjs／first.ks，判斷為 TyranoScript 遊戲結構。 | 本輪已依上方解包桌面版規則修正，在外層停止；歷史 data/image/ring 記錄保留。 |
| ROOM | resources/app 是解包目錄；Room.exe、package.json／index.html、Tyrano／KAG 核心、Config.tjs 與 first.ks 相互對應。 | 本輪判斷為 TyranoScript 遊戲結構並納入同一規則，不依賴 Room 名稱或存檔。 |

2026-10-28 已以受控結構補 NW.js 內嵌／封裝候選、WOLF 未封包／混合封包，沿用未知候選暫停與共同寫入檢查；真實版本與其他無外露標記形式仍待樣本。測試核對重掃／導覽、精確深度、明確唯讀遍歷、人工 ROOT／not-game、舊記錄、取消、權限失敗、junction 與深層巢狀建立，原始檔及內部歷史記錄保留。本輪沒有讀取、重掃或修改實際收藏；既有誤建資料另走備份與清理預覽，不自動刪除。先前解包 Tyrano 的實際兩個 ROOT 僅做過唯讀辨識與小型入口查核，未呼叫會建檔的 Library.scan。

本次驗證：`pnpm build` 通過；`pnpm test` 73 項通過（junction 在沙箱內遇 EPERM，沙箱外完整重跑通過）。隔離 Electron 目標檢查亦通過：NW／WOLF 候選內容頁、IPC visit 停止內部發布、深層建立拒絕，原檔與歷史記錄不變；腳本及截圖在 `.test-output/game-boundary-smoke.ts`、`.test-output/runtime-smoke-vDyFgG/`。完整 UI runner 與真實遊戲／macOS 原生啟動未執行。

辨識目的是協助找到「應停止遞迴的遊戲 ROOT」，不是讀取／轉換遊戲資源。引擎身分、是否為遊戲、是否為收藏集合根是不同判斷；引擎製作的工具、編輯器、模組也可能命中特徵。

使用一套小型規則登錄表與共用唯讀探測器，不為每個引擎安裝 SDK 或拆包套件。規則記錄穩定 ID、版本、有限探測路徑、必要／輔助線索與排除條件，回傳候選 ROOT、引擎候選及依據。確切 schema、探測筆數／位元組／深度上限在實作前定義。

- 先讀名稱清單，必要時只讀規則指定的小型文字標記；不執行 EXE／JS／腳本，不解包、解密、遞迴掃完整遊戲，也不修改原始檔案。
- 已確認 ROOT 直接停止；結構線索完整可列高可信候選，弱線索／衝突需人工修正。分數或強特徵不宣稱百分之百正確。
- 所有候選須在寫入子層前處理。未解決候選保留為暫停／未掃描，不讓例外、權限錯誤或取消變成「無遊戲、可繼續寫入」。
- 找不到引擎仍可手動設為 ROOT；未知或自製引擎不阻擋遊戲檢視及使用者指定 EXE。
- `.exe`、`Data`、`.pak`、`package.json`、NW.js／Electron 執行環境等單一線索不足以判定遊戲，也不能直接把上層集合目錄當 ROOT。

## 覆蓋清單與研究狀態

「依據已查」僅表示官方文件／原始碼支持列出的結構線索；實際 Windows 發行版、誤判與 ROOT 定位仍需受控樣本驗證。「待樣本」同樣列入設計範圍，現階段以人工指定兜底，不能寫成已能自動辨識。

| 引擎家族 | 候選規則方向／限制 | 研究狀態與依據 |
| --- | --- | --- |
| Unity | EXE、`UnityPlayer.dll`、對應 `*_Data` 組合；版本／改名變體另驗證，非遊戲工具也能命中。 | 依據已查：[Windows 建置](https://docs.unity3d.com/6000.0/Documentation/Manual/WindowsStandaloneBinaries.html)。 |
| Unreal Engine | 執行檔與部署內容結構組合，`.pak` 只是輔助；不同世代及容器需分規則，不能僅看到副檔名就判定。 | 依據已查：[封裝說明](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project)；UE3／4／5 變體待樣本。 |
| Godot | 同名 EXE＋`.pck` 判為 Godot（2026-11-04 使用者核定）。內嵌 PCK 的單一 EXE 沒有外部特徵：引擎未知、不判為遊戲（一般資料夾），可手動指定為遊戲，引擎顯示未知；不讀 EXE 內容。`.pak` 不是 Godot 證據（Unreal、id Tech 與許多模組也用）。 | 依據已查：[Windows 匯出](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html)。 |
| RPG Maker | 2000／2003、XP／VX／VX Ace、MV／MZ、UNITE 分家族規則；MV 核心腳本與資料結構可作組合線索。UNITE 與 Unity 規則可能重疊，不強行猜版本。 | MV／MZ 依據已查：[MV 核心原始碼](https://github.com/rpgtkoolmv/corescript)、[MZ 部署](https://rpgmakerofficial.com/product/MZ_help-en/01_11_03.html)。其他版本及封裝變體待樣本，不以編輯器專案檔作發行版必要條件。 |
| Ren’Py | 啟動程式與 `game/` 內 `.rpy`／`.rpyc`／`.rpa` 等結構組合；不要求原始腳本存在。 | 依據已查：[檔案與目錄](https://www.renpy.org/doc/html/language_basics.html)、[發行封裝](https://www.renpy.org/doc/html/build.html)。 |
| 吉里吉里／KiriKiri／KiriKiri Z | 執行檔與 XP3 等線索組合，副檔名不唯一，內嵌／自訂包裝需人工指定；不解包。 | XP3 依據已查：[引擎原始碼](https://github.com/krkrz/krkrz/blob/master/base/XP3Archive.cpp)；發行版組合待樣本。 |
| TyranoScript／TyranoBuilder | `tyrano/`、`data/`、入口結構的組合；桌面包裝、內嵌資產及 Builder 變體待驗證，不把通用網頁程式都當遊戲。 | 原始結構依據已查：[TyranoScript 原始碼](https://github.com/ShikemokuMK/tyranoscript)；Windows 發行版待樣本。 |
| WOLF RPG Editor | Game 執行檔與資料結構組合；資料可改名或封裝，單獨 `Game.exe`／`Data` 不成立。 | 依據已查：[檔案說明](https://silversecond.com/WolfRPGEditor/Help/01filelist.html)、[啟動設定](https://silversecond.com/WolfRPGEditor/Help/01control.html)；版本變體待樣本。 |
| GameMaker | VM／YYC 等輸出需分開處理；不假設所有發行版都有同一個資料檔。 | 輸出差異依據已查：[官方編譯文件](https://manual.gamemaker.io/monthly/en/Introduction/Compiling.htm)；具體檔案規則待樣本。 |
| Cocos Creator／Cocos2d-x | 原生與網頁包裝分開；不拿開發專案目錄當作所有遊戲的部署特徵。 | Creator Windows 發行方向已查：[官方部署文件](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/windows/index.html)；Creator／2d-x 規則待樣本。 |
| Construct 2／3 | 舊 NW.js 與較新桌面匯出分開；不依賴 NW.js 作必要條件。 | 匯出差異依據已查：[官方淘汰功能說明](https://www.construct.net/en/make-games/manuals/construct-3/tips-and-guides/deprecated-features)；結構規則待樣本。 |
| Defold | 執行檔與 `game.arcd` 等部署結構組合；不解析資源封包。 | 依據已查：[官方封裝文件](https://defold.com/manuals/bundling/)；Windows 變體待樣本。 |
| LÖVE | `.love` 與執行環境，或合併 EXE 與配套 DLL（`love.dll`＋`lua51.dll`，2026-11-04 依 Moonring 樣本補上）；內嵌版本不可要求外部 `.love`。 | 依據已查：[官方發行說明](https://love2d.org/wiki/Game_Distribution)；單一 DLL 仍非充分條件。 |
| Source／Source 2、CRYENGINE | 列入擴充清單；商店啟動器、模組與共用引擎安裝可能使內容根不等於遊戲根。 | 待官方結構研究與樣本；先提供人工 ROOT，不宣稱自動辨識。 |
| Adventure Game Studio、MonoGame／FNA／XNA、自製引擎 | 列入擴充清單；同一框架可製作一般應用，無通用可靠目錄規則。 | 待研究與樣本；先提供人工 ROOT，後續按真實收藏補規則。 |
| 日系視覺小說引擎（2026-11-01 依 使用者的日系視覺小說收藏 唯讀結構確認） | Artemis：EXE＋`*.pfs`（含 `.pfs.000`）。AI6WIN（Silky's／Elf）：`AI6WIN*.exe`（補丁版可能把 `.arc` 移進子資料夾，故只看執行檔名）。BGI／Ethornell：`BGI*.exe`＋`.arc`。ONScripter／NScripter：`onscripter*.exe`，或 `nscript.dat`／`ons.cfg` 加 `.nsa`／`.sar`。RealLive／AVG32：`GAMEEXE.INI`＋`SEEN.TXT`／`PDT/`／`AVG32*.exe`。SiglusEngine：`Scene.pck`＋`Gameexe.dat`。YU-RIS：`*.ypf`。Nitroplus NPA：至少兩個 `.npa`。多個 `.npk` 判為 Nitroplus NPK（2026-11-04 起，見下節）；Steam（`steam_api*.dll`）發行版引擎不明時只列候選，由人工確認。 | 依據：使用者收藏的實際目錄結構與各引擎公開的檔案慣例；單獨 `.arc`、單一 `.npa`、沒有 EXE 的 `.pfs` 不成立。補丁／外掛可能帶同名檔案，因此皆為候選。 |

## 漏判、誤判與 ROOT 定位規則

2026-10-27 使用者要求：將目前已知及可能的辨識邊際問題納入規則，修正列為最優先。**本節保留回報證據與完整驗收方向；已交付子集以上方現行修正範圍為準，不代表各變體均已支援。**

### 已確認案例與成因

先前對使用者指定的 一個 Unreal 遊戲資料夾 做必要目錄與檔案版本的唯讀確認：

```text
unrealSampleA/                         ← 應保護的遊戲 ROOT
├─ UnrealSampleA.exe
├─ Engine/
└─ UnrealSampleA/
   ├─ Binaries/Win64/UnrealSampleA-Win64-Shipping.exe
   ├─ Content/Paks/                ← .pak、.utoc、.ucas
   └─ Plugins/
```

Shipping EXE 的產品名稱為 `UnrealGame`，檔案版本標示 `++UE5+Release-5.8-CL-56702186`。當時檢查的外層、內層及 Win64 目錄均已有 `folder.json`，但沒有 boundary 設定。

現有 `electron/game-detection.ts` 要求同層 EXE，且 Unreal 只探測相對於目前目錄的 `Content/Paks`、`Binaries/Win64`：外層有 EXE 卻找不到內層標記；內層沒有同層 EXE 而提前返回；Win64 雖有 EXE，卻沒有同層部署結構。現有 `tests/explorer.test.ts` 的 Unreal 假目錄把 EXE、Engine、Binaries、Content 放在同一根目錄，未涵蓋此分層形式。

同日使用者另回報三款也被掃入，僅對指定路徑做必要檔名、版本、小型入口／核心標記及 boundary 的唯讀核對，未執行掃描器或遊戲，也未解開封包：

| 指定目錄（位於 使用者的遊戲收藏） | 實際證據 | 判斷與待修範圍 |
| --- | --- | --- |
| `UnrealSampleB` | 外層 `UnrealSampleB.exe`＋Engine，內層 `UnrealSampleB/Binaries/Win64/UnrealSampleB-Win64-Shipping.exe` 與 `Content/Paks` 的 PAK／UTOC／UCAS；Shipping EXE 的產品名稱／檔案版本為空，外層 boundary 未設定。 | 與 UnrealSampleA 相同的 Unreal 跨層漏判；另須驗證缺少 EXE 版本資訊時仍能憑結構提出候選，不得硬性要求 `UnrealGame` 或特定版本字串。 |
| `TyranoManualSample` | 根目錄有 `TyranoManualSample.exe`、Chromium 配套檔與 `resources/app.asar`，沒有直接可見的 tyrano／data；另有 `TyranoManualSample_tyrano_data.sav`。根記錄已手動標記 ROOT（engines 為空、依據為使用者指定），resources 內已有記錄。 | ASAR 封裝形式已確認；Tyrano 僅為輔助檔名所支持的候選，未確認封包內引擎。現有 Tyrano 規則只認外露 tyrano／data，因此此規則不會命中。不得只靠 app.asar／Chromium／存檔名確認引擎或遊戲；補人工 ROOT 與既有子記錄／遍歷偏好的回歸案例，不能把既有記錄當成仍在持續寫入的證據。 |
| `RpgMakerNwjsSample` | 外層只有說明檔與 `GameFolder`；內層有 `RpgMakerNwjsSample.exe`、NW.js、入口 `package.json` 指向 `www/index.html`，`www/js/rpg_core.js` 標示 v1.6.2 且有其他 RPG 核心腳本。外層與遊戲目錄有記錄，但檢查的 www、www/js、www/data 都無記錄。 | RPG Maker MV 特徵在內層，按現有條件可於內層命中；外層包裝沒有 EXE，不命中。此案先列為「外包裝／遊戲 ROOT 定位」案例，不能宣稱 MV 完全未辨識或已掃進資源內部；須以受控同結構案例確認停止位置與顯示差異。 |
| `TyranoAsarSample` | 根目錄有 `TyranoAsarSample.exe`、`resources/app.asar` 及 Chromium 配套；Readme 明載使用 TyranoBuilder 製作，根 boundary 未設定，resources 已有記錄。 | TyranoBuilder 的 ASAR 發行形式；現有規則要求同層外露 tyrano／data，無法利用此結構辨識。說明檔提供個案證據，通用 ASAR／存檔名仍不能單獨升為自動確認規則。 |
| `TyranoDataSample` | 根目錄有 `TyranoDataSample.exe`、`resources/app.asar`、`resources/app/data`；readme 記載 TyranoScript Ver6.00。根 boundary 未設定，resources/app/data 已有記錄。 | TyranoScript 的封裝／部分外露資料形式；同層 tyrano／data 規則不命中。不能因 resources/app 目錄存在就忽略仍在 ASAR 的程式，也不能只靠 data 認引擎；既有 `_meta` 與使用者存檔不在本次清理範圍。 |
| `UnitySample` | 外層有 Windows／MacOS／Android。Windows 有 `UnitySample.exe`、`UnityPlayer.dll`、`UnitySample_Data`；Mac 位於 `MacOS/MacOS/UnitySample.app`，plist 指向 `Contents/MacOS/UnitySample`，標示 Unity 2021.3.20f1、最低 macOS 10.13.0；另有 `Frameworks/UnityPlayer.dylib`、`Resources/Data`。Android 有 `UnitySample.apk`。App、Contents、MacOS、Frameworks、Resources 中均已見記錄。 | Unity 多平台包。Windows 子層符合既有規則；外包裝無 EXE，Mac bundle 也無 EXE，現有全域 EXE 前置條件會漏掉 Mac 邊界。新增多平台歸屬、Mac App 保護與執行平台驗收；不可因目前是 Windows 就放行掃描／寫入 Mac bundle。 |

`folder.json` 的 boundary 未設定不代表自動辨識沒有命中：自動候選可只存在掃描結果中，使用者確認時才保存證據與 ROOT。診斷須區分實際結構、已保存的人工設定、本次掃描候選、歷史殘留記錄與唯讀遍歷，不能混為同一種漏判。

### 共通判斷要求

- **分開保存判斷**：引擎候選、遊戲候選、應停止的 ROOT 及判斷依據不可混為一談；認出 Shipping EXE 所在目錄，不代表那裡就是 ROOT。
- **跨層組合但限制範圍**：允許規則在受限深度內結合同一款遊戲的外層啟動器、內層執行檔與部署資料；不得因目前層沒有 EXE 就跳過全部引擎線索。探測深度、目錄筆數及讀取位元組上限須明確定義並測試，不遞迴遍歷完整遊戲。
- **避免把收藏集合當遊戲**：多款遊戲、不同平台／版本、多個 EXE、模組、補丁及共用 Engine 目錄須分辨歸屬；不可跨不同子遊戲拼湊標記，也不可自動選第一個 EXE 或把集合上層整個設成 ROOT。歸屬不明保留候選供人工修正。
- **單款外包裝與內部封裝分開**：只有說明檔＋一個遊戲目錄的包裝層，要能指出實際遊戲 ROOT 並供人工確認，不直接當成多款集合，也不靜默把上層設成 ROOT。`resources/app.asar` 等通用包裝只提供弱線索；無外露引擎標記時保留候選／人工入口，不為辨識解包。使用者存檔的名稱不能成為必要標記或唯一引擎證據。
- **檔名只是線索**：驗證標記所需的檔案／目錄型別及關聯，不能讓名為 `Game.exe` 的目錄、名為 `*_Data` 的普通檔案或空殼標記通過組合規則。圖示、EXE 版本資訊、單一 DLL／副檔名／`package.json` 均不能單獨證明是遊戲；版本資訊也可能缺失或被自訂。
- **未命中不等於不是遊戲**：內嵌、改名、未封裝、腳本放子目錄、自訂啟動器及未知引擎必須有人工 ROOT 入口。有弱線索、衝突、探測超限或讀取失敗而無法排除的分支，不可默認安全並寫入內部；候選先暫停。完全無線索的一般目錄仍按專案規則處理，不因專案屬性為遊戲就把每個目錄當 ROOT。
- **衝突與人工設定**：同時命中多引擎時保留各自依據，不強猜版本／唯一引擎；使用者已確認的 ROOT 或「這不是遊戲」不得被新規則靜默覆蓋。重掃既有自動候選的更新策略須與人工設定區分，不能讓舊候選永久掩蓋修正。
- **寫入前保護**：辨識在初始化子層記錄前完成，ROOT 可有自身記錄；內部維持保護。確認 ROOT、唯讀查看內部、取消、重掃、跨專案遍歷偏好與精確深度均不得繞過邊界。舊內部記錄不自動刪除；清理仍遵守 [儲存安全](STORAGE_OPTIONS.md) 的預覽、備份、衝突檢查與復原流程。

### Mac 封裝與多平台規則

2026-10-27 使用者以 UnitySample 要求補 Mac 執行條件。**辨識／保護可以在 Windows 執行；原生啟動只能依實際平台與相容性判斷，不代表目前程式已支援啟動 Mac App。** 動作契約見 [遊戲啟動條件](GAME_VIEWER_DESIGN.md#mac-遊戲執行條件待實作)。

- Mac App 不以 `.exe` 為必要條件：受限探測 `.app/Contents/Info.plist`、`CFBundlePackageType`、`CFBundleExecutable` 與對應 `Contents/MacOS/<名稱>`，再結合引擎資源。副檔名、名為 MacOS 的資料夾、通用 bundle ID 或 App 分類不能單獨證明是遊戲。plist 可能是 XML 或 binary，解析須限制大小並禁止外部 DTD／實體載入；缺失／異常保留候選，不執行內容。
- UnitySample 的 Unity Mac 組合證據為 plist 中的 Unity 標記、對應執行檔、`Frameworks/UnityPlayer.dylib` 與 `Resources/Data`；其他引擎 Mac 輸出需各自補受控樣本，不能套用 Windows DLL／EXE 規則或宣稱全覆蓋。保留檔名大小寫與 Unicode，限定連結解析範圍，不沿外部連結／junction 探測或寫入。
- `.app` 視為受保護的程式 bundle，不在其根或 Contents 內建立 `.media-viewer`；遊戲記錄放在合法的外層遊戲資料夾。直接選取 `.app` 時需唯讀辨識／提示選外層，不為建檔搬動、重包或改寫 bundle。既有內部記錄不自動清掉，也不自動重簽章或改動 `_CodeSignature`。
- 同款 Windows／Mac／Android 並列時，分開記錄各平台目標與依據，提出共同外層候選供確認；不能只憑平台目錄名或通用 bundle ID 合併不同作品，也不能跨平台拼湊引擎標記。Windows 子目錄可命中不表示 Mac 分支已受保護，須逐支核對。
- `__MACOSX`、`.DS_Store`、`._*` 僅為包裝／系統輔助線索，不作遊戲或啟動目標；不因辨識而刪除。只有 ZIP／DMG／APK 等封包時不自動解包、安裝或執行，保留封包／平台狀態與人工入口；本次不因此加入 Android 啟動能力。

Apple 結構依據（2026-10-27 查閱）：[bundle 內容配置](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle)、[CFBundleExecutable](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleexecutable)。引擎與系統版本字串僅為樣本標記，不保證原生執行成功。

### 引擎規則與反例清單

下表「現有缺口」由程式碼條件確認；上節區分實際目錄證據與尚待確認的引擎／掃描行為，所有發行變體仍須受控樣本驗收。所列反例是必測條件，不是只要缺少某個固定檔名就可判定不是該引擎。

| 引擎家族 | 現有缺口／可能漏判 | 規則與誤判防護要求 |
| --- | --- | --- |
| Unreal | 僅認同層 EXE＋直接部署路徑，漏掉 UnrealSampleA 形式；UE3／4／5、容器與啟動器變體未完整驗證。 | 組合外層啟動 EXE／Engine 與所屬內層 Binaries／Content；涵蓋 PAK／IoStore 線索。工具、模組、單獨 `.pak`／`.utoc`、共用 Engine 及多遊戲集合不能直接確認為一款遊戲 ROOT。 |
| Unity | 目前硬性要求同層 EXE、`UnityPlayer.dll`、任意 `*_Data`；其他輸出／分層形式與 UnitySample Mac App 會漏判。 | 驗證 EXE 與資料目錄關聯；缺 DLL 的版本／部署形式另立有證據的規則，Mac bundle 依上節結合 plist／執行檔／引擎資源。引擎工具／編輯器與不相干標記拼湊須列反例，不能因 Unity 身分直接確認遊戲。 |
| Godot | 外部 `.pck` 以外，只特判一個 EXE 名稱；內嵌 PCK 的改名單檔版無對應辨識。 | 外部／內嵌形式分開；任意 EXE＋不相干 `.pck`、編輯器名稱與一般 Godot 應用不得單獨當作遊戲證據。單檔內嵌版維持人工入口：只有 EXE 一律不判為遊戲（測試固定）；`Scene.pck`＋`Gameexe.dat` 走 SiglusEngine 規則。 |
| RPG Maker 2000／2003 | 目前只認同層 EXE＋固定名稱 LDB／LMT；分層或自訂包裝未涵蓋。 | 以對應資料與執行環境組合，專案原始資料、只有其中一個標記、無關啟動器不能直接確認；版本不明時保留家族候選。 |
| RPG Maker XP／VX／VX Ace | 只認 `Game.rgssad`／`Game.rgss2a`／`Game.rgss3a`，未涵蓋沒有這些固定封包的資料形式。 | 封包與未封包形式分開研究；結合設定、資料及執行環境，不能只靠通用 `Game.exe`／Data 或 RGSS DLL；不把缺封包當成不是遊戲。 |
| RPG Maker MV／MZ／UNITE | MV／MZ 只查 `js`／`www/js` 的固定核心檔；額外封裝、改路徑未涵蓋；UNITE 無獨立規則。 | 核心腳本與資料／入口關聯後再提出候選；NW.js／Electron、普通網頁程式及編輯器專案檔不是充分證據。UNITE 與 Unity 可重疊，不強猜版本。 |
| Ren’Py | 只查 `game` 第一層 `.rpy`／`.rpyc`／`.rpa`，腳本全在子目錄或自訂包裝可能漏判。 | 受限子路徑與封包／未封包形式均納入；改 EXE 名稱不應影響標準結構。SDK／Launcher、只有腳本副本與缺少執行環境的目錄須列反例。 |
| KiriKiri／KiriKiri Z | 只認 EXE＋外部 `.xp3`，內嵌或自訂包裝未涵蓋。 | 單一 XP3 只能作線索，需與執行環境關聯；工具、補丁及其他用途 XP3 須列反例。不解包／解密來強行辨識。 |
| TyranoScript／TyranoBuilder | 只認 EXE＋`tyrano`＋`data` 名稱，ASAR 等額外桌面封裝無外露標記時不命中；TyranoAsarSample／TyranoDataSample 有隨附引擎說明，TyranoManualSample 引擎仍待確認。 | 驗證入口與 Tyrano 特徵的關聯，區分 Builder／桌面包裝；普通網頁、同名目錄、app.asar、Chromium、說明檔與使用者存檔名不能單獨確認遊戲引擎，不靠解包補判定。 |
| WOLF RPG Editor | 已有 EXE＋`Data.wolf`，另補同一 `Data/BasicData` 的 `Game.dat`＋`DataBase.dat`；缺少外露基本資料的其他改名／封裝形式仍待樣本。 | 封裝與未封裝形式分開驗證；`Game.exe`、Data 或單獨 `.wolf` 均不能單獨確認，不跨作品拼接基本資料。 |
| GameMaker | 只認 EXE＋`data.win`；不同 VM／YYC 輸出及自訂封裝需樣本，不能宣稱全部覆蓋。 | 按輸出形式補證據；無 `data.win` 不排除 GameMaker，任意同名檔＋EXE 也不是充分證據。 |
| Cocos Creator／Cocos2d-x | 只認 EXE＋`cocos2d.dll`＋`resources`，未涵蓋不同版本／原生與網頁部署。 | 按部署形式組合引擎與入口／資源線索；不把單一 DLL、同名 resources 或開發專案直接當成發行遊戲。 |
| Construct 2／3 | 只查 EXE＋`www/c2runtime.js`，其他 runtime、路徑及較新桌面匯出未涵蓋。 | 不硬性依賴舊 runtime／NW.js；普通網頁、只有 runtime 腳本或共用桌面框架須列反例，具體新規則先驗樣本。 |
| Defold | 只認 EXE＋`game.arcd`＋`game.arci`，分層／改名包裝未涵蓋。 | 檢查成對資料與執行檔歸屬；孤立封包、不成對檔案與不同作品標記混放不能直接確認。 |
| LÖVE | EXE＋`love.dll`＋外部 `.love`，或合併 EXE 的 `love.dll`＋`lua51.dll`（2026-11-04 補上）。 | 外部 `.love` 與 fused EXE 分開處理；單獨 love.dll／通用執行環境、不相干 `.love` 與工具須列反例。 |
| 尚無規則／自製引擎 | Source／Source 2、CRYENGINE、AGS、MonoGame／FNA／XNA 等沒有自動辨識覆蓋。 | 顯示未知／待人工確認，保留手動 ROOT；不得把「未支援辨識」顯示成已確認不是遊戲，也不承諾通用規則可涵蓋所有框架。 |

## 驗收與演進

1. 先用受控假目錄驗證四個指定引擎家族及可確認的其他家族；每條自動規則都要有命中、誤判、缺標記、改名／多 EXE、收藏根包含多款遊戲的案例，再宣告對應版本支援。
2. 同一引擎的編輯器／工具、只有普通 `Data`／EXE 的目錄、網頁程式、模組及共享執行環境不能直接被當成已確認遊戲；顯示依據並可修正。
3. 在 ROOT 寫入前完成邊界判定；ROOT 只使用自己的可攜目錄，遊戲內部原始檔及目錄逐項比對不變，內部無新記錄。受控案例需涵蓋精確深度、唯讀繼續、取消、重掃、權限錯誤與 junction。
4. 未知／單檔／封裝變體能手動停止；誤判能恢復正常掃描。舊內部記錄需既有清理預覽，不因偵測器升版自動移除。
5. 後續按家族新增資料規則與樣本，沿用同一掃描流程；不為提高涵蓋率新增背景執行或遊戲資源拆解。大量候選探測成本另量測，不能宣稱零成本。
6. 先以 UnrealSampleA 同結構的受控假目錄重現漏判，再驗證 ROOT 停在外層，Shipping EXE／Content／Plugins 等內部不新增記錄；測試不用真實遊戲，也不執行其中 EXE。
7. 上表每個新增／變更的自動規則至少覆蓋：標準命中、已知漏判變體、弱線索誤判、缺標記、改名、多 EXE、跨層、多遊戲集合與錯誤 ROOT。無法辨識的變體須驗證候選／人工停止，不以任意放寬條件湊命中。
8. 共通驗收包含：偽造同名檔／目錄、工具／編輯器、混合引擎線索、內嵌／未封包、探測超限、權限失敗、取消、junction、人工 ROOT／not-game 與重掃。每案核對候選、依據、ROOT 及寫入範圍；失敗／不確定不得新增內部記錄。既有人工覆寫與各專案遍歷偏好須保留。
9. 已存在內部記錄的受控案例，確認升級／重掃不自動刪改原檔或清理他人記錄；若涉及清理，另驗備份、衝突、部分失敗與復原，不把此次辨識修正當成批次遷移授權。
10. 補三款同結構的受控案例：UnrealSampleB 型 Unreal 分層且 EXE 無版本資訊；TyranoManualSample 型通用 ASAR 包裝、Tyrano 弱線索、已手動 ROOT 與歷史子記錄；NTR 配信型「說明檔＋單一內層 MV 遊戲」。逐一驗證候選可信度、ROOT、實際停止位置與寫入範圍，不把通用 Electron／NW.js 應用當成已確認遊戲，也不把外包裝多一層誤報為內部資源漏掃。
11. 補 TyranoAsarSample 的 TyranoBuilder ASAR、TyranoDataSample 的 ASAR＋外露 data、UnitySample 的 Windows／Mac／Android 並列及雙層 MacOS 包裝。Mac 案例包含改名 App、Unicode／大小寫、XML／binary／惡意或破損 plist、缺主執行檔、普通非遊戲 App、內外連結、`__MACOSX`、多作品混放與歷史 bundle 內記錄；核對外層記錄及 App 內零新增／零修改，不自動清理舊記錄。
12. Mac 啟動驗收與辨識分開：Windows 對 `.app` 顯示平台不相容並拒絕啟動，辨識與邊界保護仍有效；macOS 需另驗原生 App 啟動、參數、搬移、缺檔、最低版本／架構、權限與系統拒絕。無 macOS 環境時必須明列未執行，不用 Windows 假目錄測試宣稱 Mac 可啟動。

歷史診斷界線：原 2026-10-26 覆蓋研究只查官方資料；2026-10-27 的唯讀診斷確認上述七款指定目錄的結構／標記與所列限制。TyranoManualSample 封包內引擎及本次實際掃描行為未驗證。該次診斷只讀取指定內容。後續修正已在 tests/game-detection.test.ts 與資料回歸使用受控資料樹驗證，沒有重掃真實收藏或啟動遊戲；macOS 原生啟動未執行，其他變體仍待樣本驗證。啟動動作與參數設計見 [遊戲內容頁](GAME_VIEWER_DESIGN.md)。

## 2026-11-04 新增規則（尚未用真實樣本驗證）

依公開的部署結構補上：CRYENGINE（`CrySystem.dll`）、Adventure Game Studio（`acsetup.cfg`）、MonoGame／FNA／XNA（框架 DLL）、Source（`hl2.exe` 或 `bin/engine.dll`＋`tier0.dll`）、Source 2（`engine2.dll`）、Adobe AIR（`META-INF/AIR/application.xml`）、DOSBox 套件（`dosbox.exe` 或 `dosbox*.conf`＋EXE）、PC-98 模擬器（Neko Project II 類執行檔＋磁碟映像）。目前只用合成資料夾測試，真實遊戲樣本到手前一律視為候選，需以「確認 ROOT／這不是遊戲」人工把關；日本 galgame 的 Majiro、FVP 因缺少可信的部署特徵，等有樣本再補（Circus、Live Maker、SMILE GAME BUILDER、RPG Developer Bakin 已於同日依樣本補上，見下節）。

## 2026-11-04 依使用者樣本補上的規則

樣本在使用者的 `test game` 資料夾，只讀取目錄結構，未寫入。

| 引擎 | 規則 | 樣本 |
| --- | --- | --- |
| CatSystem2 | 至少兩個 `.int` 封包，加上 `cs2conf.dll` 或 `config/startup.xml`，且有 EXE | 灰色的果實（漢化版，根目錄只有補丁 EXE） |
| SoftPal | 至少兩個 `.pac` 封包，加上 `Pal.dll`（根目錄或 `dll/`），且有 EXE | 夏色心跳日誌 |
| LÖVE（合併 EXE） | `love.dll`＋`lua51.dll`，沒有 `.love` | Moonring |
| Circus | 有 `AdvData` 資料夾，裡面 `GRP` 有 `.crx` 圖片或 `MES` 有 `.mes` 腳本，且有 EXE | 水夏 A.S.+（樣本資料夾標為 Ethornell，實際是 Circus） |
| LiveMaker | `live.dll`＋EXE（遊戲資料包在 EXE 內） | 4gatsu_8ka |
| RPG Developer Bakin | `data/bakinplayer.exe` 或 `data/data.rbpack`，且有 EXE | Blade of Zenna Demo |
| SMILE GAME BUILDER | `data.sgbpack` 或 `sgb_rpgplayer.exe` | グランブーム国物語 |
| LucaSystem | `files/SCRIPT.PAK` 加上 `files` 裡至少另一個 `.PAK`，且有 EXE；Prototype 的引擎，Key 作品的 Steam 版（AIR、CLANNAD、Kanon、Summer Pockets 等）使用，依 [LuckSystem](https://github.com/wetor/LuckSystem) 的說明確認 | AIR（Steam 版，原版是 RealLive） |
| Nitroplus NPK | 至少 3 個 `.npk` 封包＋EXE；Nitroplus／Nitro Origin 的封包格式，引擎沒有公開名稱，故以封包命名 | みにくいモジカの子（Steam 版） |

同批以樣本確認既有規則：Ren’Py、Godot（EXE＋同名 `.pck`）、Unity 照常辨識；Godot 單一 EXE 照規則不判遊戲。標為 Majiro 的「Narcissu」實際是 NScripter（`nscript.dat`＋`arc.nsa`），由既有規則辨識，Majiro 仍無真正樣本。標為 Ethornell 的「水夏 A.S.+」實際是 Circus（CRX 圖片是 Circus 的格式），Ethornell 仍以既有規則（`BGI*.exe`＋`.arc`）辨識。「RPG Developer BAKIN Multi Vignette System」樣本資料夾是空的，無法判斷。反例 `.int`、`.pac` 單獨出現、`love.dll` 單獨出現都不判遊戲，已寫進測試。
