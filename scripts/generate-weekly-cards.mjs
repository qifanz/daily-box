import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SEED_PATH = path.join(ROOT_DIR, 'data', 'seed-cards.js');
const AUTO_PATH = path.join(ROOT_DIR, 'data', 'auto-cards.js');

function loadWindowData() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SEED_PATH, 'utf8'), sandbox);
  if (fs.existsSync(AUTO_PATH)) {
    vm.runInContext(fs.readFileSync(AUTO_PATH, 'utf8'), sandbox);
  }
  return {
    categories: sandbox.window.CATEGORIES || [],
    seedCards: sandbox.window.SEED_CARDS || [],
    autoCards: sandbox.window.AUTO_CARDS || []
  };
}

function buildPrompt(categories, existingHooks) {
  const categoryNames = categories.map((c) => c.id);
  const recentHooks = existingHooks.slice(0, 120).join(' | ');

  return `你是一个严谨又风趣的“30秒每日知识盲盒”资深科学人文编辑。
请生成 10 张高质量、跨学科的冷知识或反直觉思维模型卡片，尽量均匀覆盖以下 ${categoryNames.length} 个领域：
${categoryNames.join(' / ')}

硬性要求：
1. 事实必须准确经得起科学或历史推敲，拒绝伪科学或网络营销号谣言。
2. 严格避免与以下已有题目重复或高度相似：${recentHooks}
3. 请只输出合法 JSON 数组（不要包含任何 Markdown 代码块或额外解释文字），包含 10 个对象，每个对象结构如下：
[
  {
    "category": "必须严格等于上述领域名称之一",
    "difficulty": "轻松 或 进阶",
    "hook": "反直觉钩子问题或结论（32字以内）",
    "summary": "通俗准确的原理说明（95~140字）",
    "analogy": "生活化直觉类比（45~75字）",
    "trivia": "一句‘顺便一提’的冷门彩蛋（40~70字）",
    "deepDive": "展开后的深层机理补充（75~120字）",
    "quiz": {
      "question": "一道巩固核心原理的单选题",
      "options": ["选项A", "选项B", "选项C"],
      "answerIndex": 1,
      "explanation": "简短解析（50字以内）"
    }
  }
]`;
}

function extractJsonArray(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Model response did not contain a valid JSON array');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callGemini(prompt, apiKey) {
  const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAICompatible(prompt, apiKey) {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      messages: [
        { role: 'system', content: '你只输出严格合法的 JSON 数组。' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI-compatible API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

function validateAndFormat(rawItems, categories, existingHookSet, existingIdSet) {
  if (!Array.isArray(rawItems)) return [];
  const validCats = new Set(categories.map((c) => c.id));
  const now = new Date();
  const dateCompact = now.toISOString().slice(0, 10).replace(/-/g, '');
  const addedAt = now.toISOString().slice(0, 10);

  const results = [];
  let seq = 1;

  for (const item of rawItems) {
    if (!item || !item.hook || !item.summary || !item.analogy || !item.deepDive) continue;
    const hookNorm = String(item.hook).trim().toLowerCase();
    if (!hookNorm || existingHookSet.has(hookNorm)) continue;

    if (!item.quiz || !Array.isArray(item.quiz.options) || item.quiz.options.length < 2) {
      continue;
    }

    let id = `auto-${dateCompact}-${String(seq).padStart(2, '0')}`;
    while (existingIdSet.has(id)) {
      seq += 1;
      id = `auto-${dateCompact}-${String(seq).padStart(2, '0')}`;
    }

    const card = {
      id,
      isAuto: true,
      addedAt,
      category: validCats.has(item.category) ? item.category : '科技与逻辑',
      difficulty: item.difficulty === '进阶' ? '进阶' : '轻松',
      hook: String(item.hook).trim(),
      summary: String(item.summary).trim(),
      analogy: String(item.analogy).trim(),
      trivia: String(item.trivia || '许多看似反常识的现象背后都有严谨的自然规律。').trim(),
      deepDive: String(item.deepDive).trim(),
      quiz: {
        question: String(item.quiz.question || '回顾刚才的核心原理：').trim(),
        options: item.quiz.options.map((o) => String(o).trim()),
        answerIndex: Math.min(
          Math.max(0, Number(item.quiz.answerIndex) || 0),
          item.quiz.options.length - 1
        ),
        explanation: String(item.quiz.explanation || '').trim()
      }
    };

    existingHookSet.add(hookNorm);
    existingIdSet.add(id);
    results.push(card);
    seq += 1;
  }

  return results;
}

async function main() {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();

  if (!geminiKey && !openaiKey) {
    console.log(
      'ℹ️ No GEMINI_API_KEY or OPENAI_API_KEY found in GitHub Secrets. Skipping weekly card generation cleanly.'
    );
    return;
  }

  const { categories, seedCards, autoCards } = loadWindowData();
  const allExisting = [...autoCards, ...seedCards];
  const existingHookSet = new Set(allExisting.map((c) => String(c.hook || '').trim().toLowerCase()));
  const existingIdSet = new Set(allExisting.map((c) => c.id));

  const prompt = buildPrompt(
    categories,
    allExisting.map((c) => c.hook)
  );

  const rawText = geminiKey
    ? await callGemini(prompt, geminiKey)
    : await callOpenAICompatible(prompt, openaiKey);

  const parsed = extractJsonArray(rawText);
  const newCards = validateAndFormat(parsed, categories, existingHookSet, existingIdSet);

  if (newCards.length === 0) {
    console.log('⚠️ No valid non-duplicate cards produced this run.');
    return;
  }

  const updatedAutoCards = [...newCards, ...autoCards];
  const outputContent = `(function () {
  // Auto-generated weekly cards appended by GitHub Actions.
  // Latest update: ${new Date().toISOString()}
  window.AUTO_CARDS = ${JSON.stringify(updatedAutoCards, null, 2)};
})();
`;

  fs.writeFileSync(AUTO_PATH, outputContent, 'utf8');
  console.log(`✅ Successfully added ${newCards.length} new cards. Total AUTO_CARDS: ${updatedAutoCards.length}`);
}

main().catch((err) => {
  console.error('❌ Weekly card generation failed:', err);
  process.exit(1);
});
