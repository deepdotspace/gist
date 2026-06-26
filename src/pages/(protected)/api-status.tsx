import { useAsyncResource, integration } from 'deepspace'
import { Alert, AlertDescription, AlertTitle, Button, EmptyState, LoadingOverlay } from '../../components/ui'

interface IntegrationCatalog {
  integrations?: Record<string, unknown> | unknown[]
}

export default function ApiStatusPage() {
  const catalog = useAsyncResource<IntegrationCatalog>(
    async (signal) => {
      const res = await integration.get<IntegrationCatalog>('', undefined, { signal })
      if (!res.success) throw new Error(res.error)
      return res.data ?? {}
    },
    [],
    { retry: 1, retryDelayMs: 500 },
  )

  const integrationCount = Array.isArray(catalog.data?.integrations)
    ? catalog.data.integrations.length
    : Object.keys(catalog.data?.integrations ?? {}).length

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A scaffolded pattern for server-backed resources with explicit loading, error, empty, and retry states.
        </p>
      </div>

      {catalog.error && catalog.data && (
        <Alert variant="warning">
          <AlertTitle>Showing the last loaded catalog</AlertTitle>
          <AlertDescription>{catalog.error}</AlertDescription>
        </Alert>
      )}

      {catalog.status === 'loading' ? (
        <LoadingOverlay message="Loading integration catalog..." />
      ) : catalog.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load API data</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{catalog.error}</span>
            {catalog.retryCount > 0 && (
              <span>Retried {catalog.retryCount} time{catalog.retryCount === 1 ? '' : 's'} automatically.</span>
            )}
            <Button type="button" variant="outline" className="w-fit" onClick={catalog.reload}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : integrationCount === 0 ? (
        <EmptyState
          title="No integrations available"
          description="The catalog loaded, but it did not return any integration definitions."
        />
      ) : (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-medium">Integration catalog ready</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {integrationCount} integration{integrationCount === 1 ? '' : 's'} available.
              </p>
            </div>
            {catalog.isRefreshing && (
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                Refreshing
              </span>
            )}
          </div>
          <Button type="button" variant="outline" className="mt-4" onClick={catalog.reload}>
            Refresh
          </Button>
        </section>
      )}
    </div>
  )
}
