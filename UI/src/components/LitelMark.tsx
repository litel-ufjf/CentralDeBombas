export function LitelMark({
  size = 25,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Litel"
      className={`inline-flex items-center text-[#1d3a4f] ${className}`}
      style={{ gap: size * 0.24 }}
    >
      <svg
        viewBox="0 0 16 20"
        aria-hidden
        style={{ height: size, width: size * 0.8 }}
        className="shrink-0"
      >
        <path
          d="M8 1.2C8 1.2 1.6 8.5 1.6 12.7a6.4 6.4 0 0 0 12.8 0C14.4 8.5 8 1.2 8 1.2Z"
          fill="#1b6f8a"
        />
        <path
          d="M5 12.6a3.2 3.2 0 0 0 2.4 3.1"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.75"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      <span
        aria-hidden
        className="leading-none font-medium tracking-[0.05em]"
        style={{ fontSize: size, fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' }}
      >
        LITEL
      </span>
    </span>
  );
}
