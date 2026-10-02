/** Fetch every page before exposing a schedule, so a partial load never looks complete. */
export async function fetchAdminPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500
): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < pageSize) return rows
  }
}
