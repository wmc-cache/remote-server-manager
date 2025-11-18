const { EventEmitter } = require('events');

class AIService extends EventEmitter {
  constructor() {
    super();
    this.config = {
      apiKey: '',
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      enabled: false,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 验证配置
   */
  validateConfig() {
    if (!this.config.enabled) {
      throw new Error('AI 功能未启用');
    }
    if (!this.config.apiKey) {
      throw new Error('API Key 未配置');
    }
    return true;
  }

  /**
   * 流式调用 DeepSeek API
   * @param {Array} messages - 消息数组
   * @param {Function} onData - 数据回调函数
   * @returns {Promise<string>} 完整响应
   */
  async streamChat(messages, onData) {
    this.validateConfig();

    const url = `${this.config.apiBaseUrl}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(error.error?.message || `API 请求失败: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              return fullContent;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                if (onData) {
                  onData(content);
                }
              }
            } catch (e) {
              console.error('解析响应失败:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  /**
   * 生成 Shell 命令
   * @param {string} prompt - 用户描述
   * @param {Function} onData - 流式数据回调
   * @returns {Promise<string>} 生成的命令
   */
  async generateCommand(prompt, onData = null) {
    if (!prompt || !prompt.trim()) {
      throw new Error('请输入命令描述');
    }

    const systemPrompt = `你是一个专业的 Linux 系统管理员和开发者助手。
你的任务是帮助用户生成安全、高效的 Shell 命令。

规则：
1. 只输出命令本身，不要包含任何解释
2. 命令应该简洁、有效
3. 对于危险操作（如 rm -rf），在命令前添加 # WARNING: 注释
4. 尽量使用常见的命令和选项
5. 如果请求不明确，给出一个最合理的命令

示例：
用户：查看当前目录的文件
助手：ls -la

用户：查找所有 .log 文件
助手：find . -name "*.log" -type f

用户：杀死占用 8080 端口的进程
助手：lsof -ti:8080 | xargs kill -9
`;

    const userPrompt = `用户需求：${prompt}\n\n请生成对应的 Shell 命令：`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return await this.streamChat(messages, onData);
  }

  /**
   * 解释 Shell 命令
   * @param {string} command - 命令
   * @param {string} stdout - 标准输出
   * @param {string} stderr - 错误输出
   * @param {Function} onData - 流式数据回调
   * @returns {Promise<string>} 解释内容
   */
  async explainCommand(command, stdout = '', stderr = '', onData = null) {
    if (!command || !command.trim()) {
      throw new Error('请输入命令');
    }

    const systemPrompt = `你是一个专业的 Linux 系统管理员和开发者助手。
你的任务是解释 Shell 命令的作用，并分析其输出结果。

格式要求：
1. 使用清晰的标题和小节
2. 用列表形式列出关键点
3. 如果有错误输出，分析错误原因并提供解决方案
4. 使用 Markdown 格式，代码块用 \`\`\`bash 标记
5. 对于危险操作给出警告提示
6. 尽量简洁明了，避免过度解释

请用中文回答。`;

    let userPrompt = `命令：\`\`\`bash\n${command}\n\`\`\`\n\n`;

    if (stdout && stdout.trim()) {
      userPrompt += `标准输出：\n\`\`\`\n${stdout}\n\`\`\`\n\n`;
    }

    if (stderr && stderr.trim()) {
      userPrompt += `错误输出：\n\`\`\`\n${stderr}\n\`\`\`\n\n`;
    }

    userPrompt += `请解释这个命令的作用，并分析输出结果（如果有）：`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return await this.streamChat(messages, onData);
  }

  /**
   * 用户输入测试
   * @param {string} input
   * @param {Function} onData
   * @returns {Promise<string>}
   */
  async testChat(input, onData = null) {
    if (!input || !input.trim()) {
      throw new Error('请输入消息');
    }

    const messages = [
      { role: 'system', content: '你是一个友好的助手，请用中文回答。' },
      { role: 'user', content: input },
    ];

    return await this.streamChat(messages, onData);
  }
}

// 单例模式
let instance = null;

function getAIService() {
  if (!instance) {
    instance = new AIService();
  }
  return instance;
}

module.exports = { AIService, getAIService };
