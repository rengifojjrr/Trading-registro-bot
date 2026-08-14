-- Two more markup tools on the trade chart.
--
-- VLINE marks a moment rather than a price -- a news release, a session
-- open, the bar where a setup actually triggered. FIB is a Fibonacci
-- retracement between two points; only its two anchors are stored, never
-- the derived levels, so the ratios stay a rendering decision and an old
-- drawing picks up any future change to which levels are shown.
--
-- MEASURE is deliberately absent: it answers "how far is this move" while
-- you look at it and is meaningless afterwards, so it stays ephemeral in
-- the client instead of accumulating rows nobody revisits.

alter table public.chart_drawings
  drop constraint chart_drawings_tool_check;

alter table public.chart_drawings
  add constraint chart_drawings_tool_check
  check (tool in ('HLINE', 'VLINE', 'TRENDLINE', 'RECTANGLE', 'FIB'));

comment on column public.chart_drawings.points is
  'Shape depends on tool, validated at the application layer (lib/chart-drawings.ts): '
  'HLINE {"price"}; VLINE {"time"}; TRENDLINE/RECTANGLE/FIB {"p1":{"time","price"},"p2":{...}} '
  '-- rectangle corners are opposite, fib anchors run from the 0% to the 100% level.';
