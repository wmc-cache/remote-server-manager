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

  /**
   * 查找文件位置
   * @param {string} query - 用户查询，如"nginx的配置文件在哪"
   * @param {Function} onData - 流式数据回调
   * @returns {Promise<string>} 完整的响应
   */
  async findFileLocation(query, onData = null) {
    if (!query || !query.trim()) {
      throw new Error('请输入文件查找问题');
    }

    const systemPrompt = `你是一个专业的 Linux/Unix 系统管理员和开发者助手。
你的任务是帮助用户找到他们想要的文件或目录的位置。

规则：
1. 分析用户的查询意图，理解他们要找什么类型的文件
2. 提供具体的查找命令，使用常见的 Linux 命令（find、locate、grep 等）
3. 列出该类型文件的常见标准路径
4. 如果可能，提供多个查找方法（快速查找和精确查找）
5. 使用 Markdown 格式，命令用 \`\`\`bash 标记
6. 对于系统关键目录，给出权限提示
7. 解释每个命令的作用和参数含义
8. 保持回答简洁但全面

格式示例：
**查找命令：**
\`\`\`bash
# 使用 find 精确查找
sudo find / -name "nginx.conf" 2>/dev/null

# 使用 locate 快速查找（需安装 mlocate）
locate nginx.conf
\`\`\`

**常见路径：**
- /etc/nginx/nginx.conf
- /usr/local/nginx/conf/nginx.conf
- /opt/homebrew/etc/nginx/nginx.conf (macOS Homebrew)

**说明：**
- find 命令会实时搜索文件系统，较慢但准确
- locate 命令基于数据库，需要执行 updatedb 更新
- 配置文件通常位于 /etc 目录下`;

    const userPrompt = `用户问题：${query}\n\n请提供文件查找命令和可能的文件位置：`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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
