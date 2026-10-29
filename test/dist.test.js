// Smoke test for the built package, run with `npm run test:dist` after `npm run build`
import assert from 'node:assert'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')
const dist = new URL('../dist/', import.meta.url)

const check = mod => {
  assert.strictEqual(typeof mod.I18N, 'function')
  assert.strictEqual(typeof mod.default.get, 'function')
  const i18n = new mod.I18N({ locale: 'pt-BR', fallbackLocale: 'en', preloaded: { en: { hi: 'Hi {name}' } } })
  assert.strictEqual(i18n.t('hi', { name: 'Ana' }), 'Hi Ana')
  assert.deepStrictEqual(mod.I18N.parse('# comment\nkey = value'), { key: 'value' })
}

test('ES build can be imported', async () => {
  check(await import(new URL('i18n.es.min.js', dist)))
})

test('CommonJS build can be required', () => {
  check(require('../dist/i18n.cjs'))
})

test('package exports resolve for import and require', async () => {
  check(await import(pkg.name))
  check(require(pkg.name))
  assert.ok(require.resolve(pkg.name).endsWith('i18n.cjs'))
})

test('existing deep imports still resolve', async () => {
  check(await import(`${pkg.name}/dist/i18n.es.min.js`))
  assert.ok(require.resolve(`${pkg.name}/dist/i18n.cjs.min.js`))
  assert.ok(require.resolve(`${pkg.name}/package.json`))
})

test('iife build exposes a global', () => {
  const context = {}
  vm.runInNewContext(fs.readFileSync(new URL('i18n.iife.min.js', dist), 'utf8'), context)
  assert.strictEqual(typeof context.i18n.I18N, 'function')
})

test('type declarations are emitted', () => {
  const typeFiles = [pkg.types, pkg.exports['.'].import.types, pkg.exports['.'].require.types]
  for (const file of typeFiles) {
    assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `${file} missing`)
  }
})
