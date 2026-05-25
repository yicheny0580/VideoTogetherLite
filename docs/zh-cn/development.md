# 开发文档

## 运行本地插件代码

本仓库现在是 pnpm monorepo。Chrome 插件代码在 `apps/extension`，后端服务在 `apps/server`。

### 前置依赖

- Node.js 24 或更新版本
- pnpm 11.3 或更新版本
- Go 1.26.3
- `just`

### 1. 安装依赖

```bash
just setup
```

### 2. 编译插件

```bash
just build-extension
```

编译产物会输出到 `apps/extension/dist`。

### 3. 运行本地插件

编译完成后，在 Chrome 插件页面 [chrome://extensions/](chrome://extensions/) 加载已解压的扩展程序 `apps/extension/dist`。

### 4. 开发模式

运行完整本地开发循环：

```bash
just setup-browser
just dev
```

`just dev` 会启动 `127.0.0.1:5001` 上的 Go 调试服务，运行插件 watch 构建，并打开已加载 `apps/extension/dist` 的 Chromium。它还会打开插件 popup 和一个包含 video 元素的本地调试页面。

如果只需要服务和插件 watch 构建，不打开浏览器：

```bash
just watch
```

如果已经有 `apps/extension/dist`，只想打开浏览器：

```bash
just browser
```

### 5. 检查

```bash
just check
```

## 本地调试后端服务

```bash
just server
```
