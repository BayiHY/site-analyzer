// === 世界观概要 ===
// 从 state.story 中提取精简版世界观、主线弧光、氛围基调、画面风格

export function buildWorldview(state) {
    const worldviewBrief = (state.story?.worldview || '').slice(0, 200);
    
    const mainArcBrief = state.story?.mainArc?.length > 0
        ? state.story.mainArc.slice(0, 3).map(a => `・${a.phase}：${a.description}`).join('\n')
        : '';
    
    const toneKeywords = (state.story?.toneKeywords || []).join('、');
    
    const imageStyle = state.story?.imageStyle || 'anime';

    let section = `=== 世界设定 ===
【世界观概要】${worldviewBrief || '未设定'}`;
    
    if (mainArcBrief) {
        section += `\n【主线弧光】\n${mainArcBrief}`;
    }
    
    section += `\n【氛围基调】${toneKeywords || '未设定'}\n`;
    section += `【画面风格】${imageStyle}。场景描写、环境氛围、角色动作都要符合这一视觉风格。\n`;

    return section;
}
