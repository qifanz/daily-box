# Daily Box 项目规范

## 代码变更与 PRD 同步
- 每次对 `daily-box` 进行代码或配置改动后，必须同步更新根目录的 `PRD.md`：
  - 在 `5. 变更日志（Change Log）` 中补充本次版本号/日期、改动摘要与涉及文件；
  - 若新增或调整了功能模块、数据规范或交互规则，一并更新前面对应章节。
- 推送 GitHub 时，确保 `PRD.md` 与代码改动一同提交，由 `.github/workflows/deploy.yml` 自动部署至 GitHub Pages。
