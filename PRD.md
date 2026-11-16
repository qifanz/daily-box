# Daily Box（每日知识盲盒）— 产品需求与迭代文档 (PRD)

> **文档约定**：本项目所有较大功能改动均遵循「先出 Plan 确认 → 实施开发 → 同步更新本 PRD 变更记录」的工作流。

---

## 1. 产品愿景与设计原则

**一句话定位**：一个零打开成本、每天花 2～5 分钟即可无压力学点跨学科新知的「每日知识盲盒」。

### 核心设计原则
1. **极低摩擦**：支持本地双击 `index.html`、Chrome/Edge 新标签页扩展、以及 GitHub Pages 手机端直开。
2. **克制的 30 秒阅读体量**：单张卡片严格控制在扫一眼能读完的密度，避免长篇大论带来阅读压力。
3. **拆盒仪式感 + 轻反馈**：每日有限配额制造期待感，1 秒反馈（`💡 有意思` / `🥱 一般`）悄悄学会用户口味。

---

## 2. 当前功能架构（v1.0.0）

### 2.1 核心模块与页面结构
| 模块 | 说明 | 对应文件 |
| :--- | :--- | :--- |
| 主界面与弹窗 | 顶栏统计、领域筛选、盲盒舞台、好奇心日历、收藏/口味抽屉、AI 补充弹窗 | `index.html` |
| 视觉与动效 | 浅色/深色主题、3D 翻转拆盒动画、移动端单列响应式布局 | `styles.css` |
| 种子知识库 | 内置 8 大领域共 36 张精选卡片，每张含钩子、原理解析、类比、彩蛋、深挖与 10 秒小测验 | `data/seed-cards.js` |
| 本地持久化 | `localStorage` 存储每日拆盒记录、连续天数、收藏夹、口味权重、测验作答与 AI 配置 | `js/storage.js` |
| 加权推荐引擎 | 按领域权重加权抽盒，优先展示未读 AI 新卡，题库刷完自动进入温故循环 | `js/recommender.js` |
| AI 动态扩充 | 支持 Gemini / OpenAI 兼容接口 / 本地 Ollama，按偏好或指定好奇心问题生成新卡片 | `js/ai-generator.js` |
| 主控与交互 | 渲染日历、卡片交互、抽屉检索、主题切换与 Toast 提示 | `js/app.js` |
| 扩展与自动部署 | Chrome/Edge Manifest V3 新标签页配置 + GitHub Actions 自动发布至 GitHub Pages | `manifest.json`, `.github/workflows/deploy.yml` |

### 2.2 单张卡片数据规范
- `category`：8 大领域之一（`物理直觉`、`历史冷知识`、`心理与认知`、`经济与博弈`、`生物与自然`、`语言与词源`、`科技与逻辑`、`艺术与人文`）
- `difficulty`：`轻松` / `进阶`
- `hook`：反直觉钩子问题或结论（≤ 30 字）
- `summary`：通俗核心解释（90～130 字）
- `analogy`：生活化直觉类比
- `trivia`：「顺便一提」冷门彩蛋
- `deepDive`：点击「🔍 挖深一点」后展开的进阶原理
- `quiz`：1 道巩固记忆的单选快问快答（含解析）

### 2.3 核心交互规则
- **每日配额**：默认每天 `3` 个待拆盲盒，支持点击「➕ 意犹未尽？再加拆 1 盒」手动追加。
- **口味权重调节**：初始各领域权重均为 `1.0x`；点 `💡 有意思` 收藏并 `+0.35x`（上限 `3.0x`），点 `🥱 一般` `-0.30x`（下限 `0.25x`），支持在「🎛️ 口味雷达」查看与一键重置。
- **好奇心日历**：展示近 `60` 天拆盒热力小方格，点击任意日期可回看当天拆开的卡片。

---

## 3. 线上环境与部署信息

- **GitHub 仓库**：https://github.com/qifanz/daily-box
- **线上访问地址**：https://qifanz.github.io/daily-box/
- **自动部署机制**：推送至 `main` 分支后，由 `.github/workflows/deploy.yml` 自动部署至 GitHub Pages。

---

## 4. 后续迭代候选池（Backlog）

- [ ] **手机端 PWA 优化**：补充 App 图标、`site.webmanifest` 与 Service Worker 离线缓存，实现主屏幕全屏无地址栏启动与断网秒开。
- [ ] **跨设备进度同步**：增加「导出 / 导入 JSON 备份」，或可选接 GitHub Gist / 云存储实现 PC 与手机进度互通。
- [ ] **AI 生成体验增强**：支持一键批量生成指定领域专题包、卡片编辑/删除管理。

---

## 5. 变更日志（Change Log）

### v1.0.0 — 2026-11-15
- **初始版本上线**：完成 Daily Box MVP 全部核心功能开发并部署至 GitHub Pages。
- **新增文件**：
  - `index.html`, `styles.css`, `manifest.json`
  - `data/seed-cards.js`（8 大领域共 36 张原创整理种子卡片）
  - `js/storage.js`, `js/recommender.js`, `js/ai-generator.js`, `js/app.js`
  - `.gitignore`, `.github/workflows/deploy.yml`
- **交付能力**：支持 PC 本地双击直开、Chrome/Edge 新标签页扩展加载、手机浏览器访问与 GitHub Actions 自动化部署。
