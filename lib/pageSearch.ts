/**
 * Whether a page matches what the user typed in the pages panel search. Every
 * word must appear, in any order and case, in the page's title or its group's
 * name, so "r1 blue" finds "R1 · 06 · Blueprint" and a group's name finds all
 * of its pages.
 */
export const matchesPageSearch = (query: string, title: string, groupName = "") => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = `${title} ${groupName}`.toLowerCase();
  return words.every((word) => text.includes(word));
};
