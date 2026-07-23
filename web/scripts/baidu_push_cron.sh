#!/bin/bash
set -e
source /root/.baidu_push.env
/usr/bin/python3 /root/wbrain-project/auto-tools/site_analyzer/web/scripts/baidu_push.py
