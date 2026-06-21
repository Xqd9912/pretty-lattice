# 前端设计



## Tech Stack

前端采用一个偏工具界面的 React 技术栈：

- Bun：包管理和脚本运行。
- Vite：开发服务器和前端构建。
- TypeScript + React：应用界面。
- Tailwind CSS：样式系统和设计 token。
- shadcn/ui：应用控件的源码级组件基础。
- Radix UI primitives：tooltip、separator、popover、dialog 等控件的可访问性交互底层。
- lucide-react：线性图标。
- Three.js + React Three Fiber：晶体结构预览和后续导出前的可视化。

shadcn/ui 只用于面板、按钮、输入控件、提示层等应用界面。晶体图本身的审美、材料、相机和导出效果由 Three.js 渲染层单独控制。



## Design Style

模仿 Vercel 的风格，参见 [vercel_design.md](notes/vercel_design.md) 。

UI 字体采用 Geist。

核心在于：高对比度，黑白灰，UI 上克制用彩色，不要为了装饰而用彩色。

