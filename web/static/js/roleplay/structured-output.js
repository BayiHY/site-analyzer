// === Section: 结构化输出智能体调用 ===
// 前端只传 storyContent + schema.fields，后端 GLM-4-Flash 返回结构化 JSON

/**
 * 调用后端结构化输出智能体
 * @param {string} storyContent - 非结构化故事内容
 * @param {Array<{name: string, desc: string, type?: string}>} schemaFields - 字段定义
 * @returns {Promise<object>} 结构化数据对象
 */
App.structuredOutput = async function(storyContent, schemaFields) {
    if (!storyContent || !storyContent.trim()) {
        throw new Error('storyContent 不能为空');
    }
    if (!Array.isArray(schemaFields) || schemaFields.length === 0) {
        throw new Error('schemaFields 不能为空数组');
    }

    rpLog('info', 'STRUCTURED', `=== 结构化输出请求 ===`);
    rpLog('info', 'STRUCTURED', `content_len=${storyContent.length}, fields=${schemaFields.map(f => f.name).join(',')}`);

    try {
        const resp = await fetch('/api/structured-output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                storyContent: storyContent,
                schema: { fields: schemaFields }
            })
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (!data.success) {
            throw new Error(data.error || '结构化输出失败');
        }

        // 记录截断通知
        if (data.truncated) {
            rpLog('warn', 'STRUCTURED', `⚠️ ${data.notice} (原${data.originalLength}→截断${data.truncatedLength})`);
        }

        rpLog('info', 'STRUCTURED', `✅ 成功: ${Object.keys(data.structuredData).join(',')}`);
        return data.structuredData;

    } catch (e) {
        rpLog('error', 'STRUCTURED', `❌ ${e.message}`);
        throw e;
    }
};
