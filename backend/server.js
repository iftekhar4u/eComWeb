import { createApp, connectDatabase } from './app.js'
import { getConfig } from './config/env.js'

const config = getConfig()
await connectDatabase(config)
const server = createApp({ config }).listen(config.PORT, () => console.log(JSON.stringify({ level: 'info', message: 'AURELIA API listening', port: config.PORT })))

async function shutdown(signal) {
	console.log(JSON.stringify({ level: 'info', message: 'Shutting down', signal }))
	server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
