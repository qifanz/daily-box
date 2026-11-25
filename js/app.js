(function () {
  const Storage = window.DailyBoxStorage;
  const Recommender = window.DailyBoxRecommender;
  const AI = window.DailyBoxAI;

  const todayStr = Storage.formatLocalDate(new Date());
  let selectedDate = todayStr;
  let activeCategory = 'all';
  const expandedDiveSet = new Set();

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 2400);
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 12) return '早上好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  function formatChineseDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${y}年${m}月${d}日 ${weekdays[dateObj.getDay()]}`;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const metaTheme = document.getElementById('themeColorMeta');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0d1017' : '#f6f7fb');
    }
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    }
  }

  function renderHeaderStats() {
    const state = Storage.loadState();
    const stats = Recommender.getDeckStats();
    const streak = Storage.getStreak();

    document.getElementById('todayLabel').textContent = `${formatChineseDate(
      todayStr
    )} · ${getGreeting()}，花 30 秒拆点新知吧`;

    document.getElementById('streakBadge').textContent = `🔥 连续 ${streak} 天`;
    document.getElementById(
      'deckProgressBadge'
    ).textContent = `📦 已解锁 ${stats.seenCount} / ${stats.totalCards}`;
    document.getElementById('bookmarkCount').textContent = String(
      (state.bookmarks || []).length
    );
  }

  function renderCategoryBar() {
    const bar = document.getElementById('categoryBar');
    const hint = document.getElementById('filterHintText');
    if (!bar) return;

    const pills = [
      { id: 'all', label: '🎲 随缘盲盒' },
      ...(window.CATEGORIES || []).map((c) => ({
        id: c.id,
        label: `${c.icon} ${c.id}`
      }))
    ];

    bar.innerHTML = pills
      .map(
        (p) =>
          `<button type="button" class="cat-pill ${
            activeCategory === p.id ? 'active' : ''
          }" data-cat="${escapeHtml(p.id)}">${escapeHtml(p.label)}</button>`
      )
      .join('');

    if (activeCategory === 'all') {
      hint.innerHTML =
        '🎲 当前抽盒模式：<strong>智能随缘</strong>（根据你的「💡有意思」口味权重自动调配）';
    } else {
      const meta = Recommender.getCategoryMeta(activeCategory);
      hint.innerHTML = `${escapeHtml(
        meta.icon
      )} 当前抽盒模式：未拆盲盒将优先抽取 <strong>#${escapeHtml(activeCategory)}</strong>`;
    }

    bar.querySelectorAll('.cat-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-cat') || 'all';
        renderCategoryBar();
        updateSealedCaptions();
      });
    });
  }

  function updateSealedCaptions() {
    const descText =
      activeCategory === 'all'
        ? '跨学科随机盲盒 · 30 秒读懂一个冷知识'
        : `已锁定偏好：优先抽取「#${activeCategory}」`;
    document.querySelectorAll('.sealed-desc').forEach((el) => {
      el.textContent = descText;
    });
  }

  function buildOpenedCardElement(card, slotIndex, state) {
    const meta = Recommender.getCategoryMeta(card.category);
    const fb = (state.feedback || {})[card.id] || null;
    const savedQuiz = (state.quizAnswers || {})[card.id];
    const isDiveOpen = expandedDiveSet.has(card.id);

    const cardEl = document.createElement('article');
    cardEl.className = 'knowledge-card';
    cardEl.setAttribute('data-card-id', card.id);

    const slotLabel = `#${String(slotIndex + 1).padStart(2, '0')}`;
    const aiBadge = card.isAI
      ? `<span class="diff-badge" title="由 AI 动态生成">✨ AI</span>`
      : '';
    const autoBadge = card.isAuto
      ? `<span class="diff-badge auto-badge" title="每周云端自动更新">🆕 周更</span>`
      : '';

    let quizHtml = '';
    if (card.quiz && Array.isArray(card.quiz.options)) {
      const hasAnswered = typeof savedQuiz === 'number';
      const optsHtml = card.quiz.options
        .map((opt, idx) => {
          let cls = 'quiz-opt-btn';
          let prefix = `${String.fromCharCode(65 + idx)}. `;
          if (hasAnswered) {
            if (idx === card.quiz.answerIndex) {
              cls += ' is-correct';
              prefix = '✅ ';
            } else if (idx === savedQuiz && savedQuiz !== card.quiz.answerIndex) {
              cls += ' is-wrong';
              prefix = '❌ ';
            }
          }
          return `<button type="button" class="${cls}" data-opt-idx="${idx}" ${
            hasAnswered ? 'disabled' : ''
          }>${prefix}${escapeHtml(opt)}</button>`;
        })
        .join('');

      const expHtml = hasAnswered
        ? `<p class="quiz-explanation">💡 ${escapeHtml(card.quiz.explanation || '')}</p>`
        : '';

      quizHtml = `
        <div class="quiz-box">
          <p class="quiz-title">⚡ 10 秒快问快答：${escapeHtml(card.quiz.question)}</p>
          <div class="quiz-options">${optsHtml}</div>
          <div class="quiz-exp-slot">${expHtml}</div>
        </div>
      `;
    }

    cardEl.innerHTML = `
      <div class="card-meta-row">
        <div class="card-badges">
          <span class="cat-badge" style="color:${meta.color};background:${meta.bg}">
            ${escapeHtml(meta.icon)} ${escapeHtml(card.category)}
          </span>
          <span class="diff-badge">${escapeHtml(card.difficulty || '轻松')}</span>
          ${aiBadge}
          ${autoBadge}
        </div>
        <span class="slot-num">${slotLabel}</span>
      </div>

      <h3 class="card-hook">${escapeHtml(card.hook)}</h3>
      <p class="card-summary">${escapeHtml(card.summary)}</p>

      <div class="analogy-box">
        <strong>💡 直觉类比：</strong>${escapeHtml(card.analogy)}
      </div>

      <p class="trivia-line">📎 <strong>顺便一提：</strong>${escapeHtml(card.trivia)}</p>

      <div class="card-actions">
        <button type="button" class="card-act-btn act-like ${
          fb === 'like' ? 'active-like' : ''
        }">
          💡 有意思
        </button>
        <button type="button" class="card-act-btn act-meh ${
          fb === 'meh' ? 'active-meh' : ''
        }">
          🥱 一般
        </button>
        <button type="button" class="card-act-btn act-dive ${
          isDiveOpen ? 'active-dive' : ''
        }">
          🔍 挖深一点
        </button>
      </div>

      <div class="deep-dive-panel ${isDiveOpen ? '' : 'hidden'}">
        <p class="deep-dive-text">🔬 <strong>深层原理：</strong>${escapeHtml(card.deepDive)}</p>
        ${quizHtml}
      </div>
    `;

    // Wire buttons
    const likeBtn = cardEl.querySelector('.act-like');
    const mehBtn = cardEl.querySelector('.act-meh');
    const diveBtn = cardEl.querySelector('.act-dive');
    const divePanel = cardEl.querySelector('.deep-dive-panel');

    likeBtn.addEventListener('click', () => {
      const res = Storage.toggleFeedback(card.id, 'like', card.category);
      likeBtn.classList.toggle('active-like', res.activeFeedback === 'like');
      mehBtn.classList.remove('active-meh');
      renderHeaderStats();
      if (res.activeFeedback === 'like') {
        showToast(`⭐ 已加入收藏 ·「${card.category}」推荐权重升至 ${res.newWeight}x`);
      } else {
        showToast('已取消收藏');
      }
    });

    mehBtn.addEventListener('click', () => {
      const res = Storage.toggleFeedback(card.id, 'meh', card.category);
      mehBtn.classList.toggle('active-meh', res.activeFeedback === 'meh');
      likeBtn.classList.remove('active-like');
      renderHeaderStats();
      if (res.activeFeedback === 'meh') {
        showToast(`👌 收到，后续将少推「${card.category}」(${res.newWeight}x)`);
      }
    });

    diveBtn.addEventListener('click', () => {
      const nowHidden = divePanel.classList.toggle('hidden');
      const opened = !nowHidden;
      diveBtn.classList.toggle('active-dive', opened);
      if (opened) expandedDiveSet.add(card.id);
      else expandedDiveSet.delete(card.id);
    });

    cardEl.querySelectorAll('.quiz-opt-btn').forEach((optBtn) => {
      optBtn.addEventListener('click', () => {
        const picked = Number(optBtn.getAttribute('data-opt-idx'));
        Storage.saveQuizAnswer(card.id, picked);
        const allOptBtns = cardEl.querySelectorAll('.quiz-opt-btn');
        allOptBtns.forEach((b, i) => {
          b.disabled = true;
          const rawLabel = card.quiz.options[i];
          if (i === card.quiz.answerIndex) {
            b.classList.add('is-correct');
            b.textContent = `✅ ${rawLabel}`;
          } else if (i === picked && picked !== card.quiz.answerIndex) {
            b.classList.add('is-wrong');
            b.textContent = `❌ ${rawLabel}`;
          }
        });
        const expSlot = cardEl.querySelector('.quiz-exp-slot');
        if (expSlot) {
          expSlot.innerHTML = `<p class="quiz-explanation">💡 ${escapeHtml(
            card.quiz.explanation || ''
          )}</p>`;
        }
        if (picked === card.quiz.answerIndex) {
          showToast('🎉 答对了！直觉很准');
        } else {
          showToast('🤔 差一点点，看看原理解析吧');
        }
      });
    });

    return cardEl;
  }

  function getOpenedIdsForDay(dayRecord) {
    if (!dayRecord || !Array.isArray(dayRecord.slots)) return [];
    return dayRecord.slots
      .filter((s) => s.status === 'opened' && s.cardId)
      .map((s) => s.cardId);
  }

  function renderStage() {
    const state = Storage.loadState();
    const isToday = selectedDate === todayStr;

    const categorySection = document.getElementById('categorySection');
    const historyBanner = document.getElementById('historyBanner');
    const extraBoxRow = document.getElementById('extraBoxRow');
    const grid = document.getElementById('boxesGrid');

    categorySection.classList.toggle('hidden', !isToday);
    historyBanner.classList.toggle('hidden', isToday);
    extraBoxRow.classList.toggle('hidden', !isToday);

    grid.innerHTML = '';

    if (isToday) {
      const dayRecord = Storage.ensureDayRecord(todayStr);
      const freshState = Storage.loadState();

      dayRecord.slots.forEach((slot, idx) => {
        const scene = document.createElement('div');
        scene.className = 'box-scene';

        const flipper = document.createElement('div');
        flipper.className = 'box-flipper';

        const front = document.createElement('div');
        front.className = 'box-face box-face-front';

        const back = document.createElement('div');
        back.className = 'box-face box-face-back';

        if (slot.status === 'opened' && slot.cardId) {
          const card = Recommender.getCardById(slot.cardId);
          if (card) {
            flipper.classList.add('is-flipped', 'flip-done');
            back.appendChild(buildOpenedCardElement(card, idx, freshState));
          }
        } else {
          const boxIcons = ['🎁', '🔮', '🧭', '🪐', '🧩'];
          const icon = boxIcons[idx % boxIcons.length];
          const descText =
            activeCategory === 'all'
              ? '跨学科随机盲盒 · 30 秒读懂一个冷知识'
              : `已锁定偏好：优先抽取「#${activeCategory}」`;

          front.innerHTML = `
            <div class="sealed-box" role="button" tabindex="0" aria-label="拆开今日第 ${
              idx + 1
            } 个知识盲盒">
              <span class="sealed-slot-tag">${
                slot.extra ? `加拆盲盒 #0${idx + 1}` : `今日盲盒 #0${idx + 1}`
              }</span>
              <div>
                <div class="sealed-emblem">${icon}</div>
                <h3 class="sealed-title">未知的知识盲盒</h3>
                <p class="sealed-desc">${escapeHtml(descText)}</p>
              </div>
              <span class="sealed-cta">✨ 点击拆封</span>
            </div>
          `;

          const sealedEl = front.querySelector('.sealed-box');
          const handleUnbox = () => {
            if (flipper.classList.contains('is-flipped') || flipper.classList.contains('is-flipping')) {
              return;
            }
            const latestDay = Storage.ensureDayRecord(todayStr);
            const screenIds = getOpenedIdsForDay(latestDay);
            const { card, fallbackReason } = Recommender.drawCard(activeCategory, screenIds);
            if (!card) return;

            Storage.openSlot(todayStr, idx, card.id);
            const updatedState = Storage.loadState();

            back.innerHTML = '';
            back.appendChild(buildOpenedCardElement(card, idx, updatedState));

            flipper.classList.add('is-flipping');
            void flipper.offsetWidth;
            flipper.classList.add('is-flipped');

            setTimeout(() => {
              flipper.classList.remove('is-flipping');
              flipper.classList.add('flip-done');
            }, 700);

            if (fallbackReason === 'category_exhausted') {
              showToast(`「#${activeCategory}」未读卡已刷完，为你随机抽了一张新领域盲盒！`);
            } else if (fallbackReason === 'deck_cycled') {
              showToast('🎉 恭喜刷完题库！已开启温故知新循环（也可点右上角用 AI 扩充新卡）');
            }

            renderHeaderStats();
            updateDailyStatusText();
            renderCalendar();
          };

          sealedEl.addEventListener('click', handleUnbox);
          sealedEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleUnbox();
            }
          });
        }

        flipper.appendChild(front);
        flipper.appendChild(back);
        scene.appendChild(flipper);
        grid.appendChild(scene);
      });

      updateDailyStatusText();
    } else {
      // Historical date view
      const pastDay = state.history[selectedDate];
      const openedSlots =
        pastDay && Array.isArray(pastDay.slots)
          ? pastDay.slots.filter((s) => s.status === 'opened' && s.cardId)
          : [];

      document.getElementById('historyBannerTitle').textContent = `📅 ${formatChineseDate(
        selectedDate
      )}`;
      document.getElementById('historyBannerSub').textContent =
        openedSlots.length > 0
          ? `当天你一共拆开了 ${openedSlots.length} 个知识盲盒`
          : '这一天还没有拆盒记录哦';

      if (openedSlots.length === 0) {
        grid.innerHTML = `
          <div class="empty-day-card">
            <p style="font-size:1.8rem;margin:0 0 8px;">📭</p>
            <p style="margin:0;">${escapeHtml(selectedDate)} 没有拆开过盲盒，点击右上角「回到今天」继续探索吧！</p>
          </div>
        `;
      } else {
        openedSlots.forEach((slot, idx) => {
          const card = Recommender.getCardById(slot.cardId);
          if (card) {
            grid.appendChild(buildOpenedCardElement(card, idx, state));
          }
        });
      }
    }
  }

  function updateDailyStatusText() {
    const state = Storage.loadState();
    const day = state.history[todayStr];
    if (!day) return;
    const total = day.slots.length;
    const opened = day.slots.filter((s) => s.status === 'opened').length;
    const statusEl = document.getElementById('dailyStatusText');
    if (opened === 0) {
      statusEl.textContent = `今日还有 ${total} 个盲盒等待拆封`;
    } else if (opened < total) {
      statusEl.textContent = `今日进度：已拆 ${opened} / ${total} 盒`;
    } else {
      statusEl.textContent = `🎉 今日 ${total} 个盲盒已全部拆完！学贵有恒，明天见～`;
    }
  }

  function renderCalendar() {
    const calGrid = document.getElementById('calendarGrid');
    const calSummary = document.getElementById('calendarSummary');
    if (!calGrid) return;

    const days = Storage.getCalendarDays(60);
    const activeDaysCount = days.filter((d) => d.openedCount > 0).length;
    const totalUnboxed60d = days.reduce((acc, d) => acc + d.openedCount, 0);

    calSummary.textContent = `近 60 天共点亮 ${activeDaysCount} 天，累计拆开 ${totalUnboxed60d} 个盲盒（点击任意小方格可穿越回看）`;

    calGrid.innerHTML = days
      .map((d) => {
        let level = 0;
        if (d.openedCount >= 4) level = 3;
        else if (d.openedCount === 3) level = 2;
        else if (d.openedCount >= 1) level = 1;

        const classes = [
          'cal-cell',
          `level-${level}`,
          d.isToday ? 'is-today' : '',
          d.dateStr === selectedDate ? 'is-selected' : ''
        ]
          .filter(Boolean)
          .join(' ');

        const label = d.isToday
          ? `今天 (${d.dateStr})：已拆 ${d.openedCount} 盒`
          : `${d.dateStr}：拆开 ${d.openedCount} 盒`;

        return `<button type="button" class="${classes}" data-date="${d.dateStr}" data-tooltip="${escapeHtml(
          label
        )}" aria-label="${escapeHtml(label)}"></button>`;
      })
      .join('');

    calGrid.querySelectorAll('.cal-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        selectedDate = cell.getAttribute('data-date') || todayStr;
        renderStage();
        renderCalendar();
      });
    });
  }

  // ================= Drawer: Bookmarks & Taste =================
  function openDrawer(tab) {
    document.getElementById('drawerOverlay').classList.remove('hidden');
    document.getElementById('bookmarkDrawer').classList.remove('hidden');
    switchDrawerTab(tab || 'bookmarks');
  }

  function closeDrawer() {
    document.getElementById('drawerOverlay').classList.add('hidden');
    document.getElementById('bookmarkDrawer').classList.add('hidden');
  }

  function switchDrawerTab(tab) {
    const isBookmarks = tab === 'bookmarks';
    document.getElementById('tabBookmarksBtn').classList.toggle('active', isBookmarks);
    document.getElementById('tabWeightsBtn').classList.toggle('active', !isBookmarks);
    document.getElementById('drawerTabBookmarks').classList.toggle('hidden', !isBookmarks);
    document.getElementById('drawerTabWeights').classList.toggle('hidden', isBookmarks);

    if (isBookmarks) renderBookmarksList();
    else renderTasteWeights();
  }

  function renderBookmarksList() {
    const state = Storage.loadState();
    const listEl = document.getElementById('bookmarkList');
    const query = (document.getElementById('bookmarkSearchInput').value || '')
      .trim()
      .toLowerCase();

    const cards = (state.bookmarks || [])
      .map((id) => Recommender.getCardById(id))
      .filter(Boolean)
      .filter((c) => {
        if (!query) return true;
        return (
          c.hook.toLowerCase().includes(query) ||
          c.summary.toLowerCase().includes(query) ||
          c.category.toLowerCase().includes(query) ||
          c.analogy.toLowerCase().includes(query)
        );
      });

    if (cards.length === 0) {
      listEl.innerHTML = `
        <div class="empty-day-card" style="padding:28px 16px;">
          <p style="margin:0;">${
            query
              ? '没有找到匹配的收藏卡片'
              : '还没有收藏卡片哦～拆盲盒时点「💡 有意思」就会收纳到这里！'
          }</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = cards
      .map((c) => {
        const meta = Recommender.getCategoryMeta(c.category);
        return `
          <div class="bookmark-item" data-bm-id="${escapeHtml(c.id)}">
            <div class="bookmark-item-head">
              <span class="cat-badge" style="color:${meta.color};background:${meta.bg}">
                ${escapeHtml(meta.icon)} ${escapeHtml(c.category)}
              </span>
              <button type="button" class="btn btn-outline btn-sm remove-bm-btn" data-id="${escapeHtml(
                c.id
              )}" data-cat="${escapeHtml(c.category)}">移除</button>
            </div>
            <h4>${escapeHtml(c.hook)}</h4>
            <p>${escapeHtml(c.summary)}</p>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.remove-bm-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.getAttribute('data-id');
        const cat = btn.getAttribute('data-cat');
        Storage.toggleFeedback(cid, 'like', cat);
        renderBookmarksList();
        renderHeaderStats();
        renderStage();
      });
    });
  }

  function renderTasteWeights() {
    const state = Storage.loadState();
    const weights = state.weights || {};
    const listEl = document.getElementById('tasteWeightsList');

    const items = (window.CATEGORIES || [])
      .map((c) => ({
        ...c,
        weight: Number((weights[c.id] ?? 1.0).toFixed(2))
      }))
      .sort((a, b) => b.weight - a.weight);

    listEl.innerHTML = items
      .map((item) => {
        const pct = Math.min(100, Math.round((item.weight / 3.0) * 100));
        return `
          <div class="taste-row">
            <div class="taste-row-top">
              <span>${escapeHtml(item.icon)} ${escapeHtml(item.id)}</span>
              <span style="color:${item.color}">${item.weight}x</span>
            </div>
            <div class="taste-bar-track">
              <div class="taste-bar-fill" style="width:${pct}%;background:${item.color}"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // ================= AI Modal =================
  function syncAIProviderUI() {
    const provider = document.getElementById('aiProviderSelect').value;
    const baseUrlGroup = document.getElementById('aiBaseUrlGroup');
    const apiKeyGroup = document.getElementById('aiApiKeyGroup');
    const modelInput = document.getElementById('aiModelInput');
    const baseUrlInput = document.getElementById('aiBaseUrlInput');

    if (provider === 'gemini') {
      baseUrlGroup.classList.add('hidden');
      apiKeyGroup.classList.remove('hidden');
      if (!modelInput.value || modelInput.value === 'gpt-4o-mini' || modelInput.value === 'qwen2.5:7b') {
        modelInput.value = 'gemini-4-hydrogen';
      }
    } else if (provider === 'openai') {
      baseUrlGroup.classList.remove('hidden');
      apiKeyGroup.classList.remove('hidden');
      if (!baseUrlInput.value || baseUrlInput.value.includes('11434')) {
        baseUrlInput.value = 'https://api.openai.com/v1';
      }
      if (!modelInput.value || modelInput.value.startsWith('gemini')) {
        modelInput.value = 'gpt-4o-mini';
      }
    } else if (provider === 'ollama') {
      baseUrlGroup.classList.remove('hidden');
      apiKeyGroup.classList.add('hidden');
      baseUrlInput.value = 'http://localhost:11434/v1';
      if (!modelInput.value || modelInput.value.startsWith('gemini') || modelInput.value === 'gpt-4o-mini') {
        modelInput.value = 'qwen2.5:7b';
      }
    }
  }

  function openAIModal() {
    const state = Storage.loadState();
    const cfg = state.aiConfig || {};
    document.getElementById('aiProviderSelect').value = cfg.provider || 'gemini';
    document.getElementById('aiModelInput').value = cfg.model || 'gemini-4-hydrogen';
    document.getElementById('aiBaseUrlInput').value = cfg.baseUrl || 'https://api.openai.com/v1';
    document.getElementById('aiApiKeyInput').value = cfg.apiKey || '';
    document.getElementById('aiStatusMsg').classList.add('hidden');
    syncAIProviderUI();

    document.getElementById('aiModalOverlay').classList.remove('hidden');
    document.getElementById('aiModal').classList.remove('hidden');
  }

  function closeAIModal() {
    document.getElementById('aiModalOverlay').classList.add('hidden');
    document.getElementById('aiModal').classList.add('hidden');
  }

  function collectAIConfigFromForm() {
    return {
      provider: document.getElementById('aiProviderSelect').value,
      model: document.getElementById('aiModelInput').value.trim(),
      baseUrl: document.getElementById('aiBaseUrlInput').value.trim(),
      apiKey: document.getElementById('aiApiKeyInput').value.trim()
    };
  }

  // ================= Initialization =================
  function init() {
    const state = Storage.loadState();
    applyTheme(state.theme || 'light');
    renderHeaderStats();
    renderCategoryBar();
    renderStage();
    renderCalendar();

    // Theme toggle
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      Storage.setTheme(next);
      applyTheme(next);
    });

    // Add extra box
    document.getElementById('addExtraBoxBtn').addEventListener('click', () => {
      Storage.addExtraSlot(todayStr);
      renderStage();
      showToast('🎁 已为你今日新增 1 个待拆盲盒！');
    });

    // Back to today
    document.getElementById('backToTodayBtn').addEventListener('click', () => {
      selectedDate = todayStr;
      renderStage();
      renderCalendar();
    });

    // Drawer events
    document.getElementById('openBookmarksBtn').addEventListener('click', () => {
      openDrawer('bookmarks');
    });
    document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
    document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);
    document
      .getElementById('tabBookmarksBtn')
      .addEventListener('click', () => switchDrawerTab('bookmarks'));
    document
      .getElementById('tabWeightsBtn')
      .addEventListener('click', () => switchDrawerTab('weights'));
    document
      .getElementById('bookmarkSearchInput')
      .addEventListener('input', renderBookmarksList);
    document.getElementById('resetWeightsBtn').addEventListener('click', () => {
      Storage.resetWeights();
      renderTasteWeights();
      showToast('⚖️ 所有领域推荐权重已重置为 1.0x');
    });

    // AI Modal events
    document.getElementById('openAIModalBtn').addEventListener('click', openAIModal);
    document.getElementById('closeAIModalBtn').addEventListener('click', closeAIModal);
    document.getElementById('aiModalOverlay').addEventListener('click', closeAIModal);
    document
      .getElementById('aiProviderSelect')
      .addEventListener('change', syncAIProviderUI);

    document.getElementById('saveAIConfigBtn').addEventListener('click', () => {
      Storage.saveAIConfig(collectAIConfigFromForm());
      showToast('✅ AI 配置已保存在本地');
    });

    document.getElementById('generateAICardsBtn').addEventListener('click', async () => {
      const btn = document.getElementById('generateAICardsBtn');
      const statusEl = document.getElementById('aiStatusMsg');
      const topic = document.getElementById('aiTopicInput').value.trim();

      Storage.saveAIConfig(collectAIConfigFromForm());
      btn.disabled = true;
      btn.textContent = '⏳ 正在构思新卡片...';
      statusEl.classList.remove('hidden');
      statusEl.textContent = '正在请求大模型编写 30 秒黄金卡片与互动测验，大约需要 5~12 秒...';

      try {
        const res = await AI.generateNewCards(topic);
        renderHeaderStats();
        statusEl.textContent = `🎉 成功生成并入库 ${res.addedCount} 张新知识卡片！拆开未封盲盒即可优先遇到它们。`;
        document.getElementById('aiTopicInput').value = '';
        showToast(`✨ 已新增 ${res.addedCount} 张新盲盒卡片！`);
      } catch (err) {
        statusEl.textContent = `❌ 生成遇到问题：${err.message || err}`;
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ 立即生成 3 张新盲盒';
      }
    });

    // Escape key closes drawer or modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeAIModal();
      }
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const isWebOrigin =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (!isWebOrigin) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  registerServiceWorker();
})();
