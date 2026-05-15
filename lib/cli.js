import { ConfigManager } from './config.js'
import { runClaude } from './runner.js'

const VERSION = '0.1.3'

function usage() {
  console.log(`Usage: cce [--env <name>] <subcommand> [args...]
       cce import <file>
       cce export [--env <name>] <file>

Management commands:
  list                 List available environment names.
  add <name> [options] Add a new environment.
  remove <name>        Remove an environment.
  activate <name>      Set default environment.
  doctor               Check environment and show effective runtime context.
  version              Print cce version.

Add options:
  --provider PROVIDER  Provider name (e.g. anthropic, openai)
  --model MODEL        Model name (e.g. claude-sonnet-4-6)
  --api-key KEY        API key
  --api-base URL       API base URL
  --claude-bin PATH    Path to claude binary
  --extra-env K=V      Extra environment variables (can repeat)

Passthrough:
  cce [--env <name>] <claude-command> [args...]
  - If no --env, falls back to $CCE_ENV or the default environment.`)
}

function parseAddArgs(args) {
  const options = {}
  let i = 0
  while (i < args.length) {
    const arg = args[i]
    switch (arg) {
      case '--provider':
        options.provider = args[++i]
        break
      case '--model':
        options.model = args[++i]
        break
      case '--api-key':
        options.apiKey = args[++i]
        break
      case '--api-base':
        options.apiBase = args[++i]
        break
      case '--claude-bin':
        options.claudeBin = args[++i]
        break
      case '--extra-env':
        if (!options.extraEnv) options.extraEnv = []
        options.extraEnv.push(args[++i])
        break
      default:
        console.error(`cce: unknown option: ${arg}`)
        process.exit(1)
    }
    i++
  }
  return options
}

export async function main(argv) {
  const config = new ConfigManager()

  if (argv.length === 0) {
    usage()
    process.exit(1)
  }

  let first = argv[0]

  // Handle --env flag
  if (first === '--env') {
    if (argv.length < 2) {
      console.error('cce: --env requires <name>')
      process.exit(1)
    }
    config.setRuntimeEnv(argv[1])
    const remaining = argv.slice(2)
    // Check if remaining[0] is a management command
    const managementCmds = ['list', 'add', 'remove', 'activate', 'doctor', 'version', 'import', 'export']
    if (remaining.length > 0 && managementCmds.includes(remaining[0])) {
      // Re-run main with management command
      argv = remaining
      first = argv[0]
    } else {
      await runClaude(config, remaining)
      return
    }
  }

  // Management commands
  switch (first) {
    case '-h':
    case '--help':
      usage()
      break
    case '-V':
    case 'version':
      await printVersion(config)
      break
    case 'list':
      listEnvs(config)
      break
    case 'add':
      addEnv(config, argv.slice(1))
      break
    case 'remove':
      removeEnv(config, argv[1])
      break
    case 'activate':
      activateEnv(config, argv[1])
      break
    case 'doctor':
      doctor(config)
      break
    case 'import':
      importEnv(config, argv[1])
      break
    case 'export':
      exportEnv(config, argv.slice(1))
      break
    default:
      // Passthrough to claude
      await runClaude(config, argv)
  }
}

async function printVersion(config) {
  console.log(`cce ${VERSION}`)
  try {
    const { execSync } = await import('node:child_process')
    const claudeBin = config.get('claudeBin') || 'claude'
    const version = execSync(`${claudeBin} --version`, { encoding: 'utf8' }).trim()
    console.log(`claude ${version}`)
  } catch {
    console.log('claude: not found')
  }
}

function listEnvs(config) {
  const envs = config.listEnvs()
  if (envs.length === 0) {
    console.log('(no envs yet)')
    return
  }
  const defaultEnv = config.getDefaultEnv()
  envs.forEach(name => {
    const marker = name === defaultEnv ? ' (default)' : ''
    console.log(`${name}${marker}`)
  })
}

function addEnv(config, args) {
  if (args.length === 0) {
    console.error('cce: missing environment name')
    process.exit(1)
  }
  const name = args[0]
  const options = parseAddArgs(args.slice(1))
  try {
    config.createEnv(name, options)
    console.log(`created environment '${name}'`)
  } catch (e) {
    console.error(`cce: ${e.message}`)
    process.exit(1)
  }
}

function removeEnv(config, name) {
  if (!name) {
    console.error('cce: missing environment name')
    process.exit(1)
  }
  try {
    config.removeEnv(name)
    console.log(`removed environment '${name}'`)
  } catch (e) {
    console.error(`cce: ${e.message}`)
    process.exit(1)
  }
}

function activateEnv(config, name) {
  if (!name) {
    console.error('cce: missing environment name')
    process.exit(1)
  }
  try {
    config.setDefaultEnv(name)
    console.log(`set default environment to '${name}'`)
  } catch (e) {
    console.error(`cce: ${e.message}`)
    process.exit(1)
  }
}

function doctor(config) {
  const envName = config.getCurrentEnvName()
  const envs = config.listEnvs()

  if (!envs.includes(envName)) {
    console.log(`cce env   : ${envName} (not found)`)
    console.log(`\nAvailable environments: ${envs.length > 0 ? envs.join(', ') : '(none)'}`)
    console.log('\nCreate one with: cce add <name> --api-key <key>')
    return
  }

  const env = config.loadEnv(envName)
  const runtimeEnv = config.getRuntimeEnv()

  console.log(`cce env   : ${envName}`)
  console.log(`claude bin: ${env.claudeBin || 'claude'}`)
  console.log(`provider  : ${env.provider || '<none>'}`)
  console.log(`model     : ${env.model || '<claude default>'}`)
  console.log(`base url  : ${env.apiBase || '<default>'}`)
  console.log(`api key   : ${env.apiKey ? '<set>' : '<not set>'}`)
  if (runtimeEnv) {
    console.log(`runtime   : $CCE_ENV=${runtimeEnv}`)
  }
}

function importEnv(config, src) {
  if (!src) {
    console.error('cce: usage: cce import <file>')
    process.exit(1)
  }
  try {
    const name = config.importEnv(src)
    console.log(`imported to environment '${name}'`)
  } catch (e) {
    console.error(`cce: ${e.message}`)
    process.exit(1)
  }
}

function exportEnv(config, args) {
  let envName = null
  let target = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') {
      envName = args[++i]
    } else {
      target = args[i]
    }
  }

  if (!target) {
    console.error('cce: usage: cce export [--env <name>] <file>')
    process.exit(1)
  }

  try {
    config.exportEnv(target, envName)
    console.log(`exported environment '${envName || config.getCurrentEnvName()}' to ${target}`)
  } catch (e) {
    console.error(`cce: ${e.message}`)
    process.exit(1)
  }
}
