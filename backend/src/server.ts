import { buildApp } from './app.js'

/**
 * API process entrypoint. Development: `npm run dev` (tsx watch).
 * Production: build to dist then `node dist/server.js`.
 */
async function main(): Promise<void> {
  const app = await buildApp()
  const { PORT, HOST } = app.env

  await app.listen({ port: PORT, host: HOST })
  app.log.info({ port: PORT, host: HOST, env: app.env.NODE_ENV }, 'Uni backend listening')

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down gracefully')
    try {
      await app.close()
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error, signal }, 'Shutdown failed')
      process.exit(1)
    }
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
