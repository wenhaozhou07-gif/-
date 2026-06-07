# GitHub 提交流程

当前项目已经是一个本地 git 仓库，并已创建初始提交。

## 1. 在 GitHub 创建空仓库

建议仓库名：

```text
synapse-ai-translation-assistant
```

创建时不要勾选自动生成 README，因为本项目已经包含 README。

## 2. 绑定远程仓库

把下面的 URL 换成你自己的 GitHub 仓库地址：

```bash
git remote add origin https://github.com/<your-name>/synapse-ai-translation-assistant.git
```

如果已经绑定过 remote：

```bash
git remote set-url origin https://github.com/<your-name>/synapse-ai-translation-assistant.git
```

## 3. 推送

```bash
git branch -M main
git push -u origin main
```

## 4. 提交前再次确认

```bash
git status
git check-ignore -v .env
npm run build
```

确认 `.env` 被忽略，不要把 DeepSeek API key 上传到 GitHub。

## 5. Demo 文件

README 中已嵌入：

```text
demo/synapse-demo.gif
```

如果需要提交视频平台链接，可以把这个 GIF 转成 MP4 后上传到 B 站、YouTube 或 GitHub Releases。
