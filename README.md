# 赫特维拉世界观档案

Nuxt 4 + Nuxt UI 4 + Nuxt Content 3 的静态档案网站，使用 Tailwind CSS 4 和分层设计系统。站点：<https://hetwila.github.io/>。

目前包含首页、百科目录与分类、年代列表、18 个百科条目（禁制机制、H31 的全部 12 个事件及1747年选举相关人物与制度）、故事书架和首篇《第一次选择》、八份可阅读全文的来源资料、Pagefind 中文搜索，以及供 AI 直接读取的 Markdown／JSON 和关系、来源锚点映射。模拟论坛和 Supabase 尚未实施。

已支持系统／浅色／深色主题、手机导航、页面目录与键盘搜索。开发约定见 [AGENTS.md](AGENTS.md)，主题与组件契约见 [设计系统](docs/design-system.md)，完整产品规划见 [网站设计书](docs/网站设计书.md)。三份文档分别记录工作约定、实现规范和后续目标。

## 设计系统与官方技能

颜色与尺寸遵循 **基础尺度 → 语义用途 → 组件变量**，通过 Tailwind 4 CSS custom theme 接入：

- `app/assets/css/primitives.css`：统一色相、OKLCH 色阶、字体和尺度。修改 `--hue-brand`、`--hue-canvas`、`--hue-accent` 即可调整全站的三组主色调。
- `app/assets/css/theme.css`：浅／深色的 `--ui-*` 语义角色，以及横幅、插画、引用等颜色变量。
- `app/assets/css/tokens.css`：字号、行高、间距、容器与组件尺寸及响应式覆盖。`--ds-type-unit` 和 Tailwind 的 `--spacing` 分别统一全站字号与空间密度。
- `app/assets/css/tailwind-theme.css`：`@theme inline` 将用途变量映射为 `text-prose`、`p-panel`、`mt-section`、`gap-grid` 等工具类。
- `app/app.config.ts`：将色板接入 Nuxt UI，集中配置组件默认外观及自定义工具类的合并规则。页面与 Nuxt UI 共用字号和间距尺度。

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

开发进程默认端口3000，同时监听原始内容目录并重新生成可公开内容。修改 `content/wiki/*.md` 或 `content/stories/*.md` 后，等待内容转换完成，刷新页面即可看到更新；页面／样式由Nuxt热更新。开发进程与静态构建都不需要 Supabase 密钥。

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

主题验收使用 `@axe-core/playwright` 检查两种模式下的首页、百科、故事书架、故事阅读页和搜索弹窗，并验证系统偏好、切换持久化、颜色／尺寸变量传递及手机导航。视觉变动还需检查桌面与手机截图；自动规则不等同于完整人工可访问性审计。

项目选择TypeScript 5.9.3：当前Vue类型检查器不能加载TypeScript 7的编译入口。不要单独升级到7；待工具链兼容后一起升级并重新验证。

现有上游依赖还有 `unctx` 对 `oxc-parser`／`unplugin` 的可选peer范围提示，以及开发启动时MDC预优化条目提示。它们来自已锁定的Nuxt／Content依赖组合；没有通过忽略类型错误或禁用包校验来掩盖问题。后续升级时需同时复核构建和开发浏览器行为。

## 中文标题、链接与扩充内容

内容文件名保留中文，例如 `content/wiki/禁制.md`；`routeKey: 禁制` 对应 `/wiki/禁制`。标题需要消歧时使用“名称（限定词）”，不为技术路径另造英文译名。路径保存 NFC Unicode，URL 编码由浏览器／HTTP 客户端处理。框架生成的英文页面组件文件名不等于内容标题。

- `uid` 是长期身份。原 `wiki:ban`、`event:h31-01` 保留，历史事件继续使用原 H 编号。
- 改名时同步文件名与 `routeKey`，把旧 key 加入 `redirects`。`/wiki/ban` 与 `/wiki/h31-01` 已保留静态迁移页、canonical、新地址链接；有 JS 时会跳转并保留查询参数与片段。GitHub Pages 上没有声称返回 301。
- `aliases` 是搜索别名，`redirects` 是实际旧地址；两者分开维护。同一内容库内，文件、正式路径与旧地址必须唯一；UID 在两个库中共同校验。
- 百科与故事正文使用标准 Markdown 链接，如 `[禁制](/wiki/禁制#原理与作用边界)`。构建用 remark AST 提取链接与章节坐标，检查公开目标和锚点，并自动生成反链；有特定语义的关系仍在 `relations` 中维护。
- 新增条目必须指定已核验的 `sourceRefs`，保留原事实状态、纪年、名称性质与来源编号。新增来源在 `sources/reading-map.json` 显式登记，并由发布清单的 SHA-256 校验后进入可读原文页。
- `/wiki` 和 `/wiki/category/<分类名>` 提供完整静态目录；目录筛选可按名称、别名、编号缩小范围。`/timeline` 按有效数字年份排序，保留年 0。

## 故事收录与百科互链

- `/stories` 为故事书架，`/stories/第一次选择` 为完整阅读页；六节目录、正文概念链接、相关百科、原稿下载均支持静态 HTML 阅读。首页、主导航和全站 Pagefind 搜索可发现作品。
- `content/stories/第一次选择.md` 是阅读版，仅增加 frontmatter、章节标题和显式 Markdown 链接。`sources/stories/第一次选择.md` 保存作者原稿原字节，`manifest.json` 记录 SHA-256。构建核对原稿哈希，并用 Markdown AST 比较两版的正文文字；原稿变化或意外改写都会报错。
- 故事使用 `entityType: story`、`narrativeLayer: fiction`、`factStatus: story-local`、`scopeUid: <本篇 uid>`。历史背景的 `sourceRefs` 不会把情节或对白变成全局设定。
- 只维护故事到事件的 `depicts` 关系和正文链接。构建自动生成 Wiki 的“相关故事”，以及故事的“相关百科”；`depicts` 只允许从故事指向事件。普通提及保留章节坐标，不推导更强的历史事实。
- 新增故事时同时保存原稿及校验值，创建中文阅读版并登记背景资料与关系。原稿首行须为标题（支持一级 Markdown 标题）；不要自动改写作者文字。未发表／私密故事与百科一样排除在公开集合外。
- 目录与 JSON 记录内容类型；故事 JSON 还给出 `originalMarkdownUrl` 和 `originalSha256`，供 AI 核对原稿。`manifest.json` 的 `documentCount` 为百科与故事合计，另有 `wikiCount`、`storyCount`。

## 内容与机器读取

- 编辑源：`content/wiki/` 与 `content/stories/`。每篇文件的 `routeKey` 与文件名一致。
- 来源：`sources/releases/3.0.3/` 保存八份已引用的原始文档和 SHA-256，原文件保持不变；`sources/reading-map.json` 指定可公开原文的中文阅读路径。
- 结构：`shared/content-schema.ts`，包括UID、事实状态、世界纪年、来源和关系。
- 准备：`scripts/prepare-content.ts` 核对来源哈希／锚点和链接／身份，只将 `published + public` 百科／故事及允许公开的来源生成到 `.generated/content/`，由 Nuxt Content 读取；显式 path 保留中文标题，避免框架自动 slug 化。
- 对外入口：`/llms.txt`、`/data/v1/manifest.json`。清单指向内容哈希版本中的 Markdown、JSON、目录、正向／反向关系、来源原文及 106 个原始锚点的阅读映射。机器导出的正文文件也使用中文名；HTTP 地址按标准 URL 编码。
- 框架生成的数据库／payload同样只包含这份公开集合。私密内容不能仅靠页面过滤隐藏，也不要提交到公开Git仓库。

Markdown原文与JSON正文来自同一个源文件；`worldTime.year: 0` 保持数字0，不转为公历。原文内部链接使用实际可访问的站内URL，关系由UID解析。页面的来源面板保留附件路径及锚点，供核对。

当前覆盖 **18 个百科条目、1 篇故事、8 / 216 份设定来源、106 / 1,855 个原始锚点、13 / 546 个 H 事件条目**，不是完整设定库。重新上传的完整 ZIP 已核对原 SHA-256 并保存于 `sources/archives/赫特维拉统合设定_3.0.3.zip`，后续可从仓库恢复来源；保存附件不代表全文已整理或公开到网站。来源页面中的未收录引用显示原路径，原始 Markdown 下载保留原字节；不把这些缺失材料算作已迁移。

每次准备时重建公开导出，仅保留当前发布；历史机器版本长期归档和全库迁移仍待实施。搜索精确匹配标题、别名、H 编号优先，再合并 Pagefind 全文结果并去重；支持全半角及拉丁字母大小写规范化。开发模式的全文部分使用公开文档字串检索，正式验收以生成产物为准。

## GitHub Pages 部署

站点地址：<https://hetwila.github.io/>。发布状态以 [Pages 工作流](https://github.com/hetwila/hetwila.github.io/actions/workflows/pages.yml) 为准。

推送到 `main` 后，[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 自动安装锁定依赖，执行类型检查、内容／来源／链接测试、静态生成和浏览器测试，再发布 `.output/public`。也可以在 Actions 中手动运行该工作流。发布后会检查线上首页、全部中文百科／故事／来源深链接、旧地址入口和机器数据的版本、SHA-256，等待 CDN 更新；检查失败时工作流会明确报错。

当前仓库的 Pages 来源已由管理员设置为 **GitHub Actions**（**Settings → Pages → Build and deployment → Source**）。工作流核对该设置，并通过 GitHub 自带的 `GITHUB_TOKEN` 与 OIDC 发布，不需要额外配置部署密钥。构建任务只读仓库，部署任务单独获得 Pages 写入权限；Actions 版本固定到提交 SHA。若在新仓库复用本工作流，需先启用 Pages 并选择 GitHub Actions 来源；自动切换被 GitHub 拒绝时会明确报告权限警告。

发布目录只包含生成的HTML、Nuxt资源、Pagefind索引和机器数据；不需要运行Nuxt服务器。当前仓库为用户站点，部署基路径为 `/`。完整来源 ZIP、未收录资料、草稿、缓存与`.env`不进入发布产物；允许公开的来源原文及故事原稿由构建显式导出。
