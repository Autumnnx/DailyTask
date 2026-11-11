export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`logo ${light ? "logo--light" : ""}`}>
      <svg className="logo__mark" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="currentColor" className="logo__tile" />
        <path d="M18 33l9 9 19-21" fill="none" stroke="#2EC4A6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo__text">DailyTask</span>
    </span>
  );
}
