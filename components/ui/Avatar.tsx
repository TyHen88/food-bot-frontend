interface AvatarProps {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
}

function initials(name?: string) {
  if (!name) return "?";
  return name.split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function colorForName(name?: string): string {
  const colors = [
    "var(--color-primary)", "var(--color-accent)", "#6366F1",
    "#EC4899", "#0EA5E9", "#14B8A6", "#F59E0B",
  ];
  let h = 0;
  for (const c of name ?? "") h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

export function Avatar({ name, src, size = 36, className }: AvatarProps) {
  return (
    <div
      className={`inline-flex items-center justify-center flex-shrink-0 rounded-full overflow-hidden font-semibold text-white ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: src ? "transparent" : colorForName(name),
      }}
    >
      {src ? (
        <img src={src} alt={name} width={size} height={size} className="object-cover w-full h-full" />
      ) : (
        initials(name)
      )}
    </div>
  );
}
