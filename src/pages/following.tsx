/**
 * Route marker for `/following`. The workspace (GistApp) is rendered by the
 * root layout (`_app.tsx` → Shell), which switches the main pane to the
 * Following manager — so this element is never shown, it only registers the path.
 */
export default function FollowingRoute() {
  return null
}
