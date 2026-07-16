const CATEGORY_COLORS = [
  "#0E8C5A", "#C8483B", "#B8791F", "#3E6FB0",
  "#2FA56F", "#820AD1", "#EC7000", "#0F6B45",
];

/**
 * Deterministic color from a category name (stable hash).
 * No dependency on DB-driven icon names.
 */
export function getCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

/**
 * A deterministic fallback badge for categories.
 * Render a colored circle with the first letter of the category name.
 * Replaces fragile icon-name-based rendering.
 */
export function CategoryBadge({
  name,
  size = 18,
}: {
  name: string;
  size?: number;
}) {
  const color = getCategoryColor(name);
  const initial = name.slice(0, 1).toUpperCase();
  const fontSize = Math.max(Math.round(size * 0.5), 8);

  return (
    <span
      className="flex flex-none items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize,
        background: color,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
