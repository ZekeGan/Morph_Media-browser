import fs from 'node:fs/promises'
import path from 'node:path'
import { safePath } from './files'
// Limits apply to each read-only probe. Exceeding them stops the branch.
export const GAME_PROBE_LIMITS = { directories: 64, entries: 12000, depth: 5 }
export class GameProbeLimit extends Error {}
export interface GameDetection {
  engines: string[]
  evidence: string[]
}
// An Electron app.asar starts with a 16-byte pickle header followed by the JSON file tree. Only that tree's
// top-level names are read (never file contents), and only up to a fixed size; anything unexpected gives undefined.
export const ASAR_HEADER_LIMIT = 4 * 1024 * 1024
export async function asarTopLevel(file: string): Promise<Set<string> | undefined> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    // A file that cannot be opened (locked, no permission) simply stays the unknown candidate.
    handle = await fs.open(file, 'r')
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size < 17) return undefined
    const head = Buffer.alloc(16)
    if ((await handle.read(head, 0, 16, 0)).bytesRead !== 16) return undefined
    const length = head.readUInt32LE(12)
    if (head.readUInt32LE(0) !== 4 || length < 2 || length > ASAR_HEADER_LIMIT) return undefined
    if (length > head.readUInt32LE(8) || 16 + length > stat.size) return undefined
    const json = Buffer.alloc(length)
    if ((await handle.read(json, 0, length, 16)).bytesRead !== length) return undefined
    const tree = JSON.parse(json.toString('utf8')) as { files?: unknown }
    if (!tree || typeof tree.files !== 'object' || tree.files === null) return undefined
    return new Set(Object.keys(tree.files).map((name) => name.toLowerCase()))
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => {})
  }
}
export const insideAppBundle = (dir: string) =>
  path
    .resolve(dir)
    .split(/[\\/]/)
    .some((part) => /\.app$/i.test(part))
export async function detectGame(dir: string): Promise<GameDetection | undefined> {
  let directoryCount = 0,
    entryCount = 0
  type Entry = { name: string; kind: 'file' | 'dir' | 'link' }
  const cache = new Map<string, Map<string, Entry>>()
  async function list(rel = '') {
    const key = rel.toLowerCase()
    if (cache.has(key)) return cache.get(key)!
    if (
      rel.split('/').filter(Boolean).length > GAME_PROBE_LIMITS.depth ||
      ++directoryCount > GAME_PROBE_LIMITS.directories
    )
      throw new GameProbeLimit('遊戲邊界探測超限，請人工確認 ROOT')
    const target = path.join(dir, rel)
    await safePath(dir, target)
    const result = new Map<string, Entry>()
    try {
      const handle = await fs.opendir(target)
      for await (const entry of handle) {
        if (++entryCount > GAME_PROBE_LIMITS.entries)
          throw new GameProbeLimit('遊戲邊界探測超限，請人工確認 ROOT')
        result.set(entry.name.toLowerCase(), {
          name: entry.name,
          kind: entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'dir' : 'file',
        })
      }
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
    }
    cache.set(key, result)
    return result
  }
  async function locate(rel: string, kind: 'file' | 'dir') {
    let current = ''
    const parts = rel.split('/')
    for (let i = 0; i < parts.length; i++) {
      const entry = (await list(current)).get(parts[i].toLowerCase())
      if (entry?.kind === 'link') throw new Error('遊戲特徵包含連結，停止此分支並請人工確認')
      if (!entry || entry.kind !== (i === parts.length - 1 ? kind : 'dir')) return undefined
      current = current ? current + '/' + entry.name : entry.name
    }
    return current
  }
  const file = async (rel: string) => !!(await locate(rel, 'file'))
  const folder = async (rel: string) => !!(await locate(rel, 'dir'))
  const files = async (rel: string, pattern: RegExp) =>
    [...(await list(rel)).values()].filter((e) => e.kind === 'file' && pattern.test(e.name))
  const root = await list(),
    exes = [...root.values()].filter((e) => e.kind === 'file' && /\.exe$/i.test(e.name))
  const result: GameDetection = { engines: [], evidence: [] }
  const add = (engine: string | undefined, reason: string) => {
    if (engine && !result.engines.includes(engine)) result.engines.push(engine)
    result.evidence.push(reason.slice(0, 500))
  }
  if (/\.app$/i.test(path.basename(dir))) {
    // Unknown/binary/malformed plists never allow writes into an application bundle.
    const executable =
      (await folder('Contents/MacOS')) && (await files('Contents/MacOS', /.+/)).length > 0
    if (
      executable &&
      (await file('Contents/Frameworks/UnityPlayer.dylib')) &&
      (await folder('Contents/Resources/Data'))
    )
      add('Unity', 'Mac App：主執行檔 + UnityPlayer.dylib + Resources/Data')
    else add(undefined, '受保護的 Mac App bundle；引擎未確認，記錄須放外層資料夾')
    return result
  }
  if (exes.length) {
    const stems = exes.map((e) => e.name.slice(0, -4))
    // NW.js can append the app to a renamed EXE. Runtime structure is only a
    // stopping candidate, never evidence of a particular game engine or game.
    const nwResources =
      (await file('nw.pak')) ||
      (await file('nw_100_percent.pak')) ||
      (await file('nw_200_percent.pak'))
    const nwRuntime =
      nwResources &&
      ((await file('nw.dll')) ||
        (await file('nw_elf.dll')) ||
        (await file('chrome_elf.dll')) ||
        (await file('icudt.dll')) ||
        ((await file('libEGL.dll')) && (await file('libGLESv2.dll'))))
    if (nwRuntime)
      add(
        undefined,
        'EXE + NW.js 資源／執行環境組合：可能為內嵌或封裝應用；引擎未知，暫停深入，請確認 ROOT／非遊戲'
      )
    const unityRuntime = await file('UnityPlayer.dll'),
      unityData = (await Promise.all(stems.map((stem) => folder(stem + '_Data')))).some(Boolean)
    if (unityRuntime && unityData) add('Unity', '同名 EXE／*_Data + UnityPlayer.dll')
    else if (unityRuntime || unityData)
      add(undefined, 'Unity 部署線索不完整或名稱不相符；先停止，請確認 ROOT／非遊戲')
    if (
      (await Promise.all(stems.map((stem) => file(stem + '.pck')))).some(Boolean) &&
      !exes.every((e) => /godot.*(editor|tools)/i.test(e.name))
    )
      add('Godot', '同名 EXE／PCK（內嵌版本需人工確認）')
    // A single-file export (PCK embedded) still ships Godot's console wrapper: Game.exe beside Game.console.exe.
    if (
      !result.engines.includes('Godot') &&
      exes.some(
        (e) =>
          /\.console\.exe$/i.test(e.name) &&
          stems.some((stem) => stem.toLowerCase() === e.name.slice(0, -12).toLowerCase())
      ) &&
      !exes.every((e) => /godot.*(editor|tools)/i.test(e.name))
    )
      add('Godot', '同名 EXE + .console.exe（Godot 的主控台版本；PCK 內嵌，需人工確認）')
    for (const base of ['', 'www/']) {
      if (!(await folder(base + 'data')) || !(await folder(base + 'js'))) continue
      if (await file(base + 'js/rmmz_core.js'))
        add('RPG Maker MZ', base + 'js/rmmz_core.js + data + EXE')
      else if (await file(base + 'js/rpg_core.js'))
        add('RPG Maker MV', base + 'js/rpg_core.js + data + EXE')
    }
    if ((await Promise.all(['Game.rgssad', 'Game.rgss2a', 'Game.rgss3a'].map(file))).some(Boolean))
      add('RPG Maker XP/VX/Ace', 'RGSS 封包 + EXE；版本需確認')
    if ((await file('RPG_RT.ldb')) && (await file('RPG_RT.lmt')))
      add('RPG Maker 2000/2003', 'LDB + LMT + EXE')
    if (
      (await folder('tyrano')) &&
      (await folder('data')) &&
      ((await file('index.html')) || (await file('tyrano/tyrano.js')))
    )
      add('TyranoScript', 'Tyrano 入口／核心 + tyrano + data + EXE')
    const packedApp = await file('resources/app.asar')
    // An Electron-packed TyranoScript game keeps tyrano/ and data/ at the top of its app.asar tree.
    const packedTree = packedApp
      ? await asarTopLevel(path.join(dir, 'resources', 'app.asar'))
      : undefined
    const tyranoPacked = !!packedTree?.has('tyrano') && packedTree.has('data')
    if (tyranoPacked)
      add('TyranoScript', 'resources/app.asar 的檔案目錄含 tyrano + data + EXE（不解包）')
    // Do not infer the contents of a real archive from a neighboring app folder.
    if (!packedApp)
      for (const base of ['resources/app', 'resources/app.asar']) {
        if (!(await folder(base))) continue
        const entry = (await file(base + '/package.json')) && (await file(base + '/index.html'))
        const tyrano =
          entry &&
          (await file(base + '/tyrano/tyrano.js')) &&
          (await file(base + '/tyrano/plugins/kag/kag.js')) &&
          (await file(base + '/data/system/Config.tjs')) &&
          (await folder(base + '/data/scenario')) &&
          (await files(base + '/data/scenario', /\.ks$/i)).length > 0
        if (tyrano)
          add(
            'TyranoScript',
            '外層 EXE + ' +
              base +
              '：package.json／index.html + Tyrano／KAG 核心 + Config.tjs + 劇本；ROOT 停在外層'
          )
        else if (entry || base === 'resources/app.asar')
          add(undefined, '外層 EXE + ' + base + ' 解包應用候選；遊戲結構未完整確認，暫停深入')
      }
    if ((await folder('renpy')) && (await folder('game'))) {
      let scripts = (await files('game', /\.(rpy|rpyc|rpa)$/i)).length > 0
      for (const child of (await list('game')).values())
        if (!scripts && child.kind === 'dir')
          scripts = (await files('game/' + child.name, /\.(rpy|rpyc|rpa)$/i)).length > 0
      if (scripts) add('Ren’Py', 'renpy + game 腳本／封包 + EXE')
    }
    if (await file('Data.wolf')) add('WOLF RPG', 'Data.wolf + EXE（候選）')
    else if ((await file('Data/BasicData/Game.dat')) && (await file('Data/BasicData/DataBase.dat')))
      add('WOLF RPG', 'EXE + 同一 Data/BasicData 的 Game.dat／DataBase.dat（未封包或混合封包候選）')
    if (await file('data.win')) add('GameMaker', 'data.win + EXE（候選；YYC 需人工確認）')
    if ((await file('game.arcd')) && (await file('game.arci')))
      add('Defold', '成對 game.arcd／game.arci + EXE')
    if ((await file('love.dll')) && (await files('', /\.love$/i)).length)
      add('LÖVE', 'love.dll + .love + EXE')
    // A fused LÖVE game has no .love file; its runtime pair (love.dll with the Lua runtime) is the evidence.
    else if ((await file('love.dll')) && (await file('lua51.dll')))
      add('LÖVE', 'love.dll + lua51.dll + EXE（合併成單一 EXE 的發行版）')
    if ((await file('cocos2d.dll')) && (await folder('resources')))
      add('Cocos', 'cocos2d.dll + resources + EXE')
    // Engines recognised from the files their runtime ships next to the EXE (public deployment layouts).
    if (
      (await file('CrySystem.dll')) ||
      (await file('Bin64/CrySystem.dll')) ||
      (await file('Bin32/CrySystem.dll'))
    )
      add('CRYENGINE', 'CrySystem.dll + EXE')
    if (await file('acsetup.cfg')) add('Adventure Game Studio', 'acsetup.cfg + EXE')
    if (
      (await file('MonoGame.Framework.dll')) ||
      (await file('FNA.dll')) ||
      (await file('Microsoft.Xna.Framework.dll'))
    )
      add('MonoGame／FNA／XNA', 'MonoGame／FNA／XNA 框架 DLL + EXE')
    if (
      (await file('hl2.exe')) ||
      ((await file('bin/engine.dll')) && (await file('bin/tier0.dll')))
    )
      add('Source', 'hl2.exe 或 bin/engine.dll + tier0.dll')
    if ((await file('bin/win64/engine2.dll')) || (await file('game/bin/win64/engine2.dll')))
      add('Source 2', 'engine2.dll + EXE')
    if (await file('META-INF/AIR/application.xml'))
      add('Adobe AIR', 'META-INF/AIR/application.xml + EXE')
    if (
      (await file('dosbox.exe')) ||
      ((await files('', /^dosbox.*\.conf$/i)).length > 0 && exes.length > 0)
    )
      add('DOSBox 套件', 'dosbox.exe 或 dosbox*.conf（DOS 遊戲包裝，內容需人工確認）')
    if (
      exes.some((e) => /^(np2|np21|np21w|xnp2|t98-next)/i.test(e.name)) &&
      (await files('', /\.(hdi|fdi|d88|nhd|hdm|nfd)$/i)).length > 0
    )
      add('PC-98 模擬器', 'Neko Project II 類執行檔 + 磁碟映像（PC-98 遊戲收藏）')
    if (await file('www/c2runtime.js')) add('Construct', 'c2runtime.js + EXE（候選）')
    if ((await files('', /\.xp3$/i)).length)
      add('KiriKiri', 'XP3 + EXE（可能為補丁／工具，需確認）')
    // Japanese visual-novel engines: each needs its own runtime/launcher name or archive set next to an EXE.
    const rootFiles = [...root.values()].filter((e) => e.kind === 'file'),
      hasFile = (pattern: RegExp) => rootFiles.some((e) => pattern.test(e.name)),
      hasExe = (pattern: RegExp) => exes.some((e) => pattern.test(e.name)),
      countFiles = (pattern: RegExp) => rootFiles.filter((e) => pattern.test(e.name)).length
    if (hasFile(/\.pfs(\.\d+)?$/i)) add('Artemis', 'EXE + .pfs 封包（Artemis；補丁／工具需確認）')
    // Patched releases move or rename the archives, so the runtime name alone is the evidence.
    if (hasExe(/^ai6win/i))
      add('AI6WIN', 'AI6WIN*.EXE（Silky’s／Elf 引擎；封包可能被移到子資料夾）')
    if (hasExe(/^bgi/i) && hasFile(/\.arc$/i)) add('BGI／Ethornell', 'BGI*.EXE + .arc 封包')
    if (
      hasExe(/^onscripter/i) ||
      ((hasFile(/^(nscript\.dat|nscr_sec\.dat|0?0\.txt)$/i) || hasFile(/^ons\.cfg$/i)) &&
        hasFile(/\.(nsa|sar)$/i))
    )
      add('ONScripter／NScripter', 'ONScripter 執行檔，或 nscript／ons.cfg + nsa／sar 封包')
    if (
      (await file('GAMEEXE.INI')) &&
      ((await file('SEEN.TXT')) || (await folder('PDT')) || hasExe(/^(avg32|reallive)/i))
    )
      add('RealLive／AVG32', 'GAMEEXE.INI + SEEN.TXT／PDT／AVG32 執行檔')
    if ((await file('Scene.pck')) && (await file('Gameexe.dat')))
      add('SiglusEngine', 'Scene.pck + Gameexe.dat + EXE')
    if (hasFile(/\.ypf$/i)) add('YU-RIS', 'YPF 封包 + EXE（可能為補丁／工具，需確認）')
    if (countFiles(/\.npa$/i) >= 2) add('Nitroplus NPA', '多個 .npa 封包 + EXE')
    // .int and .pac are common extensions; each needs the engine's own config tool or runtime DLL beside it.
    if (
      countFiles(/\.int$/i) >= 2 &&
      ((await file('cs2conf.dll')) || (await file('config/startup.xml')))
    )
      add('CatSystem2', '多個 .int 封包 + cs2conf.dll／config/startup.xml + EXE')
    if (countFiles(/\.pac$/i) >= 2 && ((await file('dll/Pal.dll')) || (await file('Pal.dll'))))
      add('SoftPal', '多個 .pac 封包 + Pal.dll + EXE')
    // Circus keeps its data unpacked under AdvData: CRX images in GRP or MES scripts.
    if (
      (await folder('AdvData')) &&
      ((await files('AdvData/GRP', /\.crx$/i)).length > 0 ||
        (await files('AdvData/MES', /\.mes$/i)).length > 0)
    )
      add('Circus', 'AdvData 內的 CRX 圖片或 MES 腳本 + EXE')
    // LiveMaker packs the game into the EXE; its runtime library sits next to it.
    if (await file('live.dll')) add('LiveMaker', 'live.dll + EXE（遊戲資料包在 EXE 內）')
    if ((await file('data/bakinplayer.exe')) || (await file('data/data.rbpack')))
      add('RPG Developer Bakin', 'data/bakinplayer.exe 或 data/data.rbpack + EXE')
    if ((await file('data.sgbpack')) || hasExe(/^sgb_rpgplayer/i))
      add('SMILE GAME BUILDER', 'data.sgbpack 或 sgb_rpgplayer.exe')
    if (countFiles(/\.npk$/i) >= 3)
      add('Nitroplus NPK', 'EXE + 多個 .npk 封包（Nitroplus／Nitro Origin 的封包格式）')
    // LucaSystem (Prototype; the Steam releases of Key titles) keeps SCRIPT.PAK and other .PAK packs in files/.
    if ((await file('files/SCRIPT.PAK')) && (await files('files', /\.pak$/i)).length >= 2)
      add(
        'LucaSystem',
        'files/SCRIPT.PAK 與其他 .PAK 封包 + EXE（Prototype 引擎，Key 作品 Steam 版）'
      )
    // R-299, verified with synthetic folders only. Where an extension is shared with other software, the first
    // bytes of at most three such files are compared with the archive's published signature (GARbro's table);
    // nothing else of the file is read.
    const signed = async (pattern: RegExp, magic: string) => {
      for (const entry of rootFiles.filter((e) => pattern.test(e.name)).slice(0, 3)) {
        const target = path.join(dir, entry.name)
        await safePath(dir, target)
        let handle: Awaited<ReturnType<typeof fs.open>> | undefined
        try {
          handle = await fs.open(target, 'r')
          const head = Buffer.alloc(magic.length)
          const { bytesRead } = await handle.read(head, 0, magic.length, 0)
          if (bytesRead === magic.length && head.toString('latin1') === magic) return true
        } catch {
          // A locked or unreadable file is simply not evidence.
        } finally {
          await handle?.close().catch(() => {})
        }
      }
      return false
    }
    if (await file('data.dts')) add('SRPG Studio', 'data.dts + EXE')
    if (
      (await signed(/\.dpm$/i, 'DPMX')) ||
      hasFile(/^(hspext|hspda|hspogg|hspinet|hspsock|hspdx|hgimg3|hgimg4|hspcmp)\.dll$/i)
    )
      add('HSP', 'DPMX 封包或 HSP 外掛 DLL + EXE（Hot Soup Processor）')
    if (hasFile(/\.swf$/i)) add('Flash', '.swf + EXE（Flash Projector 候選）')
    if ((await files('GameData', /\.pack$/i)).length) add('QLIE', 'GameData 內的 .pack 封包 + EXE')
    if (hasExe(/^malie/i) || (await signed(/\.lib$/i, 'LIB')))
      add('Malie', 'malie*.exe 或 LIB 封包 + EXE')
    if (await signed(/\.noa$/i, 'Entis\x1a')) add('Entis GLS／Cotopha', 'Entis NOA 封包 + EXE')
    if ((await signed(/\.bin$/i, 'ESC-ARC')) || (await signed(/\.bin$/i, 'ACPXPK01')))
      add('Escu:de', 'ESC-ARC／ACPXPK01 封包 + EXE')
    if (await file('resident.dll')) add('ExHIBIT', 'resident.dll + EXE（候選）')
    if (hasFile(/\.vndat$/i)) add('Light.vn', '.vndat 封包 + EXE')
    if (await signed(/\.arc$/i, 'MajiroArcV')) add('Majiro', 'MajiroArc 封包 + EXE')
    if (hasFile(/\.hcb$/i)) add('FVP', '.hcb 腳本 + EXE（Favorite View Point）')
    if (hasExe(/^player\.exe$/i) && (await folder('Resources')))
      add(
        undefined,
        'Player.exe + Resources：Pixel Game Maker MV 候選；公開資料不足，引擎未推定，請確認 ROOT'
      )
    if (packedApp && !tyranoPacked)
      add(
        undefined,
        'EXE + resources/app.asar：封裝應用候選，不解包或推定引擎；請確認遊戲 ROOT 或標記非遊戲'
      )
    // Last resort for store releases of unknown engines: never overrides a specific engine rule.
    if (
      !result.evidence.length &&
      ((await file('steam_api.dll')) || (await file('steam_api64.dll')))
    )
      add(undefined, 'EXE + steam_api*.dll：Steam 發行版候選；引擎未確認，請確認 ROOT／非遊戲')
  }
  // A Java game is a .jar with a launcher: an EXE wrapper, a .bat/.cmd script or a bundled JRE.
  if (
    !result.evidence.length &&
    [...root.values()].some((e) => e.kind === 'file' && /\.jar$/i.test(e.name)) &&
    (exes.length ||
      [...root.values()].some((e) => e.kind === 'file' && /\.(bat|cmd)$/i.test(e.name)) ||
      (await folder('jre')))
  )
    add('Java', '.jar + EXE／.bat／jre 啟動方式（候選）')
  async function unreal(base: string) {
    if (!(await folder(base + 'Binaries/Win64')) || !(await folder(base + 'Content/Paks')))
      return false
    return (
      (await files(base + 'Binaries/Win64', /\.exe$/i)).length > 0 &&
      (await files(base + 'Content/Paks', /\.(pak|utoc|ucas)$/i)).length > 0
    )
  }
  if (await unreal(''))
    add('Unreal', 'Binaries/Win64 執行檔 + Content/Paks（PAK／IoStore）；不依賴版本資訊')
  // Match a launcher to its own product directory, never join unrelated sibling games.
  const products: string[] = []
  for (const exe of exes) {
    const child = root.get(exe.name.slice(0, -4).toLowerCase())
    if (child?.kind === 'dir' && (await unreal(child.name + '/'))) {
      const binaries = await files(child.name + '/Binaries/Win64', /\.exe$/i)
      if (
        binaries.some(
          (binary) =>
            binary.name
              .toLowerCase()
              .replace(/-(win64|win32|shipping|development|debug)+/g, '')
              .replace(/\.exe$/, '') === exe.name.toLowerCase().slice(0, -4)
        )
      )
        products.push(child.name)
    }
  }
  if (products.length === 1) {
    let collection = false
    for (const child of root.values())
      if (
        child.kind === 'dir' &&
        child.name !== products[0] &&
        !['engine', '.media-viewer', '__macosx'].includes(child.name.toLowerCase())
      ) {
        const siblings = await list(child.name)
        if (
          [...siblings.values()].some(
            (entry) =>
              (entry.kind === 'file' && /\.exe$/i.test(entry.name)) ||
              (entry.kind === 'dir' && /\.app$/i.test(entry.name))
          )
        )
          collection = true
      }
    if (!collection)
      add(
        'Unreal',
        '同名外層啟動器／產品資料夾 + ' + products[0] + '/Binaries/Win64 + Content/Paks'
      )
  }
  if (!products.length && exes.length && (await folder('Engine'))) {
    const deployments: string[] = []
    for (const child of root.values())
      if (
        child.kind === 'dir' &&
        !['engine', '.media-viewer'].includes(child.name.toLowerCase()) &&
        (await unreal(child.name + '/'))
      )
        deployments.push(child.name)
    if (deployments.length)
      add(
        undefined,
        '跨層 Unreal 部署與啟動器名稱不相符，可能為改名遊戲或集合：' +
          deployments.join('／') +
          '；需人工確認 ROOT'
      )
  }
  return result.evidence.length ? result : undefined
}
