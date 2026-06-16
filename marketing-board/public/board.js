(() => {
  const stages = [
    ['pulse_signals', 'PULSE · WIDOW', '#00c6a3', '#006b5e'],
    ['ideas', 'IDEAS · STRANGE', '#a78bfa', '#5b21b6'],
    ['copywritten', 'COPY READY · SHURI', '#f4bd4f', '#9a5b10'],
    ['review', 'IN REVIEW · CAP', '#326295', '#163a63'],
    ['to_be_posted', 'TO BE POSTED · STARK', '#d7ea1f', '#667000'],
    ['posted', 'POSTED · STARK', '#16a34a', '#075e28'],
    ['revising', 'REVISING', '#fb923c', '#9a3412'],
    ['killed', 'KILLED', '#7f1d1d', '#3f0d0d']
  ].map(([key, name, color, dark]) => ({ key, name, color, dark }));

  const pillarColors = {
    pulse: ['#00c6a3', '#020f2a'],
    pronostico_del_dia: ['#f4bd4f', '#020f2a'],
    quiniela_challenge: ['#d7ea1f', '#020f2a'],
    datos_curiosos: ['#a78bfa', '#ffffff'],
    tu_equipo_tu_data: ['#c8102e', '#ffffff'],
    momento_del_partido: ['#326295', '#ffffff']
  };

  const platformColors = {
    instagram: '#c13584',
    threads: '#475569',
    x: '#111827',
    tiktok: '#00c6a3',
    youtube: '#c8102e',
  };

  const PLATFORM_LABEL = {
    instagram: 'IG',
    threads: 'TH',
    x: 'X',
    tiktok: 'TT',
    youtube: 'YT',
  };

  const PLATFORM_NAME = {
    instagram: 'Instagram',
    threads: 'Threads',
    x: 'X (Twitter)',
    tiktok: 'TikTok',
    youtube: 'YouTube',
  };

  const state = {
    cards: [],
    version: null,
    expanded: loadExpanded(),
    filter: '',
    activeCard: null,
    activePlatform: null,
    pollTimer: null,
    lastModified: null,
    actionMode: null,
    focusBeforeDrawer: null
  };

  const board = document.querySelector('#board');
  const filterInput = document.querySelector('#filterInput');
  const refreshButton = document.querySelector('#refreshButton');
  const toast = document.querySelector('#toast');
  const toastMessage = document.querySelector('#toastMessage');
  const retryButton = document.querySelector('#retryButton');
  const dismissToast = document.querySelector('#dismissToast');
  const drawer = document.querySelector('#cardDrawer');
  const backdrop = document.querySelector('#drawerBackdrop');
  const drawerClose = document.querySelector('#drawerClose');
  const drawerId = document.querySelector('#drawerId');
  const drawerTitle = document.querySelector('#drawerTitle');
  const drawerMeta = document.querySelector('#drawerMeta');
  const drawerPlatforms = document.querySelector('#drawerPlatforms');
  const drawerPreview = document.querySelector('#drawerPreview');
  const drawerSections = document.querySelector('#drawerSections');
  const drawerActionForm = document.querySelector('#drawerActionForm');
  const drawerActions = document.querySelector('#drawerActions');
  const actionReasonWrap = document.querySelector('#actionReasonWrap');
  const actionReasonLabel = document.querySelector('#actionReasonLabel');
  const actionReason = document.querySelector('#actionReason');
  const snoozeWrap = document.querySelector('#snoozeWrap');
  const snoozeSelect = document.querySelector('#snoozeSelect');

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (window.innerWidth < 900 && state.expanded.length > 1) {
      state.expanded = [state.expanded[0]];
    }
    bindEvents();
    await ensureAuth();
    await fetchBoard({ force: true });
    state.pollTimer = setInterval(fetchBoard, 5000);
  }

  function bindEvents() {
    filterInput.addEventListener('input', debounce((event) => {
      state.filter = event.target.value.trim().toLowerCase();
      renderBoard();
    }, 150));
    refreshButton.addEventListener('click', () => fetchBoard({ force: true }));
    retryButton.addEventListener('click', () => fetchBoard({ force: true }));
    if (dismissToast) dismissToast.addEventListener('click', hideToast);
    drawerActionForm.addEventListener('submit', (event) => event.preventDefault());
    drawerClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', handleKeys);
    window.addEventListener('resize', debounce(() => {
      if (window.innerWidth < 900 && state.expanded.length > 1) {
        state.expanded = [state.expanded[0]];
        persistExpanded();
        renderBoard();
      }
    }, 150));
  }

  async function ensureAuth() {
    const url = new URL(location.href);
    const token = url.searchParams.get('token');
    if (token) {
      localStorage.setItem('board:token', token);
      url.searchParams.delete('token');
      history.replaceState(null, '', url.pathname + url.search);
      await postAuth(token);
      return;
    }
    const stored = localStorage.getItem('board:token');
    if (stored) await postAuth(stored);
  }

  async function postAuth(token) {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token, passphrase: token })
      });
    } catch {
      // Dev mode may not expose /api/auth; /api/board remains the source of truth.
    }
  }

  async function fetchBoard(options = {}) {
    const headers = {};
    const token = localStorage.getItem('board:token');
    if (token) headers.Authorization = `Bearer ${token}`;
    if (state.lastModified && !options.force) headers['If-Modified-Since'] = state.lastModified;

    try {
      const response = await fetch('/api/board', { headers });
      if (response.status === 401 || response.status === 403) {
        location.href = '/login.html';
        return;
      }
      if (response.status === 304) { hideToast(); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.lastModified = response.headers.get('Last-Modified') || state.lastModified;
      const data = await response.json();
      const nextVersion = data.version || data.updated_at || data.generatedAt || null;
      hideToast();
      if (!options.force && nextVersion && nextVersion === state.version) return;
      state.version = nextVersion;
      state.cards = normalizeCards(data);
      try {
        renderBoard();
      } catch (renderErr) {
        console.error('renderBoard failed', renderErr);
        showToast(`Error al renderizar tablero (${renderErr.message})`);
      }
    } catch (error) {
      console.error('fetchBoard failed', error);
      showToast(`Error de red al cargar tablero (${error.message || 'desconocido'})`);
      if (!state.cards.length) renderBoard();
    }
  }

  function normalizeCards(data) {
    let list = [];
    if (Array.isArray(data)) {
      list = data;
    } else if (Array.isArray(data?.cards)) {
      list = data.cards;
    } else if (Array.isArray(data?.items)) {
      list = data.items;
    } else if (data?.columns) {
      const columns = data.columns;
      if (Array.isArray(columns)) {
        list = columns.flatMap((column) => column.cards || []);
      } else if (typeof columns === 'object') {
        list = Object.values(columns).flatMap((column) => column?.cards || []);
      }
    }
    return list.map((card, index) => {
      const payload = parsePayload(card.payload_json || card.payload || {});
      const platforms = normalizePlatforms(card.platforms || payload.platforms || payload.assets?.map((asset) => asset.platform));
      return {
        raw: card,
        id: String(card.id || card.card_id || card.slug || `CARD-${index + 1}`),
        stage: card.stage || card.stage_key || card.status || 'ideas',
        title: card.title || payload.title || 'Sin título',
        pillar: card.pillar || payload.pillar || 'pulse',
        owner: card.owner || card.assignee || payload.owner || '',
        nextActor: card.next_actor || card.nextActor || payload.next_actor || '',
        createdAt: card.created_at || card.added_at || payload.created_at,
        updatedAt: card.updated_at || card.touched_at || payload.updated_at,
        stalledFor: card.stalled_for || card.stalled || payload.stalled_for,
        priority: card.priority || payload.priority,
        platforms,
        posts: Array.isArray(card.posts) ? card.posts : [],
        payload,
        due: card.due || dueStatus(payload.scheduled_for, payload.expires_at || card.expires_at, payload.window_key),
        windowLabel: card.window_label || payload.window_label,
        reviewNotes: card.review_notes || card.cap_review_notes || payload.review_notes || payload.cap_review_notes
      };
    });
  }

  function parsePayload(payload) {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch { return { caption: payload }; }
    }
    return payload && typeof payload === 'object' ? payload : {};
  }

  function normalizePlatforms(input = []) {
    const map = {
      twitter: 'x',
      x: 'x',
      youtube: 'youtube',
      yt: 'youtube',
      instagram: 'instagram',
      ig: 'instagram',
      threads: 'threads',
      th: 'threads',
      tiktok: 'tiktok',
      tt: 'tiktok',
      facebook: 'facebook',
      fb: 'facebook',
    };
    return [...new Set(
      (Array.isArray(input) ? input : [input])
        .filter(Boolean)
        .map((value) => map[String(value).toLowerCase()] || String(value).toLowerCase()),
    )];
  }

  function renderBoard() {
    const scrollState = captureScrollState();
    const filtered = state.cards.filter(matchesFilter);
    board.innerHTML = '';
    stages.forEach((stage) => {
      const cards = sortCardsForStage(stage.key, filtered.filter((card) => card.stage === stage.key));
      const allStageCards = state.cards.filter((card) => card.stage === stage.key);
      board.appendChild(renderColumn(stage, cards, allStageCards.length, allStageCards));
    });
    restoreScrollState(scrollState);
  }

  function sortCardsForStage(stageKey, cards) {
    return [...cards].sort((a, b) => {
      if (stageKey === 'to_be_posted') {
        const aTime = scheduledTime(a);
        const bTime = scheduledTime(b);
        if (aTime !== bTime) return aTime - bTime;
      }
      const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0);
      if (priorityDiff) return priorityDiff;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function scheduledTime(card) {
    const scheduledFor = card?.payload?.scheduled_for;
    if (!scheduledFor) return Number.POSITIVE_INFINITY;
    const time = new Date(scheduledFor).getTime();
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  }

  function captureScrollState() {
    const columns = {};
    document.querySelectorAll('.column[data-stage]').forEach((column) => {
      const list = column.querySelector('.cards');
      if (list) columns[column.dataset.stage] = list.scrollTop;
    });
    return {
      boardLeft: board.scrollLeft,
      columns,
    };
  }

  function restoreScrollState(scrollState) {
    if (!scrollState) return;
    board.scrollLeft = scrollState.boardLeft || 0;
    for (const [stage, top] of Object.entries(scrollState.columns || {})) {
      const list = document.querySelector(`.column[data-stage="${cssEscape(stage)}"] .cards`);
      if (list) list.scrollTop = top;
    }
  }

  function renderColumn(stage, cards, totalCount, allStageCards = cards) {
    const expanded = state.expanded.includes(stage.key);
    const expiredCount = stage.key === 'to_be_posted'
      ? allStageCards.filter((card) => (card.due || {}).key === 'expired').length
      : 0;
    const section = document.createElement('section');
    section.className = `column${expanded ? ' is-expanded' : ''}`;
    section.style.setProperty('--stage-color', stage.color);
    section.style.setProperty('--stage-dark', stage.dark);
    section.style.setProperty('--item-count', String(totalCount));
    section.style.setProperty('--capsule-height', `clamp(160px, ${160 + totalCount * 6}px, 360px)`);
    section.style.setProperty('--capsule-mobile-height', `${110 + totalCount * 4}px`);
    section.dataset.stage = stage.key;

    const capsule = document.createElement('div');
    capsule.className = 'capsule';
    capsule.setAttribute('role', 'button');
    capsule.setAttribute('tabindex', '0');
    capsule.setAttribute('aria-label', `Expandir columna ${stage.name}, ${totalCount} cartas`);
    capsule.innerHTML = `<span class="capsule__count">${formatCount(totalCount)}</span><span class="capsule__name">${escapeHtml(stage.name)}</span>`;
    capsule.addEventListener('click', () => expandStage(stage.key));
    capsule.addEventListener('keydown', (event) => activateOnEnterSpace(event, () => expandStage(stage.key)));

    const panel = document.createElement('div');
    panel.className = 'column-panel';
    panel.innerHTML = `
      <header class="column-panel__header">
        <span class="column-dot" aria-hidden="true"></span>
        <h2>${escapeHtml(stage.name)}</h2>
        ${stage.key === 'to_be_posted' ? `<button type="button" class="bulk-expired-button" title="${expiredCount ? `Descartar ${expiredCount} carta(s) expirada(s)` : 'No hay cartas expiradas'}" aria-label="Descartar cartas expiradas">🧹</button>` : ''}
        <span class="count-pill">${formatCount(totalCount)}</span>
      </header>
      <div class="cards"></div>
    `;
    const bulkExpiredButton = panel.querySelector('.bulk-expired-button');
    if (bulkExpiredButton) {
      bulkExpiredButton.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        bulkDiscardExpired();
      });
    }
    const cardList = panel.querySelector('.cards');
    if (!cards.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Sin cartas';
      cardList.appendChild(empty);
    } else {
      cards.forEach((card) => cardList.appendChild(renderCard(card)));
    }

    section.append(capsule, panel);
    return section;
  }

  function slideKeys(card) {
    const assets = card?.payload?.assets;
    if (!assets || typeof assets !== 'object' || Array.isArray(assets)) return [];
    return Object.keys(assets)
      .filter((k) => /^slide_\d+$/i.test(k))
      .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  }

  function formatVariantBadge(card) {
    const slides = slideKeys(card);
    if (slides.length > 1) return `<span class="card__variant" title="Carrusel de ${slides.length} slides">📚 ${slides.length}</span>`;
    const variant = card?.payload?.format_variant;
    if (variant === 'data_callout') return `<span class="card__variant" title="Data callout — número grande">🔢</span>`;
    if (variant === 'hero_pose') return `<span class="card__variant" title="Hero pose — imagen impacto">🦸</span>`;
    if (variant === 'reel_storyboard') return `<span class="card__variant" title="Reel / video corto">🎬</span>`;
    return '';
  }

  function renderCard(card) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `card${isWarm(card) ? ' is-warm' : ''}`;
    button.setAttribute('aria-label', `Abrir carta ${card.id}: ${card.title}`);
    button.addEventListener('click', () => openDrawer(card.id));
    const [chipBg, chipText] = pillarColors[card.pillar] || ['#b7c3d7', '#020f2a'];
    const stalled = formatStalled(card);
    const showTrash = card.stage === 'to_be_posted';
    const variantBadge = formatVariantBadge(card);
    const due = formatDueChip(card);
    button.innerHTML = `
      <div class="card__top">
        <span class="card__id">${escapeHtml(card.id)}</span>
        <span class="chip" style="--chip-bg:${chipBg};--chip-text:${chipText}">${escapeHtml(formatPillar(card.pillar))}</span>
        ${variantBadge}
        ${due}
        ${stalled ? `<span class="stalled">${escapeHtml(stalled)}</span>` : ''}
      </div>
      <strong class="card__title">${escapeHtml(card.title)}</strong>
      <div class="card__platforms">${card.platforms.map(platformPill).join('')}</div>
      <footer class="card__footer">
        <span>ADDED ${age(card.createdAt)} ago</span>
        <span>·</span>
        <span>↻ touched ${age(card.updatedAt)} ago</span>
        ${card.owner ? `<span class="avatar" title="${escapeHtml(card.owner)}">${escapeHtml(initials(card.owner))}</span>` : ''}
        ${card.nextActor ? `<span>→ ${escapeHtml(card.nextActor)}</span>` : ''}
      </footer>
      ${showTrash ? `<span class="card__trash" role="button" tabindex="0" aria-label="Descartar carta ${escapeHtml(card.id)}" title="Descartar carta">🗑</span>` : ''}
    `;
    if (showTrash) {
      const trash = button.querySelector('.card__trash');
      const fire = (event) => {
        event.stopPropagation();
        event.preventDefault();
        quickDiscardCard(card);
      };
      trash.addEventListener('click', fire);
      trash.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') fire(event);
      });
    }
    return button;
  }

  async function quickDiscardCard(card) {
    const confirmed = window.confirm(`¿Descartar la carta ${card.id} "${card.title}"? Pasará a KILLED y se quitará de To Be Posted.`);
    if (!confirmed) return;
    const token = localStorage.getItem('board:token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}/kill`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'Descartada desde tarjeta (To Be Posted)' }),
      });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try { const body = await response.json(); if (body?.error) detail = `${detail} · ${body.error}`; } catch {}
        throw new Error(detail);
      }
      showToast(`Carta ${card.id} descartada.`, 'success');
      await fetchBoard({ force: true });
    } catch (error) {
      showToast(`No se pudo descartar (${error.message}).`);
    }
  }

  async function bulkDiscardExpired() {
    const expiredCards = state.cards.filter((card) => card.stage === 'to_be_posted' && (card.due || {}).key === 'expired');
    if (!expiredCards.length) {
      showToast('No hay cartas expiradas en To Be Posted.', 'success');
      return;
    }
    const confirmed = window.confirm(`¿Descartar ${expiredCards.length} carta(s) expirada(s) de To Be Posted?\n\nPasarán a KILLED y se quitarán de la columna.`);
    if (!confirmed) return;
    const token = localStorage.getItem('board:token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    let killed = 0;
    const failed = [];
    try {
      for (const card of expiredCards) {
        const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}/kill`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason: 'Bulk discard expired To Be Posted cards from column header' }),
        });
        if (response.ok) {
          killed += 1;
          continue;
        }
        let detail = `${card.id}: HTTP ${response.status}`;
        try { const body = await response.json(); if (body?.error) detail = `${detail} · ${body.error}`; } catch {}
        failed.push(detail);
      }
      await fetchBoard({ force: true });
      if (failed.length) {
        showToast(`Descartadas ${killed}; fallaron ${failed.length}. Primero: ${failed[0]}`);
        return;
      }
      showToast(`Descartadas ${killed} carta(s) expirada(s).`, 'success');
    } catch (error) {
      showToast(`No se pudieron descartar expiradas (${error.message}).`);
    }
  }

  function expandStage(stageKey) {
    if (window.innerWidth < 900) {
      state.expanded = [stageKey];
    } else if (state.expanded.includes(stageKey)) {
      // Bring re-clicked stage to "most recent" position (so it won't be the next one dropped).
      state.expanded = [...state.expanded.filter((key) => key !== stageKey), stageKey];
    } else {
      // LRU: append the new stage; drop the oldest if we exceed 2 visible columns.
      const next = [...state.expanded, stageKey];
      while (next.length > 2) next.shift();
      state.expanded = next;
    }
    persistExpanded();
    renderBoard();
    document.querySelector(`[data-stage="${stageKey}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function openDrawer(cardId) {
    const card = state.cards.find((item) => item.id === cardId);
    if (!card) return;
    state.activeCard = card;
    state.activePlatform = card.platforms[0] || platformFromAssets(card)[0] || 'PREVIEW';
    state.actionMode = null;
    state.previewSlide = 0;
    state.focusBeforeDrawer = document.activeElement;
    renderDrawer();
    backdrop.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    drawerClose.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    state.activeCard = null;
    state.actionMode = null;
    state.focusBeforeDrawer?.focus?.();
  }

  function renderDrawer() {
    const card = state.activeCard;
    if (!card) return;
    drawerId.textContent = card.id;
    drawerTitle.textContent = card.title;
    const [chipBg, chipText] = pillarColors[card.pillar] || ['#b7c3d7', '#020f2a'];
    const progress = postProgress(card);
    drawerMeta.innerHTML = `
      <span class="chip" style="--chip-bg:${chipBg};--chip-text:${chipText}">${escapeHtml(formatPillar(card.pillar))}</span>
      ${card.platforms.map(platformPill).join('')}
      ${progress.total > 0 ? `<span class="chip chip--progress" style="--chip-bg:${progress.done === progress.total ? '#16a34a' : '#f4bd4f'};--chip-text:#020f2a">Publicado ${progress.done}/${progress.total}${progress.done === progress.total ? ' ✓' : ''}</span>` : ''}
      ${card.windowLabel ? `<span class="chip" style="--chip-bg:#d7ea1f;--chip-text:#020f2a">${escapeHtml(card.windowLabel)}</span>` : ''}
      ${formatDueChip(card, { asChip: true })}
      ${card.owner ? `<span class="chip" style="--chip-bg:#f0f4ff;--chip-text:#020f2a">Owner ${escapeHtml(card.owner)}</span>` : ''}
      ${card.nextActor ? `<span class="chip" style="--chip-bg:#f0f4ff;--chip-text:#020f2a">→ ${escapeHtml(card.nextActor)}</span>` : ''}
    `;
    renderPlatformTabs(card);
    renderPreview(card);
    renderSections(card);
    renderActions(card);
  }

  function postProgress(card) {
    const platforms = card.platforms || [];
    const posts = Array.isArray(card.posts) ? card.posts : [];
    const done = new Set(
      posts
        .filter((p) => ['posted', 'posted_manual', 'skipped'].includes(p.status))
        .map((p) => String(p.platform).toLowerCase()),
    );
    return {
      done: platforms.filter((p) => done.has(String(p).toLowerCase())).length,
      total: platforms.length,
      pending: platforms.filter((p) => !done.has(String(p).toLowerCase())),
    };
  }

  function renderPlatformTabs(card) {
    const platforms = card.platforms.length ? card.platforms : platformFromAssets(card);
    const posted = new Set(
      (Array.isArray(card.posts) ? card.posts : [])
        .filter((p) => ['posted', 'posted_manual', 'skipped'].includes(p.status))
        .map((p) => String(p.platform).toLowerCase()),
    );
    drawerPlatforms.innerHTML = platforms.map((platform) => {
      const key = String(platform).toLowerCase();
      const isDone = posted.has(key);
      const label = `${platformDisplayName(platform)}${isDone ? ' ✓' : ''}`;
      return `
        <button type="button" role="tab"
          aria-selected="${platform === state.activePlatform}"
          aria-label="Ver asset ${escapeHtml(platformDisplayName(platform))}"
          data-platform="${escapeHtml(platform)}"
          ${isDone ? 'data-posted="true"' : ''}>${escapeHtml(label)}</button>
      `;
    }).join('');
    drawerPlatforms.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        state.activePlatform = button.dataset.platform;
        renderDrawer();
      });
    });
  }

  function renderPreview(card) {
    const slides = slideKeys(card);
    if (slides.length > 1) {
      const assets = card.payload.assets;
      if (typeof state.previewSlide !== 'number' || state.previewSlide >= slides.length) {
        state.previewSlide = 0;
      }
      const current = slides[state.previewSlide];
      const src = assetUrlFromPath(assets[current]);
      drawerPreview.innerHTML = `
        <div class="preview-carousel">
          <img loading="lazy" src="${escapeAttribute(src)}" alt="Slide ${state.previewSlide + 1} de ${slides.length} para carta ${escapeHtml(card.id)}">
          <div class="preview-nav">
            <button type="button" class="preview-nav__btn" data-dir="prev" aria-label="Slide anterior">‹</button>
            <span class="preview-nav__counter">Slide ${state.previewSlide + 1} / ${slides.length}</span>
            <button type="button" class="preview-nav__btn" data-dir="next" aria-label="Slide siguiente">›</button>
          </div>
          <div class="preview-dots">
            ${slides.map((_, i) => `<span class="preview-dot${i === state.previewSlide ? ' is-active' : ''}" data-slide="${i}"></span>`).join('')}
          </div>
          <p class="asset-meta">Carrusel · <a href="${escapeAttribute(src)}" download>Descargar slide ${state.previewSlide + 1}</a></p>
        </div>
      `;
      drawerPreview.querySelectorAll('.preview-nav__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const dir = btn.dataset.dir === 'next' ? 1 : -1;
          state.previewSlide = (state.previewSlide + dir + slides.length) % slides.length;
          renderPreview(card);
        });
      });
      drawerPreview.querySelectorAll('.preview-dot').forEach((dot) => {
        dot.addEventListener('click', () => {
          state.previewSlide = Number(dot.dataset.slide) || 0;
          renderPreview(card);
        });
      });
      return;
    }
    const asset = findAsset(card, state.activePlatform);
    if (asset?.path) {
      const isVideo = /\.mp4(?:[?#]|$)/i.test(asset.path);
      const preview = isVideo
        ? `<video controls muted loop playsinline src="${escapeAttribute(asset.path)}" aria-label="Vista previa de video ${escapeHtml(state.activePlatform)}"></video>`
        : `<img loading="lazy" src="${escapeAttribute(asset.path)}" alt="Vista previa de asset ${escapeHtml(state.activePlatform)}">`;
      drawerPreview.innerHTML = `${preview}
        <p class="asset-meta">${escapeHtml(asset.label || '')} · <a href="${escapeAttribute(asset.path)}" download>Descargar</a></p>`;
    } else {
      drawerPreview.innerHTML = '<p>No hay asset visual para esta plataforma.</p>';
    }
  }

  function formatAssetList(assets) {
    if (!assets) return null;
    if (Array.isArray(assets)) {
      return assets.map((a) => {
        const src = typeof a === 'string' ? a : (a.path || a.url || '');
        const url = assetUrlFromPath(src);
        return url ? `${a.platform || a.kind || a.label || ''} → ${url}` : src;
      }).join('\n');
    }
    if (typeof assets === 'object') {
      return Object.entries(assets).map(([size, path]) => `${size} → ${assetUrlFromPath(path)}`).join('\n');
    }
    return String(assets);
  }

  function cleanCaption(text) {
    if (!text) return '';
    const lines = String(text).replace(/\r/g, '').split('\n');
    while (lines.length) {
      const last = lines[lines.length - 1].trim();
      if (last === '') {
        lines.pop();
        continue;
      }
      const isHashtagLine = /^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(last);
      if (isHashtagLine) {
        lines.pop();
        continue;
      }
      break;
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function renderSections(card) {
    const payload = card.payload;
    const activeCopy = platformCopy(card, state.activePlatform);
    const scheduled = payload.scheduled_for ? new Date(payload.scheduled_for).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : null;
    const caption = cleanCaption(activeCopy.caption || activeCopy.text || payload.caption || payload.copy || payload.text);
    const hashtags = activeCopy.hashtags ?? payload.hashtags;
    const instructions = platformInstructions(state.activePlatform, activeCopy);
    const sections = [
      [`${platformDisplayName(state.activePlatform)} · checklist`, instructions],
      ['Hook (scroll-stopper)', payload.hook],
      ['Caption (paste-ready)', caption],
      ['Hashtags', Array.isArray(hashtags) ? hashtags.join(' ') : hashtags],
      ['Reply / link follow-up', activeCopy.reply_text],
      ['CTA', activeCopy.cta || payload.cta],
      ['Alt text (accesibilidad)', activeCopy.alt_text || payload.alt_text],
      ['Script (video)', activeCopy.script || payload.script],
      ['Body brief (dirección creativa)', payload.body_brief],
      ['Notas', payload.notes],
      ['Stat / Eyebrow', [payload.eyebrow, payload.statLine].filter(Boolean).join(' · ')],
      ['Plantilla', payload.template],
      ['Programado para', scheduled],
      ['Ventana', [payload.window_key, payload.window_label || card.windowLabel].filter(Boolean).join(' · ')],
      ['Assets', formatAssetList(payload.assets)],
      ['Señal de origen', payload.signal_source],
      ["Cap's review notes", card.reviewNotes],
    ].filter(([, content]) => content);

    drawerSections.innerHTML = sections.map(([title, content], index) => `
      <details class="detail-section" ${index < 4 ? 'open' : ''}>
        <summary>${escapeHtml(title)}</summary>
        <pre>${escapeHtml(String(content))}</pre>
      </details>
    `).join('') || '<p class="empty">Sin detalles adicionales</p>';
  }

  function renderActions(card) {
    const tiktokFallback = isTikTokFallback(card);
    actionReasonWrap.hidden = !['revise', 'kill', 'confirm_posted'].includes(state.actionMode);
    snoozeWrap.hidden = state.actionMode !== 'snooze';
    const submitLabel = SUBMIT_LABELS[state.actionMode] || 'Confirmar';
    const progress = postProgress(card);
    const showBulkButton = (card.stage === 'to_be_posted' || card.stage === 'posted') && progress.total > 0 && progress.done < progress.total;
    drawerActions.innerHTML = `
      ${card.stage === 'to_be_posted' ? '<button type="button" class="success" data-action="approve_publish" aria-label="Aprobar y publicar carta">Aprobar y publicar</button>' : ''}
      ${hasCopyForPlatform(card, state.activePlatform) ? `<button type="button" class="secondary" data-action="copy_caption" aria-label="Copiar texto al portapapeles">Copiar ${escapeHtml(platformDisplayName(state.activePlatform))}</button>` : ''}
      ${copyReplyForPlatform(card, state.activePlatform) ? '<button type="button" class="secondary" data-action="copy_reply" aria-label="Copiar reply/link">Copiar reply/link</button>' : ''}
      ${openUrlForPlatform(state.activePlatform) ? `<button type="button" class="secondary" data-action="open_platform" aria-label="Abrir plataforma">Abrir ${escapeHtml(platformDisplayName(state.activePlatform))}</button>` : ''}
      ${card.stage === 'to_be_posted' || card.stage === 'posted' ? `<button type="button" class="secondary" data-mode="confirm_posted" aria-label="Marcar publicado en una plataforma">Marcar publicado en ${escapeHtml(platformDisplayName(state.activePlatform))}</button>` : ''}
      ${showBulkButton ? `<button type="button" class="success" data-action="confirm_all_posted" aria-label="Marcar todas las plataformas como publicadas">Marcar TODAS publicadas (mover a POSTED)</button>` : ''}
      <button type="button" class="secondary" data-mode="revise" aria-label="Pedir cambios">Pedir cambios</button>
      <button type="button" class="secondary" data-mode="snooze" aria-label="Posponer carta">Posponer</button>
      <button type="button" class="danger" data-mode="kill" aria-label="Descartar carta">Descartar</button>
      ${tiktokFallback ? '<button type="button" class="secondary" data-action="open_tiktok" aria-label="Abrir TikTok">Abrir TikTok</button>' : ''}
      ${state.actionMode ? `<button type="button" class="success" data-action="submit_mode" aria-label="${escapeAttribute(submitLabel)}">${escapeHtml(submitLabel)}</button>` : ''}
      ${state.actionMode ? '<button type="button" class="secondary" data-action="cancel_mode" aria-label="Cancelar acción">Cancelar</button>' : ''}
    `;
    drawerActions.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleActionButton(button.dataset, card);
      });
    });
    if (state.actionMode === 'confirm_posted') {
      if (actionReasonLabel) actionReasonLabel.textContent = `Enlace público (permalink) en ${platformDisplayName(state.activePlatform)}`;
      actionReason.placeholder = `Pega aquí el enlace público de ${platformDisplayName(state.activePlatform)} (ej. https://www.instagram.com/p/XXXX/). Si no lo tienes, deja vacío.`;
    } else if (state.actionMode === 'revise') {
      if (actionReasonLabel) actionReasonLabel.textContent = 'Notas para Shuri';
      actionReason.placeholder = 'Escribe qué hay que ajustar antes de publicar…';
    } else if (state.actionMode === 'kill') {
      if (actionReasonLabel) actionReasonLabel.textContent = 'Razón para descartar';
      actionReason.placeholder = 'Escribe por qué descartas esta carta…';
    }
  }

  const SUBMIT_LABELS = {
    confirm_posted: 'Confirmar publicación',
    revise: 'Enviar a revisión',
    kill: 'Descartar carta',
    snooze: 'Posponer',
  };

  async function handleActionButton(dataset, card) {
    if (dataset.action === 'cancel_mode') {
      state.actionMode = null;
      actionReason.value = '';
      renderActions(card);
      showToast('Acción cancelada.', 'success');
      return;
    }
    if (dataset.action === 'confirm_all_posted') {
      const progress = postProgress(card);
      if (progress.pending.length === 0) {
        showToast('Todas las plataformas ya están confirmadas.', 'success');
        return;
      }
      const friendly = progress.pending.map(platformDisplayName).join(', ');
      const ok = window.confirm(`¿Marcar TODAS las plataformas pendientes como publicadas (${friendly})?\n\nLa carta se moverá a POSTED sin guardar enlaces.\nPuedes agregar permalinks después con "Marcar publicado".`);
      if (!ok) {
        showToast('Marca masiva cancelada.', 'success');
        return;
      }
      await bulkConfirmPosted(card, progress.pending);
      return;
    }
    if (dataset.mode) {
      state.actionMode = dataset.mode;
      renderActions(card);
      if (['revise', 'kill', 'confirm_posted'].includes(dataset.mode)) actionReason.focus();
      if (dataset.mode === 'snooze') snoozeSelect.focus();
      const hint = MODE_HINTS[dataset.mode];
      if (hint) showToast(hint, 'success');
      return;
    }
    if (dataset.action === 'copy_caption') {
      const activeCopy = platformCopy(card, state.activePlatform);
      const cleaned = cleanCaption(activeCopy.caption || activeCopy.text || card.payload.caption);
      const hashtags = (activeCopy.hashtags || card.payload.hashtags || []).join(' ').trim();
      const text = [cleaned, hashtags].filter(Boolean).join('\n\n');
      const ok = await copyToClipboard(text);
      if (ok) {
        showToast('Texto copiado al portapapeles (caption + hashtags). Ya puedes pegarlo en la plataforma.', 'success');
      } else {
        showToast('No se pudo copiar automáticamente. Mantén presionado el texto del caption en la sección "Caption" para copiarlo manualmente.');
      }
      return;
    }
    if (dataset.action === 'copy_reply') {
      const text = copyReplyForPlatform(card, state.activePlatform);
      const ok = await copyToClipboard(text);
      showToast(ok ? 'Reply/link copiado al portapapeles.' : 'No se pudo copiar el reply/link automáticamente.', ok ? 'success' : 'error');
      return;
    }
    if (dataset.action === 'open_platform') {
      window.open(openUrlForPlatform(state.activePlatform), '_blank', 'noopener');
      showToast(`Abriendo ${platformDisplayName(state.activePlatform)}.`, 'success');
      return;
    }
    if (dataset.action === 'open_tiktok') {
      window.open('https://www.tiktok.com/upload?lang=es', '_blank', 'noopener');
      showToast('Abriendo TikTok en una pestaña nueva.', 'success');
      return;
    }
    const action = dataset.action === 'submit_mode' ? state.actionMode : dataset.action;
    if (!action) {
      showToast('Primero elige una acción (Marcar publicado, Pedir cambios, Posponer o Descartar).');
      return;
    }
    if ((action === 'revise' || action === 'kill') && !actionReason.value.trim()) {
      showToast('Escribe una nota breve para el resto del equipo antes de continuar.');
      actionReason.focus();
      return;
    }
    await sendAction(card, action);
  }

  async function bulkConfirmPosted(card, pendingPlatforms) {
    const token = localStorage.getItem('board:token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    let lastResult = null;
    let confirmed = 0;
    try {
      for (const platform of pendingPlatforms) {
        const response = await fetch(`/api/cards/${encodeURIComponent(card.id)}/confirm-posted`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ platform, permalink: null }),
        });
        if (!response.ok) {
          let detail = `HTTP ${response.status}`;
          try { const errBody = await response.json(); if (errBody?.error) detail = `${detail} · ${errBody.error}`; } catch {}
          throw new Error(`Falló en ${platformDisplayName(platform)}: ${detail}`);
        }
        lastResult = await response.json().catch(() => ({}));
        confirmed += 1;
      }
      actionReason.value = '';
      state.actionMode = null;
      await fetchBoard({ force: true });
      if (lastResult?.stage === 'posted') {
        showToast(`${confirmed} plataforma(s) marcada(s). Carta movida a POSTED ✓`, 'success');
        closeDrawer();
      } else {
        showToast(`${confirmed} plataforma(s) marcada(s).`, 'success');
        state.activeCard = state.cards.find((c) => c.id === card.id) || state.activeCard;
        renderDrawer();
      }
    } catch (error) {
      await fetchBoard({ force: true });
      state.activeCard = state.cards.find((c) => c.id === card.id) || state.activeCard;
      if (state.activeCard) renderDrawer();
      showToast(`Marca masiva interrumpida (${error.message}).`);
    }
  }

  const MODE_HINTS = {
    confirm_posted: 'Pega el enlace público y presiona "Confirmar publicación".',
    revise: 'Escribe qué hay que ajustar y presiona "Enviar a revisión".',
    snooze: 'Elige cuánto posponer y presiona "Posponer".',
    kill: 'Escribe por qué descartas y presiona "Descartar carta".',
  };

  async function copyToClipboard(text) {
    if (!text) return false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through to legacy fallback
      }
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(textarea);
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  function snoozeHoursFromSelect() {
    const value = snoozeSelect.value;
    if (value === 'next-day') return 18;
    const match = String(value).match(/^(\d+)h$/);
    return match ? Number(match[1]) : 1;
  }

  async function sendAction(card, action) {
    const token = localStorage.getItem('board:token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    let endpoint = null;
    let body = {};
    let successMessage = 'Acción completada.';
    if (action === 'approve_publish') {
      endpoint = `/api/cards/${encodeURIComponent(card.id)}/approve`;
      successMessage = 'Carta aprobada. Recuerda usar "Marcar publicado" después de subirla a cada red.';
    } else if (action === 'revise') {
      endpoint = `/api/cards/${encodeURIComponent(card.id)}/revise`;
      body = { note: actionReason.value || 'Necesita ajustes' };
      successMessage = 'Carta enviada a revisión.';
    } else if (action === 'kill') {
      endpoint = `/api/cards/${encodeURIComponent(card.id)}/kill`;
      body = { reason: actionReason.value || 'Descartada' };
      successMessage = 'Carta descartada.';
    } else if (action === 'snooze') {
      endpoint = `/api/cards/${encodeURIComponent(card.id)}/snooze`;
      body = { hours: snoozeHoursFromSelect() };
      successMessage = `Carta pospuesta ${body.hours}h.`;
    } else if (action === 'confirm_posted') {
      endpoint = `/api/cards/${encodeURIComponent(card.id)}/confirm-posted`;
      const raw = actionReason.value.trim();
      body = { platform: state.activePlatform, permalink: raw || null };
      successMessage = `Publicación en ${platformDisplayName(state.activePlatform)} registrada.`;
    } else {
      showToast(`Acción no soportada (${action}).`);
      return;
    }
    try {
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody?.error) detail = `${detail} · ${errBody.error}`;
        } catch {}
        throw new Error(detail);
      }
      const result = await response.json().catch(() => ({}));
      actionReason.value = '';
      state.actionMode = null;
      if (action === 'approve_publish' && Array.isArray(result.result)) {
        const summary = result.result.map((r) => `${r.platform}:${r.status}`).join(' · ');
        showToast(`Publicación enviada → ${summary}`, 'success');
      } else if (action === 'confirm_posted') {
        const posts = Array.isArray(result.posts) ? result.posts : [];
        const platforms = Array.isArray(result.platforms) ? result.platforms : [];
        const done = new Set(posts.filter((p) => ['posted', 'posted_manual', 'skipped'].includes(p.status)).map((p) => String(p.platform).toLowerCase()));
        const pending = platforms.map((p) => String(p).toLowerCase()).filter((p) => !done.has(p));
        if (result.stage === 'posted' || pending.length === 0) {
          showToast(`${successMessage} Carta movida a POSTED ✓`, 'success');
        } else {
          const friendly = pending.map(platformDisplayName).join(', ');
          showToast(`${successMessage} Faltan: ${friendly}.`, 'success');
        }
      } else {
        showToast(successMessage, 'success');
      }
      await fetchBoard({ force: true });
      if (action === 'confirm_posted') {
        if (result.stage === 'posted') {
          closeDrawer();
        } else {
          state.activeCard = state.cards.find((c) => c.id === card.id) || state.activeCard;
          renderDrawer();
        }
      } else if (action !== 'approve_publish') {
        closeDrawer();
      }
    } catch (error) {
      showToast(`No se pudo enviar la acción (${error.message}).`);
    }
  }

  function handleKeys(event) {
    if (event.key === 'Escape' && state.activeCard) closeDrawer();
    if (event.key.toLowerCase() === 'f' && !isTyping(event.target)) {
      event.preventDefault();
      filterInput.focus();
    }
    if (!state.activeCard && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !isTyping(event.target)) {
      event.preventDefault();
      cycleExpanded(event.key === 'ArrowRight' ? 1 : -1);
    }
    if (state.activeCard && event.key === 'Tab') trapFocus(event);
  }

  function cycleExpanded(direction) {
    const current = stages.findIndex((stage) => stage.key === state.expanded[state.expanded.length - 1]);
    const next = (current + direction + stages.length) % stages.length;
    expandStage(stages[next].key);
  }

  function trapFocus(event) {
    const focusable = drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function matchesFilter(card) {
    if (!state.filter) return true;
    const haystack = [card.title, card.pillar, card.payload.caption, card.payload.copy, card.payload.hashtags].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(state.filter);
  }

  function loadExpanded() {
    try {
      const saved = JSON.parse(localStorage.getItem('board:expanded') || '[]');
      if (Array.isArray(saved) && saved.length) return saved.filter((key) => stages.some((stage) => stage.key === key)).slice(0, 2);
    } catch {
      // Ignore corrupt localStorage.
    }
    return ['to_be_posted', 'posted'];
  }

  function persistExpanded() {
    localStorage.setItem('board:expanded', JSON.stringify(state.expanded));
  }

  function showToast(message, kind = 'error') {
    const text = (message || '').trim();
    if (!text) { hideToast(); return; }
    toastMessage.textContent = text;
    toast.classList.toggle('toast--success', kind === 'success');
    toast.hidden = false;
    toast.setAttribute('role', kind === 'success' ? 'status' : 'alert');
    clearTimeout(showToast._t);
    if (kind === 'success') {
      showToast._t = setTimeout(hideToast, 5000);
    } else {
      showToast._t = setTimeout(hideToast, 10000);
    }
  }

  function hideToast() {
    toast.hidden = true;
  }

  const WINDOW_URGENCY_MINUTES = {
    t_minus_48h: 180,
    t_minus_24h: 120,
    t_minus_4h: 45,
    t_minus_60: 20,
    t_minus_15: 10,
    halftime: 10,
    fulltime_plus_30: 30,
    next_morning: 60,
    evergreen: 120,
  };

  function dueStatus(scheduledFor, expiresAt, windowKey) {
    if (!scheduledFor) return { key: 'unscheduled', label: 'Sin horario', deltaMinutes: null };
    const due = new Date(scheduledFor);
    if (Number.isNaN(due.getTime())) return { key: 'unscheduled', label: 'Sin horario', deltaMinutes: null };
    const now = Date.now();
    const deltaMinutes = Math.round((due.getTime() - now) / 60000);
    if (expiresAt) {
      const expiry = new Date(expiresAt);
      if (!Number.isNaN(expiry.getTime()) && now > expiry.getTime()) {
        return { key: 'expired', label: 'Expirado', deltaMinutes };
      }
    }
    const urgency = WINDOW_URGENCY_MINUTES[windowKey] || 20;
    if (deltaMinutes > urgency) return { key: 'future', label: `En ${formatDuration(deltaMinutes)}`, deltaMinutes };
    if (deltaMinutes > 0) return { key: 'due_soon', label: `En ${formatDuration(deltaMinutes)}`, deltaMinutes };
    if (deltaMinutes >= -15) return { key: 'due_now', label: 'POST NOW', deltaMinutes };
    return { key: 'late', label: `Tarde ${formatDuration(Math.abs(deltaMinutes))}`, deltaMinutes };
  }

  function formatDuration(minutes) {
    const value = Math.max(0, Number(minutes || 0));
    if (value < 60) return `${value}m`;
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }

  function formatDueChip(card, { asChip = false } = {}) {
    const due = card.due || dueStatus(card.payload?.scheduled_for, card.expires_at || card.payload?.expires_at, card.payload?.window_key);
    if (!due || due.key === 'unscheduled') return '';
    const classes = asChip ? `chip due-chip due-chip--${due.key}` : `due-mini due-mini--${due.key}`;
    return `<span class="${classes}">${escapeHtml(due.label)}</span>`;
  }

  function platformCopy(card, platform) {
    const key = String(platform || '').toLowerCase();
    const copy = card.payload?.platform_copy?.[key] || {};
    return copy && typeof copy === 'object' ? copy : {};
  }

  function hasCopyForPlatform(card, platform) {
    const copy = platformCopy(card, platform);
    return Boolean(copy.caption || copy.text || card.payload?.caption || card.payload?.text || card.payload?.copy);
  }

  function copyReplyForPlatform(card, platform) {
    const copy = platformCopy(card, platform);
    return copy.reply_text || copy.link_reply || '';
  }

  function openUrlForPlatform(platform) {
    const key = String(platform || '').toLowerCase();
    if (key === 'instagram') return 'https://www.instagram.com/';
    if (key === 'x') return 'https://x.com/compose/post';
    if (key === 'threads') return 'https://www.threads.net/';
    if (key === 'tiktok') return 'https://www.tiktok.com/upload?lang=es';
    if (key === 'youtube') return 'https://studio.youtube.com/';
    return '';
  }

  function platformInstructions(platform, activeCopy) {
    const format = activeCopy.format ? `Formato: ${activeCopy.format}` : null;
    const customInstructions = activeCopy.instructions || null;
    const steps = [
      format,
      customInstructions,
      '1. Descarga/usa el asset visible si aplica.',
      '2. Copia el texto de esta pestaña.',
      `3. Abre ${platformDisplayName(platform)} y pega.`,
      '4. Publica en la ventana indicada.',
      '5. Regresa y marca esta plataforma como publicada.',
    ].filter(Boolean);
    return steps.join('\n');
  }

  function formatCount(count) {
    return count > 99 ? '99+' : String(count);
  }

  function formatPillar(pillar) {
    return String(pillar || 'pulse').replaceAll('_', ' ');
  }

  function platformPill(platform) {
    const key = String(platform).toLowerCase();
    const color = platformColors[key] || '#326295';
    const label = PLATFORM_LABEL[key] || String(platform).toUpperCase();
    return `<span class="platform-pill" style="--platform-color:${color}">${escapeHtml(label)}</span>`;
  }

  function platformDisplayName(platform) {
    const key = String(platform).toLowerCase();
    return PLATFORM_NAME[key] || String(platform);
  }

  function initials(name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function age(value) {
    if (!value) return '0d';
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return '0d';
    const diff = Math.max(0, Date.now() - timestamp);
    const hours = Math.floor(diff / 36e5);
    if (hours < 24) return `${Math.max(1, hours)}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  function formatStalled(card) {
    const explicit = card.stalledFor;
    if (explicit) return `STALLED ${String(explicit).toUpperCase()}`;
    const hours = card.updatedAt ? Math.floor((Date.now() - new Date(card.updatedAt).getTime()) / 36e5) : 0;
    if (hours < 48 || card.stage === 'posted' || card.stage === 'killed') return '';
    return `STALLED ${hours < 72 ? `${hours}H` : `${Math.floor(hours / 24)}D`}`;
  }

  function isWarm(card) {
    return ['high', 'urgent', 'warm'].includes(String(card.priority).toLowerCase()) || card.stage === 'to_be_posted';
  }

  function isTikTokFallback(card) {
    const hasTikTok = card.platforms.includes('tiktok');
    const status = String(card.payload.tiktok_status || card.payload.publish_mode || card.payload.fallback || '').toLowerCase();
    return hasTikTok && (status.includes('paste') || status.includes('fallback') || card.payload.paste_fallback === true);
  }

  function platformFromAssets(card) {
    const assets = card.payload.assets;
    if (Array.isArray(assets)) {
      return normalizePlatforms(assets.map((asset) => asset.platform || asset.kind).filter(Boolean));
    }
    if (assets && typeof assets === 'object') {
      return card.platforms;
    }
    return [];
  }

  const SIZE_BY_PLATFORM = {
    instagram: ['animated_mp4', '1080x1080', '1080x1350', '1080x1920'],
    ig: ['animated_mp4', '1080x1080', '1080x1350', '1080x1920'],
    threads: ['1080x1350', '1080x1080', '1080x1920'],
    x: ['1080x1350', '1080x1080', '1080x1920'],
    twitter: ['1080x1350', '1080x1080', '1080x1920'],
    tiktok: ['1080x1920', '1080x1350', '1080x1080'],
    youtube: ['1080x1920', '1080x1350', '1080x1080'],
  };

  function assetUrlFromPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const normalized = rawPath.replace(/\\/g, '/');
    const marker = '.squad/agents/shuri/outputs/creative/';
    const index = normalized.indexOf(marker);
    const bust = `?ts=${Date.now()}`;
    if (index >= 0) return '/creative/' + normalized.slice(index + marker.length) + bust;
    if (normalized.startsWith('/')) return normalized + bust;
    return '/creative/' + normalized + bust;
  }

  function findAsset(card, platform) {
    const assets = card.payload.assets;
    if (Array.isArray(assets)) {
      const match = assets.find((asset) => normalizePlatforms(asset.platform || asset.kind)[0] === platform) || assets[0];
      if (!match) return null;
      const src = typeof match === 'string' ? match : (match.path || match.url);
      return { path: assetUrlFromPath(src), label: match.label || platform };
    }
    if (assets && typeof assets === 'object') {
      const priorities = SIZE_BY_PLATFORM[String(platform).toLowerCase()] || Object.keys(assets);
      for (const size of priorities) {
        if (assets[size]) return { path: assetUrlFromPath(assets[size]), label: size, size };
      }
      const firstKey = Object.keys(assets)[0];
      if (firstKey && assets[firstKey]) return { path: assetUrlFromPath(assets[firstKey]), label: firstKey, size: firstKey };
    }
    return null;
  }

  function activateOnEnterSpace(event, callback) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  }

  function debounce(fn, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }

  function isTyping(target) {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, '\\$&');
  }
})();
