export const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

/** @typedef {import('astro:content').CollectionEntry<'blog'>} Post */
/** @typedef {{month: string, label: string, posts: Post[]}} Month */

// Match the UTC dates displayed in posts, regardless of the build machine's timezone.
/** @param {Post[]} posts */
export function blogArchive(posts) {
  /** @type {Map<string, {year: string, posts: Post[], months: Map<string, Month>}>} */
  const years = new Map();
  for (const post of posts.filter(post => !post.data.draft).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id))) {
    const year = String(post.data.date.getUTCFullYear());
    const month = String(post.data.date.getUTCMonth() + 1).padStart(2, "0");
    if (!years.has(year)) years.set(year, { year, posts: [], months: new Map() });
    const group = years.get(year);
    group.posts.push(post);
    if (!group.months.has(month)) group.months.set(month, { month, label: monthNames[Number(month) - 1], posts: [] });
    group.months.get(month).posts.push(post);
  }
  return [...years.values()].map(group => ({ ...group, months: [...group.months.values()] }));
}
