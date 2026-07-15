/**
 * Атлас Забытых Земель — interactive Perlin RPG map
 */
(function () {
  "use strict";

  const { TERRAIN, RESOURCES, QUESTS, EMPTY_FLAVOR } = WorldData;
  const { createPerlin, hashSeed } = Perlin;

  // ── DOM ──
  const canvas = document.getElementById("map-canvas");
  const ctx = canvas.getContext("2d");
  const seedInput = document.getElementById("seed-input");
  const mapSizeSelect = document.getElementById("map-size");
  const noiseScaleInput = document.getElementById("noise-scale");
  const btnGenerate = document.getElementById("btn-generate");
  const btnDownload = document.getElementById("btn-download");
  const btnRandomSeed = document.getElementById("btn-random-seed");
  const btnFogToggle = document.getElementById("btn-fog-toggle");
  const btnExplore = document.getElementById("btn-explore");
  const mapHint = document.getElementById("map-hint");
  const seedDisplay = document.getElementById("seed-display");

  const statExplored = document.getElementById("stat-explored");
  const statResources = document.getElementById("stat-resources");
  const statQuests = document.getElementById("stat-quests");

  const detailPlaceholder = document.getElementById("detail-placeholder");
  const detailContent = document.getElementById("detail-content");
  const terrainBadge = document.getElementById("terrain-badge");
  const cellCoord = document.getElementById("cell-coord");
  const regionName = document.getElementById("region-name");
  const regionDesc = document.getElementById("region-desc");
  const lootList = document.getElementById("loot-list");
  const resourceSection = document.getElementById("resource-section");
  const questSection = document.getElementById("quest-section");
  const questTitle = document.getElementById("quest-title");
  const questText = document.getElementById("quest-text");
  const exploreNote = document.getElementById("explore-note");
  const inventoryEl = document.getElementById("inventory");
  const eventLog = document.getElementById("event-log");
  const toastHost = document.getElementById("toast-host");
  const modalBackdrop = document.getElementById("modal-backdrop");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");

  // ── State ──
  const state = {
    size: 48,
    seed: "",
    seedNum: 0,
    scale: 0.07,
    grid: null, // 2D array of cells
    selected: null, // { x, y }
    inventory: {}, // id -> { name, emoji, count }
    stats: { explored: 0, resources: 0, quests: 0 },
    fogOfWar: true,
    animProgress: 1, // 0..1 reveal animation
    hover: null,
    revealToken: 0,
  };

  // ── Helpers ──
  function pick(arr, rand) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function weightedPick(items, rand) {
    const total = items.reduce((s, i) => s + i.weight, 0);
    let r = rand() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }

  function heightToTerrain(h) {
    if (h < 0.28) return "deep";
    if (h < 0.38) return "ocean";
    if (h < 0.43) return "shore";
    if (h < 0.55) return "plain";
    if (h < 0.68) return "forest";
    if (h < 0.78) return "hill";
    if (h < 0.9) return "mountain";
    return "snow";
  }

  function shadeColor(rgb, factor) {
    return [
      Math.min(255, Math.max(0, Math.round(rgb[0] * factor))),
      Math.min(255, Math.max(0, Math.round(rgb[1] * factor))),
      Math.min(255, Math.max(0, Math.round(rgb[2] * factor))),
    ];
  }

  function randomSeedString() {
    const words = [
      "ember", "frost", "shadow", "thorn", "azure", "iron", "moon", "dusk",
      "vale", "storm", "rune", "ash", "wild", "crystal", "night", "dawn",
    ];
    const a = words[Math.floor(Math.random() * words.length)];
    const b = words[Math.floor(Math.random() * words.length)];
    const n = Math.floor(Math.random() * 9000 + 1000);
    return `${a}-${b}-${n}`;
  }

  // ── Map generation ──
  function generateWorld(seedStr, size, scale) {
    const seedNum = hashSeed(seedStr);
    const noise = createPerlin(seedNum);
    const grid = [];

    // Offset so same seed looks different at different scales
    const ox = noise.rand() * 1000;
    const oy = noise.rand() * 1000;

    for (let y = 0; y < size; y++) {
      const row = [];
      for (let x = 0; x < size; x++) {
        // Domain warping for more organic continents
        const wx = x * scale + ox;
        const wy = y * scale + oy;
        const warp = noise.fbm(wx * 0.8, wy * 0.8, 3, 2, 0.5);
        const h = noise.fbm(wx + warp * 0.4, wy + warp * 0.4, 5, 2.1, 0.5);

        // Radial falloff → island-ish continents
        const cx = (x / size - 0.5) * 2;
        const cy = (y / size - 0.5) * 2;
        const dist = Math.sqrt(cx * cx + cy * cy);
        const falloff = Math.max(0, 1 - dist * 0.72);
        const height = h * 0.72 + falloff * 0.28;

        const terrainId = heightToTerrain(height);
        const terrain = TERRAIN[terrainId];

        // Cell-local RNG from position + seed
        const cellSeed = hashSeed(`${seedNum}:${x},${y}`);
        const cellRand = Perlin.mulberry32(cellSeed);

        const name = pick(terrain.names, cellRand);
        const desc = pick(terrain.desc, cellRand);

        // Pre-roll discovery content (revealed on explore)
        let resource = null;
        let quest = null;
        const roll = cellRand();
        // ~55% chance of something interesting on land-ish tiles, less on deep water
        const chance =
          terrainId === "deep" ? 0.35 :
          terrainId === "ocean" ? 0.4 :
          0.62;

        if (roll < chance * 0.55) {
          resource = weightedPick(RESOURCES[terrainId], cellRand);
        } else if (roll < chance) {
          quest = pick(QUESTS, cellRand);
        }

        // Moisture secondary noise for color variation
        const moist = noise.noise2D(wx * 1.7 + 50, wy * 1.7 + 50);

        row.push({
          x,
          y,
          height,
          moist,
          terrainId,
          name,
          desc,
          resource,
          quest,
          explored: false,
          foundResource: null,
          foundQuest: null,
          emptyFlavor: pick(EMPTY_FLAVOR, cellRand),
        });
      }
      grid.push(row);
    }

    return { grid, seedNum, noise };
  }

  function createWorld() {
    let seed = seedInput.value.trim();
    if (!seed) {
      seed = randomSeedString();
      seedInput.value = seed;
    }

    const size = parseInt(mapSizeSelect.value, 10) || 48;
    const scale = parseFloat(noiseScaleInput.value) || 0.07;

    canvas.classList.add("generating");
    btnGenerate.disabled = true;

    // Brief delay so UI can show generating state
    requestAnimationFrame(() => {
      setTimeout(() => {
        const result = generateWorld(seed, size, scale);

        state.size = size;
        state.seed = seed;
        state.seedNum = result.seedNum;
        state.scale = scale;
        state.grid = result.grid;
        state.selected = null;
        state.inventory = {};
        state.stats = { explored: 0, resources: 0, quests: 0 };
        state.hover = null;
        state.animProgress = 0;

        seedDisplay.textContent = `Семя: ${seed}`;
        mapHint.classList.add("hidden");
        btnDownload.disabled = false;
        updateStats();
        renderInventory();
        showDetail(null);
        clearLog();
        logEvent(`Мир «${seed}» сотворён. Размер ${size}×${size}.`, "explore");
        toast("Мир создан. Отправляйтесь исследовать!");

        startRevealAnimation();
        canvas.classList.remove("generating");
        btnGenerate.disabled = false;
      }, 80);
    });
  }

  function startRevealAnimation() {
    const token = ++state.revealToken;
    const start = performance.now();
    const duration = 900;

    function frame(now) {
      if (token !== state.revealToken) return;
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      state.animProgress = 1 - Math.pow(1 - t, 3);
      drawMap();
      if (t < 1) requestAnimationFrame(frame);
      else state.animProgress = 1;
    }
    requestAnimationFrame(frame);
  }

  // ── Rendering ──
  function cellPixelSize() {
    return canvas.width / state.size;
  }

  function drawMap() {
    if (!state.grid) {
      ctx.fillStyle = "#0c0e14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const size = state.size;
    const ps = cellPixelSize();
    const progress = state.animProgress;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Diagonal wipe reveal
        const revealOrder = (x + y) / (size * 2 - 2);
        if (revealOrder > progress + 0.02) continue;

        const cell = state.grid[y][x];
        const terrain = TERRAIN[cell.terrainId];
        let rgb = terrain.color.slice();

        // Height / moisture shading
        const hShade = 0.85 + cell.height * 0.3;
        const mShade = 0.92 + cell.moist * 0.16;
        rgb = shadeColor(rgb, hShade * mShade);

        // Fog of war for unexplored
        const fogged = state.fogOfWar && !cell.explored;
        if (fogged) {
          // Silhouette: darken heavily, slight blue cast
          rgb = [
            Math.round(rgb[0] * 0.18 + 8),
            Math.round(rgb[1] * 0.18 + 10),
            Math.round(rgb[2] * 0.22 + 16),
          ];
        }

        // Fade-in for cells just appearing
        const localFade = Math.min(1, Math.max(0, (progress - revealOrder) * 8));
        ctx.globalAlpha = localFade;
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(x * ps, y * ps, Math.ceil(ps) + 0.5, Math.ceil(ps) + 0.5);

        // Explored gold corner mark
        if (cell.explored && !fogged) {
          ctx.fillStyle = "rgba(212, 175, 88, 0.55)";
          const m = Math.max(1.5, ps * 0.18);
          ctx.beginPath();
          ctx.moveTo(x * ps, y * ps);
          ctx.lineTo(x * ps + m, y * ps);
          ctx.lineTo(x * ps, y * ps + m);
          ctx.closePath();
          ctx.fill();
        }

        // Quest marker (if explored and has quest)
        if (cell.explored && cell.foundQuest) {
          ctx.fillStyle = "rgba(195, 155, 211, 0.9)";
          const cx = x * ps + ps * 0.5;
          const cy = y * ps + ps * 0.5;
          const r = Math.max(1.2, ps * 0.14);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (cell.explored && cell.foundResource) {
          ctx.fillStyle = "rgba(125, 206, 160, 0.85)";
          const cx = x * ps + ps * 0.5;
          const cy = y * ps + ps * 0.5;
          const r = Math.max(1, ps * 0.11);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;

    // Hover highlight
    if (state.hover && progress >= 1) {
      const { x, y } = state.hover;
      ctx.strokeStyle = "rgba(232, 213, 163, 0.85)";
      ctx.lineWidth = Math.max(1, ps * 0.12);
      ctx.strokeRect(x * ps + 0.5, y * ps + 0.5, ps - 1, ps - 1);
    }

    // Selection
    if (state.selected && progress >= 1) {
      const { x, y } = state.selected;
      ctx.strokeStyle = "rgba(212, 175, 88, 1)";
      ctx.lineWidth = Math.max(1.5, ps * 0.16);
      ctx.strokeRect(x * ps + 1, y * ps + 1, ps - 2, ps - 2);
      ctx.strokeStyle = "rgba(110, 198, 255, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x * ps - 1, y * ps - 1, ps + 2, ps + 2);
    }
  }

  /** High-res export without UI chrome (or with legend strip) */
  function renderExportCanvas() {
    const size = state.size;
    const cellPx = 16;
    const pad = 48;
    const legendH = 56;
    const titleH = 52;
    const w = size * cellPx + pad * 2;
    const h = size * cellPx + pad * 2 + titleH + legendH;

    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const c = off.getContext("2d");

    // Background parchment-dark
    const grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#12161f");
    grad.addColorStop(1, "#0a0c12");
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);

    // Title
    c.fillStyle = "#e8d5a3";
    c.font = "bold 22px Cinzel, Georgia, serif";
    c.textAlign = "center";
    c.fillText("Атлас Забытых Земель", w / 2, 32);
    c.fillStyle = "#9a9488";
    c.font = "14px Crimson Pro, Georgia, serif";
    c.fillText(`Семя: ${state.seed}  ·  ${size}×${size}  ·  исследовано ${state.stats.explored}`, w / 2, 50);

    // Border
    const mapX = pad;
    const mapY = pad + titleH - 8;
    c.strokeStyle = "rgba(212, 175, 88, 0.45)";
    c.lineWidth = 2;
    c.strokeRect(mapX - 4, mapY - 4, size * cellPx + 8, size * cellPx + 8);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = state.grid[y][x];
        const terrain = TERRAIN[cell.terrainId];
        let rgb = terrain.color.slice();
        const hShade = 0.85 + cell.height * 0.3;
        const mShade = 0.92 + cell.moist * 0.16;
        rgb = shadeColor(rgb, hShade * mShade);

        // Export shows true terrain always; explored get a subtle mark
        c.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        c.fillRect(mapX + x * cellPx, mapY + y * cellPx, cellPx, cellPx);

        if (cell.explored) {
          c.fillStyle = "rgba(212, 175, 88, 0.5)";
          c.fillRect(mapX + x * cellPx, mapY + y * cellPx, 4, 4);
        }
        if (cell.foundQuest) {
          c.fillStyle = "rgba(195, 155, 211, 0.95)";
          c.beginPath();
          c.arc(mapX + x * cellPx + cellPx / 2, mapY + y * cellPx + cellPx / 2, 2.5, 0, Math.PI * 2);
          c.fill();
        } else if (cell.foundResource) {
          c.fillStyle = "rgba(125, 206, 160, 0.9)";
          c.beginPath();
          c.arc(mapX + x * cellPx + cellPx / 2, mapY + y * cellPx + cellPx / 2, 2, 0, Math.PI * 2);
          c.fill();
        }
      }
    }

    // Mini legend
    const legends = [
      ["deep", "Океан"],
      ["plain", "Равнины"],
      ["forest", "Лес"],
      ["mountain", "Горы"],
      ["snow", "Снег"],
    ];
    const ly = mapY + size * cellPx + 22;
    c.font = "12px Crimson Pro, Georgia, serif";
    c.textAlign = "left";
    let lx = pad;
    legends.forEach(([id, label]) => {
      const col = TERRAIN[id].color;
      c.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      c.fillRect(lx, ly, 12, 12);
      c.strokeStyle = "rgba(255,255,255,0.2)";
      c.strokeRect(lx, ly, 12, 12);
      c.fillStyle = "#9a9488";
      c.fillText(label, lx + 16, ly + 11);
      lx += 90;
    });

    return off;
  }

  function downloadMap() {
    if (!state.grid) return;
    const off = renderExportCanvas();
    const link = document.createElement("a");
    const safe = state.seed.replace(/[^\w\-]+/g, "_").slice(0, 40);
    link.download = `atlas-${safe}.png`;
    link.href = off.toDataURL("image/png");
    link.click();
    toast("Карта сохранена как PNG");
    logEvent("Карта экспортирована в PNG.", "explore");
  }

  // ── Interaction ──
  function canvasToCell(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (evt.clientX - rect.left) * scaleX;
    const py = (evt.clientY - rect.top) * scaleY;
    const ps = cellPixelSize();
    const x = Math.floor(px / ps);
    const y = Math.floor(py / ps);
    if (!state.grid || x < 0 || y < 0 || x >= state.size || y >= state.size) return null;
    return { x, y };
  }

  function selectCell(x, y) {
    state.selected = { x, y };
    const cell = state.grid[y][x];
    showDetail(cell);
    drawMap();
  }

  function showDetail(cell) {
    if (!cell) {
      detailPlaceholder.classList.remove("hidden");
      detailContent.classList.add("hidden");
      return;
    }

    detailPlaceholder.classList.add("hidden");
    detailContent.classList.remove("hidden");
    // re-trigger enter animation
    detailContent.style.animation = "none";
    void detailContent.offsetWidth;
    detailContent.style.animation = "";

    const terrain = TERRAIN[cell.terrainId];
    terrainBadge.textContent = terrain.name;
    cellCoord.textContent = `[${cell.x}, ${cell.y}]`;

    if (cell.explored) {
      regionName.textContent = cell.name;
      regionDesc.textContent = cell.desc;
      btnExplore.disabled = true;
      btnExplore.textContent = "✓ Уже исследовано";
      exploreNote.textContent = "Эта земля уже отмечена в вашем атласе.";

      lootList.innerHTML = "";
      if (cell.foundResource) {
        resourceSection.classList.remove("hidden");
        const li = document.createElement("li");
        li.textContent = `${cell.foundResource.emoji} ${cell.foundResource.name}`;
        lootList.appendChild(li);
      } else {
        resourceSection.classList.add("hidden");
      }

      if (cell.foundQuest) {
        questSection.classList.remove("hidden");
        questTitle.textContent = cell.foundQuest.title;
        questText.textContent = cell.foundQuest.text;
      } else {
        questSection.classList.add("hidden");
      }
    } else {
      regionName.textContent = state.fogOfWar ? "??? " + terrain.name : cell.name;
      regionDesc.textContent = state.fogOfWar
        ? "Земля скрыта туманом войны. Исследуйте клетку, чтобы узнать её тайны."
        : cell.desc + " Исследуйте, чтобы найти ресурсы или квесты.";
      btnExplore.disabled = false;
      btnExplore.textContent = "🔍 Исследовать";
      exploreNote.textContent = "Шанс найти ресурс или квест зависит от типа местности.";
      resourceSection.classList.add("hidden");
      questSection.classList.add("hidden");
    }
  }

  function exploreSelected() {
    if (!state.selected || !state.grid) return;
    const { x, y } = state.selected;
    const cell = state.grid[y][x];
    if (cell.explored) return;

    cell.explored = true;
    state.stats.explored++;

    let modalHtml = "";
    let title = "Земля открыта";

    if (cell.resource) {
      cell.foundResource = cell.resource;
      addToInventory(cell.resource);
      state.stats.resources++;
      title = "Находка!";
      modalHtml = `
        <span class="loot-emoji">${cell.resource.emoji}</span>
        <p>В <strong>${cell.name}</strong> вы находите:</p>
        <p style="color:var(--success);font-family:var(--font-display);margin-top:0.4rem">${cell.resource.name}</p>
      `;
      logEvent(`${cell.resource.emoji} ${cell.resource.name} — ${cell.name} [${x},${y}]`, "resource");
      toast(`${cell.resource.emoji} ${cell.resource.name}`);
    } else if (cell.quest) {
      cell.foundQuest = cell.quest;
      state.stats.quests++;
      title = "Новый квест!";
      modalHtml = `
        <span class="loot-emoji">📜</span>
        <p class="quest-title">${cell.quest.title}</p>
        <p>${cell.quest.text}</p>
        <p style="margin-top:0.6rem;font-size:0.9rem;opacity:0.8">Регион: ${cell.name}</p>
      `;
      logEvent(`📜 Квест «${cell.quest.title}» — ${cell.name}`, "quest");
      toast(`Квест: ${cell.quest.title}`);
    } else {
      modalHtml = `
        <span class="loot-emoji">🧭</span>
        <p><strong>${cell.name}</strong></p>
        <p style="margin-top:0.5rem">${cell.emptyFlavor}</p>
        <p style="margin-top:0.5rem;font-size:0.95rem;opacity:0.75">${cell.desc}</p>
      `;
      logEvent(`Исследовано: ${cell.name} [${x},${y}]`, "explore");
    }

    updateStats();
    renderInventory();
    showDetail(cell);
    drawMap();
    openModal(title, modalHtml);

    // Pulse selection
    canvas.animate(
      [{ filter: "brightness(1)" }, { filter: "brightness(1.2)" }, { filter: "brightness(1)" }],
      { duration: 400, easing: "ease-out" }
    );
  }

  function addToInventory(resource) {
    if (!state.inventory[resource.id]) {
      state.inventory[resource.id] = {
        name: resource.name,
        emoji: resource.emoji,
        count: 0,
      };
    }
    state.inventory[resource.id].count++;
  }

  function renderInventory() {
    const keys = Object.keys(state.inventory);
    if (!keys.length) {
      inventoryEl.innerHTML = '<li class="inventory-empty">Пока пусто — отправляйтесь в путь</li>';
      return;
    }
    inventoryEl.innerHTML = keys
      .map((id) => {
        const item = state.inventory[id];
        return `<li><span>${item.emoji} ${item.name}</span><span class="qty">×${item.count}</span></li>`;
      })
      .join("");
  }

  function updateStats() {
    statExplored.textContent = state.stats.explored;
    statResources.textContent = state.stats.resources;
    statQuests.textContent = state.stats.quests;

    [statExplored, statResources, statQuests].forEach((el) => {
      el.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.2)" }, { transform: "scale(1)" }],
        { duration: 300, easing: "ease-out" }
      );
    });
  }

  function logEvent(text, type) {
    const p = document.createElement("p");
    p.className = `log-entry ${type || ""}`;
    const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    p.textContent = `[${time}] ${text}`;
    if (eventLog.querySelector(".muted")) eventLog.innerHTML = "";
    eventLog.prepend(p);
    while (eventLog.children.length > 40) eventLog.removeChild(eventLog.lastChild);
  }

  function clearLog() {
    eventLog.innerHTML = "";
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalBackdrop.classList.remove("hidden");
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
  }

  // ── Particles ──
  function spawnParticles() {
    const host = document.getElementById("particles");
    if (!host) return;
    for (let i = 0; i < 36; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      p.style.left = Math.random() * 100 + "%";
      p.style.top = Math.random() * 100 + "%";
      p.style.setProperty("--dur", 3 + Math.random() * 5 + "s");
      p.style.setProperty("--delay", Math.random() * 6 + "s");
      host.appendChild(p);
    }
  }

  // ── Events ──
  btnGenerate.addEventListener("click", createWorld);
  btnDownload.addEventListener("click", downloadMap);
  btnRandomSeed.addEventListener("click", () => {
    seedInput.value = randomSeedString();
    seedInput.focus();
  });
  btnFogToggle.addEventListener("click", () => {
    state.fogOfWar = !state.fogOfWar;
    btnFogToggle.textContent = state.fogOfWar ? "🌫️ Туман войны" : "👁️ Туман снят";
    if (state.selected) {
      const { x, y } = state.selected;
      showDetail(state.grid[y][x]);
    }
    drawMap();
    toast(state.fogOfWar ? "Туман войны активен" : "Вся карта видна");
  });
  btnExplore.addEventListener("click", exploreSelected);
  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && document.activeElement === seedInput) createWorld();
    if ((e.key === "e" || e.key === "E" || e.key === "у" || e.key === "У") &&
        document.activeElement.tagName !== "INPUT" &&
        document.activeElement.tagName !== "SELECT") {
      exploreSelected();
    }
  });

  canvas.addEventListener("click", (e) => {
    if (!state.grid || state.animProgress < 1) return;
    const pos = canvasToCell(e);
    if (!pos) return;
    selectCell(pos.x, pos.y);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!state.grid || state.animProgress < 1) return;
    const pos = canvasToCell(e);
    const prev = state.hover;
    if (!pos) {
      if (state.hover) {
        state.hover = null;
        drawMap();
      }
      return;
    }
    if (!prev || prev.x !== pos.x || prev.y !== pos.y) {
      state.hover = pos;
      drawMap();
    }
  });

  canvas.addEventListener("mouseleave", () => {
    if (state.hover) {
      state.hover = null;
      drawMap();
    }
  });

  // Double-click to explore quickly
  canvas.addEventListener("dblclick", (e) => {
    if (!state.grid || state.animProgress < 1) return;
    const pos = canvasToCell(e);
    if (!pos) return;
    selectCell(pos.x, pos.y);
    exploreSelected();
  });

  // ── Init ──
  spawnParticles();
  seedInput.value = randomSeedString();
  drawMap();

  // Auto-generate first world for immediate play
  createWorld();
})();
