# VideoTogether Lite 一起看视频

VideoTogether Lite 是一个用于同步视频播放的 Chrome 扩展和 Go 后端服务。用户可以创建邀请码房间，其他人用昵称加入；每个参与者需要主动选择并共享当前视频，其他参与者才能跟随播放状态。

[English](./README.MD)

## 仓库内容

- `apps/extension`: 使用 Vite、TypeScript、React 和 Tailwind 构建的 Chrome MV3 扩展。
- `apps/server`: Go 房间同步 API 和 WebSocket 后端。
- `packages/shared`: 共享协议、语言、URL 状态和时间同步工具。
- `deploy`: 小型 VPS 上使用 Docker Compose 和 Caddy 部署的配置。
- `.github/workflows`: CI、后端镜像发布、后端部署、扩展打包和 Chrome Web Store 上传流程。

## 本地安装

```bash
just setup
just build-extension
```

打开 `chrome://extensions`，启用开发者模式，然后加载已解压的 `apps/extension/dist`。

## 开发

前置依赖：

- Node.js 24 或更新版本
- pnpm 11.3 或更新版本
- Go 1.26.3
- `just`

运行完整本地开发循环：

```bash
just setup
just setup-browser
just dev
```

`just dev` 会启动 `http://127.0.0.1:5001` 上的 Go 调试服务，监听扩展构建，并打开已加载扩展的 Chromium 以及一个本地视频调试页面。

运行检查：

```bash
just check
```

更多文档：

- [用户指南](./docs/zh-cn/user-guide.md)
- [开发文档](./docs/zh-cn/development.md)
- [部署文档](./docs/deployment.md)
- [发布清单](./docs/release-checklist.md)
- [隐私说明](./docs/privacy.md)
- [Chrome 商店说明](./docs/chrome-store.md)
- [HTTP 和 WebSocket API](./docs/HttpApiSpec.md)

问题反馈: https://github.com/yicheny0580/VideoTogetherLite/issues
