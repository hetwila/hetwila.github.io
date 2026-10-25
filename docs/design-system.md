# 赫特维拉设计系统

当前实现：Nuxt UI 4.12.0 + Tailwind CSS 4.3.3。视觉延续档案馆与阅读器方向：暖色纸面、植物色主色、少量黄铜色强调；深色使用有层次的暗色表面。颜色角色与具体色相分离，可整体换肤。

## 三层变量与 Tailwind 4 custom theme

| 层级／接口 | 文件 | 职责 |
| --- | --- | --- |
| 基础尺度 | `app/assets/css/primitives.css` | OKLCH 色板、字体族、完整字号阶梯、间距基数、字重、行高、字距、断点、宽度与动效基数 |
| 语义与组件颜色 | `app/assets/css/theme.css` | 深浅色的 `--ui-*` 契约，以及横幅、插画、引用等用途的颜色 |
| 语义与组件尺寸 | `app/assets/css/tokens.css` | 正文／标题字号、阅读行距、页面／卡片／区块间距、导航尺寸、响应式覆盖；值从基础尺度派生 |
| Tailwind 4 接口 | `app/assets/css/tailwind-theme.css` | 用 `@theme inline` 将用途变量接到 `--text-*`、`--spacing-*`、`--container-*`、`--radius-*` 等命名空间，生成工具类 |
| Nuxt UI 接口 | `app/app.config.ts` | 色板映射、组件 slots／variants、识别自定义工具类的合并规则 |

加载顺序在 `main.css`：Tailwind → Nuxt UI → 基础尺度 → 颜色角色 → 尺寸角色 → custom theme → 档案布局。基础 `@theme static` 保留 CSS、SVG 和运行时也会读取的尺度；`@theme inline` 生成直接读取用途变量的工具类。`tokens.css`、`theme.css` 使用无 layer 的根变量覆盖框架的 `@layer theme`；布局不靠 `!important` 修正主题。

`archive.css` 只消费尺度和用途变量。结构常量（`0`、`auto`、百分比、网格比例）、层叠顺序与 SVG 坐标保留在布局／插画中。搜索防抖属于查询行为，不属于视觉动效。

## 基础尺度

| 想整体调整什么 | 基础入口 | 影响范围 |
| --- | --- | --- |
| 配色 | `--hue-brand`、`--hue-canvas`、`--hue-accent` 与对应色阶 | 正文、控件、表面与插画 |
| 字体族 | `--font-sans`、`--font-serif`、`--font-mono` | 正文、标题、代码；沿用系统字体回退 |
| 字号 | `--ds-type-unit`（默认 `1rem`）与 `--text-2xs` 到 `--text-9xl` | Nuxt UI 标准字号和站点语义字号；流式标题保留上下限 |
| 空间密度 | `--spacing`（默认 `0.25rem`） | `p-4`、`mt-6`、`gap-3` 等数值工具类，及派生的面板、区块、图标、导航尺寸 |
| 字重、行距、字距 | `--font-weight-*`、`--leading-*`、`--tracking-*` | 标准 Tailwind 类和由它们派生的排版角色 |
| 页面／阅读／搜索宽度 | `--ds-page-width`、`--ds-reading-width`、`--ds-dialog-width` | 容器、正文栏、搜索弹窗；与空间密度分开调整 |
| 圆角 | `--ds-radius-base` | Nuxt UI 的 `--ui-radius`，以及卡片、横幅 |
| 线条、焦点 | `--ds-border-width`、`--ds-focus-width`、`--ds-focus-offset` | 自定义边框和键盘焦点轮廓 |
| 动效 | `--ds-duration-fast`、`--ds-duration-normal`、`--ease-*` | 默认 Tailwind 过渡和卡片过渡；减少动态效果偏好仍强制关闭动画／过渡 |
| 断点 | `--breakpoint-sm/md/lg/xl/2xl` | Vue 的响应式工具类及 CSS 的 `@variant` |

例如，在基础文件中修改现有定义，就能让字号与留白一起变得宽松：

```css
@theme static {
  --spacing: 0.28125rem; /* 4.5px，默认根字号下增加 12.5% */
}
:root {
  --ds-type-unit: 1.125rem;
}
```

字号与间距使用 `rem`；行高使用无单位比例，随字号缩放。基础字号变化会同时影响 `text-sm` 这样的 Nuxt UI 默认类与 `text-prose` 这样的自定义类。数值间距工具类仍可用于小范围排版，它们读取同一个 `--spacing`，不需要为每个倍数另造变量。

运行时预览全站密度，可在浏览器开发者工具中给 `document.documentElement.style` 设置上述变量。全站用途变量定义在根节点；若以后增加局部密度主题，需要在局部作用域重新声明相关派生变量，不能假定根节点已计算的别名会在后代自动重新计算。

## 用途变量与工具类

| 用途变量 | Tailwind 4 用法 | 当前使用 |
| --- | --- | --- |
| `--ds-text-label/meta/caption` | `text-label`、`text-meta`、`text-caption` | 英文栏目名、版本信息、辅助文字 |
| `--ds-text-body/prose` | `text-body`、`text-prose` | 页面基础正文、Wiki 正文 |
| `--ds-text-card/section/title/display` | `text-card`、`text-section`、`text-title`、`text-display` | 条目卡、栏目、文章、首页横幅标题 |
| `--ds-leading-prose/copy` | `leading-prose`、`leading-copy` | 阅读与说明文字 |
| `--ds-space-panel` | `p-panel`、`px-panel` | `UPageCard`、来源 `UCard` 的内边距 |
| `--ds-space-section` | `pt-section`、`mt-section` | 主区块留白与相关阅读 |
| `--ds-space-inline/stack/grid/layout` | `gap-inline`、`mb-stack`、`gap-grid`、`gap-layout` | 图文间距、垂直节奏、卡片／文章列间距 |
| `--ds-space-page-block`、`--ds-page-gutter` | `my-page-block`、`py-page-block`、`px-gutter` | 页首／页尾节奏和页面横向留白 |
| `--ds-control-size`、`--ds-icon-size` | `min-h-control`、`min-w-control`、`size-icon` | 页头控件、内容图标 |
| `--ds-page-width/reading-width/dialog-width` | `max-w-page`、`max-w-reading`、`max-w-search` | 页面容器、阅读栏、搜索弹窗 |
| `--ds-radius-card/hero`、`--ds-shadow-card` | `rounded-card`、`rounded-hero`、`shadow-card` | 卡片、横幅的形状和抬升效果 |
| `--ds-duration-fast/normal` | `duration-fast`、`duration-normal` | 可复用的过渡时长 |

工具类可以直接组合：

```vue
<section class="px-gutter pt-section">
  <h2 class="font-serif text-section tracking-heading">栏目标题</h2>
  <UPageCard class="rounded-card" :ui="{ container: 'p-panel sm:p-panel', title: 'text-card' }" />
</section>
```

自定义 CSS 可使用 `@apply text-prose` 或 `var(--ds-text-prose)`。配对的 `--text-prose--line-height` 等定义让字号工具类也带上适合的默认行高。细调某个用途，到 `tokens.css` 修改变量；例如调整 `--ds-space-panel` 不会改变按钮的内边距，调整 `--ds-text-prose` 不会改变导航字号。

响应式尺寸在 `tokens.css` 用 `@variant max-sm`、`max-md` 等覆盖变量。小屏面板内边距、正文和品牌字号自动切换，组件仍使用同一语义类。修改某个用途时，连同它的小屏覆盖一起检查。断点值位于 `primitives.css`，统一使用字面量 `rem`：媒体查询是构建时生成的，修改后需要重新构建，不能靠运行时 CSS 变量改变断点。

## Nuxt UI 的接入约定

`app.config.ts` 将 `primary → brand`、`secondary → accent`、`neutral → canvas` 接到 Nuxt UI。成功、信息、警告与错误沿用框架的语义色板。颜色在页面中使用 `bg-default`、`bg-raised`、`text-muted`、`text-primary`、`border-default` 等角色；组件不写色值、原始色板类或各自维护的 `dark:*` 配色。

Tailwind 生成 CSS 和 Nuxt UI 合并类名是两件事。自定义 `text-card`、`p-panel`、`rounded-card` 等名称同时登记在 `ui.tv.twMergeConfig.extend.theme`，让框架识别字号、间距、圆角等冲突组，正确替换 `text-base`、`p-4`、`rounded-lg`，并保留 `text-highlighted` 这样的颜色类。新增命名工具类时同步登记对应组，不关闭类名合并，也不依赖 CSS 输出顺序取胜。

组件的响应式默认类需在同一变体层覆盖，例如 `p-panel sm:p-panel` 会分别替换 `p-4 sm:p-6`。框架 `variants`／`compoundVariants` 会在基础 slots 之后应用；非全屏弹窗圆角放在 `fullscreen.false`，卡片标题出现时的描述间距放在 `title.true`，避免被后续默认变体覆盖。单个组件实例继续优先使用官方 `ui`／`class` 接口。

颜色变更后重新检查对比度；尺寸变更后检查换行、点击目标与小屏溢出。变量提供调整入口，不保证任意组合都适合阅读。

## 深浅色与浏览器外观

- 使用 Nuxt UI 自动注册的 `@nuxtjs/color-mode`，默认跟随系统，静态 HTML 回退浅色。页面保留完整正文，不依赖主题脚本才能阅读。
- 页头使用 `UColorModeSelect`：系统／浅色／深色。偏好存放在 Color Mode 管理的 `hetwila-color-mode` localStorage 键中，跨页面和刷新生效；选择系统后继续响应系统颜色变化。
- 框架的头部初始化脚本在水合前设置主题 class；选择器使用官方客户端占位，避免服务器猜测浏览器偏好造成水合不一致。
- 正文、导航、卡片、表格、引用、模态弹窗、错误页和 SVG 都共用变量。横幅刻意保持深底，使用独立的反差色角色，而不是跟随正文的浅底色直接反转。
- 页头标记为内联 SVG。`theme-metadata.client.ts` 从实际渲染的颜色生成 favicon，并从页面背景更新浏览器 `theme-color`，没有复制一份色板。禁用 JS 时的独立 favicon 使用浏览器系统色 `Canvas` / `CanvasText`，无固定品牌色。

## 组件选用

| 用途 | 当前复用 |
| --- | --- |
| 桌面／手机导航与菜单 | `UHeader`、`UNavigationMenu` |
| 主题选择、快捷键提示 | `UColorModeSelect`、`UKbd`、`defineShortcuts` |
| 条目、分类目录与相关阅读 | `UPageGrid`、`UPageCard` |
| 来源面板、状态、操作 | `UCard`、`UBadge`、`UButton` |
| 搜索 | `UModal`、`UInput`；查询由 Pagefind 完成 |
| 页面目录 | `UContentToc`，手机折叠、桌面滚动定位 |
| 页脚及基础上下文 | `UFooter`、`UApp`，语言为 `zh_cn` |

自定义代码保留在档案排版、来源呈现和轨道插画。搜索继续使用现有的 Pagefind 索引；不因视觉重构引入第二套搜索引擎。Nuxt UI 默认行为通过 props、slots 和主题配置定制，不绕过它的焦点管理和键盘交互。

来源原文中的空 `<a id="…"></a>` 在可读页面生成时转为同 ID 的非交互定位标记，避免 `ProseA` 将其渲染成无名称按钮；原始 Markdown 下载保持原字节。`UPageCard` 的覆盖链接在根主题中获得完整点击区域，正文旁的反向链接保留下划线，确保触屏、键盘及辅助技术能识别。

## 验证

`tests/browser/theme.spec.ts` 验证系统偏好、手动切换、刷新与路由保持、修改基础变量后颜色贯穿到组件和 SVG、手机菜单，以及两种模式下首页、代表性 Wiki、目录、年代、来源页和搜索弹窗的 axe 可访问性规则（包括可自动判断的文字对比度）。`tests/browser/tokens.spec.ts` 额外验证桌面／手机修改字号和间距基数后，Nuxt UI、Tailwind 与自定义 CSS 同步缩放；用途变量覆盖、颜色保留、弹窗和来源面板尺寸、减少动态效果偏好。原有内容、搜索、无 JS 阅读、HTTP 导出与深链接测试继续运行。

视觉验收还应检查桌面／手机截图、排版和焦点。axe 自动检查不能替代人工审查所有布局、渐变背景或任意用户自定义色板。
