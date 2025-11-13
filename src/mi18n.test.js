import assert from 'assert'
import { describe, test } from 'node:test'
import mi18n, { I18N } from './mi18n.js'

describe('I18N', () => {
  const locale = 'te-ST'
  const testOpts = {
    locale,
    override: {
      'te-ST': {
        testKey: 'Teeesst',
        testVars: 'I saw {count} {animals}',
        testMultipleTokens: '{greeting} {name}, you have {count} messages',
        testNoTokens: 'Just a plain string',
        testMissingVars: '{hello} {world}',
      },
    },
  }

  test('should exist', () => {
    assert.ok(mi18n)
  })

  describe('should have methods', async () => {
    await mi18n.init(testOpts)

    describe('init()', () => {
      test('should exist', () => {
        assert.strictEqual(typeof mi18n.init, 'function')
      })
      test('should set locale', () => {
        assert.strictEqual(mi18n.config.locale, locale)
      })
      test('should set current language', () => {
        assert.ok(mi18n.current)
        assert.ok(Object.keys(mi18n.current).includes('testKey'))
      })
    })
  })

  describe('should have methods after init', async () => {
    await mi18n.init(testOpts)

    describe('get()', () => {
      test('shall exist', () => {
        assert.ok(mi18n.get)
      })

      test('shall return a string', () => {
        const str = mi18n.get('testKey')
        assert.strictEqual(str, 'Teeesst')
      })

      test('shall return a string with vars', () => {
        const str = mi18n.get('testVars', {
          count: 3,
          animals: 'chickens',
        })
        assert.strictEqual(str, 'I saw 3 chickens')
      })

      test('shall return undefined for missing key', () => {
        const str = mi18n.get('nonExistentKey')
        assert.strictEqual(str, undefined)
      })

      test('shall return string without replacement when no args', () => {
        const str = mi18n.get('testVars')
        assert.strictEqual(str, 'I saw {count} {animals}')
      })

      test('shall return string when no tokens to replace', () => {
        const str = mi18n.get('testNoTokens', { foo: 'bar' })
        assert.strictEqual(str, 'Just a plain string')
      })

      test('shall replace with primitive arg', () => {
        const str = mi18n.get('testVars', 'something')
        assert.strictEqual(str, 'I saw something something')
      })

      test('shall replace multiple tokens with object', () => {
        const str = mi18n.get('testMultipleTokens', {
          greeting: 'Hello',
          name: 'Alice',
          count: 5,
        })
        assert.strictEqual(str, 'Hello Alice, you have 5 messages')
      })

      test('shall handle missing object properties with empty string', () => {
        const str = mi18n.get('testMissingVars', {})
        assert.strictEqual(str, ' ')
      })

      test('shall handle null/undefined values in object args', () => {
        const str = mi18n.get('testMissingVars', {
          hello: null,
          world: undefined,
        })
        assert.strictEqual(str, ' ')
      })
    })

    describe('put()', () => {
      test('shall exist', () => {
        assert.ok(mi18n.put)
      })

      test('shall add a key to current language', () => {
        const str = mi18n.put('dynamicKey', 'Dynamic Value')
        assert.strictEqual(str, 'Dynamic Value')
        assert.strictEqual(mi18n.get('dynamicKey'), 'Dynamic Value')
      })
    })

    describe('getValue() and getFallbackValue()', () => {
      test('getValue should return value from specified locale', () => {
        const value = mi18n.getValue('testKey', 'te-ST')
        assert.strictEqual(value, 'Teeesst')
      })

      test('getValue should return fallback when locale missing', () => {
        const i18n = new I18N({
          override: {
            'en-US': { fallbackKey: 'Fallback Value' },
            'fr-FR': {},
          },
        })
        const value = i18n.getValue('fallbackKey', 'fr-FR')
        assert.strictEqual(value, 'Fallback Value')
      })

      test('getFallbackValue should return undefined for missing key', () => {
        const value = mi18n.getFallbackValue('nonExistentKey')
        assert.strictEqual(value, undefined)
      })
    })

    describe('getLangs', () => {
      test('should return available languages', () => {
        const langs = mi18n.getLangs
        assert.ok(Array.isArray(langs))
        assert.ok(langs.length > 0)
      })
    })
  })

  describe('loadLang', () => {
    const location = 'https://formbuilder.online/assets/lang/'
    const i18n = new I18N({ location })

    test('should load de-DE', async () => {
      const lang = await i18n.loadLang('de-DE')
      assert.strictEqual(typeof lang, 'object')
      assert.strictEqual(Object.keys(i18n.langs)[0], 'de-DE')
    })

    test('should use cache on second load', async () => {
      const lang1 = await i18n.loadLang('de-DE')
      const lang2 = await i18n.loadLang('de-DE', true)
      assert.strictEqual(lang1, lang2)
    })

    test('should bypass cache when useCache is false', async () => {
      const lang = await i18n.loadLang('de-DE', false)
      assert.strictEqual(typeof lang, 'object')
    })

    test('should handle fetch error gracefully', async () => {
      const lang = await i18n.loadLang('nonexistent-locale')
      assert.strictEqual(typeof lang, 'object')
    })
  })

  describe('addLanguage', () => {
    const locale = 'te-ST'
    const i18n = new I18N()

    test('should load te-ST with object', async () => {
      i18n.addLanguage(locale, {
        myKey: 'one thing',
        yourKey: "shouldn't change",
      })
      await i18n.setCurrent(locale)
      assert.strictEqual(i18n.locale, locale)
      assert.strictEqual(i18n.get('myKey'), 'one thing')
      assert.strictEqual(i18n.get('yourKey'), "shouldn't change")
    })

    test('should load language from string format', () => {
      const i18n = new I18N()
      const langString = 'greeting = Hello\nfarewell = Goodbye'
      i18n.addLanguage('test-lang', langString)
      assert.ok(i18n.langs['test-lang'])
      assert.strictEqual(i18n.langs['test-lang'].greeting, 'Hello')
      assert.strictEqual(i18n.langs['test-lang'].farewell, 'Goodbye')
    })
  })

  describe('processConfig', () => {
    test('should handle location without trailing slash', () => {
      const i18n = new I18N({ location: 'assets/lang' })
      assert.strictEqual(i18n.config.location, 'assets/lang/')
    })

    test('should handle location with trailing slash', () => {
      const i18n = new I18N({ location: 'assets/lang/' })
      assert.strictEqual(i18n.config.location, 'assets/lang/')
    })

    test('should handle override taking precedence over preloaded', () => {
      const i18n = new I18N({
        override: {
          'test-OVERRIDE': { overrideKey: 'Override Value' },
        },
        preloaded: {
          'pre-LOAD': { preKey: 'Preloaded Value' },
        },
      })
      // Override takes precedence, so only override langs are used
      assert.ok(i18n.langs['test-OVERRIDE'])
      assert.strictEqual(i18n.langs['test-OVERRIDE'].overrideKey, 'Override Value')
    })

    test('should use first lang when locale not specified', () => {
      const i18n = new I18N({
        langs: ['fr-FR', 'en-US'],
        locale: null,
      })
      assert.strictEqual(i18n.locale, 'fr-FR')
    })
  })

  describe('setCurrent', () => {
    test('should set locale to already loaded language', async () => {
      const i18n = new I18N({
        override: {
          'en-US': { test: 'value' },
        },
      })
      i18n.loaded.push('en-US')
      const lang = await i18n.setCurrent('en-US')
      assert.strictEqual(i18n.locale, 'en-US')
      assert.strictEqual(lang.test, 'value')
    })

    test('should use default locale when none provided', async () => {
      const i18n = new I18N()
      await i18n.setCurrent()
      assert.strictEqual(i18n.locale, 'en-US')
    })
  })

  describe('Static methods', () => {
    describe('processFile()', () => {
      test('should process language file text', () => {
        const fileContent = 'key1 = value1\n\nkey2 = value2'
        const result = I18N.processFile(fileContent)
        assert.strictEqual(result.key1, 'value1')
        assert.strictEqual(result.key2, 'value2')
      })
    })

    describe('fromFile()', () => {
      test('should parse language file format', () => {
        const fileContent = 'greeting = Hello World\nfarewell = Goodbye'
        const result = I18N.fromFile(fileContent)
        assert.strictEqual(result.greeting, 'Hello World')
        assert.strictEqual(result.farewell, 'Goodbye')
      })

      test('should trim whitespace from values', () => {
        const fileContent = 'key =   value with spaces   '
        const result = I18N.fromFile(fileContent)
        assert.strictEqual(result.key, 'value with spaces')
      })

      test('should handle lines without equals sign', () => {
        const fileContent = 'valid = value\ninvalid line\nanother = value'
        const result = I18N.fromFile(fileContent)
        assert.strictEqual(result.valid, 'value')
        assert.strictEqual(result.another, 'value')
        assert.strictEqual(result['invalid line'], undefined)
      })
    })
  })

  describe('applyLanguage', () => {
    test('should merge existing language with new data', () => {
      const i18n = new I18N()
      i18n.langs['test'] = { existing: 'old' }
      i18n.applyLanguage('test', { newKey: 'new' })
      assert.strictEqual(i18n.langs.test.existing, 'old')
      assert.strictEqual(i18n.langs.test.newKey, 'new')
    })

    test('should apply overrides', () => {
      const i18n = new I18N({
        override: {
          test: { overridden: 'override value' },
        },
      })
      i18n.applyLanguage('test', { overridden: 'original', normal: 'value' })
      assert.strictEqual(i18n.langs.test.overridden, 'override value')
      assert.strictEqual(i18n.langs.test.normal, 'value')
    })
  })
})
