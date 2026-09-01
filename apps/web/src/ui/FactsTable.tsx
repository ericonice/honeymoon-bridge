/**
 * A small table of figures, real `<table>` markup rather than a grid of spans.
 *
 * These *are* tables — a label and two figures under two headings — so a screen
 * reader should be told as much, and a test then has rows to read rather than a
 * class name to match on, which is how the record screen's row test broke once.
 *
 * Shared by every page that prints numbers asked of the engine rather than typed
 * out — see `scoringFacts.ts` and `biddingFacts.ts` for why that distinction
 * matters here.
 */
export function FactsTable({
  caption,
  columns,
  rows,
}: {
  readonly caption: string;
  readonly columns: readonly [string, string, string];
  readonly rows: readonly { readonly label: React.ReactNode; readonly values: readonly [React.ReactNode, React.ReactNode] }[];
}): React.JSX.Element {
  const head = "font-mono text-[0.55rem] tracking-wider text-white/40 uppercase";
  return (
    <table className="w-full font-mono text-xs tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-white/15">
          <th scope="col" className={`${head} py-1 text-left`}>
            {columns[0]}
          </th>
          <th scope="col" className={`${head} py-1 text-right`}>
            {columns[1]}
          </th>
          <th scope="col" className={`${head} py-1 text-right`}>
            {columns[2]}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <th scope="row" className="py-1 text-left font-normal">
              {row.label}
            </th>
            {row.values.map((value, column) => (
              <td key={column} className="py-1 text-right">
                {value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
