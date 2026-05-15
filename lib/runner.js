import { spawn } from 'node:child_process'

export async function runClaude(config, args) {
  const envName = config.getCurrentEnvName()
  const env = config.loadEnv(envName)
  const claudeBin = env.claudeBin || 'claude'

  // Build environment variables
  const childEnv = { ...process.env }

  // Skip API key confirmation prompt
  childEnv.ANTHROPIC_API_KEY_SKIP_CONFIRM = '1'

  if (env.apiKey) {
    childEnv.ANTHROPIC_API_KEY = env.apiKey
  }
  if (env.apiBase) {
    childEnv.ANTHROPIC_BASE_URL = env.apiBase
  }

  // Set CCE environment variables
  childEnv.CCE_ENV = envName
  if (env.provider) {
    childEnv.CCE_PROVIDER = env.provider
  }
  if (env.model) {
    childEnv.CCE_MODEL = env.model
  }

  // Parse extra env vars
  if (env.extraEnv) {
    const pairs = env.extraEnv.split(/\s+/)
    for (const pair of pairs) {
      const eqIndex = pair.indexOf('=')
      if (eqIndex !== -1) {
        const key = pair.slice(0, eqIndex)
        const val = pair.slice(eqIndex + 1)
        childEnv[key] = val
      }
    }
  }

  // Build --settings override to neutralize settings.json env overrides
  // settings.json may hardcode ANTHROPIC_BASE_URL and ANTHROPIC_DEFAULT_*_MODEL
  // which take precedence over process env vars, so we override them via --settings
  const settingsOverride = { env: {} }
  if (env.apiKey) {
    settingsOverride.env.ANTHROPIC_API_KEY = env.apiKey
  }
  if (env.apiBase) {
    settingsOverride.env.ANTHROPIC_BASE_URL = env.apiBase
  }
  if (env.model) {
    settingsOverride.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = env.model
    settingsOverride.env.ANTHROPIC_DEFAULT_SONNET_MODEL = env.model
    settingsOverride.env.ANTHROPIC_DEFAULT_OPUS_MODEL = env.model
  }

  // Build command args
  const cmdArgs = ['--settings', JSON.stringify(settingsOverride), ...args]

  // Spawn claude process
  const child = spawn(claudeBin, cmdArgs, {
    stdio: 'inherit',
    env: childEnv,
  })

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      process.exit(code || 0)
    })
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        console.error(`cce: claude binary not found: ${claudeBin}`)
        process.exit(1)
      }
      reject(err)
    })
  })
}
