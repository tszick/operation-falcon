// Read all message geometry before applying any transforms, including across
// the independent radio and warning feeds. A burst must not force one layout
// recalculation for each newly inserted message.
export function layoutMessageFeeds(feeds, now) {
  const layouts = feeds.map(({ host, positioned }) => {
    if (!positioned.length) return { positioned, free: 0 };
    for (const entry of positioned) entry.height = entry.node.offsetHeight;
    const free = Math.max(
      0,
      host.clientHeight - positioned.reduce((sum, p) => sum + p.height + 14, 0),
    );
    return { positioned, free };
  });
  for (const { positioned, free } of layouts) {
    let y = 0;
    for (const { node, item, height } of positioned) {
      node.style.transform = `translateY(${y + Math.min(free, (now - item.shownAt) * 8)}px)`;
      node.style.opacity = item.fading ? '0' : '1';
      y += height + 14;
    }
  }
}
