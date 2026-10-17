// Card publication dates do not describe when a trip happened.
/**
 * @template {{data:{visitedYear?:number,title:string}}} T
 * @param {T[]} cities
 * @returns {{year:number|null,cities:T[]}[]}
 */
export function groupTripsByYear(cities) {
  /** @type {Map<number|null,T[]>} */
  const groups = new Map();
  for (const city of cities) {
    const year = city.data.visitedYear ?? null;
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(city);
  }
  return [...groups].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : b - a)
    .map(([year, places]) => ({year, cities: places.sort((a, b) => a.data.title.localeCompare(b.data.title, 'ru'))}));
}
