(function () {
  function buildSystemPrompt(state, customTopic) {
    const validCategories = (window.CATEGORIES || []).map((c) => c.id);
    const weights = state.weights || {};
    const sortedPrefs = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    const existingHooks = window.DailyBoxRecommender
      .getAllCards()
      .slice(0, 35)
      .map((c) => c.hook)
      .join(' | ');

    const topicInstruction = customTopic && customTopic.trim()
      ? `用户特别好奇的主题是：「${customTopic.trim()}」。请围绕该主题（及其跨学科延伸）生成 3 张不同切入点的卡片。`
      : `请优先结合用户目前偏好的领域（${sortedPrefs.join('、')}）生成 3 张跨学科冷知识或思维模型卡片。`;

    return `你是一个严谨又有趣的“30秒每日知识盲盒”主编。
${topicInstruction}
请严格避免与以下已有问题重复：${existingHooks}

请【只输出合法的 JSON 数组】（不要带 Markdown 代码块包裹），数组包含 3 个对象，每个对象字段格式如下：
[
  {
    "category": "必须从以下8个之一选择：${validCategories.join(' / ')}",
    "difficulty": "轻松 或 进阶",
    "hook": "一句反直觉的钩子问题或结论（30字以内）",
    "summary": "通俗准确的核心原理解释（90~130字）",
    "analogy": "一个让人秒懂的生活化类比（40~70字）",
    "trivia": "一句‘顺便一提’的冷门彩蛋（40~65字）",
    "deepDive": "展开后的进阶原理补充（70~110字）",
    "quiz": {
      "question": "一道巩固核心原理的单选题",
      "options": ["选项A", "选项B", "选项C"],
      "answerIndex": 0,
      "explanation": "简短解释为什么选该项（50字以内）"
    }
  }
]`;
  }

  function extractJsonArray(text) {
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('AI 返回的数据格式未能解析为 JSON 数组');
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function normalizeCards(rawList) {
    if (!Array.isArray(rawList)) throw new Error('返回结果不是数组');
    const validCategories = new Set((window.CATEGORIES || []).map((c) => c.id));
    const ts = Date.now();
    return rawList
      .filter((item) => item && item.hook && item.summary)
      .map((item, idx) => ({
        id: `ai-${ts}-${idx}`,
        isAI: true,
        category: validCategories.has(item.category) ? item.category : '科技与逻辑',
        difficulty: item.difficulty === '进阶' ? '进阶' : '轻松',
        hook: String(item.hook).trim(),
        summary: String(item.summary).trim(),
        analogy: String(item.analogy || '把它想象成日常生活里最熟悉的直觉开关。').trim(),
        trivia: String(item.trivia || '科学史上许多常识最初都源于一次偶然发现。').trim(),
        deepDive: String(item.deepDive || item.summary).trim(),
        quiz:
          item.quiz && Array.isArray(item.quiz.options) && item.quiz.options.length >= 2
            ? {
                question: String(item.quiz.question || '回顾一下刚才的核心结论：'),
                options: item.quiz.options.map((o) => String(o)),
                answerIndex: Math.min(
                  Math.max(0, Number(item.quiz.answerIndex) || 0),
                  item.quiz.options.length - 1
                ),
                explanation: String(item.quiz.explanation || '')
              }
            : null
      }));
  }

  async function generateNewCards(customTopic) {
    const state = window.DailyBoxStorage.loadState();
    const cfg = state.aiConfig || {};
    const provider = cfg.provider || 'gemini';
    const apiKey = (cfg.apiKey || '').trim();

    if (!apiKey && provider !== 'ollama') {
      throw new Error('请先填入 API Key 再生成新卡片');
    }

    const prompt = buildSystemPrompt(state, customTopic);
    let rawText = '';

    if (provider === 'gemini') {
      const model = (cfg.model || 'gemini-4-hydrogen').trim();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
          }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini 请求失败 (${res.status})：${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      rawText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const model = (cfg.model || 'gpt-4o-mini').trim();
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.8,
          messages: [
            { role: 'system', content: '你只输出严格合法的 JSON 数组。' },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`API 请求失败 (${res.status})：${errText.slice(0, 120)}`);
      }
      const data = await res.json();
      rawText = data?.choices?.[0]?.message?.content || '';
    }

    const parsed = extractJsonArray(rawText);
    const normalized = normalizeCards(parsed);
    if (!normalized.length) {
      throw new Error('未能生成有效的知识卡片，请重试');
    }
    const addedCount = window.DailyBoxStorage.addCustomCards(normalized);
    return { addedCount, cards: normalized };
  }

  window.DailyBoxAI = {
    generateNewCards
  };
})();
