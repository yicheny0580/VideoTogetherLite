# 开发文档

## 运行本地插件代码

本仓库现在是 pnpm monorepo。Chrome 插件代码在 `apps/extension`，后端服务在 `apps/server`。

### 1. 安装依赖

```bash
npx pnpm@latest install
```

### 2. 编译插件

```bash
npx pnpm@latest build:extension
```

编译产物会输出到 `apps/extension/dist`。

### 3. 运行本地插件

编译完成后，在 Chrome 插件页面 [chrome://extensions/](chrome://extensions/) 加载已解压的扩展程序 `apps/extension/dist`。

### 4. 开发模式

如果要连接本地后端服务：

```bash
VITE_VT_HOST=http://127.0.0.1:5001 npx pnpm@latest --filter @videotogether/extension dev
```

### 5. 检查

```bash
npx pnpm@latest lint
npx pnpm@latest typecheck
npx pnpm@latest test
go test ./apps/server/...
```

## 本地调试后端服务

```bash
cd apps/server
go run . debug
```
