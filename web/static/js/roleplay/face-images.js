// === Section: 头像生成 ===
// 角色头像生成闭环：清洗 → 调用 API → 失败重试 → 插入消息

App.generateCharacterFace = async function(character, imagePrompt) {
    if (!character || !character.name) {
        throw new Error('无效的角色对象，无法生成头像');
    }
    console.log('开始生成头像:', character.name, imagePrompt.slice(0, 100));

    const safePrompt = App.sanitizeImagePrompt(imagePrompt, character);
    console.log('清洗后的生图 prompt:', safePrompt.slice(0, 150));

    let imageUrl;
    try {
        imageUrl = await App.agnesImageGen(safePrompt);
    } catch (e) {
        console.warn('生图失败，尝试使用备用 prompt:', e.message);
        const backupPrompt = App.buildBackupPrompt(character);
        console.log('备用 prompt:', backupPrompt.slice(0, 150));
        imageUrl = await App.agnesImageGen(backupPrompt);
    }

    console.log('头像生成成功:', character.name, imageUrl.slice(0, 80));
    if (!imageUrl) {
        throw new Error('未获取到图片 URL');
    }

    character.faceImageUrl = imageUrl;
    await saveState();

    // 发送头像消息
    state.messages.push({
        id: 'msg_face_' + Date.now(),
        role: 'char',
        type: 'image',
        content: imageUrl,
        caption: `${character.name} 的角色形象`,
        charIndex: state.characters.indexOf(character),
        timestamp: new Date().toISOString()
    });
    renderMessage(state.messages[state.messages.length - 1]);
    await saveMessages();

    addSystemMessage('角色头像生成完成');
}

// 静默生成头像（并行时使用，不插系统消息）
App.generateCharacterFaceSilent = async function(character, imagePrompt) {
    if (!character || !character.name) {
        return null;
    }
    console.log('[并行] 开始生成头像:', character.name, imagePrompt.slice(0, 100));

    const safePrompt = App.sanitizeImagePrompt(imagePrompt, character);

    let imageUrl;
    try {
        imageUrl = await App.agnesImageGen(safePrompt);
    } catch (e) {
        console.warn('[并行] 生图失败，尝试备用 prompt:', e.message);
        const backupPrompt = App.buildBackupPrompt(character);
        imageUrl = await App.agnesImageGen(backupPrompt);
    }

    if (!imageUrl) {
        console.error('[并行] 头像生成失败:', character.name);
        return null;
    }

    character.faceImageUrl = imageUrl;
    await saveState();

    // 发送头像消息
    state.messages.push({
        id: 'msg_face_' + Date.now(),
        role: 'char',
        type: 'image',
        content: imageUrl,
        caption: `${character.name} 的角色形象`,
        charIndex: state.characters.indexOf(character),
        timestamp: new Date().toISOString()
    });
    renderMessage(state.messages[state.messages.length - 1]);
    await saveMessages();

    console.log('[并行] 头像生成成功:', character.name);
    return imageUrl;
};
