/**
 * Capability gates that depend on evidence from a real host.
 *
 * `QUICK_EASE_AUTO_OPEN_PROVEN` stays false until the proof checklist in
 * `docs/research/cep-modeless-quick-ease.md` has been executed in After
 * Effects. While false, the auto-open setting is not offered and the selection
 * watcher never starts; opening the floating window manually works regardless.
 */
export const QUICK_EASE_AUTO_OPEN_PROVEN = false;
