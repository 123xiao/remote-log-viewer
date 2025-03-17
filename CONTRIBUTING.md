# 贡献指南

感谢您对远程服务器日志查询工具的关注！我们非常欢迎社区成员参与项目的开发和改进。本文档将指导您如何为项目做出贡献。

## 开发环境设置

1. 克隆项目到本地：

   ```bash
   git clone https://github.com/yourusername/remote-log-viewer.git
   cd remote-log-viewer
   ```

2. 安装依赖：

   ```bash
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

## 打包说明

### Windows 安装程序打包

1. 安装打包依赖：

   ```bash
   npm install electron-builder --save-dev
   ```

2. 在 `package.json` 中添加打包配置：

   ```json
   {
     "build": {
       "appId": "com.logcat.app",
       "productName": "远程服务器日志查询工具",
       "win": {
         "target": [
           {
             "target": "nsis",
             "arch": ["x64"]
           }
         ],
         "icon": "build/icon.ico"
       },
       "nsis": {
         "oneClick": false,
         "allowToChangeInstallationDirectory": true,
         "createDesktopShortcut": true,
         "createStartMenuShortcut": true,
         "shortcutName": "远程服务器日志查询工具"
       }
     },
     "scripts": {
       "build:win": "electron-builder --win --x64"
     }
   }
   ```

3. 执行打包命令：

   ```bash
   npm run build:win
   ```

4. 打包后的安装程序将在 `dist` 目录下生成。

### 注意事项

- 确保已安装 Node.js 和 npm
- Windows 打包需要在 Windows 系统下进行
- 打包前请确保所有依赖都已正确安装
- 建议使用 Node.js LTS 版本
- 如遇到签名相关错误，可添加 `--publish=never` 参数

## 提交代码

1. 创建新的分支：

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. 提交您的更改：

   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   ```

3. 推送到远程仓库：

   ```bash
   git push origin feature/your-feature-name
   ```

4. 创建 Pull Request

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范，提交信息格式如下：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

常用的 type 类型：

- feat: 新功能
- fix: 修复问题
- docs: 文档修改
- style: 代码格式修改
- refactor: 代码重构
- test: 测试用例修改
- chore: 其他修改

## 代码规范

- 遵循 ESLint 配置的代码规范
- 保持代码简洁清晰
- 添加必要的注释
- 确保代码可以正常运行

## 问题反馈

如果您发现了问题或有新的想法，欢迎创建 Issue。在创建 Issue 时，请：

1. 使用清晰的标题
2. 详细描述问题或建议
3. 如果是 bug，请提供：
   - 问题的复现步骤
   - 期望的结果
   - 实际的结果
   - 错误信息（如果有）
   - 运行环境信息

## 联系我们

如果您有任何问题，可以：

- 创建 Issue
- 发送邮件至：[codecoming@163.com]
- 通过项目的讨论区交流

感谢您的贡献！
