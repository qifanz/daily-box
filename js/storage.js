(function () {
  const STORAGE_KEY = 'daily_box_state_v1';

  function formatLocalDate(dateObj) {
    const d = dateObj || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function createDefaultWeights() {
    const weights = {};
    (window.CATEGORIES || []).forEach((c) => {
      weights[c.id] = 1.0;
    });
    return weights;
  }

  function createDefaultState() {
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      theme: prefersDark ? 'dark' : 'light',
      dailyQuota: 3,
      history: {}, // { 'YYYY-MM-DD': { slots: [ { status: 'sealed'|'opened', cardId?, openedAt? } ] } }
      seenCardIds: [],
      bookmarks: [],
      feedback: {}, // { [cardId]: 'like' | 'meh' }
      quizAnswers: {}, // { [cardId]: number }
      weights: createDefaultWeights(),
      customCards: [],
      aiConfig: {
        provider: 'gemini',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gemini-4-hydrogen'
      }
    };
  }

  let memoryFallback = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const init = createDefaultState();
        saveState(init);
        return init;
      }
      const parsed = JSON.parse(raw);
      const defaults = createDefaultState();
      const mergedAIConfig = { ...defaults.aiConfig, ...(parsed.aiConfig || {}) };
      if (mergedAIConfig.model === 'gemini-2.5-flash' || mergedAIConfig.model === 'gemini-3.8-flash') {
        mergedAIConfig.model = 'gemini-4-hydrogen';
      }
      return {
        ...defaults,
        ...parsed,
        weights: { ...defaults.weights, ...(parsed.weights || {}) },
        aiConfig: mergedAIConfig
      };
    } catch (err) {
      if (!memoryFallback) memoryFallback = createDefaultState();
      return memoryFallback;
    }
  }

  function saveState(state) {
    memoryFallback = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('localStorage unavailable, using in-memory state.', err);
    }
  }

  function ensureDayRecord(dateStr) {
    const state = loadState();
    if (!state.history[dateStr]) {
      const slots = [];
      for (let i = 0; i < (state.dailyQuota || 3); i++) {
        slots.push({ status: 'sealed' });
      }
      state.history[dateStr] = { slots };
      saveState(state);
    }
    return state.history[dateStr];
  }

  function openSlot(dateStr, slotIndex, cardId) {
    const state = loadState();
    if (!state.history[dateStr]) {
      ensureDayRecord(dateStr);
    }
    const day = state.history[dateStr];
    if (!day || !day.slots[slotIndex]) return null;

    day.slots[slotIndex] = {
      status: 'opened',
      cardId,
      openedAt: new Date().toISOString()
    };

    if (!state.seenCardIds.includes(cardId)) {
      state.seenCardIds.push(cardId);
    }
    saveState(state);
    return day.slots[slotIndex];
  }

  function addExtraSlot(dateStr) {
    const state = loadState();
    if (!state.history[dateStr]) {
      ensureDayRecord(dateStr);
    }
    state.history[dateStr].slots.push({ status: 'sealed', extra: true });
    saveState(state);
    return state.history[dateStr].slots.length - 1;
  }

  function toggleFeedback(cardId, type, category) {
    const state = loadState();
    const prev = state.feedback[cardId] || null;
    const currentWeight = state.weights[category] ?? 1.0;

    // Revert previous weight delta first
    let baseWeight = currentWeight;
    if (prev === 'like') baseWeight = Math.max(0.25, baseWeight - 0.35);
    if (prev === 'meh') baseWeight = Math.min(3.0, baseWeight + 0.3);

    let nextState = null;
    if (prev === type) {
      // Toggle off
      delete state.feedback[cardId];
      state.bookmarks = state.bookmarks.filter((id) => id !== cardId);
      state.weights[category] = Number(baseWeight.toFixed(2));
    } else {
      nextState = type;
      state.feedback[cardId] = type;
      if (type === 'like') {
        if (!state.bookmarks.includes(cardId)) {
          state.bookmarks.unshift(cardId);
        }
        state.weights[category] = Number(Math.min(3.0, baseWeight + 0.35).toFixed(2));
      } else if (type === 'meh') {
        state.bookmarks = state.bookmarks.filter((id) => id !== cardId);
        state.weights[category] = Number(Math.max(0.25, baseWeight - 0.3).toFixed(2));
      }
    }

    saveState(state);
    return { activeFeedback: nextState, newWeight: state.weights[category] };
  }

  function saveQuizAnswer(cardId, optionIndex) {
    const state = loadState();
    state.quizAnswers[cardId] = optionIndex;
    saveState(state);
  }

  function getOpenedCountOnDate(state, dateStr) {
    const day = state.history[dateStr];
    if (!day || !Array.isArray(day.slots)) return 0;
    return day.slots.filter((s) => s.status === 'opened').length;
  }

  function getStreak() {
    const state = loadState();
    const today = new Date();
    let streak = 0;
    let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const todayStr = formatLocalDate(cursor);
    if (getOpenedCountOnDate(state, todayStr) === 0) {
      // Check starting from yesterday if today hasn't started yet
      cursor.setDate(cursor.getDate() - 1);
    }

    while (true) {
      const ds = formatLocalDate(cursor);
      if (getOpenedCountOnDate(state, ds) > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function getCalendarDays(numDays) {
    const count = numDays || 60;
    const state = loadState();
    const result = [];
    const today = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dateStr = formatLocalDate(d);
      const openedCount = getOpenedCountOnDate(state, dateStr);
      result.push({
        dateStr,
        openedCount,
        isToday: i === 0,
        weekday: d.getDay()
      });
    }
    return result;
  }

  function setTheme(theme) {
    const state = loadState();
    state.theme = theme;
    saveState(state);
  }

  function addCustomCards(newCards) {
    const state = loadState();
    const existingIds = new Set([
      ...(window.SEED_CARDS || []).map((c) => c.id),
      ...state.customCards.map((c) => c.id)
    ]);
    let added = 0;
    newCards.forEach((card) => {
      if (card && card.hook && !existingIds.has(card.id)) {
        state.customCards.unshift(card);
        existingIds.add(card.id);
        added += 1;
      }
    });
    saveState(state);
    return added;
  }

  function saveAIConfig(cfg) {
    const state = loadState();
    state.aiConfig = { ...state.aiConfig, ...cfg };
    saveState(state);
  }

  function resetWeights() {
    const state = loadState();
    state.weights = createDefaultWeights();
    saveState(state);
    return state.weights;
  }

  window.DailyBoxStorage = {
    formatLocalDate,
    loadState,
    ensureDayRecord,
    openSlot,
    addExtraSlot,
    toggleFeedback,
    saveQuizAnswer,
    getStreak,
    getCalendarDays,
    setTheme,
    addCustomCards,
    saveAIConfig,
    resetWeights
  };
})();
