// === Section: Window 别名注册 ===
// 因为 JS 模块化架构，各模块的 App.xxx 函数需要通过 window 别名才能在 HTML
// 的 onclick/onkeydown 等裸函数调用中使用。在此统一注册，方便维护和排查。

// 图片 API
window.agnesChat = App.agnesChat;
window.agnesImageGen = App.agnesImageGen;
window.appendArtStyle = App.appendArtStyle;
window.sanitizeImagePrompt = App.sanitizeImagePrompt;
window.buildBackupPrompt = App.buildBackupPrompt;

// 头像生成
window.generateCharacterFace = App.generateCharacterFace;
window.generateCharacterFaceSilent = App.generateCharacterFaceSilent;
window.generatePlayerAvatar = App.generatePlayerAvatar;

// 场景图
window.generateSceneImage = App.generateSceneImage;
window.generateInitialSceneImage = App.generateInitialSceneImage;
window.parseSceneFromReply = App.parseSceneFromReply;
window.isSceneChanged = App.isSceneChanged;
window.sceneToImagePrompt = App.sceneToImagePrompt;
window.getActiveCharacterFaceUrl = App.getActiveCharacterFaceUrl;
window.applySceneBackground = App.applySceneBackground;

// 情感与信息披露
window.updateEmotions = App.updateEmotions;
window.updateRevealedInfo = App.updateRevealedInfo;
window.updateDynamicAttributes = App.updateDynamicAttributes;

// 状态持久化
window.saveState = App.saveState;
window.saveMessages = App.saveMessages;
window.loadState = App.loadState;
window.loadMessages = App.loadMessages;
window.openDB = App.openDB;
window._isDBReady = App._isDBReady;

// UI 切换
window.showChatScreen = App.showChatScreen;
window.showSetupScreen = App.showSetupScreen;
window.updateStoryHeader = App.updateStoryHeader;
window.updateGenerationControls = App.updateGenerationControls;

// 消息渲染
window.renderMessage = App.renderMessage;
window.renderMessages = App.renderMessages;
window.addSystemMessage = App.addSystemMessage;
window.showTyping = App.showTyping;
window.hideTyping = App.hideTyping;
window.truncate = App.truncate;

// 面板
window.renderInfoRow = App.renderInfoRow;
window.togglePanel = App.togglePanel;
window.closePanel = App.closePanel;
window.renderCharactersPanel = App.renderCharactersPanel;
window.renderSettingsPanel = App.renderSettingsPanel;
window.toggleCharDetails = App.toggleCharDetails;

// 应用初始化
window.loadSettings = App.loadSettings;
window.saveSettings = App.saveSettings;
window.restoreApiKeysToInputs = App.restoreApiKeysToInputs;
window.clearApiKey = App.clearApiKey;
window.resetStory = App.resetStory;
window.exportData = App.exportData;
window.importData = App.importData;
window.showNewDiscovery = App.showNewDiscovery;
