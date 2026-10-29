export const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]'),
} : {}
