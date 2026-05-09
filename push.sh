#!/bin/bash
# 同时推送到 Gitee、GitCode 和 GitHub

# 提交信息
if [ -z "$1" ]; then
    echo "请提供提交信息"
    echo "用法: ./push.sh '提交信息'"
    exit 1
fi

# 添加所有更改
git add -A

# 提交
git commit -m "$1"

# 推送到三个平台
echo "推送到 Gitee..."
git push origin master

echo "推送到 GitCode..."
git push gitcode master

echo "推送到 GitHub..."
git push github master

echo "✅ 同步完成！"
