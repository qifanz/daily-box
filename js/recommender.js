(function () {
  function getAllCards() {
    const state = window.DailyBoxStorage.loadState();
    const combined = [
      ...(state.customCards || []),
      ...(window.AUTO_CARDS || []),
      ...(window.SEED_CARDS || [])
    ];
    const seenIds = new Set();
    return combined.filter((card) => {
      if (!card || !card.id || seenIds.has(card.id)) return false;
      seenIds.add(card.id);
      return true;
    });
  }

  function getCardById(cardId) {
    return getAllCards().find((c) => c.id === cardId) || null;
  }

  function getCategoryMeta(categoryId) {
    const found = (window.CATEGORIES || []).find((c) => c.id === categoryId);
    return (
      found || {
        id: categoryId || '跨界冷知识',
        icon: '✨',
        color: '#6366f1',
        bg: 'rgba(99, 102, 241, 0.12)'
      }
    );
  }

  function weightedPick(candidates, weights) {
    if (!candidates.length) return null;
    const itemWeights = candidates.map((card) => {
      const catWeight = Math.max(0.1, weights[card.category] || 1.0);
      const freshnessBoost = card.isAuto ? 2.0 : 1.0;
      return catWeight * freshnessBoost;
    });
    const totalWeight = itemWeights.reduce((sum, w) => sum + w, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      r -= itemWeights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function drawCard(categoryFilter, excludeIdsOnScreen) {
    const state = window.DailyBoxStorage.loadState();
    const allCards = getAllCards();
    const seenSet = new Set(state.seenCardIds || []);
    const screenSet = new Set(excludeIdsOnScreen || []);
    const weights = state.weights || {};

    let unseen = allCards.filter((c) => !seenSet.has(c.id) && !screenSet.has(c.id));
    let fallbackReason = null;

    if (categoryFilter && categoryFilter !== 'all') {
      const catUnseen = unseen.filter((c) => c.category === categoryFilter);
      if (catUnseen.length > 0) {
        return { card: weightedPick(catUnseen, weights), fallbackReason: null };
      }
      // Category unseen exhausted: try any unseen first
      if (unseen.length > 0) {
        fallbackReason = 'category_exhausted';
        return { card: weightedPick(unseen, weights), fallbackReason };
      }
      // Entire deck seen: cycle within category excluding screen cards
      const catCycle = allCards.filter(
        (c) => c.category === categoryFilter && !screenSet.has(c.id)
      );
      if (catCycle.length > 0) {
        return { card: weightedPick(catCycle, weights), fallbackReason: 'deck_cycled' };
      }
    }

    if (unseen.length > 0) {
      const freshAICards = unseen.filter((c) => c.isAI);
      if (freshAICards.length > 0) {
        return { card: weightedPick(freshAICards, weights), fallbackReason: null };
      }
      return { card: weightedPick(unseen, weights), fallbackReason };
    }

    // Entire deck has been unboxed -> cycle gracefully
    const cyclePool = allCards.filter((c) => !screenSet.has(c.id));
    return {
      card: weightedPick(cyclePool.length ? cyclePool : allCards, weights),
      fallbackReason: 'deck_cycled'
    };
  }

  function getDeckStats() {
    const state = window.DailyBoxStorage.loadState();
    const allCards = getAllCards();
    const seenSet = new Set(state.seenCardIds || []);
    const categoryRemaining = {};
    (window.CATEGORIES || []).forEach((cat) => {
      categoryRemaining[cat.id] = 0;
    });
    allCards.forEach((card) => {
      if (!seenSet.has(card.id)) {
        categoryRemaining[card.category] = (categoryRemaining[card.category] || 0) + 1;
      }
    });
    const unseenTotal = allCards.filter((c) => !seenSet.has(c.id)).length;
    return {
      totalCards: allCards.length,
      seenCount: Math.min(allCards.length, seenSet.size),
      remainingCount: unseenTotal,
      customCount: (state.customCards || []).length,
      categoryRemaining
    };
  }

  window.DailyBoxRecommender = {
    getAllCards,
    getCardById,
    getCategoryMeta,
    drawCard,
    getDeckStats
  };
})();
