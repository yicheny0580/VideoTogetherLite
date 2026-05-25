# <a name="0">VideoTogether 一起看视频</a>


## VideoTogether Lite 是一个用于同步视频播放的 Chrome 插件。

文档正在完善中
请加入插件的交流群获取更详细的帮助信息，以及反馈问题

Telegram: https://t.me/videotogether_group

QQ群: 170200260

也欢迎提交任何 issue 以及 PR

## 安装使用

运行以下命令后，在 Chrome 扩展页面加载 `apps/extension/dist`。

```bash
just setup
just build-extension
```


## 开发

请查阅 [开发文档](./docs/zh-cn/development.md)

### 插件

插件代码在 `apps/extension`，使用 Vite、TypeScript、React 和 Tailwind 构建。

共享协议、语言、URL 状态和时间同步工具在 `packages/shared`。

Lite 版本只保留创建/加入房间和播放同步。语音、文字聊天、本地下载、Easy Share、Safari、Firefox、网页代理和生成的 release 文件已移除。

### 服务端

代码在 `apps/server`。


### 赞助

项目天使轮赞助

<img src="https://user-images.githubusercontent.com/23057110/175770059-c8faad24-dc79-42da-9359-bf462eb7e884.png" width="300">

七夕追加赞助

<img width="290" alt="B54A4B2B-D606-4CD8-B5BF-0AA53CD1B010" src="https://user-images.githubusercontent.com/23057110/182861201-022c9460-9174-47ce-b8d8-3ab3ff737e25.png">
