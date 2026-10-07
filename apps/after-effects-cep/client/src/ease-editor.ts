import { bezierEditor, button, createElement, searchField, type I18n } from "@motion/ui-core";
import { curveProgress } from "./preset-gallery.js";
import { EASE_PRESETS, readEaseLibrary, writeEaseLibrary, validCurve, type EaseCurve } from "./ease-library.js";

export function createEaseEditor(doc: Document, options: {
  i18n: I18n; curve: EaseCurve; busy: boolean;
  onChange(curve: EaseCurve): void; onApply(): void;
}): { element: HTMLElement; dispose(): void } {
  const t = options.i18n.t;
  let curve = { x1: options.curve.x1, y1: options.curve.y1, x2: options.curve.x2, y2: options.curve.y2 };
  let storage: Storage | undefined;
  try { storage = doc.defaultView?.localStorage; } catch { /* storage is optional */ }
  let library = readEaseLibrary(storage);
  let favoritesOnly = false;
  let query = "";
  let alive = true;
  let raf = 0;
  const win = doc.defaultView;
  const root = createElement(doc, "div", "ch-ease-editor");
  const columns = createElement(doc, "div", "ch-ease-columns"); root.appendChild(columns);
  const editor = createElement(doc, "div", "ch-ease-main"); columns.appendChild(editor);
  const graphHeader = createElement(doc, "div", "ch-ease-graph-header");
  const curveName = createElement(doc, "span", "ch-ease-curve-name");
  graphHeader.appendChild(curveName);
  editor.appendChild(graphHeader);
  let disposeGraph: (() => void) | undefined;
  let setGraph: ((a: number, b: number, c: number, d: number) => void) | undefined;
  let playGraph: (() => void) | undefined;
  let cancelGraphPreview: (() => void) | undefined;
  const numeric: HTMLInputElement[] = [];
  const selectedButtons: { element: HTMLButtonElement; curve: EaseCurve }[] = [];
  function updateCurveName(): void {
    const selected = [...EASE_PRESETS, ...library.custom].find(p => JSON.stringify(p.curve) === JSON.stringify(curve));
    curveName.textContent = selected?.name ?? t("ease.customCurve");
  }
  function update(c: EaseCurve, graph = true, committedInput?: HTMLInputElement): void {
    curve = { ...c }; options.onChange(curve);
    if (graph) setGraph?.(c.x1, c.y1, c.x2, c.y2);
    numeric.forEach((input, i) => {
      // A numeric commit owns one draft. Other fields may still contain an
      // unfinished value or a visible error that must survive this update.
      if (committedInput && input !== committedInput) return;
      input.value = String([c.x1, c.y1, c.x2, c.y2][i]);
      input.setCustomValidity(""); input.removeAttribute("aria-invalid");
      const error = input.parentElement?.querySelector<HTMLElement>(".ch-field__error");
      if (error) { error.textContent = ""; error.hidden = true; }
    });
    selectedButtons.forEach(b => b.element.setAttribute("aria-pressed", String(JSON.stringify(b.curve) === JSON.stringify(curve))));
    updateCurveName();
  }
  editor.appendChild(bezierEditor(doc, {
    ...curve, label: t("tool.ease.name"), outHandleLabel: t("ease.curve.outHandle"), inHandleLabel: t("ease.curve.inHandle"),
    onDisposeReady: dispose => { disposeGraph = dispose; },
    onReady: setter => { setGraph = setter; },
    preview: { label: t("ease.preview"), progress: time => curveProgress(curve, time) },
    onPreviewReady: (play, cancel) => { playGraph = play; cancelGraphPreview = cancel; },
    onChange: (x1, y1, x2, y2) => update({ x1, y1, x2, y2 }, false)
  }));
  updateCurveName();
  const values = createElement(doc, "div", "ch-ease-values"); editor.appendChild(values);
  values.setAttribute("role", "group"); values.setAttribute("aria-label", t("ease.coordinates"));
  for (const key of ["x1", "y1", "x2", "y2"] as const) {
    const label = doc.createElement("label");
    label.appendChild(createElement(doc, "span", "ch-ease-coordinate-label", key.toUpperCase()));
    const input = doc.createElement("input"); input.type = "text"; input.inputMode = "decimal";
    input.min = key.startsWith("x") ? "0" : "-1"; input.max = key.startsWith("x") ? "1" : "2";
    input.value = String(curve[key]); input.setAttribute("aria-label", key.toUpperCase());
    input.title = `${key.toUpperCase()} · ${t(key.endsWith("1") ? "ease.curve.outHandle" : "ease.curve.inHandle")}`;
    const error = createElement(doc, "span", "ch-field__error");
    error.id = `ease-${key}-error`; error.hidden = true; error.setAttribute("aria-live", "polite");
    input.setAttribute("aria-describedby", error.id);
    input.addEventListener("input", () => cancelGraphPreview?.());
    input.addEventListener("focus", () => cancelGraphPreview?.());
    input.addEventListener("change", () => {
      const next = { ...curve, [key]: Number(input.value.replace(",", ".")) };
      if (input.value.trim() && validCurve(next)) { input.setCustomValidity(""); update(next, true, input); }
      else { input.setCustomValidity(t("ease.invalid")); input.setAttribute("aria-invalid", "true"); error.textContent = t("ease.invalid"); error.hidden = false; }
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") { input.value = String(curve[key]); input.setCustomValidity(""); input.removeAttribute("aria-invalid"); error.hidden = true; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault(); cancelGraphPreview?.();
        const parsed = Number(input.value.replace(",", "."));
        const step = e.altKey ? 0.001 : e.shiftKey ? 0.1 : 0.01;
        const current = input.value.trim() && Number.isFinite(parsed) ? parsed : curve[key];
        const value = Math.round(Math.max(Number(input.min), Math.min(Number(input.max), current + (e.key === "ArrowUp" ? step : -step))) * 1000) / 1000;
        update({ ...curve, [key]: value }, true, input);
      }
      if (e.key === "Enter") input.blur();
    });
    numeric.push(input); label.appendChild(input); label.appendChild(error); values.appendChild(label);
  }
  const preview = button(doc, { label: t("ease.previewShort"), title: t("ease.preview"), onClick: () => playGraph?.() });
  preview.setAttribute("aria-label", t("ease.preview"));
  preview.classList.add("ch-ease-replay"); graphHeader.appendChild(preview);
  function stop(): void { if (raf) win?.cancelAnimationFrame(raf); raf = 0; }
  function reduced(): boolean { return doc.documentElement.getAttribute("data-reduced-motion") === "true" || Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }
  function play(paint: (time: number) => void): void {
    stop();
    if (reduced() || !win?.requestAnimationFrame) { paint(0.5); return; }
    let start: number | undefined;
    const tick = (now: number): void => {
      if (!alive || doc.hidden) { stop(); return; }
      if (reduced()) { paint(0.5); stop(); return; }
      start ??= now;
      const time = Math.min(1, (now - start) / 1300); paint(time);
      if (time < 1) raf = win.requestAnimationFrame(tick); else raf = 0;
    };
    raf = win.requestAnimationFrame(tick);
  }
  const saveRow = createElement(doc, "form", "ch-ease-save"); saveRow.hidden = true;
  saveRow.id = "ease-save-curve";
  const name = doc.createElement("input"); name.placeholder = t("ease.curveName"); name.maxLength = 80; name.setAttribute("aria-label", name.placeholder);
  saveRow.appendChild(name);
  const feedback = createElement(doc, "p", "ch-hint"); feedback.setAttribute("role", "status");
  feedback.classList.add("ch-ease-feedback");
  function persist(next: typeof library): boolean {
    if (!writeEaseLibrary(storage, next)) { feedback.textContent = t("ease.storageError"); return false; }
    library = next; return true;
  }
  function save(): void {
    if (!name.value.trim() || library.custom.length >= 200) { name.focus(); return; }
    const preset = { id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name.value.trim(), curve: { ...curve }, custom: true };
    if (persist({ ...library, custom: [...library.custom, preset] })) { name.value = ""; feedback.textContent = t("ease.saved"); saveRow.hidden = true; saveToggle.setAttribute("aria-expanded", "false"); saveToggle.focus(); updateCurveName(); drawLibrary(); }
  }
  saveRow.appendChild(button(doc, { label: t("ease.save"), onClick: save }));
  saveRow.addEventListener("submit", e => { e.preventDefault(); save(); });
  const shelf = createElement(doc, "section", "ch-ease-library"); shelf.setAttribute("aria-label", t("ease.library")); columns.appendChild(shelf);
  const shelfHeader = createElement(doc, "div", "ch-ease-library-header"); shelf.appendChild(shelfHeader);
  shelfHeader.appendChild(createElement(doc, "h3", "ch-ease-section-title", t("ease.presets")));
  const saveToggle = button(doc, { label: t("ease.saveCurve"), disabled: options.busy, onClick: () => {
    saveRow.hidden = !saveRow.hidden; saveToggle.setAttribute("aria-expanded", String(!saveRow.hidden));
    if (!saveRow.hidden) name.focus();
  } });
  saveToggle.setAttribute("aria-expanded", "false"); saveToggle.setAttribute("aria-controls", saveRow.id);
  shelfHeader.appendChild(saveToggle);
  shelf.appendChild(saveRow); shelf.appendChild(feedback);
  const toolbar = createElement(doc, "div", "ch-ease-library-toolbar"); shelf.appendChild(toolbar);
  toolbar.hidden = true; toolbar.id = "ease-search-curves";
  const searchToggle = button(doc, { label: t("ease.searchShort"), onClick: () => {
    toolbar.hidden = !toolbar.hidden; searchToggle.setAttribute("aria-expanded", String(!toolbar.hidden));
    if (!toolbar.hidden) toolbar.querySelector<HTMLInputElement>("input")?.focus();
  } });
  searchToggle.setAttribute("aria-expanded", "false"); searchToggle.setAttribute("aria-controls", toolbar.id); shelfHeader.appendChild(searchToggle);
  toolbar.appendChild(searchField(doc, { id: "ease-library-search", label: t("ease.search"), value: query, expandable: false,
    onInput: value => { query = value.toLowerCase().trim(); drawLibrary(); } }));
  const favoriteFilter = button(doc, { label: "☆", onClick: () => { favoritesOnly = !favoritesOnly; favoriteFilter.setAttribute("aria-pressed", String(favoritesOnly)); drawLibrary(); } });
  favoriteFilter.setAttribute("aria-label", t("ease.favorites")); favoriteFilter.title = t("ease.favorites"); favoriteFilter.setAttribute("aria-pressed", "false"); shelfHeader.appendChild(favoriteFilter);
  const grid = createElement(doc, "div", "ch-ease-grid"); shelf.appendChild(grid);
  function drawLibrary(): void {
    stop(); updateCurveName(); grid.textContent = ""; selectedButtons.length = 0;
    const presets = [...EASE_PRESETS, ...library.custom].filter(p => (!favoritesOnly || library.favorites.includes(p.id)) && p.name.toLowerCase().includes(query))
      .sort((a, b) => Number(library.favorites.includes(b.id)) - Number(library.favorites.includes(a.id)));
    for (const preset of presets) {
      const tile = createElement(doc, "div", "ch-ease-tile"); grid.appendChild(tile);
      const select = button(doc, { label: "", onClick: () => update(preset.curve) });
      select.classList.add("ch-ease-preset"); select.title = preset.name; select.setAttribute("aria-label", preset.name);
      select.setAttribute("aria-pressed", String(JSON.stringify(curve) === JSON.stringify(preset.curve)));
      select.addEventListener("dblclick", () => { update(preset.curve); options.onApply(); });
      selectedButtons.push({ element: select, curve: preset.curve });
      const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 80 54"); svg.setAttribute("aria-hidden", "true");
      const path = doc.createElementNS(svg.namespaceURI!, "path");
      const c = preset.curve;
      const low = Math.min(0, c.y1, c.y2), high = Math.max(1, c.y1, c.y2);
      const y = (value: number): number => 43 - (value - low) / (high - low) * 32;
      path.setAttribute("d", `M10 ${y(0)} C${10 + c.x1 * 60} ${y(c.y1)} ${10 + c.x2 * 60} ${y(c.y2)} 70 ${y(1)}`); svg.appendChild(path);
      const marker = doc.createElementNS(svg.namespaceURI!, "circle"); marker.setAttribute("r", "2"); marker.setAttribute("cx", "10"); marker.setAttribute("cy", String(y(0))); svg.appendChild(marker);
      const paint = (time: number): void => { marker.setAttribute("cx", String(10 + time * 60)); marker.setAttribute("cy", String(y(curveProgress(c, time)))); };
      select.addEventListener("mouseenter", () => play(paint)); select.addEventListener("focus", () => play(paint));
      select.addEventListener("mouseleave", stop); select.addEventListener("blur", stop);
      select.appendChild(svg); select.appendChild(createElement(doc, "span", "", preset.name)); tile.appendChild(select);
      const favorite = button(doc, { label: library.favorites.includes(preset.id) ? "★" : "☆", onClick: () => {
        const favorites = library.favorites.includes(preset.id) ? library.favorites.filter(id => id !== preset.id) : [...library.favorites, preset.id];
        if (persist({ ...library, favorites })) drawLibrary();
      } });
      favorite.classList.add("ch-ease-star"); favorite.title = `${t("ease.favorites")}: ${preset.name}`; favorite.setAttribute("aria-label", favorite.title); favorite.setAttribute("aria-pressed", String(library.favorites.includes(preset.id))); tile.appendChild(favorite);
      if (preset.custom) {
        const remove = button(doc, { label: "×", onClick: () => {
          if (persist({ custom: library.custom.filter(p => p.id !== preset.id), favorites: library.favorites.filter(id => id !== preset.id) })) drawLibrary();
        } });
        remove.classList.add("ch-ease-delete"); remove.setAttribute("aria-label", `${t("ease.delete")}: ${preset.name}`); tile.appendChild(remove);
      }
    }
    if (!presets.length) grid.appendChild(createElement(doc, "p", "ch-hint", t("ease.empty")));
  }
  drawLibrary();
  return { element: root, dispose() { alive = false; stop(); disposeGraph?.(); } };
}
