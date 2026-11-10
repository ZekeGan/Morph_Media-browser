# 遊戲引擎辨識

> 本頁只寫現行的辨識規則與邊界策略，不承擔畫面或工作進度。導覽能否進入依 [現行工作區](WORKSPACE_REVISION.md)，內容／動作見 [遊戲](GAME_VIEWER_DESIGN.md)；取捨與歷次診斷見 [DECISIONS](DECISIONS.md)（C-80 起）。程式：`electron/game-detection.ts`；測試：`tests/game-detection.test.ts`；唯讀試跑：`pnpm detect <資料夾> [--children]`。最後確認：2026-11-11。

## 目的與原則

辨識是為了找出「應停止遞迴的遊戲 ROOT」，不是讀取或轉換遊戲資源。引擎身分、是否為遊戲、是否為收藏集合根是三個不同的判斷；引擎做的工具、編輯器與模組也可能命中特徵。

- 只讀目錄名稱與檔案型別；不執行 EXE／JS／腳本，不解包、解密，不讀資源或 EXE 內容（唯一例外是 `app.asar` 開頭的檔案目錄，見下表）。
- 自動結果一律是**候選**，不自動宣告 ROOT；使用者的「確認 ROOT」或「這不是遊戲」優先，新規則不得靜默覆蓋。
- 候選在建立子層記錄前就處理；未解決的候選保持暫停，例外、權限錯誤或取消都不能變成「無遊戲、可繼續寫入」。
- 單一線索（`.exe`、`Data`、`.pak`、`package.json`、單一 DLL、EXE 版本資訊、圖示、存檔名）都不足以判定遊戲；規則必須是同一款遊戲內的檔案組合。
- 找不到引擎仍可手動設為 ROOT；未知或自製引擎不阻擋遊戲檢視與使用者指定的 EXE。

## 探測範圍

- 每次探測最多 64 個目錄、12,000 筆目錄項目、相對深度 5；超限時暫停為候選，請人工確認。權限或路徑錯誤停止該分支。不跟隨連結，取消後不排入後續分支。
- `app.asar`：只讀 16 位元組表頭與最多 4 MiB 的 JSON 檔案目錄、只看最上層名稱；開不了、格式異常或過大一律退回「封裝應用候選」。
- 任意 `.app` bundle（含未知引擎與破損 plist）視為不可寫入的程式 bundle：根與內部都不建記錄、不深入。
- 雙擊／路徑列導覽與掃描採同一套停止規則：遊戲 ROOT 的內部子資料夾不發布到 CARD／TABLE／TREE，除非使用者明確啟用唯讀遍歷。建立／載入巢狀專案與共同寫入入口也會檢查所有上層的保護；已連結的舊內部專案停止寫入，歷史內部記錄原樣保留、不自動清理。

## 辨識規則

「EXE」指同一層的一般 `.exe` 檔。標「候選」的規則特別容易命中補丁或工具，介面會請使用者確認。

| 引擎 | 規則 | 不成立的情況（反例已入測試） |
| --- | --- | --- |
| Unity | 同名 EXE＋`*_Data`＋`UnityPlayer.dll`；Mac App：主執行檔＋`Frameworks/UnityPlayer.dylib`＋`Resources/Data` | 名為 `*_Data` 的檔案、缺 DLL 的不完整部署（列未知候選） |
| Unreal | `Binaries/Win64` 有 EXE＋`Content/Paks` 有 PAK／IoStore；外層啟動器只與同名產品資料夾配對 | 單獨 `.pak`／`.utoc`、共用 Engine、不同作品拼接；不依賴 EXE 版本資訊 |
| Godot | 同名 EXE＋`.pck`；內嵌 PCK 的單一 EXE 只在旁有同名 `.console.exe` 時成立 | 只有 EXE（維持一般資料夾，可手動指定）；`.pak` 不是 Godot 證據 |
| RPG Maker MZ／MV | `js/rmmz_core.js`（MZ）或 `js/rpg_core.js`（MV）＋`data`＋EXE，也查 `www/` 下 | 只有核心腳本、NW.js／一般網頁程式、編輯器專案檔 |
| RPG Maker XP／VX／VX Ace | RGSS 封包（`Game.rgssad`／`.rgss2a`／`.rgss3a`）＋EXE | 只有 `Game.exe`／Data 或 RGSS DLL |
| RPG Maker 2000／2003 | LDB＋LMT＋EXE | 只有其中一個 |
| Ren’Py | `renpy`＋`game` 的腳本或封包＋EXE | SDK／Launcher、只有腳本副本 |
| TyranoScript | 解包版：同一 `resources/app` 內有入口、Tyrano／KAG 核心、`data/system/Config.tjs` 與 `.ks` 劇本＋EXE；外露版：`tyrano`＋`data`＋EXE；Electron 打包版：`app.asar` 檔案目錄最上層有 `tyrano` 與 `data`＋EXE | 只有 app.asar、Chromium、說明檔或存檔名；有真正的 asar 檔時不拿旁邊的 app 目錄推定 |
| WOLF RPG Editor | `Data.wolf`＋EXE；或同一 `Data/BasicData` 內有 `Game.dat`＋`DataBase.dat`＋EXE（未封包、混合封包） | 單獨 `.wolf`、`Game.exe`、跨路徑拼接；不深入 AutoBackup |
| GameMaker | `data.win`＋EXE（候選；YYC 輸出需人工確認） | 無 `data.win` 不排除 GameMaker |
| Defold | 成對 `game.arcd`／`game.arci`＋EXE | 不成對的封包 |
| LÖVE | `love.dll`＋`.love`＋EXE；或合併 EXE 的 `love.dll`＋`lua51.dll` | 單獨 `love.dll` |
| Cocos | `cocos2d.dll`＋`resources`＋EXE | 單一 DLL、開發專案 |
| Construct | `www/c2runtime.js`＋EXE（候選） | 只有 runtime 腳本 |
| KiriKiri | XP3＋EXE（候選） | 工具、補丁的 XP3 |
| CRYENGINE、Adventure Game Studio、MonoGame／FNA／XNA、Source、Source 2、Adobe AIR | 依各自部署結構：`CrySystem.dll`、`acsetup.cfg`、框架 DLL、`hl2.exe` 或 `bin/engine.dll`＋`tier0.dll`、`engine2.dll`、`META-INF/AIR/application.xml`，皆需 EXE | 只用合成資料夾驗證過，視為候選 |
| DOSBox 套件、PC-98 模擬器 | `dosbox.exe` 或 `dosbox*.conf`＋EXE；Neko Project II 類執行檔＋磁碟映像 | 包裝內的實際遊戲需人工確認 |
| Artemis | EXE＋`.pfs`（含 `.pfs.000`） | 沒有 EXE 的 `.pfs` |
| AI6WIN | `AI6WIN*.exe`（補丁版可能把 `.arc` 移進子資料夾，所以只看執行檔名） | — |
| BGI／Ethornell | `BGI*.exe`＋`.arc` | 單獨 `.arc` |
| ONScripter／NScripter | ONScripter 執行檔，或 `nscript.dat`／`ons.cfg`＋`.nsa`／`.sar` | — |
| RealLive／AVG32 | `GAMEEXE.INI`＋`SEEN.TXT`／`PDT`／`AVG32*.exe` | — |
| SiglusEngine | `Scene.pck`＋`Gameexe.dat`＋EXE | — |
| YU-RIS | `.ypf`＋EXE（候選） | — |
| Nitroplus NPA／NPK | 至少兩個 `.npa`＋EXE；至少三個 `.npk`＋EXE | 單一 `.npa` |
| CatSystem2 | 至少兩個 `.int`＋`cs2conf.dll` 或 `config/startup.xml`＋EXE | 單獨 `.int` |
| SoftPal | 至少兩個 `.pac`＋`Pal.dll`（根目錄或 `dll/`）＋EXE | 單獨 `.pac` |
| Circus | `AdvData` 內 `GRP` 有 `.crx` 或 `MES` 有 `.mes`＋EXE | — |
| LiveMaker | `live.dll`＋EXE（資料包在 EXE 內） | — |
| RPG Developer Bakin | `data/bakinplayer.exe` 或 `data/data.rbpack`＋EXE | — |
| SMILE GAME BUILDER | `data.sgbpack` 或 `sgb_rpgplayer.exe` | — |
| LucaSystem | `files/SCRIPT.PAK`＋`files` 內至少另一個 `.PAK`＋EXE（Key 作品 Steam 版等） | — |

### 只列候選、不推定引擎

以下組合只代表「這裡可能是一個程式」，引擎維持未知，先停止深入並請使用者確認 ROOT 或標為「這不是遊戲」：

- **NW.js**：EXE＋NW 資源檔（`nw.pak`／`nw_100_percent.pak`／`nw_200_percent.pak`）與執行環境（`nw.dll`、`nw_elf.dll`、`chrome_elf.dll`、`icudt.dll` 之一，或成對 `libEGL.dll`／`libGLESv2.dll`）。
- **封裝應用**：EXE＋`resources/app.asar`，且 asar 最上層看不出 Tyrano。
- **Steam 發行版**：其他規則都沒命中時，EXE＋`steam_api.dll`／`steam_api64.dll`。

## 漏判、誤判與 ROOT 定位規則

- **分開判斷**：引擎候選、遊戲候選、應停止的 ROOT 與依據分開保存；認出 Shipping EXE 所在目錄，不代表那裡是 ROOT。
- **跨層但有範圍**：規則可在受限深度內結合同一款遊戲的外層啟動器、內層執行檔與部署資料，但不跨作品拼接。
- **收藏集合不是遊戲**：多款遊戲、多平台、多個 EXE、模組、補丁與共用 Engine 目錄要分辨歸屬；歸屬不明保留候選，不自動選第一個 EXE，也不把集合上層設成 ROOT。
- **外包裝與內部封裝分開**：只有說明檔＋一個遊戲目錄的包裝層，要指出內層的實際 ROOT 供確認。
- **檔名只是線索**：驗證所需檔案／目錄的型別與關聯；名為 `Game.exe` 的目錄、名為 `*_Data` 的檔案不能通過。
- **未命中不等於不是遊戲**：內嵌、改名、未封裝、自訂啟動器與未知引擎都有人工 ROOT 入口；完全沒有線索的一般目錄照專案規則處理，不因專案是遊戲類就把每個目錄當 ROOT。
- **多引擎同時命中**：保留各自依據，不強猜版本或唯一引擎。
- **寫入前保護**：辨識在初始化子層記錄前完成；ROOT 可有自身記錄，內部維持保護。確認 ROOT、唯讀遍歷、取消、重掃、跨專案遍歷偏好與精確深度都不得繞過邊界；舊內部記錄的清理照 [儲存安全](STORAGE_OPTIONS.md) 的預覽、備份與復原流程。
- `folder.json` 沒有 boundary 不代表沒命中：自動候選只存在掃描結果，使用者確認時才保存證據與 ROOT。

### Mac 封裝與多平台規則

辨識與保護在 Windows 上就會執行；原生啟動 Mac App 尚未支援，契約見 [遊戲啟動條件](GAME_VIEWER_DESIGN.md#mac-遊戲執行條件未支援)。

- Mac App 不以 `.exe` 為必要條件：`.app` 一律視為受保護的程式 bundle，不在根或 `Contents` 內建立 `.media-viewer`，遊戲記錄放在外層資料夾；不搬動、重包、改簽章。
- 目前只有 Unity 有 Mac 規則（plist 指向的主執行檔＋`UnityPlayer.dylib`＋`Resources/Data`）；尚未解析 plist 內容或驗證主機能否啟動。其他引擎的 Mac 輸出需樣本，不套用 Windows 規則。
- 同款 Windows／Mac／Android 並列時分開記錄各平台目標，提出共同外層候選供確認；不跨平台拼湊標記，Windows 分支命中不代表 Mac 分支已受保護。
- `__MACOSX`、`.DS_Store`、`._*` 只是包裝輔助線索；ZIP／DMG／APK 不自動解包、安裝或執行。

## 尚未涵蓋

- **沒有規則**：Majiro、FVP（缺可信的部署特徵，等真正的樣本）；KiriKiri 內嵌版、GameMaker YYC、Unreal 早期世代與其他容器、RPG Maker UNITE（與 Unity 重疊）等變體。
- **只用合成資料夾驗證**：CRYENGINE、Adventure Game Studio、MonoGame／FNA／XNA、Source、Source 2、Adobe AIR、DOSBox、PC-98 模擬器。
- **未驗證**：plist 解析與 macOS 原生啟動。

這些情況一律以人工「確認 ROOT」兜底，介面不得把「未支援辨識」顯示成「已確認不是遊戲」。

## 驗收與演進

1. 每條新增或修改的規則，在 `tests/game-detection.test.ts` 用受控假目錄覆蓋：標準命中、已知漏判變體、弱線索誤判、缺標記、改名、多 EXE、跨層、多遊戲集合與錯誤 ROOT；不以放寬條件湊命中。
2. 共通驗收：偽造同名檔／目錄、工具／編輯器、混合引擎、內嵌／未封包、探測超限、權限失敗、取消、junction、人工 ROOT／not-game 與重掃；每案核對候選、依據、ROOT 與寫入範圍，失敗或不確定時不得新增內部記錄。
3. ROOT 內部的原始檔與目錄逐項比對不變；已有內部記錄的案例確認重掃不刪改原檔。
4. 真實樣本只用 `pnpm detect` 唯讀檢查使用者指定的資料夾，不執行掃描、不啟動遊戲；文件與測試不寫入使用者收藏的作品名稱或路徑。
5. Mac 啟動驗收與辨識分開：Windows 對 `.app` 顯示平台不相容並拒絕啟動；沒有 macOS 環境時明列未執行。

## 依據

引擎結構依官方文件與原始碼：[Unity](https://docs.unity3d.com/6000.0/Documentation/Manual/WindowsStandaloneBinaries.html)、[Unreal](https://dev.epicgames.com/documentation/en-us/unreal-engine/packaging-your-project)、[Godot](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html)、[RPG Maker MV](https://github.com/rpgtkoolmv/corescript)、[RPG Maker MZ](https://rpgmakerofficial.com/product/MZ_help-en/01_11_03.html)、[Ren’Py](https://www.renpy.org/doc/html/build.html)、[KiriKiri Z](https://github.com/krkrz/krkrz/blob/master/base/XP3Archive.cpp)、[TyranoScript](https://github.com/ShikemokuMK/tyranoscript)、[WOLF RPG Editor](https://silversecond.com/WolfRPGEditor/Help/01filelist.html)、[GameMaker](https://manual.gamemaker.io/monthly/en/Introduction/Compiling.htm)、[Cocos Creator](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/windows/index.html)、[Construct](https://www.construct.net/en/make-games/manuals/construct-3/tips-and-guides/deprecated-features)、[Defold](https://defold.com/manuals/bundling/)、[LÖVE](https://love2d.org/wiki/Game_Distribution)、[LuckSystem](https://github.com/wetor/LuckSystem)（LucaSystem）、[Apple bundle](https://developer.apple.com/documentation/bundleresources/placing-content-in-a-bundle)。日系視覺小說引擎的規則另依使用者提供的樣本（唯讀檢查目錄結構）確認；所有規則仍屬候選，以人工確認為準。
