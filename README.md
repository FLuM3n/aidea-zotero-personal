# AIdea — Zotero 个人定制版

当前版本 **3.6.1.9**。基于 [Visterainer/aidea-zotero](https://github.com/Visterainer/aidea-zotero) 3.6.1，保留原作者署名与 AGPL-3.0-or-later 许可。

这是用于 Windows 与 Mac 之间安装同一版本的个人仓库。仓库保持 **Private**。

## Mac 上安装

1. 在 Mac 上登录同一 GitHub 账号，打开本仓库的 [Releases](../../releases/latest)。
2. 下载 **AIdea-3.6.1.9-fulltext.xpi** 安装包。请下载附件中的 XPI，不要下载 Source code 压缩包，也不要解压 XPI。
3. 在 Zotero 的“工具 → 插件”（部分版本叫“附加组件”）中，点击齿轮菜单，选择“从文件安装插件”，选中下载的 XPI。
4. 完全退出并重新打开 Zotero，在 AIdea 设置里填入自己的 API 地址、模型和 Key。

本仓库不保存你的 API Key、聊天记录或文献。Windows 上的配置不会因为安装插件自动复制到 Mac。论文文件仍需由 Zotero/OneDrive 等原有方式同步。

找不到 Release 时，也可在仓库 [downloads](downloads/) 目录打开安装包并点击 Download raw file。

## 本版功能

- PDF 对话每轮以文件全部已提取文字为基础；提到图号或页码，不再只提供图注。
- 先为全文预留容量，再放入对话历史；全文确实超出模型容量时明确提示，不静默删成摘录。
- 扫把旁一键扫描当前 PDF 页，PDF 名称同排显示扫描状态。
- 扫描图片作为普通上下文加入，不设图片优先级。
- 保留国内供应商配置、历史对话布局及扫描兼容修复。

详见 [全文阅读说明](docs/全文阅读说明.md)。全文指 PDF 可提取文字，独立补充文件需要另行添加；图片仍需按需扫描。全文输入会增加 token 用量。

## 文件与重建

- `downloads/`：当前可安装 XPI，Windows/Mac 共用。
- `plugin/`：当前安装包的完整文件内容。
- `upstream-source/`：原版 3.6.1 TypeScript 源码快照，用于溯源；不是已经修改完成的 3.6.1.9 TS 工程。
- `changes/`：当前定制辅助模块。
- `patches/`：从原版 XPI 到当前版本的完整修改差异。
- `verification/`：本地测试记录。

用 Python 3 重建：`python tools/build_xpi.py`。验证已发布安装包：`python tools/verify_package.py`。

当前下载包 SHA-256：`7466023499f51f7d15334d0021071a523e377c5bd22a209b77eb9a873f9f50ba`。

全文完整性、请求预算、扫描及图片请求结构检查已通过。测试没有调用付费 API，也不代表已在 Mac 的实际 Zotero 环境完成验证。

当前安装包保留原作者的插件更新地址；以后升级前请确认目标版本包含个人定制功能。
