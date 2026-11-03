<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/morph-mark-dark.svg">
    <img src="docs/brand/morph-mark-light.svg" alt="M:orph" width="96">
  </picture>
  <br>
  M:orph
</h1>

<p align="center"><strong>Media Browser</strong><br><em>数据不变，样貌随你。</em></p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · 简体中文 · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a>
</p>

M:orph 是以 Windows 为优先的桌面应用，用卡片、表格或树状图浏览大量文件夹收藏：漫画、相册、视频、音乐与游戏。你为“项目”指定一个根文件夹，应用就会把每个符合条件的子文件夹变成一条记录，让你描述、搜索，并按自己喜欢的方式排版。它只**查看**你的数据：不会为了浏览而移动、重命名或删除原始文件。

**数据与呈现分开。** 你对文件夹的了解（名称、标签、评分、来源）随文件夹保存；外观则是一份版面，设计一次就应用到整个项目。

> **人类负责主导项目，AI 负责代码开发。** 方向、需求、设计决策与审查由人类主导；代码由 AI 开发代理（OpenAI Codex，之后是 Anthropic 的 Claude Code）依此编写。
>
> 项目**即将发布第一个版本**。当前版本：**0.39.0**（[更新日志](CHANGELOG.md)）。

---

## 功能

**浏览**

- 同一份数据有三种模式：**CARD**、**TABLE**、**TREE**，并按项目记住筛选、范围与查看设置。
- 右侧面板无需离开列表就能查看所选文件夹：详情、文件、子文件夹，以及内容的阅读器或播放器。
- 可重建的本机索引，支持所有字段搜索（子串、AND／OR／排除、数字与日期比较、已保存的搜索）。

**设计卡片**

- 积木编辑器把**组件**放在网格上：名称、路径、文本、标签、数字、评分、日期、单选、链接、图片、分隔线，以及游戏组件（封面、启动按钮）。
- 每个组件都能调整样式：字号、粗细、斜体／下划线／删除线、对齐、颜色、内边距、圆角、边框、透明度、行距与字距，还有现成的样式。标签可按分类上色，单选选项可有自己的颜色。
- 长内容保持整齐：省略号、换行、标签“+N”，或可滚动的组件。
- **备用字段**：一个组件可以列出多个字段（例如 Steam、DLsite 与你自己备注的名称），显示第一个有值的；搜索也沿用同一顺序。
- 编辑器内用真实数据预览、每个项目可有多个命名版面，也可按内容类型指定版面。

**查看与播放**

- 相册瀑布流与全屏图片阅读器；支持跨页与从右到左的漫画阅读器；带字幕（SRT／VTT）、续播与跨项目音频／视频队列的视频播放器；应用内打开 PDF、ZIP 与 CBZ。
- 视频无法解码时，应用会说明原因（例如被改名的压缩包），并提供用系统播放器打开。

**游戏**

- 检测游戏文件夹（含许多日系视觉小说引擎）并保护其内部：应用不会在游戏里创建记录。
- 每个游戏各自的启动动作：带参数的 EXE、文件夹、文件、网址，以及**快捷方式**（让 Locale Emulator 快捷方式保留它自己的设置）。启动组件可以从一个动作退到另一个动作，每个游戏也能隐藏用不到的按钮。

**补充数据**

- 粘贴页面网址就会自动识别来源：E-Hentai／ExHentai、Steam、DLsite、VNDB、Bangumi、AniList、Hitomi、Pixiv、MusicBrainz、Open Library 与 Wikimedia Commons。先看预览，再选择要导入的字段。你不要求，就不会获取任何数据。其中部分网站含有成人内容，是否使用由你自行决定，并请遵守各网站自己的条款。

**外观与语言**

- 三种主题（深色、雾白玻璃、暖纸）与五种界面语言（繁体中文、简体中文、英文、日文、西班牙文）。

---

## 数据如何保存

```text
文件夹 ──→ 可携带的文件夹记录 ──┐
                                ├──→ 项目版面 → 屏幕上的组件
项目根目录 ──→ 可携带的设置 ────┘
                    │ 两者都是数据来源
                    └──→ SQLite 搜索索引（随时可重建）
```

- 每个受管文件夹带有隐藏的 `.media-viewer` 记录，所以文件夹移到别处或别的设备，仍知道自己是什么。你的原始文件不会被改动。（这个文件夹名称属于数据格式，沿用产品改名前的名称。）
- 写入是原子且可恢复的；清理只移除应用创建的内容，并先预览。
- 值默认在项目间共享；私有覆写必须有意创建。
- Electron 启用 context isolation 与 sandbox；renderer 不能任意读取路径或执行命令。

---

## 开始使用

需要 Node.js 24 与 pnpm 10。

```bash
pnpm install
pnpm dev
```

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发模式运行 |
| `pnpm build` | 类型检查并构建 |
| `pnpm typecheck` | 只做类型检查 |
| `pnpm test` | 数据与逻辑测试 |
| `pnpm test:ui:changed` / `:smoke` / `:all` | Electron UI 测试（按改动／核心项目／全部） |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm dist` | 构建 Windows 安装程序与免安装版到 `release/morph <版本>/` |
| `pnpm shot <game\|manga\|album\|other>` | 用内置示例数据截图 |

验证方式见 [IMPLEMENTATION](docs/IMPLEMENTATION.md)。每次推送，GitHub Actions 会执行类型检查、格式检查与数据测试。

---

## 技术

Electron · React 18 · Vite 7 · TypeScript · Mantine 8 · Node SQLite（搜索索引）· Playwright（UI 测试）

---

## 文档

设计文档主要以繁体中文撰写。

- [文档索引](docs/README.md)：按任务找到对应文档。
- [产品范围](docs/PRODUCT.md)与[架构](docs/ARCHITECTURE.md)。
- [当前工作与已知限制](docs/WORK_ITEMS.md)、[决策](docs/DECISIONS.md)。
- [贡献指南](CONTRIBUTING.md)与[安全政策](SECURITY.md)（请私下报告漏洞）。
- 贡献者与编程代理：请先读 [CLAUDE.md](CLAUDE.md)（Claude Code）或 [AGENTS.md](AGENTS.md)（Codex）。早期 POC 资料封存在 [docs/archive](docs/archive/)，不是现行规格。

---

## 许可

版权所有 (C) 2024–2026 Zeke Gan。源代码是自由软件，采用 **GNU 通用公共许可证第 3 版或（由你选择）任何更新的版本**，见 [LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。修改后的版本必须以相同许可证公开，并保留声明。

**名称与标志不在此许可范围内。** 修改后的版本不得使用“M:orph”名称或 M:orph 标志，也不能只换标志或只改名就当作官方版本发布。见[名称与标志政策](TRADEMARK.md)。

M:orph 与它可读取数据的各网站没有任何关系；各网站的名称属于其所有者。

---

## 作者

**Zeke Gan** — [GitHub](https://github.com/ZekeGan)
