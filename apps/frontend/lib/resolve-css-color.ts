/**
 * Resolves any CSS color value (including modern color functions like oklch(),
 * CSS custom properties like var(--chart-1), etc.) to an SVG-safe rgb() string.
 *
 * SVG presentation attributes set via JavaScript setAttribute() do not support
 * modern CSS color functions or custom properties in all browsers. Reading a
 * color back through getComputedStyle forces the browser to normalize it to
 * rgb(r, g, b), which SVG can always render.
 *
 * Returns the original string unchanged in SSR/Node environments.
 */
export function resolveCssColorToRgb(cssColor: string): string {
  if (typeof document === 'undefined' || !cssColor.trim()) return cssColor;
  const el = document.createElement('span');
  el.style.color = cssColor;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  document.body.removeChild(el);
  return resolved || cssColor;
}

/**
 * Converts a computed `rgb(r, g, b)` / `rgba(...)` string to rgba with the given alpha.
 * Used when SVG/recharts mishandles separate fillOpacity on presentation attributes.
 */
export function rgbStringToRgba(rgb: string, alpha: number): string {
  const comma = rgb.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/
  );
  if (comma) {
    return `rgba(${comma[1]}, ${comma[2]}, ${comma[3]}, ${alpha})`;
  }
  const space = rgb.match(
    /rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*[\d.%]+)?\s*\)/
  );
  if (space) {
    return `rgba(${space[1]}, ${space[2]}, ${space[3]}, ${alpha})`;
  }
  return rgb;
}
