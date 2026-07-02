// === 场景图元数据要求 ===
// LLM 回复末尾附加的 JSON 元数据块格式

export function buildMetadataRequirements() {
    return `=== 场景图元数据（必须）===
在你的回复**最后**，另起一行附加一个 JSON 块，格式如下：
{"sceneDesc":"{场景描述的文字版，不含花括号}","presentCharacters":["角色1","角色2"],"actions":{"角色1":"动作描述","角色2":"动作描述"},"dialogues":{"角色1":"对话内容","角色2":"对话内容"}}
要求：
- sceneDesc: 场景描述的纯文本版本（去掉花括号）
- presentCharacters: 本回合回复中**实际出现**的角色名数组
- actions: 每个角色的动作描述（从 (动作) 中提取）
- dialogues: 每个角色的对话内容
- 只包含实际出现在回复中的角色，不要包含未发言的角色
- JSON 必须是合法的，用双引号，不要有多余逗号
- 在 JSON 前后各放一行 \`\`\`json 和 \`\`\` 标记，例如：

\`\`\`json
{"sceneDesc":"走廊里","presentCharacters":["林浅","苏糖"],"actions":{"林浅":"微笑","苏糖":"挥手"},"dialogues":{"林浅":"你好","苏糖":"早上好"}}
\`\`\``;
}
