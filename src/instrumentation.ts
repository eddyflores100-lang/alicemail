// Punto de arranque del motor en el runtime de Next.js
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorker } = await import('@/lib/worker')
    startWorker()
  }
}
