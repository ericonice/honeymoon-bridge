/** Points down when closed, up when open — the one thing that says a row opens something. */
export function Chevron({ open }: { readonly open: boolean }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`self-center transition-transform ${open ? "rotate-180 text-white/55" : "text-white/30"}`}
      fill="none"
      height="10"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
      viewBox="0 0 10 10"
      width="10"
    >
      <path d="M2 3.6 L5 6.6 L8 3.6" />
    </svg>
  );
}
