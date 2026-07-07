// === Section: 数据导入导出 ===
// JSON 数据的序列化、反序列化、文件读写

App.exportData = function() {
    const data = {
        characters: state.characters,
        story: state.story,
        emotions: state.emotions,
        revealed: state.revealed,
        messages: state.messages,
        exportTime: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roleplay_${state.story?.title || 'data'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

App.importData = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (data.character) state.character = data.character;
                if (data.characters) state.characters = data.characters;
                if (data.story) state.story = data.story;
                if (data.emotions) state.emotions = data.emotions;
                if (data.revealed) state.revealed = data.revealed;
                if (data.messages) { state.messages = data.messages; await saveMessages(); }
                await saveState();
                showChatScreen();
                renderMessages();
                closePanel();
                alert('数据导入成功');
            } catch (err) {
                alert('导入失败: ' + err.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
