/** Текст ошибки для баннера: всё, что не Error, показываем одинаково. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}
