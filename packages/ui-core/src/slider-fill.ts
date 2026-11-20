/** Keep the painted track aligned with the native range thumb. */
export function updateSliderFill(range: HTMLInputElement, value = Number(range.value)): void {
  const min = Number(range.min);
  const fraction = (value - min) / (Number(range.max) - min);
  const fill = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
  range.style?.setProperty("--ch-slider-fraction", String(fill));
}
