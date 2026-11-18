# AIdea — Zotero 个人定制版

当前版本 **3.6.1.16**。基于 [Visterainer/aidea-zotero](https://github.com/Visterainer/aidea-zotero) 3.6.1，保留原作者署名与 AGPL-3.0-or-later 许可。

这是用于 Windows 与 Mac 安装同一插件版本的公开仓库。各设备在本机填写自己的账号和 API 配置。

## 安装或更新

1. 打开 [最新 Release](https://github.com/FLuM3n/aidea-zotero-personal/releases/latest)。
2. 下载 **AIdea-3.6.1.16-progress-lock.xpi**。下载 Release 附件里的 XPI，不要下载 Source code 压缩包，也不要解压 XPI。
3. 在 Zotero 的“工具 → 插件”（部分版本叫“附加组件”）中，点击齿轮菜单，选择“从文件安装插件”，选中下载的 XPI。
4. 完全退出并重新打开 Zotero。已有环境和账号配置可继续使用；第一次使用的设备需要单独配置。

也可从 [downloads](downloads/) 目录下载当前安装包。本仓库不保存 API Key、网页登录会话、聊天数据库或论文文件。安装插件不会把 Windows 的配置、文献或登录状态复制到 Mac。

## 3.6.1.12–3.6.1.16 的更新

- 多个 `cite` 来源标记可分别点击，支持跳转 PDF 页并在能匹配原句时临时高亮。
- Zotero 条目同步版本变化不会再把未改变的 PDF 误判成不同文件；实际文件变化仍会校验。
- 自定义供应商“保存勾选模型”同时更新菜单显示名单，同名模型可在不同供应商分组分别使用各自接口。
- 全文翻译安装环境时一并约束 `bitstring==4.3.1`，并实际导入引擎后才报告就绪。
- 翻译进度接收 BabelDOC 的结构化阶段和完成数量；不足以估算时显示“估算中”，不再用固定10%推算不断增长的剩余时间。
- 本地 Gemini 的正文与术语提取限制为单任务，修复“并发为1”设置未传入引擎的问题。
- Windows 短暂锁住进度文件时自动重试，跳过一帧进度不会终止翻译；最终结果有独立快照。
- 修正翻译过程中异常退出被误报为“启动失败”的提示。

早期定制功能仍保留：全文文字上下文、一键扫描当前页、图片同排状态、划词直接翻译、国内供应商预设及历史对话布局。详见 [全文阅读说明](docs/全文阅读说明.md)。全文指 PDF 可提取文字，补充文件需要另行添加；图片仍需按需扫描。全文输入会增加模型用量。

## Gemini 网页版本地服务

在自定义 API 预设中选择 **Gemini 网页版（本地）**，默认地址为 `http://127.0.0.1:8100/v1/`。需要单独运行与该接口兼容的 Gemini 网页服务并自行登录。点击获取模型列表，选择账号实际可用的模型；预设名称不在列表中时，请按真实列表选择。

Key 栏只填写本地服务设置的访问 Key，服务未设置时可留空。默认按128K上下文预算准备请求，支持手动调整，实际能力以服务和账号为准。

插件可在 Windows/Mac 安装，但本地服务也必须在对应电脑运行。另一台 Windows 电脑上的 `127.0.0.1` 服务不能直接被 Mac 调用。该仓库仅发布 Zotero 插件，不打包本机 Gemini 终端及其登录缓存。

使用 Gemini 网页服务时，如果回答出现空 `[]`，需要服务端兼容插件的引用标记；仅更新 XPI 无法恢复已经丢失的来源编号。

## 验证与重建

- `downloads/`：可直接安装的 XPI 与校验值。
- `plugin/`：当前安装包的完整内容。
- `upstream-source/`：原版 3.6.1 TypeScript 快照，用于溯源；当前定制以 `plugin/` 和补丁为准。
- `changes/`、`patches/`：定制辅助代码与修改差异。
- `tests/`、`verification/`：回归检查和验证范围。

用 Python 3 重建：`python tools/build_xpi.py`。验证发布包：`python tools/verify_package.py`。重建包的内容也可通过验证脚本检查；ZIP 容器的字节校验值可能因打包方式而不同。

当前发布包 SHA-256：`7b29dd2f2ef3775cf4681bc190180adfd2e6941a9f0d1f2a03dd656b67ed5c7e`。

无需调用模型的检查：

```text
node tests/selection-translation.mjs
node tests/gemini-web.mjs
node tests/provider-selection.mjs
node tests/citations.mjs
node tests/citation-revision.mjs
node tests/translation-progress.mjs
node tests/translation-progress-lock.mjs
python -m unittest discover -s tests -p "test_translation*.py"
```

Windows 文件锁测试会在 Windows 上实际制造读取锁。BabelDOC 原生回调和完整离线模拟链路测试需要先设置环境变量 `AIDEA_TRANSLATE_PYTHON`，指向本机已安装翻译环境的 Python。这些测试不会发送模型请求，不会翻译个人文献。

验证不代表已在 Mac 的实际 Zotero 环境完成测试，也不代表整篇真实文献的所有翻译阶段均已验证。首次翻译可能需要准备字体和版面模型，网页模型逐段响应也可能较慢。

当前安装包保留原作者的插件更新地址；以后升级前请确认目标版本包含个人定制功能。
