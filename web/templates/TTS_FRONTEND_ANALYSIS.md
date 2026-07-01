# 前端 Edge TTS WebSocket 可行性分析

> 2026-07-01

## 结论

**纯前端直接调 Edge TTS WebSocket 不可行**，原因如下：

### 1. WebSocket 端点需要 Sec-MS-GEC 令牌

Microsoft Edge TTS 的 WebSocket 端点是：
```
wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
  ?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4
  &ConnectionId={uuid}
  &Sec-MS-GEC={SHA256(ticks + TrustedClientToken)}
  &Sec-MS-GEC-Version=1-143.0.3650.75
```

其中 `Sec-MS-GEC` 是一个基于当前时间（Windows 文件时间格式）和 TrustedClientToken 的 SHA256 哈希值，每 5 分钟变化一次。

### 2. MUID Cookie 认证

连接时需要 `Cookie: muid={generated_uuid};` 头，这个也是 DRM 模块动态生成的。

### 3. 协议复杂度高

WebSocket 握手后需要按顺序发送：
1. **speech.config** — JSON 格式，指定输出格式（24kHz MP3）、边界类型
2. **SSML 请求** — 带自定义头部的 SSML 文本

接收响应需要解析二进制帧（带长度前缀的头 + 数据）和文本帧。

### 4. 跨域问题

WebSocket 连接到 `speech.platform.bing.com`，浏览器会有 CORS 限制。即使 WebSocket 本身不受 CORS 限制，SSL 证书和客户端指纹验证也可能导致连接被拒。

## 可行替代方案

### 方案 A：后端 `/api/tts` 代理（推荐）

最轻量的后端端点，不占持续资源：

```python
# site_analyzer/web/app.py
import io
import edge_tts

@app.route('/api/tts', methods=['POST'])
def tts_api():
    data = request.get_json()
    text = data['text']
    voice = data.get('voice', 'zh-CN-XiaoxiaoNeural')
    rate = data.get('rate', '+0%')
    volume = data.get('volume', '+0%')
    pitch = data.get('pitch', '+0Hz')
    
    communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume, pitch=pitch)
    audio_chunks = []
    for chunk in communicate.stream_sync():
        if chunk['type'] == 'audio':
            audio_chunks.append(chunk['data'])
    
    audio_data = b''.join(audio_chunks)
    return Response(audio_data, mimetype='audio/mpeg')
```

**优点**：
- 代码不到 20 行
- 仅在请求时占用 CPU（生成语音约 0.1-0.5 秒）
- 无持久资源消耗
- 稳定可靠

### 方案 B：Web Speech API（零后端）

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.lang = 'zh-CN';
speechSynthesis.speak(utterance);
```

**缺点**：
- 音色取决于浏览器（Chrome 有微软语音，Firefox/Safari 很少）
- 不支持 SSML（情绪/语速/音量控制）
- 移动端兼容性差

## 推荐

采用 **方案 A**，后端代理是最务实的选择。它不会"持续占用"服务器资源——只在用户发消息时瞬时生成语音，生成完即释放。对于角色扮演场景，每条消息平均 0.2 秒的 TTS 延迟完全可以接受。
