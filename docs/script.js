(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const DEBUG = new URLSearchParams(window.location.search).has("debug");
  const CACHE_BUST = Date.now().toString(36);

  function setNoScroll(enabled) {
    document.body.classList.toggle("no-scroll", enabled);
  }

  function debugLog(...args) {
    if (!DEBUG) return;
    // eslint-disable-next-line no-console
    console.log("[VII-debug]", ...args);
  }

  function summarizeVideo(video) {
    if (!video) return {};
    const err = video.error;
    return {
      src: video.currentSrc || video.getAttribute("src"),
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      ended: video.ended,
      controls: video.controls,
      muted: video.muted,
      loop: video.loop,
      currentTime: Number.isFinite(video.currentTime) ? Number(video.currentTime.toFixed(3)) : video.currentTime,
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(3)) : video.duration,
      error: err ? { code: err.code, message: err.message } : null
    };
  }

  function attachVideoDebug(video, label) {
    if (!DEBUG || !video || video.dataset._dbg) return;
    video.dataset._dbg = "1";
    const events = ["loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "playing", "pause", "seeking", "seeked", "stalled", "waiting", "suspend", "error"];
    events.forEach((ev) => {
      video.addEventListener(ev, () => {
        debugLog(label, ev, summarizeVideo(video));
      });
    });
  }

  function primeFirstFrame(video, label) {
    // Some browsers keep a black frame until a tiny seek occurs.
    if (!video) return;
    const doPrime = () => {
      try {
        if (!Number.isFinite(video.duration) || video.duration <= 0) return;
        const t = Math.min(0.001, Math.max(0, video.duration - 0.001));
        video.currentTime = t;
        debugLog(label, "primeFirstFrame:seek", t);
      } catch (e) {
        debugLog(label, "primeFirstFrame:error", String(e));
      }
    };

    if (video.readyState >= 1) {
      doPrime();
    } else {
      video.addEventListener("loadedmetadata", doPrime, { once: true });
    }
  }

  function bustUrl(url) {
    if (!url) return url;
    const hasQuery = url.includes("?");
    return `${url}${hasQuery ? "&" : "?"}v=${CACHE_BUST}`;
  }

  function swapVideoSrc(video, url, label) {
    if (!video || !url) return;
    const next = bustUrl(url);
    try {
      video.pause();
    } catch (_) {}
    // Fully reset the media element to avoid Chromium demuxer edge cases when swapping sources.
    try {
      video.removeAttribute("src");
      video.load();
    } catch (_) {}
    video.src = next;
    try {
      video.load();
    } catch (_) {}
    debugLog(label || "swapVideoSrc", next, summarizeVideo(video));
  }

  // -----------------------------
  // Lightboxes / Modals
  // -----------------------------
  const imgLightbox = $("#img-lightbox");
  const imgLightboxImg = $("#img-lightbox-img");
  const imgLightboxClose = $("#img-lightbox-close");

  const videoLightbox = $("#video-lightbox");
  const videoLightboxPlayer = $("#video-lightbox-player");
  const videoLightboxClose = $("#video-lightbox-close");

  // Confirm modal (for viewing original/unmasked videos)
  const confirmModal = $("#confirm-modal");
  const confirmModalClose = $("#confirm-modal-close");
  const confirmCancel = $("#confirm-cancel");
  const confirmAccept = $("#confirm-accept");
  let pendingConfirm = null;

  function openImgLightbox(src, alt = "") {
    if (!src) return;
    imgLightboxImg.src = src;
    imgLightboxImg.alt = alt || "";
    imgLightbox.classList.add("active");
    setNoScroll(true);
  }

  function closeImgLightbox() {
    imgLightbox.classList.remove("active");
    imgLightboxImg.src = "";
    setNoScroll(false);
  }

  function openVideoLightbox(sourceVideo) {
    const src = sourceVideo?.currentSrc || sourceVideo?.getAttribute?.("src");
    if (!src) return;
    videoLightboxPlayer.src = src;
    // Best-effort: sync time
    try {
      videoLightboxPlayer.currentTime = sourceVideo.currentTime || 0;
    } catch (_) {}
    videoLightbox.classList.add("active");
    setNoScroll(true);
    sourceVideo.pause?.();
    videoLightboxPlayer.play?.();
  }

  function closeVideoLightbox() {
    videoLightbox.classList.remove("active");
    setNoScroll(false);
    try {
      videoLightboxPlayer.pause();
      videoLightboxPlayer.removeAttribute("src");
      videoLightboxPlayer.load();
    } catch (_) {}
  }

  function openConfirmModal(onAccept) {
    pendingConfirm = typeof onAccept === "function" ? onAccept : null;
    confirmModal?.classList.add("active");
    setNoScroll(true);
  }

  function closeConfirmModal() {
    confirmModal?.classList.remove("active");
    setNoScroll(false);
    pendingConfirm = null;
  }

  imgLightboxClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeImgLightbox();
  });
  imgLightbox?.addEventListener("click", (e) => {
    if (e.target === imgLightbox) closeImgLightbox();
  });

  videoLightboxClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeVideoLightbox();
  });
  videoLightbox?.addEventListener("click", (e) => {
    if (e.target === videoLightbox) closeVideoLightbox();
  });

  confirmModalClose?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeConfirmModal();
  });
  confirmCancel?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeConfirmModal();
  });
  confirmAccept?.addEventListener("click", (e) => {
    e.stopPropagation();
    const fn = pendingConfirm;
    closeConfirmModal();
    try {
      fn?.();
    } catch (_) {}
  });
  confirmModal?.addEventListener("click", (e) => {
    if (e.target === confirmModal) closeConfirmModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (confirmModal?.classList.contains("active")) closeConfirmModal();
    if (videoLightbox?.classList.contains("active")) closeVideoLightbox();
    if (imgLightbox?.classList.contains("active")) closeImgLightbox();
  });

  // -----------------------------
  // Helpers for demo rendering
  // -----------------------------
  const LABELS = {
    baseline: "Baseline output video",
    ours: "VII output video"
  };

  function createSensitiveOverlay(text) {
    const overlay = document.createElement("div");
    overlay.className = "sensitive-overlay";
    overlay.innerHTML = `<div class="badge"><i class="fa fa-lock" aria-hidden="true"></i><span>${text || "Sensitive media hidden"}</span></div>`;
    return overlay;
  }

  function createImageTile(label, src, alt) {
    const tile = document.createElement("div");
    tile.className = "image-tile";

    const badge = document.createElement("div");
    badge.className = "tile-label";
    badge.textContent = label;

    const img = document.createElement("img");
    img.className = "img zoomable";
    img.loading = "lazy";
    img.src = src;
    img.alt = alt || label;
    img.addEventListener("click", () => openImgLightbox(img.currentSrc || img.src, img.alt));

    tile.appendChild(img);
    tile.appendChild(badge);
    return tile;
  }

  function createVideoTile(label, src, options = {}) {
    const tile = document.createElement("div");
    tile.className = "video-tile";

    const badge = document.createElement("div");
    badge.className = "tile-label";
    badge.textContent = label;

    const video = document.createElement("video");
    // Do not bust URL for initial preview; allow browser caching.
    video.src = src;
    video.playsInline = true;
    video.preload = "metadata";
    video.muted = true;
    video.autoplay = !!options.autoplay;
    video.loop = !!options.loop;
    video.controls = !!options.controls;
    if (options.blurred) video.classList.add("blurred-preview");

    // Click: toggle play/pause only for preview mode.
    // When controls are enabled (original mode), let the native controls handle interaction.
    video.addEventListener("click", () => {
      if (video.controls) return;
      if (!video.paused) video.pause();
      else video.play().catch(() => {});
    });

    attachVideoDebug(video, `video:${label}`);

    const actions = document.createElement("div");
    actions.className = "tile-actions";

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "icon-btn";
    expandBtn.title = "Expand";
    expandBtn.innerHTML = `<i class="fa fa-expand" aria-hidden="true"></i>`;
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openVideoLightbox(video);
    });

    const muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "icon-btn";
    muteBtn.title = "Mute / unmute";
    muteBtn.innerHTML = `<i class="fa fa-volume-off" aria-hidden="true"></i>`;
    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      video.muted = !video.muted;
      muteBtn.innerHTML = `<i class="fa ${video.muted ? "fa-volume-off" : "fa-volume-up"}" aria-hidden="true"></i>`;
    });

    actions.appendChild(expandBtn);
    actions.appendChild(muteBtn);

    tile.appendChild(video);
    tile.appendChild(badge);
    tile.appendChild(actions);
    if (options.overlayText) tile.appendChild(createSensitiveOverlay(options.overlayText));
    return { tile, video, actions };
  }

  function createRefusalTile(aspectRatio) {
    const tile = document.createElement("div");
    tile.className = "refusal-tile";
    if (aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0) {
      tile.style.setProperty("--refusal-ar", String(aspectRatio));
    }
    tile.textContent = "Refusal";
    return tile;
  }

  const VII_TEXT_PROMPT = "Generate the video based on the visual instructions and text description shown in the image.";

  const _textCache = new Map();
  async function loadTextMaybe(url) {
    if (!url) return "";
    const key = bustUrl(url);
    if (_textCache.has(key)) return _textCache.get(key);
    const p = fetch(key, { cache: "no-cache" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => (t || "").trim());
    _textCache.set(key, p);
    return p;
  }

  function createPromptCell(label, text) {
    const cell = document.createElement("div");
    cell.className = "cell prompt-cell";
    const title = document.createElement("div");
    title.className = "prompt-title";
    title.textContent = label || "Text";
    const box = document.createElement("div");
    box.className = "prompt-box";
    if (label) box.setAttribute("aria-label", label);
    if (!text) {
      box.innerHTML = `<div class="hint">(empty)</div>`;
    } else {
      box.textContent = text;
    }
    cell.appendChild(title);
    cell.appendChild(box);
    return { cell, box };
  }

  function renderDemos(data) {
    const root = $("#demos-root");
    if (!root) return;
    root.innerHTML = "";

    if (!data?.groups?.length) {
      root.innerHTML = `<div class="card"><p class="muted">No demos found.</p></div>`;
      return;
    }

    data.groups.forEach((group) => {
      const groupEl = document.createElement("div");
      groupEl.className = "demo-group";

      const title = document.createElement("h3");
      title.className = "demo-group-title";
      title.textContent = group.title || "Demos";

      const disclaimer = document.createElement("div");
      disclaimer.className = "demo-disclaimer";
      disclaimer.innerHTML = `<i class="fa fa-exclamation-triangle" aria-hidden="true"></i> <span>${group.disclaimer || data.notice || ""}</span>`;

      const grid = document.createElement("div");
      grid.className = "demo-grid";

      (group.samples || []).forEach((sample) => {
        const card = document.createElement("article");
        card.className = "demo-card";

        const body = document.createElement("div");
        body.className = "demo-body";

        const variants = sample.variants || [];
        if (!variants.length) {
          card.appendChild(body);
          grid.appendChild(card);
          return;
        }

        const catId = (group.id || "").toLowerCase();
        const isIll = catId === "ill";

        // Model selector (only if multiple variants).
        const modelRow = document.createElement("div");
        modelRow.className = "model-row";

        const selectedPill = document.createElement("div");
        selectedPill.className = "model-pill";
        selectedPill.innerHTML = `<span>Model</span>`;

        const selectWrap = document.createElement("div");
        selectWrap.className = "model-select-wrap";
        const select = document.createElement("select");
        select.className = "model-select";
        select.setAttribute("aria-label", "Select model");

        variants.forEach((v, idx) => {
          const opt = document.createElement("option");
          opt.value = String(idx);
          opt.textContent = v.llm_display || "Default";
          select.appendChild(opt);
        });

        if (variants.length === 1) {
          const only = variants[0];
          // If there is no explicit model label, hide the entire model row.
          if (only.llm_display) {
            selectedPill.innerHTML = `<span>Model</span> <span style="opacity:.65">·</span> <span>${only.llm_display}</span>`;
            modelRow.appendChild(selectedPill);
          }
        } else {
          modelRow.appendChild(selectedPill);
          selectWrap.appendChild(select);
          modelRow.appendChild(selectWrap);
        }
        if (modelRow.childNodes.length) body.appendChild(modelRow);

        const variantHost = document.createElement("div");
        body.appendChild(variantHost);

        function renderVariant(variant, baselinePromptText) {
          variantHost.innerHTML = "";

          const vids = variant.videos || {};

          const rowWrap = document.createElement("div");
          rowWrap.className = "sample-row-wrap";

          const row = document.createElement("div");
          row.className = "sample-row";

          // Col 1: input image
          if (sample.images?.input) {
            const t = createImageTile("Input image", sample.images.input, "Input image");
            t.classList.add("cell");
            row.appendChild(t);
          } else {
            row.appendChild(document.createElement("div")).className = "cell";
          }

          // Col 2: unsafe text prompt (baseline prompt, optional)
          row.appendChild(createPromptCell("Unsafe text prompt", baselinePromptText || "").cell);

          // Col 3: baseline output video / refusal
          const baselineCell = document.createElement("div");
          baselineCell.className = "cell video-cell";
          if (vids.baseline) {
            const baseline = createVideoTile(LABELS.baseline, vids.baseline, { autoplay: true, loop: true, controls: false });
            baselineCell.appendChild(baseline.tile);
          } else {
            baselineCell.appendChild(createRefusalTile());
          }
          row.appendChild(baselineCell);

          // Col 4: VII image (attack image)
          if (sample.images?.attack) {
            const t = createImageTile("VII image", sample.images.attack, "VII image");
            t.classList.add("cell");
            row.appendChild(t);
          } else {
            row.appendChild(document.createElement("div")).className = "cell";
          }

          // Col 5: VII text prompt (fixed)
          row.appendChild(createPromptCell("VII text prompt", VII_TEXT_PROMPT).cell);

          // Col 6: VII output video (masked if available; no toggle for now)
          const oursCell = document.createElement("div");
          oursCell.className = "cell video-cell";

          // Ours preview selection (policy by category):
          // - ill: show ours directly
          // - sex/vio/hate: show oursmask only (never show ours)
          //
          // NOTE: Temporarily disable mask/original switching (kept below as commented code).
          const oursPreviewSrc = isIll ? vids.ours : vids.oursmask;
          const oursPreviewBlurred = false;
          let ours = null;
          if (oursPreviewSrc) {
            ours = createVideoTile(LABELS.ours, oursPreviewSrc, {
              autoplay: true,
              loop: true,
              controls: false,
              blurred: oursPreviewBlurred,
              overlayText: null
            });
            oursCell.appendChild(ours.tile);
          } else {
            // Should not happen if manifest builder enforces required fields,
            // but keep UI resilient if assets are missing.
            oursCell.appendChild(createRefusalTile());
          }

          // Sync refusal tile aspect ratio to ours preview (best-effort)
          if (!vids.baseline && ours?.video) {
            const refusal = baselineCell.querySelector(".refusal-tile");
            if (refusal) {
              ours.video.addEventListener(
                "loadedmetadata",
                () => {
                  const ar = ours.video.videoWidth && ours.video.videoHeight ? ours.video.videoWidth / ours.video.videoHeight : null;
                  if (ar) refusal.style.setProperty("--refusal-ar", String(ar));
                },
                { once: true }
              );
            }
          }

          /*
           * Temporarily disabled: mask/blur preview ↔ original (unmasked) switching UI.
           * Restore by re-enabling the toggle row below and switching oursPreviewBlurred logic.
           */
          // const toggleRow = document.createElement("div");
          // toggleRow.className = "toggle-row";
          // if (isSex) {
          //   const note = document.createElement("div");
          //   note.className = "preview-note";
          //   note.textContent = "Original (unmasked) viewing is disabled for Sexual Content demos.";
          //   toggleRow.appendChild(note);
          //   oursCell.appendChild(toggleRow);
          // } else {
          //   const toggleBtn = document.createElement("button");
          //   toggleBtn.type = "button";
          //   toggleBtn.className = "toggle-btn";
          //   toggleBtn.innerHTML = `<i class="fa fa-unlock-alt" aria-hidden="true"></i><span>View original (confirm)</span>`;
          //
          //   const loopLabel = document.createElement("label");
          //   loopLabel.className = "loop-toggle";
          //   loopLabel.style.display = "none";
          //   loopLabel.innerHTML = `<input type="checkbox" /> <span>Loop</span>`;
          //   const loopCheckbox = loopLabel.querySelector("input");
          //
          //   let mode = "preview"; // preview | original
          //   const previewSrc = oursPreviewSrc;
          //   const previewBlurred = oursPreviewBlurred;
          //
          //   function setToPreview() {
          //     mode = "preview";
          //     toggleBtn.innerHTML = `<i class="fa fa-unlock-alt" aria-hidden="true"></i><span>View original (confirm)</span>`;
          //     loopLabel.style.display = "none";
          //     loopCheckbox.checked = false;
          //
          //     ours.video.controls = false;
          //     ours.video.autoplay = true;
          //     ours.video.loop = true;
          //     ours.video.muted = true;
          //     ours.video.classList.toggle("blurred-preview", previewBlurred);
          //     const cur = ours.video.currentSrc || ours.video.getAttribute("src");
          //     if (!cur || !cur.includes(previewSrc)) {
          //       swapVideoSrc(ours.video, previewSrc, "swap->preview");
          //     } else {
          //       try { ours.video.load(); } catch (_) {}
          //     }
          //     ours.video.play().catch(() => {});
          //     debugLog("setToPreview", variant.llm_display || "(no-llm)", summarizeVideo(ours.video));
          //   }
          //
          //   function setToOriginal() {
          //     mode = "original";
          //     toggleBtn.innerHTML = `<i class="fa fa-lock" aria-hidden="true"></i><span>Back to masked</span>`;
          //     loopLabel.style.display = "inline-flex";
          //     ours.video.pause();
          //     ours.video.classList.remove("blurred-preview");
          //     ours.video.autoplay = false;
          //     ours.video.loop = false;
          //     ours.video.controls = true;
          //     ours.video.muted = true;
          //     const originalSrc = vids.ours;
          //     swapVideoSrc(ours.video, originalSrc, "swap->original");
          //     primeFirstFrame(ours.video, `original:${variant.llm_display || "(no-llm)"}`);
          //     debugLog("setToOriginal", variant.llm_display || "(no-llm)", summarizeVideo(ours.video));
          //   }
          //
          //   loopCheckbox.addEventListener("change", () => {
          //     if (mode !== "original") return;
          //     ours.video.loop = !!loopCheckbox.checked;
          //   });
          //
          //   toggleBtn.addEventListener("click", () => {
          //     if (mode === "original") {
          //       setToPreview();
          //       return;
          //     }
          //     openConfirmModal(() => setToOriginal());
          //   });
          //
          //   toggleRow.appendChild(toggleBtn);
          //   toggleRow.appendChild(loopLabel);
          //   oursCell.appendChild(toggleRow);
          // }

          row.appendChild(oursCell);

          rowWrap.appendChild(row);
          variantHost.appendChild(rowWrap);
        }

        let baselinePromptText = "";
        // Fire and forget; if missing, keep empty.
        loadTextMaybe(sample.baseline_prompt_path)
          .then((t) => {
            baselinePromptText = t || "";
            const idx = variants.length > 1 ? Number.parseInt(select.value || "0", 10) : 0;
            renderVariant(variants[idx] || variants[0], baselinePromptText);
          })
          .catch(() => {});

        // Initial render (prompt may be empty until fetched)
        renderVariant(variants[0], baselinePromptText);

        if (variants.length > 1) {
          select.addEventListener("change", () => {
            const idx = Number.parseInt(select.value, 10);
            const v = variants[idx] || variants[0];
            renderVariant(v, baselinePromptText);
          });
        }

        card.appendChild(body);
        grid.appendChild(card);
      });

      groupEl.appendChild(title);
      groupEl.appendChild(disclaimer);
      groupEl.appendChild(grid);
      root.appendChild(groupEl);
    });

    // Also enable zoom for static figures already in DOM
    $$(".zoomable").forEach((img) => {
      if (img.dataset._zoomBound) return;
      img.dataset._zoomBound = "1";
      img.addEventListener("click", () => openImgLightbox(img.currentSrc || img.src, img.alt));
    });
  }

  async function main() {
    const manifestUrl = document.currentScript?.dataset?.manifest || "data/manifest.json";
    try {
      const res = await fetch(manifestUrl, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
      const data = await res.json();
      renderDemos(data);
    } catch (err) {
      const root = $("#demos-root");
      if (root) {
        root.innerHTML = `<div class="card"><p class="muted">Failed to load demos: ${String(err?.message || err)}</p></div>`;
      }
    }
  }

  main();
})();

