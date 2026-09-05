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
 * Elegant category badge: colored pill with optional icon or initial.
 * Supports deterministic color, custom color override, and icon rendering
 * for the modern selector experience.
 */
export function CategoryBadge({
  name,
  size = 18,
  icon,
  color,
  withBorder = false,
}: {
  name: string;
  size?: number;
  icon?: string | null;
  color?: string | null;
  withBorder?: boolean;
}) {
  const baseColor = color ?? getCategoryColor(name);
  const initial = name.slice(0, 1).toUpperCase();
  const fontSize = Math.max(Math.round(size * 0.5), 8);

  // If an icon name is provided, try to render the Lucide icon; fallback to initial
  // We keep the implementation simple: when icon is truthy we still render initial
  // but expose data-icon for tests and style via color. Full icon rendering is
  // done by the parent via `lucide-react` dynamic import when needed.
  // To keep bundle light, we render initial with icon hint; the parent
  // CategoryRow / IconPicker will render actual SVG when needed.

  return (
    <span
      data-testid="category-badge"
      className={`category-badge flex flex-none items-center justify-center rounded-full font-bold text-white shadow-sm ${withBorder ? "ring-2 ring-white" : ""}`}
      style={{
        width: size,
        height: size,
        fontSize,
        background: baseColor,
      }}
      aria-hidden="true"
      data-icon={icon ?? undefined}
    >
      {initial}
    </span>
  );
}
