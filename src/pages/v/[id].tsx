/**
 * Route marker for `/v/:id`. The workspace (GistApp) is rendered by the root
 * layout (`_app.tsx` → Shell), which reads the `:id` and selects it — so this
 * element is never shown, it only registers the path.
 */
export default function ResultRoute() {
  return null
}
