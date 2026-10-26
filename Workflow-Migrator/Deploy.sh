#!/usr/bin/env bash
# Conditionally test/build the frontend, then deploy the Forge app from Linux/macOS.
# This is the Bash counterpart of Deploy.ps1 and intentionally preserves its
# fingerprinting, safety checks, command order, and command-line options.
set -Eeuo pipefail

environment="development"
force_build=false
build_only=false
dry_run=false

usage() {
  cat <<'EOF'
Usage: ./Deploy.sh [-Environment NAME] [-ForceBuild] [-BuildOnly] [-DryRun]

Long aliases are also accepted: --environment, --force-build, --build-only,
--dry-run. Deployment defaults to the development environment.
EOF
}

while (($#)); do
  case "$1" in
    -Environment|--environment)
      (($# >= 2)) || { echo "Missing value for $1." >&2; exit 2; }
      environment="$2"
      shift 2
      ;;
    -ForceBuild|--force-build) force_build=true; shift ;;
    -BuildOnly|--build-only) build_only=true; shift ;;
    -DryRun|--dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$environment" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || {
  echo "Invalid Forge environment: $environment" >&2
  exit 2
}

script_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
frontend="$script_root/static/hello-world"
build="$frontend/build"
state_path="$script_root/.forge/frontend-build-state.json"
original_directory="$PWD"
ci_was_set=false
[[ ${CI+x} ]] && ci_was_set=true
previous_ci="${CI-}"

restore_environment() {
  cd -- "$original_directory"
  if $ci_was_set; then export CI="$previous_ci"; else unset CI; fi
}
trap restore_environment EXIT
cd -- "$script_root"

[[ -f manifest.yml ]] || {
  echo "Run this script from a valid Forge app (manifest.yml is missing)." >&2
  exit 1
}
[[ -z ${BUILD_PATH:-} ]] || {
  echo "BUILD_PATH must be unset: manifest.yml expects static/hello-world/build." >&2
  exit 1
}
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
command -v npm >/dev/null || { echo "npm is required." >&2; exit 1; }

# Node is already a project prerequisite and gives identical hashing semantics on
# Linux and macOS without depending on platform-specific sha256 utilities.
get_tree_fingerprint() {
  local root="$1" mode="${2:-output}"
  node - "$root" "$mode" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const root = path.resolve(process.argv[2]);
const mode = process.argv[3];
const excluded = new Set(["node_modules", "build", "coverage", ".git", ".forge"]);
const entries = [];

function visit(directory) {
  for (const name of fs.readdirSync(directory)) {
    if (mode === "source" && excluded.has(name)) continue;
    const absolute = path.join(directory, name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Linked file or directory is not supported in build inputs: ${absolute}`);
    }
    if (stat.isDirectory()) {
      visit(absolute);
    } else if (stat.isFile()) {
      const relative = `/${path.relative(root, absolute).split(path.sep).join("/")}`;
      const hash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex").toUpperCase();
      entries.push(`${relative}:${hash}`);
    }
  }
}

visit(root);
if (mode === "source") {
  entries.push("fingerprint-version=1", `node=${process.version}`, "NODE_ENV=production", "CI=true");
  const selected = new Set([
    "PUBLIC_URL", "BUILD_PATH", "GENERATE_SOURCEMAP", "INLINE_RUNTIME_CHUNK",
    "IMAGE_INLINE_SIZE_LIMIT", "DISABLE_ESLINT_PLUGIN", "ESLINT_NO_DEV_ERRORS",
    "TSC_COMPILE_ON_ERROR", "BROWSERSLIST", "BROWSERSLIST_ENV",
    "BROWSERSLIST_CONFIG", "NODE_OPTIONS",
  ]);
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("REACT_APP_") || selected.has(name)) entries.push(`${name}=${value}`);
  }
}
entries.sort();
process.stdout.write(crypto.createHash("sha256").update(entries.join("\n"), "utf8").digest("hex").toUpperCase());
NODE
}

invoke_checked() {
  printf '> '
  printf '%q ' "$@"
  printf '\n'
  "$@"
}

echo "App: $(pwd)"
echo "Target environment: $environment"
source_hash="$(get_tree_fingerprint "$frontend" source)"
state_source=""
state_output=""
if [[ -f "$state_path" ]]; then
  if state_values="$(node - "$state_path" <<'NODE'
const fs = require("fs");
const state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!state.sourceHash || !state.outputHash) process.exit(1);
console.log(state.sourceHash);
console.log(state.outputHash);
NODE
  )"; then
    mapfile -t parsed_state <<<"$state_values"
    state_source="${parsed_state[0]}"
    state_output="${parsed_state[1]}"
  else
    echo "Build cache is unreadable; a fresh build will be required."
  fi
fi

reason=""
if $force_build; then reason="forced rebuild"
elif [[ ! -f "$build/index.html" ]]; then reason="missing build"
elif [[ -z "$state_source" || -z "$state_output" ]]; then reason="no trusted build fingerprint"
elif [[ "$state_source" != "$source_hash" ]]; then reason="frontend inputs changed"
elif [[ "$(get_tree_fingerprint "$build")" != "$state_output" ]]; then reason="build files changed or missing"
fi

if [[ -n "$reason" ]]; then
  echo "Frontend: rebuild required ($reason)."
else
  echo "Frontend: unchanged; reusing the verified build."
fi
if $dry_run; then
  echo "Dry run: no tests, build, cache updates or deployment performed. BuildOnly=$build_only"
  exit 0
fi

if [[ -n "$reason" ]]; then
  rm -f -- "$state_path"
  export CI=true
  invoke_checked npm --prefix "$frontend" test -- --watchAll=false --runInBand
  invoke_checked npm --prefix "$frontend" run build
  [[ -f "$build/index.html" ]] || {
    echo "Build command succeeded but build/index.html is missing." >&2
    exit 1
  }
  after_hash="$(get_tree_fingerprint "$frontend" source)"
  [[ "$after_hash" == "$source_hash" ]] || {
    echo "Frontend files changed during the build. Run the script again." >&2
    exit 1
  }
  output_hash="$(get_tree_fingerprint "$build")"
  mkdir -p -- "$(dirname -- "$state_path")"
  node - "$state_path" "$source_hash" "$output_hash" <<'NODE'
const fs = require("fs");
const [file, sourceHash, outputHash] = process.argv.slice(2);
fs.writeFileSync(file, `${JSON.stringify({ sourceHash, outputHash }, null, 2)}\n`, "utf8");
NODE
  echo "Frontend tests and build succeeded; fingerprint saved locally."
fi

if $build_only; then
  echo "Ready: frontend build verified. No deployment requested."
else
  command -v forge >/dev/null || { echo "Forge CLI is required for deployment." >&2; exit 1; }
  invoke_checked forge deploy --non-interactive --environment "$environment"
  echo "Deployment succeeded: $environment. No Git commit or push performed."
fi
