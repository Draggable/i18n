import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { I18N } from './mi18n.js'

const realFetch = globalThis.fetch

/**
 * Replace global fetch for a test
 * @param {Object} files url suffix → file contents
 * @return {String[]} requested urls
 */
const stubFetch = (files = {}) => {
  const requested = []
  globalThis.fetch = async url => {
    requested.push(url)
    const file = Object.keys(files).find(name => url.endsWith(name))
    if (file === undefined) {
      return { ok: false, status: 404 }
    }
    return { ok: true, status: 200, text: async () => files[file], json: async () => files[file] }
  }
  return requested
}

describe('fallbackLocale', () => {
  const preloaded = {
    'pt-BR': { onlyBR: 'Só BR', shared: 'Compartilhado BR' },
    pt: { onlyPT: 'Só PT', shared: 'Compartilhado PT', emptyInPT: '' },
    en: { onlyEN: 'Only EN', shared: 'Shared EN', emptyInPT: 'Not empty' },
    de: { onlyDE: 'Nur DE' },
  }

  test('looks up requested locale → base language → fallback locale', () => {
    const i18n = new I18N({ locale: 'pt-BR', fallbackLocale: 'en', preloaded })
    assert.strictEqual(i18n.get('shared'), 'Compartilhado BR')
    assert.strictEqual(i18n.get('onlyBR'), 'Só BR')
    assert.strictEqual(i18n.get('onlyPT'), 'Só PT')
    assert.strictEqual(i18n.get('onlyEN'), 'Only EN')
  })

  test('does not use languages outside of the chain', () => {
    const i18n = new I18N({ locale: 'pt-BR', fallbackLocale: 'en', preloaded })
    assert.strictEqual(i18n.get('onlyDE'), undefined)
    assert.strictEqual(i18n.getValue('onlyDE'), undefined)
    assert.strictEqual(i18n.t('onlyDE'), 'onlyDE')
  })

  test('checks multiple fallback locales in order', () => {
    const i18n = new I18N({ locale: 'fr-FR', fallbackLocale: ['de', 'en'], preloaded })
    assert.strictEqual(i18n.get('onlyDE'), 'Nur DE')
    assert.strictEqual(i18n.get('onlyEN'), 'Only EN')
    assert.deepStrictEqual(i18n.getLocaleChain('fr-FR'), ['fr-FR', 'de', 'en'])
  })

  test('only includes the base language when it is loaded', () => {
    const i18n = new I18N({ locale: 'pt-BR', fallbackLocale: 'en', preloaded })
    assert.deepStrictEqual(i18n.getLocaleChain('pt-BR'), ['pt-BR', 'pt', 'en'])
    assert.deepStrictEqual(i18n.getLocaleChain('es-MX'), ['es-MX', 'en'])
    assert.deepStrictEqual(i18n.getLocaleChain('en'), ['en'])
  })

  test('treats empty strings as present', () => {
    const i18n = new I18N({ locale: 'pt-BR', fallbackLocale: 'en', preloaded })
    assert.strictEqual(i18n.get('emptyInPT'), '')
    assert.strictEqual(i18n.t('emptyInPT'), '')
  })

  test('legacy lookup without fallbackLocale is unchanged', () => {
    const i18n = new I18N({ locale: 'pt-BR', preloaded })
    // any loaded language containing the key
    assert.strictEqual(i18n.get('onlyDE'), 'Nur DE')
    // empty strings are skipped
    assert.strictEqual(i18n.get('emptyInPT'), 'Not empty')
  })

  test('init loads fallback locales', async () => {
    const requested = stubFetch({ 'en.lang': 'onlyEN = Only EN', 'pt-BR.lang': 'onlyBR = Só BR' })
    try {
      const i18n = new I18N({ location: 'lang', locale: 'pt-BR', fallbackLocale: 'en' })
      const current = await i18n.init()
      assert.strictEqual(current.onlyBR, 'Só BR')
      assert.strictEqual(i18n.t('onlyEN'), 'Only EN')
      assert.deepStrictEqual(requested.toSorted(), ['lang/en.lang', 'lang/pt-BR.lang'])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('per-call locale', () => {
  const i18n = new I18N({
    locale: 'en-US',
    preloaded: {
      'en-US': { greeting: 'Hello {name}' },
      'de-DE': { greeting: 'Hallo {name}' },
    },
  })

  test('get() uses the given locale', () => {
    assert.strictEqual(i18n.get('greeting', { name: 'Ana' }, 'de-DE'), 'Hallo Ana')
    assert.strictEqual(i18n.get('greeting', { name: 'Ana' }), 'Hello Ana')
  })

  test('getValue() uses the given locale', () => {
    assert.strictEqual(i18n.getValue('greeting', 'de-DE'), 'Hallo {name}')
  })

  test('t() uses the given locale', () => {
    assert.strictEqual(i18n.t('greeting', { name: 'Ana' }, 'de-DE'), 'Hallo Ana')
  })

  test('forLocale() returns a bound t()', () => {
    const t = i18n.forLocale('de-DE')
    assert.strictEqual(t('greeting', { name: 'Ana' }), 'Hallo Ana')
    assert.strictEqual(t('missing'), 'missing')
    assert.strictEqual(i18n.locale, 'en-US')
  })
})

describe('t()', () => {
  const i18n = new I18N({ preloaded: { 'en-US': { hello: 'Hello {name}' } } })

  test('returns the translated string', () => {
    assert.strictEqual(i18n.t('hello', { name: 'Ana' }), 'Hello Ana')
  })

  test('falls back to the key, get() stays undefined', () => {
    assert.strictEqual(i18n.t('missing.key'), 'missing.key')
    assert.strictEqual(i18n.get('missing.key'), undefined)
  })
})

describe('plurals', () => {
  const preloaded = {
    en: {
      'items.zero': 'No items',
      'items.one': '{count} item',
      'items.other': '{count} items',
      'files.one': 'One file in {folder}',
      'files.other': '{count} files in {folder}',
      exact: 'Exact key wins',
      'exact.other': 'plural',
    },
    pt: {
      'items.one': '{count} item',
      'items.other': '{count} itens',
    },
    'pt-PT': {
      'items.one': '{count} item (PT)',
      'items.other': '{count} itens (PT)',
    },
    ru: {
      'apples.one': '{count} яблоко',
      'apples.few': '{count} яблока',
      'apples.many': '{count} яблок',
      'apples.other': '{count} яблока',
    },
  }
  const i18n = new I18N({ locale: 'en', preloaded })

  test('selects forms in en', () => {
    assert.strictEqual(i18n.get('items', { count: 0 }), 'No items')
    assert.strictEqual(i18n.get('items', { count: 1 }), '1 item')
    assert.strictEqual(i18n.get('items', { count: 5 }), '5 items')
  })

  test('accepts a number as args', () => {
    assert.strictEqual(i18n.t('items', 0), 'No items')
    assert.strictEqual(i18n.t('items', 1), '1 item')
    assert.strictEqual(i18n.t('items', 2), '2 items')
  })

  test('substitutes other placeholders', () => {
    assert.strictEqual(i18n.t('files', { count: 1, folder: 'docs' }), 'One file in docs')
    assert.strictEqual(i18n.t('files', { count: 3, folder: 'docs' }), '3 files in docs')
  })

  test('uses the plural category when key.zero is missing', () => {
    // en: 0 → other
    assert.strictEqual(i18n.t('files', { count: 0, folder: 'docs' }), '0 files in docs')
  })

  test('selects forms in pt using the locale plural rules', () => {
    // pt (Brazil): 0 and 1 are "one", pt-PT: 0 is "other"
    assert.strictEqual(i18n.t('items', 0, 'pt'), '0 item')
    assert.strictEqual(i18n.t('items', 1, 'pt'), '1 item')
    assert.strictEqual(i18n.t('items', 2, 'pt'), '2 itens')
    assert.strictEqual(i18n.t('items', 0, 'pt-PT'), '0 itens (PT)')
  })

  test('selects few/many forms', () => {
    assert.strictEqual(i18n.t('apples', 1, 'ru'), '1 яблоко')
    assert.strictEqual(i18n.t('apples', 3, 'ru'), '3 яблока')
    assert.strictEqual(i18n.t('apples', 5, 'ru'), '5 яблок')
  })

  test('the exact key takes precedence', () => {
    assert.strictEqual(i18n.t('exact', 3), 'Exact key wins')
  })

  test('only applies with a numeric count', () => {
    assert.strictEqual(i18n.get('items'), undefined)
    assert.strictEqual(i18n.get('items', { count: '2' }), undefined)
    assert.strictEqual(i18n.t('items', 'two'), 'items')
  })

  test('prefers forms from the requested locale over fallbacks', () => {
    const withFallback = new I18N({
      locale: 'pt-BR',
      fallbackLocale: 'en',
      preloaded: {
        'pt-BR': { 'items.other': '{count} itens' },
        en: { 'items.one': '{count} item' },
      },
    })
    assert.strictEqual(withFallback.t('items', 1), '1 itens')
    assert.strictEqual(withFallback.t('items', 1, 'de'), '1 item')
  })

  test('falls back to one/other without Intl.PluralRules', () => {
    const { PluralRules } = Intl
    Intl.PluralRules = undefined
    try {
      assert.strictEqual(i18n.t('apples', 1, 'ru'), '1 яблоко')
      assert.strictEqual(i18n.t('apples', 5, 'ru'), '5 яблока')
      assert.strictEqual(i18n.t('items', 0), 'No items')
    } finally {
      Intl.PluralRules = PluralRules
    }
  })

  test('handles invalid locale tags', () => {
    const custom = new I18N({ locale: 'test', preloaded: { test: { 'x.one': 'one', 'x.other': 'other' } } })
    assert.strictEqual(custom.t('x', 1), 'one')
    assert.strictEqual(custom.t('x', 2), 'other')
  })
})

describe('numeric zero args', () => {
  test('replaces tokens with 0', () => {
    const i18n = new I18N({ preloaded: { 'en-US': { total: 'Total: {count}' } } })
    assert.strictEqual(i18n.get('total', 0), 'Total: 0')
    assert.strictEqual(i18n.get('total', { count: 0 }), 'Total: 0')
  })
})

describe('onMissing', () => {
  test('is called for missing keys', () => {
    const calls = []
    const i18n = new I18N({ onMissing: info => calls.push(info) && undefined })
    assert.strictEqual(i18n.get('nope'), undefined)
    assert.strictEqual(i18n.t('nope', null, 'de-DE'), 'nope')
    assert.deepStrictEqual(calls, [
      { key: 'nope', locale: 'en-US', type: 'key' },
      { key: 'nope', locale: 'de-DE', type: 'key' },
    ])
  })

  test('can provide a replacement for missing keys', () => {
    const i18n = new I18N({ onMissing: ({ key, locale }) => `[${locale}:${key}]` })
    assert.strictEqual(i18n.get('nope'), '[en-US:nope]')
    assert.strictEqual(i18n.t('nope'), '[en-US:nope]')
  })

  test('is called for missing args', () => {
    const calls = []
    const i18n = new I18N({
      preloaded: { 'en-US': { greet: '{greeting} {name}' } },
      onMissing: info => {
        calls.push(info)
        return info.arg === 'name' ? '?' : undefined
      },
    })
    assert.strictEqual(i18n.t('greet', { greeting: 'Hi' }), 'Hi ?')
    assert.strictEqual(i18n.t('greet', {}), ' ?')
    assert.deepStrictEqual(calls[0], { key: 'greet', locale: 'en-US', type: 'arg', arg: 'name' })
    assert.strictEqual(calls.length, 3)
  })

  test('survives init()', async () => {
    const onMissing = () => 'missing'
    const i18n = new I18N({ preloaded: { 'en-US': {} }, onMissing })
    await i18n.init({ locale: 'en-US' })
    assert.strictEqual(i18n.get('nope'), 'missing')
  })
})

describe('put()', () => {
  test('writes to the given locale', () => {
    const i18n = new I18N({ preloaded: { 'en-US': {}, 'de-DE': {} } })
    i18n.put('key', 'Wert', 'de-DE')
    assert.strictEqual(i18n.get('key', null, 'de-DE'), 'Wert')
    assert.strictEqual(i18n.langs['en-US'].key, undefined)
  })

  test('writes to the current language by default', async () => {
    const i18n = new I18N({ preloaded: { 'en-US': {}, 'de-DE': {} } })
    await i18n.setCurrent('de-DE')
    i18n.put('key', 'Wert')
    assert.strictEqual(i18n.current.key, 'Wert')
    assert.strictEqual(i18n.langs['de-DE'].key, 'Wert')
  })

  test('works before setCurrent()', () => {
    const i18n = new I18N({ preloaded: { 'en-US': {} } })
    i18n.put('key', 'Value')
    assert.strictEqual(i18n.get('key'), 'Value')
  })

  test('is visible after the current language is extended', async () => {
    const i18n = new I18N({ preloaded: { 'en-US': { a: 'A' } } })
    await i18n.setCurrent('en-US')
    i18n.addLanguage('en-US', { b: 'B' })
    i18n.put('c', 'C')
    assert.strictEqual(i18n.get('b'), 'B')
    assert.strictEqual(i18n.get('c'), 'C')
  })
})

describe('loading without fetch', () => {
  beforeEach(() => {
    globalThis.fetch = () => {
      throw new Error('fetch should not be called')
    }
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('addLanguage() dedupes loaded and langs', () => {
    const i18n = new I18N({ langs: ['en-US', 'en-US'] })
    i18n.addLanguage('fr-FR', { a: 'a' })
    i18n.addLanguage('fr-FR', { b: 'b' })
    i18n.applyLanguage('fr-FR', { c: 'c' })
    assert.deepStrictEqual(i18n.getLangs, ['en-US', 'fr-FR'])
    assert.deepStrictEqual(i18n.loaded, ['fr-FR'])
    assert.deepStrictEqual(i18n.langs['fr-FR'], { a: 'a', b: 'b', c: 'c' })
  })

  test('addLanguage() does not leak into other instances', () => {
    new I18N().addLanguage('fr-FR', {})
    assert.deepStrictEqual(new I18N().getLangs, ['en-US'])
  })

  test('setCurrent() on a preloaded locale does not fetch', async () => {
    const i18n = new I18N({ locale: 'de-DE', preloaded: { 'de-DE': { hello: 'Hallo' } } })
    const current = await i18n.init()
    assert.strictEqual(current.hello, 'Hallo')
    await i18n.setCurrent('de-DE')
    assert.strictEqual(i18n.t('hello'), 'Hallo')
  })

  test('addLanguage() with .lang file contents', async () => {
    const i18n = new I18N()
    i18n.addLanguage('de-DE', '# German\r\nhello = Hallo\r\n')
    await i18n.setCurrent('de-DE')
    assert.strictEqual(i18n.t('hello'), 'Hallo')
  })

  test('loadLang() accepts JSON language files', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ hello: 'Hallo' }) })
    const i18n = new I18N({ extension: '.json' })
    const lang = await i18n.loadLang('de-DE')
    assert.deepStrictEqual(lang, { hello: 'Hallo' })
  })
})

describe('.lang parser', () => {
  test('normalises CRLF line endings', () => {
    const result = I18N.fromFile('a = one\r\nb = two\r\n\r\nc = three')
    assert.deepStrictEqual(result, { a: 'one', b: 'two', c: 'three' })
  })

  test('ignores full-line comments', () => {
    const lines = ['# comment = no', '  ; also = no', 'a = one', '\t# indented = no', 'b = two # not a comment']
    const text = lines.join('\n')
    assert.deepStrictEqual(I18N.fromFile(text), { a: 'one', b: 'two # not a comment' })
  })

  test('trims keys', () => {
    assert.deepStrictEqual(I18N.fromFile('  spaced key\t= value'), { 'spaced key': 'value' })
  })

  test('joins lines ending with a backslash', () => {
    const text = 'long = first line, \\\n    second line, \\\n  third line\nnext = value'
    assert.deepStrictEqual(I18N.fromFile(text), {
      long: 'first line, second line, third line',
      next: 'value',
    })
  })

  test('continuation works with CRLF and at end of file', () => {
    assert.deepStrictEqual(I18N.fromFile('a = one \\\r\n  two\r\nb = end \\'), { a: 'one two', b: 'end' })
  })

  test('a double backslash is not a continuation', () => {
    assert.deepStrictEqual(I18N.fromFile('path = C:\\\\\nnext = value'), { path: 'C:\\\\', next: 'value' })
  })

  test('keeps existing parse results', () => {
    const text = 'a = b = c\nempty = \nnoequals\nkey=value\nurl = https://x.test/?a=1'
    assert.deepStrictEqual(I18N.fromFile(text), { a: 'b = c', empty: '', key: 'value', url: 'https://x.test/?a=1' })
  })

  test('processFile() and parse() match fromFile()', () => {
    const text = '# header\r\n\r\na = one \\\r\n two\r\n\r\nb = two\n\n\nc = three'
    const expected = { a: 'one two', b: 'two', c: 'three' }
    assert.deepStrictEqual(I18N.processFile(text), expected)
    assert.deepStrictEqual(I18N.parse(text), expected)
  })
})
