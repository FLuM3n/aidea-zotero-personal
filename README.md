# AIdea — Zotero 个人定制版

当前版本 **3.6.1.11**。基于 [Visterainer/aidea-zotero](https://github.com/Visterainer/aidea-zotero) 3.6.1，保留原作者署名与 AGPL-3.0-or-later 许可。

这是用于 Windows 与 Mac 安装同一版本的公开仓库。各设备在本机填写自己的账号和 API 配置。

## Mac 上安装

1. 打开本仓库的 [Releases](https://github.com/FLuM3n/aidea-zotero-personal/releases/latest)。
2. 下载 **AIdea-3.6.1.11-gemini-web.xpi** 安装包。请下载附件中的 XPI，不要下载 Source code 压缩包，也不要解压 XPI。
3. 在 Zotero 的“工具 → 插件”（部分版本叫“附加组件”）中，点击齿轮菜单，选择“从文件安装插件”，选中下载的 XPI。
4. 完全退出并重新打开 Zotero，在 AIdea 设置里填入自己的 API 地址、模型和 Key。

本仓库不保存你的 API Key、聊天记录或文献。Windows 上的配置不会因为安装插件自动复制到 Mac。论文文件仍需由 Zotero/OneDrive 等原有方式同步。

找不到 Release 时，也可在仓库 [downloads](downloads/) 目录打开安装包并点击 Download raw file。

## Gemini 网页版本地服务

安装插件后，在自定义 API 预设中选择 **Gemini 网页版（本地）**。它连接单独运行的 `gemini-web-api` 服务，默认地址 `http://127.0.0.1:8100/v1/`，默认模型 `gemini-3.8-flash`。该服务需要使用者自行安装、运行并登录 Gemini 网页账号。

Key 栏只填写本地服务配置的访问 Key，服务未设置访问 Key 时可留空。模型以本地服务和网页账号实际支持的列表为准。图片输入需要服务的 webapi 后端可用。默认按128K上下文预算准备请求，支持手动调整，实际长文本能力须按账号验证。

## 本版功能

- PDF 对话每轮以文件全部已提取文字为基础；提到图号或页码，不再只提供图注。
- 先为全文预留容量，再放入对话历史；全文确实超出模型容量时明确提示，不静默删成摘录。
- 扫把旁一键扫描当前 PDF 页，PDF 名称同排显示扫描状态。
- 扫描图片作为普通上下文加入，不设图片优先级。
- 划词直接翻译选中文字，取消后台全文预热与冷启动缓存依赖。
- 加入 Gemini 网页版本地服务预设。
- 保留国内供应商配置、历史对话布局及扫描兼容修复。

详见 [全文阅读说明](docs/全文阅读说明.md)。全文指 PDF 可提取文字，独立补充文件需要另行添加；图片仍需按需扫描。全文输入会增加 token 用量。

## 文件与重建

- `downloads/`：当前可安装 XPI，Windows/Mac 共用。
- `plugin/`：当前安装包的完整文件内容。
- `upstream-source/`：原版 3.6.1 TypeScript 源码快照，用于溯源；不是已经修改完成的 3.6.1.11 TS 工程。
- `changes/`：当前定制辅助模块。
- `patches/`：从原版 XPI 到当前版本的完整修改差异。
- `verification/`：本地测试记录。

用 Python 3 重建：`python tools/build_xpi.py`。验证已发布安装包：`python tools/verify_package.py`。

当前下载包 SHA-256：`ef152ef07f3dff99bacf961e5d2f139a08c4c2e515b2767b05d2b73ad520d3c4`。

全文完整性、请求预算、扫描及图片请求结构检查已通过。测试没有调用付费 API，也不代表已在 Mac 的实际 Zotero 环境完成验证。

当前安装包保留原作者的插件更新地址；以后升级前请确认目标版本包含个人定制功能。

开发验证可运行 `node tests/selection-translation.mjs` 和 `node tests/gemini-web.mjs`，这些检查不调用真实模型。
