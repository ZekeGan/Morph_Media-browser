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
    if ((await file('cocos2d.dll')) && (await folder('resources')))
      add('Cocos', 'cocos2d.dll + resources + EXE')
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
    if (countFiles(/\.npk$/i) >= 3)
      add(undefined, 'EXE + 多個 .npk 資源封包：引擎未確認，請確認 ROOT／非遊戲')
    if (packedApp)
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
