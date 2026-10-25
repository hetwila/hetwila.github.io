# 赫特维拉世界观档案

Nuxt 4 + Nuxt UI 4 + Nuxt Content 3 的静态档案网站，使用 Tailwind CSS 4 和分层设计系统。站点：<https://hetwila.github.io/>。

目前包含首页、两个互相链接的百科试读条目（禁制与 H31-01）、Pagefind 中文搜索，以及供 AI 直接读取的 Markdown／JSON。故事、模拟论坛和 Supabase 尚未实施。

已支持系统／浅色／深色主题、手机导航、页面目录与键盘搜索。开发约定见 [AGENTS.md](AGENTS.md)，主题与组件契约见 [设计系统](docs/design-system.md)，完整产品规划见 [网站设计书](docs/网站设计书.md)。三份文档分别记录工作约定、实现规范和后续目标。

## 设计系统与官方技能

配色遵循 **基础色板 → 语义主题 → 组件变量**：

- `app/assets/css/primitives.css`：统一色相、OKLCH 色阶、字体和尺度。修改 `--hue-brand`、`--hue-canvas`、`--hue-accent` 即可调整全站的三组主色调。
- `app/assets/css/theme.css`：浅／深色的 `--ui-*` 语义角色，以及横幅、插画、引用等组件变量。
- `app/app.config.ts`：将色板接入 Nuxt UI，集中配置组件默认外观。页面使用 Tailwind 语义工具类，不写固定颜色。

细节与修改示例集中在 [设计系统](docs/design-system.md)。默认跟随系统，主题选择由 Nuxt UI 的 Color Mode 管理并持久保存；主题状态不另写一套。

官方 `nuxt-ui` skill 已通过 Skills CLI 安装到 [`.agents/skills/nuxt-ui/`](.agents/skills/nuxt-ui/SKILL.md)，来源为 [`nuxt/ui`](https://github.com/nuxt/ui/tree/v4/skills/nuxt-ui)。技能内容与 `skills-lock.json` 一起保留，正常克隆即可阅读。需要恢复时，在仓库根目录运行：

```bash
npx skills@1.7.4 experimental_install --agent codex --yes
```

首次安装的等价命令是 `npx skills@1.7.4 add nuxt/ui --skill nuxt-ui --agent codex --yes`。升级使用 `npx skills@1.7.4 update nuxt-ui --project --yes`，并审查技能与锁文件差异。锁文件记录来源、路径与内容哈希；已提交的技能文件保留本次实际使用的版本。

[`.codex/config.toml`](.codex/config.toml) 配置了官方 Nuxt UI MCP。支持项目级配置的客户端加载后可调用它，需要网络允许 `ui.nuxt.com`；本次云会话仍受网络策略限制，组件 API 已按已安装版本的源码、类型和生成主题核对。云环境的 `npx` 如遇缓存权限问题，加上 `npm_config_cache=/workspace/.cache/hetwila/npm`。

## 开发环境

使用 Node.js 24 LTS（至少24.15，当前云环境固定24.19.0）、pnpm 11.25.0。依赖及锁文件已固定。Nuxt Content 使用 `better-sqlite3`；缺少适配的预编译产物时，安装需要 Python 3、make 和 C++ 编译器。当前云环境已具备这些工具。

云环境中运行：

```bash
cd /workspace/hetwila.github.io
bash scripts/setup-cloud.sh
bash scripts/cloud.sh dev
```

`setup-cloud.sh` 将包管理器与缓存放在可写的 `/workspace/.cache/hetwila`，验证Node版本并按锁文件安装。`cloud.sh` 为每次命令恢复相同环境；不用写入系统目录或更改HOME。以后任务使用当前检出目录即可，不需要创建Git worktree。

普通本地环境可使用：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发进程默认端口3000，同时监听原始内容目录并重新生成可公开内容。修改 `content/wiki/*.md` 后，等待内容转换完成，刷新页面即可看到更新；页面／样式由Nuxt热更新。开发进程与静态构建都不需要 Supabase 密钥。

## 检查与构建

云环境中的 `pnpm` 命令用 `bash scripts/cloud.sh` 包装执行。

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | 内容准备及Vue／TypeScript类型检查 |
| `pnpm test:content` | 验证公开范围、引用、稳定身份与世界纪年 |
| `pnpm generate` | 预渲染HTML、输出机器数据、构建Pagefind索引 |
| `pnpm preview` | 在4173端口运行静态产物验证服务 |
| `pnpm test:e2e` | 对生成产物运行阅读、搜索、主题、可访问性与HTTP测试，自动启停验证服务 |
| `pnpm test` | 内容测试 → 生成 → 浏览器测试 |

Playwright优先使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`，或云环境已有的 `/usr/bin/chromium`。其他环境可运行 `pnpm exec playwright install chromium`。测试需要4173端口可用，不复用不明的现有服务。

主题验收使用 `@axe-core/playwright` 检查两种模式下的首页、百科和搜索弹窗，并验证系统偏好、切换持久化、变量传递及手机导航。视觉变动还需检查桌面与手机截图；自动规则不等同于完整人工可访问性审计。

项目选择TypeScript 5.9.3：当前Vue类型检查器不能加载TypeScript 7的编译入口。不要单独升级到7；待工具链兼容后一起升级并重新验证。

现有上游依赖还有 `unctx` 对 `oxc-parser`／`unplugin` 的可选peer范围提示，以及开发启动时MDC预优化条目提示。它们来自已锁定的Nuxt／Content依赖组合；没有通过忽略类型错误或禁用包校验来掩盖问题。后续升级时需同时复核构建和开发浏览器行为。

## 内容与机器读取

- 编辑源：`content/wiki/`。每篇文件的 `routeKey` 与文件名一致。
- 来源：`sources/releases/3.0.3/` 保存本次用到的两份原始文档和SHA-256；没有导入整个附件。
- 结构：`shared/content-schema.ts`，包括UID、事实状态、世界纪年、来源和关系。
- 准备：`scripts/prepare-content.ts` 验证来源文件，只将 `published + public` 文档复制到 `.generated/content/`，由Nuxt Content读取。
- 对外入口：`/llms.txt`、`/data/v1/manifest.json`。清单指向当前带内容哈希的版本目录，包含Markdown、JSON、目录及关系。
- 框架生成的数据库／payload同样只包含这份公开集合。私密内容不能仅靠页面过滤隐藏，也不要提交到公开Git仓库。

Markdown原文与JSON正文来自同一个源文件；`worldTime.year: 0` 保持数字0，不转为公历。原文内部链接使用实际可访问的站内URL，关系由UID解析。页面的来源面板保留附件路径及锚点，供核对。

这是**两个条目的原型**，不是216篇设定的完整网站。每次准备时重建公开导出，仅保留当前发布；历史机器版本的长期归档、完整来源映射和创作规则迁移留待下一阶段。搜索在开发模式使用公开样本的简单字串检索；生成产物使用Pagefind中文分词，正式验收以生成产物为准。

## GitHub Pages 部署

站点地址：<https://hetwila.github.io/>。发布状态以 [Pages 工作流](https://github.com/hetwila/hetwila.github.io/actions/workflows/pages.yml) 为准。

推送到 `main` 后，[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 自动安装锁定依赖，执行类型检查、内容测试、静态生成和浏览器测试，再发布 `.output/public`。也可以在 Actions 中手动运行该工作流。发布后会检查线上首页、百科深层链接和机器数据的版本、SHA-256，等待 CDN 更新；检查失败时工作流会明确报错。

当前仓库的 Pages 来源已由管理员设置为 **GitHub Actions**（**Settings → Pages → Build and deployment → Source**）。工作流核对该设置，并通过 GitHub 自带的 `GITHUB_TOKEN` 与 OIDC 发布，不需要额外配置部署密钥。构建任务只读仓库，部署任务单独获得 Pages 写入权限；Actions 版本固定到提交 SHA。若在新仓库复用本工作流，需先启用 Pages 并选择 GitHub Actions 来源；自动切换被 GitHub 拒绝时会明确报告权限警告。

发布目录只包含生成的HTML、Nuxt资源、Pagefind索引和机器数据；不需要运行Nuxt服务器。当前仓库为用户站点，部署基路径为 `/`。不要把源资料、草稿、缓存或`.env`作为发布产物。
