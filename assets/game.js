(async () => {
  /* ==========================
                 SHORTCUTS / UTILITIES
                 ========================== */

  const qid = (id) => document.getElementById(id);
  const createEl = (tag, cls) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    return el;
  };
  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /* ==========================
                 CONFIG
                 ========================== */
  const GAME_CONFIG = {
    goodRecordTotal: 11, // total unique "good" covers
    badRecordTotal: 126, // total unique "bad" covers
    goodChance: 0.03, // probability that a popped record is good
    popInterval: 1000, // ms between record pops
    startTime: 30, // seconds of game time
    gameOverPickLimit: 5, // max picks before game ends
  };

  /* ==========================
                 PRELOAD (with progress)
                 ========================== */
  const progressBar = document.getElementById("progress-bar");

  const preloadAssets = async () => {
    const paths = [
      "./assets/logo.webp",
      "./assets/crate-plastic--orange.webp",
      "./assets/crate-plastic--blue.webp",
      "./assets/crate-plastic--green.webp",
      "./assets/crate-plastic--red.webp",
      ...Array.from(
        { length: GAME_CONFIG.goodRecordTotal },
        (_, i) =>
          `./assets/covers-good--resized/cover-good-${String(i + 1).padStart(
            2,
            "0"
          )}.webp`
      ),
      ...Array.from(
        { length: GAME_CONFIG.badRecordTotal },
        (_, i) =>
          `./assets/covers-bad--resized/cover-bad-${String(i + 1).padStart(
            2,
            "0"
          )}.webp`
      ),
    ];

    let loaded = 0;
    const total = paths.length + 1; // +1 for fonts

    function updateProgress() {
      const percent = Math.round((loaded / total) * 100);
      if (progressBar) {
        progressBar.value = percent;
        progressBar.setAttribute("aria-valuenow", percent);
      }
    }

    const preloadImage = (src) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          updateProgress();
          res();
        };
        img.src = src;
      });

    await Promise.all([
      ...paths.map(preloadImage),
      document.fonts.ready.then(() => {
        loaded++;
        updateProgress();
      }),
    ]);
  };

  await preloadAssets();
  document.body.classList.remove("isLoading");
  document.body.style.touchAction = "manipulation";

  /* ==========================
                 DOM REFERENCES
                 ========================== */
  const crateContainerInner = document.querySelectorAll(
    ".crateContainer--inner"
  );
  const modalContainer = qid("modalContainer");
  const startModal = qid("startModal");
  const aboutModal = qid("aboutModal");
  const gameOverModal = qid("gameOverModal");
  const cratesContainer = qid("cratesContainer");
  const finalScoreTitle = qid("finalScoreTitle");
  const finalScoreCovers = qid("finalScoreCovers");
  const finalScoreMessage = qid("finalScoreMessage");

  const totalSpan = qid("total");
  const totalContainer = qid("scoreBoard--total");
  const timerSpan = qid("timer");
  const yearSpan = qid("currentYear");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  const startButton = qid("startButton");
  const openAboutButton = qid("openAboutButton");
  const closeAboutButton = qid("closeAboutButton");
  const restartButton = qid("restartButton");
  const cancelGameButton = qid("cancelGameButton");

  const decorationCar = qid("decoration--car");
  const decorationPepper = qid("decoration--pepper");
  const decorationSalt = qid("decoration--salt");
  const decorationPicture = qid("decoration--picture");
  const decorationMary = qid("decoration--mary");

  /* ==========================
       STATE
       ========================== */

  let crateElements = [];

  let state = {
    pickedRecords: [],
    goodRecord: 0,
    badRecord: 0,
    gameTime: GAME_CONFIG.startTime,
    gameActive: false,
    lastPopTime: 0,
    timerId: null,
    badCoverIndex: 0,
    lastScore: 0,
  };

  let preShuffledBadCovers = [];
  let preGeneratedGoodCovers = [];

  /* ==========================
         CRATES MODULE
         ========================== */
  function generateCrates() {
    crateElements = [];
    crateContainerInner.forEach((container, i) => {
      container.innerHTML = "";

      const recordBtn = document.createElement("button");
      recordBtn.className = "record";
      recordBtn.dataset.index = i;
      recordBtn.setAttribute("title", "Select this record");

      const recordImg = document.createElement("img");
      recordImg.className = "record-img";
      recordBtn.appendChild(recordImg);

      const cover = document.createElement("div");
      cover.className = "crate-cover";
      const coverImg = document.createElement("img");
      coverImg.className = "record-img";
      cover.appendChild(coverImg);

      const box = document.createElement("div");
      box.className = "crate-box";

      container.append(recordBtn, cover, box);

      crateElements.push({
        crateEl: container,
        recordEl: recordBtn,
        imgEl: recordImg,
        coverEl: cover,
        coverImgEl: coverImg,
        isLocked: false,
        type: null,
        popTimeout: null,
        popId: null,
      });
    });
  }

  // Function to generate and shuffle the bad covers once
  function generateBadCovers() {
    preShuffledBadCovers = Array.from(
      { length: GAME_CONFIG.badRecordTotal },
      (_, i) =>
        `./assets/covers-bad--resized/cover-bad-${String(i + 1).padStart(
          2,
          "0"
        )}.webp`
    );
  }

  function generateGoodCovers() {
    preGeneratedGoodCovers = Array.from(
      { length: GAME_CONFIG.goodRecordTotal },
      (_, i) =>
        `./assets/covers-good--resized/cover-good-${String(i + 1).padStart(
          2,
          "0"
        )}.webp`
    );
  }

  /* ==========================
         GAME FLOW
         ========================== */
  function revealWhenReady(crate, record, hideAfter = GAME_CONFIG.popInterval) {
    const popId = Symbol();
    crate.popId = popId;
    crate.type = record.type;
    crate.imgEl.src = record.imageUrl;

    const reveal = () => {
      if (!state.gameActive || crate.popId !== popId) return;
      crate.recordEl.classList.add(`${record.type}-record`, "pop");
      crate.popTimeout = setTimeout(() => hideRecord(crate), hideAfter);
    };

    (crate.imgEl.decode ? crate.imgEl.decode() : Promise.resolve())
      .then(reveal)
      .catch(reveal);
  }

  function popRecord() {
    if (!state.gameActive) return;

    const spots = crateElements.filter((c) => !c.isLocked);
    if (!spots.length) return;

    const crate = spots[Math.floor(Math.random() * spots.length)];
    crate.isLocked = true;

    const isGood = Math.random() < GAME_CONFIG.goodChance;
    let imageUrl, type;

    if (isGood) {
      const randomIndex = Math.floor(
        Math.random() * preGeneratedGoodCovers.length
      );
      imageUrl = preGeneratedGoodCovers[randomIndex];
      type = "good";
    } else {
      imageUrl = preShuffledBadCovers[state.badCoverIndex];
      type = "bad";
      state.badCoverIndex =
        (state.badCoverIndex + 1) % preShuffledBadCovers.length;
    }

    revealWhenReady(crate, {
      imageUrl: imageUrl,
      type: type,
    });
  }

  function hideRecord(crate) {
    crate.recordEl.addEventListener(
      "transitionend",
      (e) => {
        if (e.propertyName !== "transform") return;
        crate.recordEl.classList.remove("good-record", "bad-record");
        crate.isLocked = false;
      },
      { once: true }
    );
    crate.recordEl.classList.remove("pop");
  }

  function updateScoreboard() {
    const currentScore = state.goodRecord + state.badRecord;

    if (totalSpan) {
      totalSpan.textContent = currentScore;
    }

    // Only animate if score actually increased
    if (currentScore > state.lastScore && totalContainer) {
      totalContainer.classList.remove("animate");
      requestAnimationFrame(() => {
        totalContainer.classList.add("animate");
      });
    }

    if (timerSpan) {
      timerSpan.textContent = state.gameTime;
    }

    state.lastScore = currentScore; // update tracker
  }

  function checkGameOver() {
    if (
      state.goodRecord + state.badRecord >= GAME_CONFIG.gameOverPickLimit ||
      state.gameTime <= 0
    ) {
      state.gameActive = false;
      showGameOver();
    }
  }

  /* ==========================
         UI / Helpers
         ========================== */
  function addAnimationOnInteraction(el, animationClass) {
    if (!el) return;

    el.addEventListener("pointerdown", () => {
      el.classList.add(animationClass);
    });
  }

  addAnimationOnInteraction(decorationCar, "roll");
  addAnimationOnInteraction(decorationSalt, "fall");
  addAnimationOnInteraction(decorationPepper, "fall");
  addAnimationOnInteraction(decorationPicture, "fall");
  addAnimationOnInteraction(decorationMary, "fall");

  function showGameOver() {
    clearInterval(state.timerId);
    finalScoreTitle.innerHTML = "";
    finalScoreMessage.innerHTML = "";
    finalScoreCovers.innerHTML = "";

    if (state.goodRecord === 0 && state.badRecord === 0) {
      finalScoreTitle.innerHTML =
        "<h2>Another typical day in the op-shop!</h2>";
      finalScoreMessage.innerHTML =
        "<p>You didn't find anything worth buying, but at least you didn't waste any money.</p>";
      state.pickedRecords = [];
    } else if (state.goodRecord === 0) {
      finalScoreTitle.innerHTML = "<h2>What a waste of money!</h2>";
      finalScoreMessage.innerHTML = "<p>All you bought was crap.</p>";
    } else if (state.goodRecord === 1 && state.badRecord === 0) {
      finalScoreTitle.innerHTML = "<h2>How'd you go?</h2>";
      finalScoreMessage.innerHTML =
        "<p>You actually found something half-decent for a change, but it has the wrong record inside! Oh well.</p>";
    } else if (state.goodRecord === 1 && state.badRecord >= 0) {
      finalScoreTitle.innerHTML = "<h2>How'd you go?</h2>";
      finalScoreMessage.innerHTML =
        "<p>You actually found one decent record amongst the crap, but there is a scratch across the best track! Oh well.</p>";
    } else if (state.goodRecord >= 1) {
      finalScoreTitle.innerHTML = "<h2>Any luck?</h2>";
      finalScoreMessage.innerHTML = `<p>You found ${state.goodRecord} good records amongst all that crap - pity they're in unplayable condition! What did you expect?!</p>`;
    }

    state.pickedRecords.forEach((r) => {
      const d = createEl("div", `picked-record ${r.type}-cover`);
      const img = createEl("img");
      img.src = r.imageUrl;
      d.appendChild(img);
      finalScoreCovers.appendChild(d);
    });
    modalContainer.classList.add("visible");
    gameOverModal.style.display = "flex";
  }

  function handleRecordClick(crate) {
    if (!state.gameActive || !crate.recordEl.classList.contains("pop")) return;

    crate.recordEl.classList.remove("pop");
    clearTimeout(crate.popTimeout);

    state.pickedRecords.push({ type: crate.type, imageUrl: crate.imgEl.src });
    crate.type === "good" ? state.goodRecord++ : state.badRecord++;
    if (navigator.vibrate) navigator.vibrate(30);
    updateScoreboard();
    checkGameOver();
    hideRecord(crate);
  }

  /* ==========================
         GAME CONTROL
         ========================== */
  function startGame() {
    state.goodRecord = 0;
    state.badRecord = 0;
    state.gameTime = GAME_CONFIG.startTime;
    state.pickedRecords = [];
    state.gameActive = true;
    state.badCoverIndex = 0;

    startModal.style.display = "none";
    modalContainer.classList.remove("visible");
    gameOverModal.style.display = "none";

    crateElements.forEach((c) => {
      c.recordEl.classList.remove("pop", "good-record", "bad-record");
      clearTimeout(c.popTimeout);
      c.isLocked = false;
      c.popId = null;
      c.coverImgEl.src = "";
      c.coverEl.classList.remove("bad-record");
    });

    shuffleArray(preShuffledBadCovers);

    const cratesCount = crateElements.length;
    for (let i = 0; i < cratesCount; i++) {
      const crate = crateElements[i];
      crate.coverImgEl.src = preShuffledBadCovers[state.badCoverIndex];
      crate.coverEl.classList.add("bad-record");

      state.badCoverIndex =
        (state.badCoverIndex + 1) % preShuffledBadCovers.length;
    }

    updateScoreboard();
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      state.gameTime--;
      updateScoreboard();
      checkGameOver();
    }, 1000);

    state.lastPopTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function cancelGame() {
    state.gameActive = false;
    clearInterval(state.timerId);
    crateElements.forEach((c) => {
      clearTimeout(c.popTimeout);
      c.recordEl.classList.remove("pop");
      c.isLocked = false;
      c.popId = null;
    });
    showGameOver();
  }

  function aboutGameOpen() {
    startModal.classList.add("modal-hidden");
    aboutModal.classList.remove("modal-hidden");
    aboutModal.classList.add("modal-visible");
  }

  function aboutGameClose() {
    startModal.classList.remove("modal-hidden");
    aboutModal.classList.add("modal-hidden");
    aboutModal.classList.remove("modal-visible");
  }

  function gameLoop(ts) {
    if (!state.gameActive) {
      return;
    }
    if (ts - state.lastPopTime > GAME_CONFIG.popInterval) {
      popRecord();
      state.lastPopTime = ts;
    }
    requestAnimationFrame(gameLoop);
  }

  /* ==========================
         EVENT BINDING
         ========================== */
  startButton.addEventListener("click", () => {
    if (typeof gtag === "function") {
      gtag("event", "game_start", {
        event_category: "Game Flow",
        event_label: "Start Button Click",
      });
    }
    startGame();
  });

  openAboutButton.addEventListener("click", () => {
    if (typeof gtag === "function") {
      gtag("event", "game_about_open", {
        event_category: "Game Flow",
        event_label: "About Button Open Click",
      });
    }
    aboutGameOpen();
  });

  closeAboutButton.addEventListener("click", () => {
    if (typeof gtag === "function") {
      gtag("event", "game_about_close", {
        event_category: "Game Flow",
        event_label: "Close About Button Click",
      });
    }
    aboutGameClose();
  });

  restartButton.addEventListener("click", () => {
    if (typeof gtag === "function") {
      gtag("event", "game_restart", {
        event_category: "Game Flow",
        event_label: "Restart Button Click",
      });
    }
    startGame();
  });

  cancelGameButton.addEventListener("click", () => {
    if (typeof gtag === "function") {
      gtag("event", "game_give_up", {
        event_category: "Game Flow",
        event_label: "Give Up Button Click",
      });
    }
    cancelGame();
  });

  // Add a single listener to the parent container
  cratesContainer.addEventListener(
    "pointerdown",
    (e) => {
      const recordEl = e.target.closest(".record");
      if (recordEl) {
        const crateIndex = parseInt(recordEl.dataset.index);
        const crate = crateElements[crateIndex];
        handleRecordClick(crate, e);
      }
    },
    {
      passive: true,
    }
  );

  cratesContainer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const recordEl = e.target.closest(".record");
      if (recordEl) {
        const crateIndex = parseInt(recordEl.dataset.index);
        const crate = crateElements[crateIndex];
        handleRecordClick(crate, e);
      }
    }
  });

  /* ==========================
   INIT
   ========================== */
  generateCrates();
  generateBadCovers();
  generateGoodCovers();
  gameLoop(0);
})();
