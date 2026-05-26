# 开发文档

## 前置依赖

- Node.js 24 或更新版本
- pnpm 11.3 或更新版本
- Go 1.26.3
- `just`

## 初始化

```bash
just setup
just setup-browser
```

`just setup` 会安装 JS 依赖并下载 Go 模块。`just setup-browser` 会安装用于本地扩展运行和 e2e 测试的 Playwright Chromium。

## 本地模式

运行完整本地开发循环：

```bash
just dev
```

该命令会编译临时 Go 后端，在 `http://127.0.0.1:5001` 启动 debug 服务，监听扩展构建，打开加载 `apps/extension/dist` 的 Chromium，打开 popup，并打开一个本地 HTML 视频调试页面。

只启动服务和扩展监听构建：

```bash
just watch
```

使用已有构建打开 Chromium：

```bash
just browser
```

只运行后端：

```bash
just server
```

## 后端地址覆盖

扩展会在构建时读取 `VITE_VIDEOTOGETHER_LITE_HOST`。

```bash
VITE_VIDEOTOGETHER_LITE_HOST=https://beta.example.com pnpm build:extension
```

如果没有设置该值，开发构建会使用 `http://127.0.0.1:5001`。

## 检查

```bash
just check
```

该命令会运行 lint、过期文案检查、类型检查、JS 测试、扩展构建和 Go 测试。

单独运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
go test ./apps/server/...
```

运行扩展 e2e 测试：

```bash
just test-e2e
```

针对本地或已部署后端运行 smoke 流程：

```bash
BACKEND_PUBLIC_URL=https://beta.example.com just smoke-backend
```

该流程会检查 `/healthz`、时间戳、创建房间、加入房间、更新房间、退出房间，以及 WebSocket `room.updated` 广播。

通过临时 Caddy 反向代理运行后端 Docker 镜像：

```bash
just smoke-docker
```

该命令需要正在运行的 Docker daemon，并可能拉取 Go、distroless 和 Caddy 镜像。

## 发布构建

发布产物通过 GitHub Actions 生成：

- `Backend Image` 将 Go 后端镜像发布到 GHCR。
- `Deploy Backend` 通过 Docker Compose 和 Caddy 更新 VPS 环境。
- `Extension Package` 生成指定渠道的 ZIP 产物。
- `Chrome Web Store Upload` 将已提升版本号的 ZIP 上传到现有商店项目。

Beta 和 production 构建必须在对应 GitHub Actions environment 中设置 `BACKEND_PUBLIC_URL`。
