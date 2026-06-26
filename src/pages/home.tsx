/**
 * Route marker for `/home`. The actual workspace (GistApp) is rendered by the
 * root layout (`_app.tsx` → Shell) so it persists across navigations; this
 * element is never shown, it only registers the path.
 */
export default function HomeRoute() {
  return null
}
