# 开发约定

## 先读什么

- [README.md](README.md)：当前已实现范围、开发命令、内容与部署流程。
- [设计系统](docs/design-system.md)：颜色、排版、主题和组件契约。
- [网站设计书](docs/网站设计书.md)：完整产品目标和后续功能；不要把规划当作已实现功能。
- 处理前端时先读官方 [Nuxt UI skill](.agents/skills/nuxt-ui/SKILL.md)，再按任务加载它引用的相关文档。组件 API 以本仓库锁定版本的源码、类型与 `.nuxt/ui/` 生成主题为准。

## 工作方式

- 使用当前检出目录。云任务本身已隔离；除非用户要求，不创建 Git worktree。
- 保留用户未提交的修改。安装使用锁文件，新增依赖固定版本。
- 优先复用 Nuxt UI 的导航、表单、弹窗、卡片、主题控件及可访问性行为。自定义内容排版和品牌插画可以保留，通用交互不另写一套。
- 页面使用 `text-default`、`text-muted`、`bg-raised`、`border-default`、`primary` 等语义角色。不得在组件中写颜色字面量、原始色板工具类或按页面覆盖深浅色。修改色板到 `primitives.css`，角色到 `theme.css`，组件默认外观到 `app.config.ts`。
- 尺寸先复用 `primitives.css` 的字号／间距尺度；重复用途在 `tokens.css` 命名，再经 `tailwind-theme.css` 接入工具类。新增自定义名称同步登记 `app.config.ts` 的 `ui.tv` 合并规则。避免固定 `px`／`rem` 字号和留白散落在页面；数值 Tailwind 间距类共用 `--spacing`，可以使用。响应式 CSS 使用 `@variant`，与 Tailwind 断点保持一致。
- 不修改已安装的官方 skill 来适配项目规则。保留 `.agents/skills/nuxt-ui/`、`skills-lock.json` 和项目级 MCP 配置；更新技能后审查文件及锁文件差异。
- 使用 Nuxt UI 提供的 Color Mode，不另建主题状态或存储。保证系统偏好、明确选择、刷新与导航保持一致；组件文案使用 `zh_cn`。
- 视觉改动同时检查桌面、手机、浅色、深色、键盘与无 JavaScript 阅读。主题改动验证颜色对比度、字号／间距传递，以及 Nuxt UI、自定义 CSS 和 SVG 的一致性。

## 内容与验证

- 内容文件和 `routeKey` 使用中文标题，必要时用括号消歧，不另译英文。保留稳定 UID，改名通过 `redirects` 保留旧地址；避免路径大小写、Unicode 规范化和重定向冲突。Markdown 使用真实站内链接，由构建解析 AST 校验并生成反链。
- `content/wiki/` 与 `content/stories/` 是编辑源；公开构建只允许 `published + public`。不要手改 `.generated/`、`public/data/` 或 `.output/`。
- `sources/releases/3.0.3/` 是来源证据，不随页面润色改动。保留 UID、来源锚点、纪年 0、事实状态与双向关联。新增来源通过 `sources/reading-map.json` 进入公开允许列表；禁止为补齐覆盖率猜写缺失资料。
- 故事保留作者原稿及哈希；阅读版只整理标题和链接，构建检查正文一致。以 `story-local`、`fiction` 与本篇 `scopeUid` 区别于百科事实；`depicts` 从故事指向事件，反链自动生成。人物百科标题使用原设定中的完整姓名，简称进入别名。
- 不添加虚构作品、帖子、读者或互动统计充当真实内容。完整附件已保存于 `sources/archives/`；新增内容先解压并核对对应责任原文，Supabase 属于后续任务。
- 按 README 执行适合改动的检查；前端完成后运行类型检查及 `pnpm test`。云环境使用 `bash scripts/cloud.sh` 包装 pnpm。
- 静态生成与 Nuxt dev 不能并行，共用生成状态。只停止本任务启动的服务；测试自行占用 4173 端口，完成后恢复开发服务。
- 不为低风险文档／样式修改添加照抄实现的测试。主题持久化、系统偏好、可访问性、内容一致性等可失效的行为应有集成验证。

## 文档同步

实现改变时同步相关文档：README 描述实际能力，设计系统文档记录变量／组件契约，设计书标明实现与规划的边界。本文件只放开发约定，不复制另外三份文档的细节。不要维护重复的 `AGENT.md`。
