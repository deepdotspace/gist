/**
 * App — global providers + shell.
 *
 * Generouted renders this around all routes.
 * Providers → auth gate → nav + page outlet.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet, useRouteError, useLocation, useMatch } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuthStatus } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import { ErrorScreen, ToastProvider } from '../components/ui'
import { GistApp } from '../components/GistApp'
import { SCOPE_ID } from '../constants'
import { schemas } from '../schemas'

export default function App() {
  return (
    <ToastProvider>
      <DeepSpaceAuthProvider>
        <AuthBoot>
          {/* data-testid="app-root" is the canonical "app shell mounted" hook
              every test relies on. Don't rename without updating templates/tests.
              No global chrome — the app IS the GistApp workspace shell. */}
          <div data-testid="app-root" className="h-screen overflow-hidden bg-background text-foreground">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Loading…
                </div>
              }
            >
              <Shell />
            </Suspense>
          </div>
        </AuthBoot>
      </DeepSpaceAuthProvider>
    </ToastProvider>
  )
}

/**
 * The main experience (`/home`, `/v/:id`) is ONE persistent workspace — the
 * GistApp shell stays mounted while you move between gists, so the sidebar and
 * its scroll/state never flash. We render it directly here (not via Outlet) so
 * React keeps the same instance across those navigations. Any other route
 * (settings, 404) falls through to the normal Outlet.
 */
function Shell() {
  const { pathname } = useLocation()
  const videoMatch = useMatch('/v/:id')
  const isFollowing = pathname === '/following'
  const isWorkspace = pathname === '/home' || pathname.startsWith('/v/') || isFollowing

  if (isWorkspace) {
    return (
      <GistApp
        selectedId={videoMatch?.params.id}
        view={isFollowing ? 'following' : undefined}
      />
    )
  }
  return <Outlet />
}

/**
 * Root error boundary. Generouted wires a `_app` `Catch` export to the root
 * route's errorElement, so any render-time crash in a page — a thrown error,
 * or a hooks-rule violation like React #310 — lands here instead of React
 * Router's raw minified screen. ErrorScreen decodes the error for the developer.
 */
export function Catch() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

/** Waits for auth to resolve, then mounts the data layer. Distinct from the SDK's `AuthGate`. */
function AuthBoot({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuthStatus()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        Loading...
      </div>
    )
  }

  return (
    <RecordProvider allowAnonymous>
      <RecordScope roomId={SCOPE_ID} schemas={schemas}>
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
