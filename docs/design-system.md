# 赫特维拉设计系统

当前实现：Nuxt UI 4.12.0 + Tailwind CSS 4.3.3。视觉延续档案馆与阅读器方向：暖色纸面、植物色主色、少量黄铜色强调；深色使用有层次的暗色表面。颜色角色与具体色相分离，可整体换肤。

## 三层变量

| 层级 | 文件 | 职责 |
| --- | --- | --- |
| 基础 | `app/assets/css/primitives.css` | OKLCH 色板 50—950、色相、字体、字号、页面与正文宽度、圆角基数、动效时长；颜色字面量仅在这里定义 |
| 语义 | `app/assets/css/theme.css` 的 `:root, .light` / `.dark` | 页面、文本、边框、强调、焦点、选区、抬升表面；覆盖 Nuxt UI 的 `--ui-*` 契约 |
| 组件 | 同一文件的 `--ds-hero-*`、`--ds-art-*`、`--ds-quote-*` 等 | 从语义角色取得横幅、按钮、插画、引用、搜索等用途的颜色，不再另设字面量 |

`app/app.config.ts` 将 `primary → brand`、`secondary → accent`、`neutral → canvas` 接到 Nuxt UI。成功、信息、警告与错误沿用框架的语义色板，可在同一配置调整。`@theme static` 保证动态读取的所有色阶都会输出；`@theme inline` 将 `bg-raised`、`bg-tint`、`bg-hero-action` 等工具类绑定到语义／组件变量。

样式加载顺序在 `main.css`：Tailwind → Nuxt UI → 基础变量 → 主题与组件变量 → 档案布局。主题变量使用无 layer 声明覆盖框架的 `@layer theme`；不依赖 `!important` 修正颜色。`archive.css` 负责版式和阅读排版，只消费变量。

## 如何调整

整体改变三组颜色，修改基础变量即可：

```css
@theme static {
  --hue-brand: 158;
  --hue-canvas: 95;
  --hue-accent: 78;
}
```

这些值分别控制主色、纸面／中性色的细微色调、强调色。若需改变明暗或饱和度，在同文件调整对应色阶的 OKLCH 亮度／色度。重新运行对比度检查；“可以换色”并不意味着任意变量组合都符合可访问性标准。

| 想调整什么 | 修改入口 |
| --- | --- |
| 主色明暗 | `.light` / `.dark` 的 `--ui-primary` |
| 页面、卡片、弹窗 | `--ui-bg`、`--ds-surface-raised` 与 `--ui-bg-elevated` |
| 正文、次要信息、边框 | `--ui-text*`、`--ui-border*` |
| 横幅和插画 | `--ds-hero-*`、`--ds-art-*` |
| 全站圆角 | `--ds-radius-base`；Nuxt UI 与卡片、横幅均从它派生 |
| 字体与阅读密度 | `--font-*`、`--text-article`、`--text-article--line-height`、`--ds-reading-width` |
| 页面宽度与留白 | `--ds-page-width`、`--ds-page-gutter`；内部间距使用 Tailwind 间距体系 |
| 通用组件外观 | `app.config.ts` 的组件 slots／variants；少数局部差异使用 `ui` / `class` |

页面禁止 `bg-green-500`、`text-gray-600`、内联十六进制色值和页面各自维护的 `dark:*` 配色。使用 `bg-default`、`text-muted`、`text-primary`、`border-default` 等角色；独特需求先在组件变量层命名，再让样式消费它。透明度可用语义工具类的 `/10` 等修饰或基于变量的 `color-mix()`。

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
| 条目与相关阅读 | `UPageGrid`、`UPageCard` |
| 来源面板、状态、操作 | `UCard`、`UBadge`、`UButton` |
| 搜索 | `UModal`、`UInput`；查询由 Pagefind 完成 |
| 页面目录 | `UContentToc`，手机折叠、桌面滚动定位 |
| 页脚及基础上下文 | `UFooter`、`UApp`，语言为 `zh_cn` |

自定义代码保留在档案排版、来源呈现和轨道插画。搜索继续使用现有的 Pagefind 索引；不因视觉重构引入第二套搜索引擎。Nuxt UI 默认行为通过 props、slots 和主题配置定制，不绕过它的焦点管理和键盘交互。

## 验证

`tests/browser/theme.spec.ts` 验证系统偏好、手动切换、刷新与路由保持、修改基础变量后颜色贯穿到组件和 SVG、手机菜单，以及两种模式下首页、两篇 Wiki 和搜索弹窗的 axe 可访问性规则（包括可自动判断的文字对比度）。原有内容、搜索、无 JS 阅读、HTTP 导出与深链接测试继续运行。

视觉验收还应检查桌面／手机截图、排版和焦点。axe 自动检查不能替代人工审查所有布局、渐变背景或任意用户自定义色板。
