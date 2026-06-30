// === Section: 头像生成 ===
// 角色头像生成闭环：模块化三级降级 → 旧版兼容 → 备用兜底

// generateCharacterFace 和 generateCharacterFaceSilent 已迁移到 image-api.js
// 此处保留空壳以兼容旧代码引用
// 实际降级逻辑在 App.generateCharacterImage() 中实现：
//   L0: 0-5 全身 (style+face+hair+body+clothes+environment)
//   L1: 0-3 半身 (style+face+hair+body)
//   L2: 0-1 特写 (style+face)
//   Fallback: 旧版 sanitizePrompt → buildBackupPrompt
