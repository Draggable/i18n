#!/usr/bin/env bash
# Rebuild tools/npm-11.21.1-undici-6.29.1.tgz.
#
# @semantic-release/npm depends on npm ^11.6.2. The newest published npm 11
# (11.21.1) and npm 12 (12.2.1) both bundle undici 6.29.0, which is inside
# GHSA-xjj6-f33q-929c (>=6.23.0 <6.29.1). npm cannot override a bundled
# dependency, so package.json overrides the npm package with this repack:
# registry npm 11.21.1 with node_modules/undici replaced by undici 6.29.1.
#
# Tar metadata is not stable, so rerunning this script changes the tarball
# hash. Commit the generated file only when intentionally refreshing the pin.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/npm" "$work/undici"
npm pack npm@11.21.1 --pack-destination "$work" >/dev/null
npm pack undici@6.29.1 --pack-destination "$work" >/dev/null
tar -xzf "$work"/npm-11.21.1.tgz -C "$work/npm"
tar -xzf "$work"/undici-6.29.1.tgz -C "$work/undici"
rm -rf "$work/npm/package/node_modules/undici"
mv "$work/undici/package" "$work/npm/package/node_modules/undici"
tar -czf "$root/tools/npm-11.21.1-undici-6.29.1.tgz" -C "$work/npm" package

node --input-type=module -e "
import { execFileSync } from 'node:child_process'
const raw = execFileSync('tar', ['-xOf', 'tools/npm-11.21.1-undici-6.29.1.tgz', 'package/node_modules/undici/package.json'], { cwd: process.argv[1] })
const version = JSON.parse(raw.toString()).version
if (version !== '6.29.1') {
  console.error('expected undici 6.29.1, found ' + version)
  process.exit(1)
}
console.log('packed undici', version)
" "$root"
