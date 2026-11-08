/**
 * Credential stores a shell command is not allowed to read — adapted from
 * abacusai-bot packages/agent/src/sandbox/secrets.ts.
 *
 * Reads stay allow-by-default so toolchains keep working; only pure secret
 * stores are denied. Configuration files beside them stay readable (ssh -G,
 * a public key, ~/.aws/config). In Uni's server context the home directory
 * is the account the API runs under — the same honesty applies, plus the
 * env path Uni itself keeps credentials in.
 */
import * as path from 'node:path'

/** A denied path with the files under it that are read back. */
export interface SecretEntry {
  path: string
  /** Relative to `path`. Names, or `*.ext` for a suffix. */
  except?: string[]
}

/** Where Uni keeps its own local config, API keys included. */
function uniHome(env: NodeJS.ProcessEnv, home: string): string {
  const configured = (env.UNI_HOME ?? '').trim()
  return configured.length > 0 ? configured : path.join(home, '.uni')
}

export function secretEntries(
  home: string,
  env: NodeJS.ProcessEnv = process.env,
): SecretEntry[] {
  const at = (...parts: string[]): string => path.join(home, ...parts)
  const uni = uniHome(env, home)

  return [
    { path: uni, except: ['*.json.example', 'LICENSE'] },
    { path: at('.ssh'), except: ['*.pub', 'authorized_keys', 'known_hosts'] },
    { path: at('.aws'), except: ['config'] },
    { path: at('.gcloud'), except: ['configurations', 'active_config'] },
    { path: at('.config', 'gcloud'), except: ['configurations', 'active_config'] },
    { path: at('.kube') },
    { path: at('.docker'), except: ['config.json.example'] },
    { path: at('.netrc') },
    { path: at('.gnupg') },
  ]
}

/** Whether `candidate` is within `store` (both already resolved lexical). */
export function isWithin(candidate: string, store: string): boolean {
  const relative = path.relative(store, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Every credential store a command names, as paths worth refusing or
 * asking about. Uni's port keeps the shape upstream's gate consumes:
 * the raw command string, scanned for store paths.
 */
export function namedSecretPaths(
  command: string,
  options: { cwd: string },
): string[] {
  const home = homeOf(options.cwd)
  const stores = secretEntries(home).flatMap((entry) =>
    expandStorePrefix(entry.path),
  )
  const named = stores.filter((store) => command.includes(store))
  return dedupe(named)
}

/** The prefixes worth scanning for: the store itself and its ~/. spelling. */
function expandStorePrefix(store: string): string[] {
  const home = path.dirname(store) === '' ? '' : homeOf(store)
  const tilde = home !== '' && store.startsWith(home) ? `~${store.slice(home.length)}` : null
  return tilde != null ? [store, tilde] : [store]
}

function homeOf(_hint: string): string {
  return process.env.HOME ?? '/root'
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

/** File names that are secret by their name, wherever they appear. */
const SECRET_FILE_NAMES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'credentials.json',
  'service-account.json',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
]

export function namesSecretFile(relativePath: string): boolean {
  const base = relativePath.split(/[\\/]/).pop() ?? ''
  if (base === '') return false
  return SECRET_FILE_NAMES.includes(base)
}
