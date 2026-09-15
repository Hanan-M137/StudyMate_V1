/**
 * Pinned rows first, then newest first within each group.
 *
 * This is the order both /quizzes and /conversations come back in, and the
 * same order has to be reapplied in the browser after a pin is toggled -
 * otherwise the icon changes and the row stays where it was, which looks like
 * the pin did nothing until the next reload.
 *
 * Pinning lifts a row to the top of the list it is already in rather than
 * moving it to a favourites page. Both lists are grouped by document, and a
 * favourites list would cut across that grouping - two organising schemes for
 * the same rows, and two answers to "where is my conversation".
 *
 * Returns a new array; the argument is not touched, because these lists come
 * straight from React state.
 */
export function sortPinnedFirst(rows) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1

    return timeOf(b.createdAt) - timeOf(a.createdAt)
  })
}

/* A row with no usable date sorts to the bottom of its group rather than
   scrambling the order around it, which is what NaN comparisons would do. */
function timeOf(value) {
  if (!value) return 0

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}
