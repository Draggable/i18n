import { fetchData } from './fetch.js'

const DEFAULT_CONFIG = {
  extension: '.lang',
  // local or remote directory containing language files
  location: 'assets/lang/',
  // list of available locales, handy for populating selector.
  langs: ['en-US'],
  locale: 'en-US', // init with user's preferred language
  override: {},
}

// Singleton instance holder
let instance = null

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

/**
 * Add an item to an array if it is not already present
 * @param {Array} arr
 * @param {*} item
 */
const pushUnique = (arr, item) => {
  if (Array.isArray(arr) && !arr.includes(item)) {
    arr.push(item)
  }
}

/**
 * Whether a looked up value counts as present.
 * Legacy lookups treat empty strings as missing, fallbackLocale lookups do not.
 * @param {*} value
 * @param {Boolean} strict true when fallbackLocale is configured
 * @return {Boolean}
 */
const isPresent = (value, strict) => (strict ? value !== undefined && value !== null : Boolean(value))

/**
 * Extract the plural count from get/t args
 * @param {*} args
 * @return {Number|undefined}
 */
const getCount = args => {
  if (typeof args === 'number') {
    return args
  }
  if (args && typeof args === 'object' && typeof args.count === 'number') {
    return args.count
  }
}

const pluralRulesCache = new Map()

/**
 * Get the CLDR plural category for a count in a locale
 * @param {String} locale
 * @param {Number} count
 * @return {String} plural category, eg. 'one', 'few', 'other'
 */
const getPluralCategory = (locale, count) => {
  const basicCategory = count === 1 ? 'one' : 'other'
  if (typeof Intl === 'undefined' || typeof Intl.PluralRules !== 'function') {
    return basicCategory
  }
  if (!pluralRulesCache.has(locale)) {
    let rules = null
    try {
      rules = new Intl.PluralRules(String(locale).replaceAll('_', '-'))
    } catch {
      // invalid locale tag
    }
    pluralRulesCache.set(locale, rules)
  }
  const rules = pluralRulesCache.get(locale)
  return rules ? rules.select(count) : basicCategory
}

/**
 * Plural key suffixes to try, in order
 * @param {Number} count
 * @param {String} locale
 * @return {String[]}
 */
const getPluralSuffixes = (count, locale) => {
  const suffixes = new Set()
  if (count === 0) {
    suffixes.add('zero')
  }
  suffixes.add(getPluralCategory(locale, count))
  suffixes.add('other')
  return [...suffixes]
}

/**
 * Main i18n class
 * @class I18NBase
 * @classdesc methods and data store for i18n
 */
class I18NBase {
  /**
   * Process options and start the module
   * @param {Object} options
   */
  constructor(options = DEFAULT_CONFIG) {
    this.langs = Object.create(null)
    this.loaded = []
    this.processConfig(options)
  }

  /**
   * parse and format config
   * @param {Object} options
   */
  processConfig(options) {
    const { location, ...restOptions } = { ...DEFAULT_CONFIG, ...options }
    // Ensure location ends with a slash
    const parsedLocation = location.endsWith('/') ? location : `${location}/`
    // Copy langs so the defaults and user supplied arrays are never mutated
    if (Array.isArray(restOptions.langs)) {
      restOptions.langs = [...new Set(restOptions.langs)]
    }
    this.config = { location: parsedLocation, ...restOptions }

    const { preloaded = {}, override = {} } = this.config

    // Merge locales from both preloaded and override
    // This supports legacy usage where override defined entire languages
    const allLocales = new Set([...Object.keys(preloaded), ...Object.keys(override)])

    // Apply languages from both preloaded and override
    // applyLanguage will merge them properly (existing + preloaded + override)
    for (const locale of allLocales) {
      const preloadedLang = preloaded[locale] || {}
      const overrideLang = override[locale] || {}
      // Merge preloaded and override for this locale
      const mergedLang = { ...preloadedLang, ...overrideLang }
      this.applyLanguage(locale, mergedLang)
    }

    this.locale = this.config.locale || this.config.langs[0]
  }

  /**
   * Load language and set default
   * @param  {Object} options
   * @return {Promise}        resolves language
   */
  init(options) {
    this.processConfig({ ...this.config, ...options })
    // Fallback locales are loaded alongside the current locale so lookups can fall back to them
    const fallbacks = this.getFallbackLocales().filter(locale => !this.loaded.includes(locale))
    if (!fallbacks.length) {
      return this.setCurrent(this.locale)
    }
    return Promise.all([this.setCurrent(this.locale), ...fallbacks.map(locale => this.loadLang(locale))]).then(
      ([current]) => current,
    )
  }

  /**
   * Adds a language to the list of available languages
   * @param {String} locale
   * @param {String|Object} lang
   */
  addLanguage(locale, lang = {}) {
    lang = typeof lang === 'string' ? I18NBase.processFile(lang) : lang
    this.applyLanguage(locale, lang)
    pushUnique(this.loaded, locale)
    pushUnique(this.config.langs, locale)
  }

  /**
   * Configured fallback locales
   * @return {String[]}
   */
  getFallbackLocales() {
    const { fallbackLocale } = this.config
    return [].concat(fallbackLocale ?? []).filter(locale => typeof locale === 'string' && locale)
  }

  /**
   * Locales checked, in order, when looking up a key with fallbackLocale configured:
   * requested locale, its base language (if loaded), then each fallback locale
   * @param  {String} locale
   * @return {String[]}
   */
  getLocaleChain(locale = this.locale) {
    const chain = [locale]
    const baseLocale = String(locale).split(/[-_]/)[0]
    if (baseLocale && this.langs[baseLocale]) {
      chain.push(baseLocale)
    }
    chain.push(...this.getFallbackLocales())
    return [...new Set(chain)]
  }

  /**
   * get a string from a loaded language file
   * @param  {String} key  - the key for the string we are trying to retrieve
   * @param  {String} locale - locale to check for value
   * @return {String} language string or undefined
   */
  getValue(key, locale = this.locale) {
    if (this.config.fallbackLocale) {
      for (const chainLocale of this.getLocaleChain(locale)) {
        const lang = this.langs[chainLocale]
        if (lang && hasOwn(lang, key) && isPresent(lang[key], true)) {
          return lang[key]
        }
      }
      return
    }

    const value = this.langs[locale]?.[key]
    return value || this.getFallbackValue(key)
  }

  /**
   * Find a plural form of key, eg. `key.zero`, `key.one`, `key.other`
   * @param  {String} key
   * @param  {Number} count
   * @param  {String} locale
   * @return {String} plural string or undefined
   */
  getPluralValue(key, count, locale = this.locale) {
    const strict = Boolean(this.config.fallbackLocale)
    const locales = strict ? this.getLocaleChain(locale) : new Set([locale, ...Object.keys(this.langs)])

    for (const pluralLocale of locales) {
      const lang = this.langs[pluralLocale]
      if (!lang) {
        continue
      }
      for (const suffix of getPluralSuffixes(count, pluralLocale)) {
        const pluralKey = `${key}.${suffix}`
        if (hasOwn(lang, pluralKey) && isPresent(lang[pluralKey], strict)) {
          return lang[pluralKey]
        }
      }
    }
  }

  /**
   * Report a missing key or argument to the onMissing handler
   * @param  {Object} info { key, locale, type, arg }
   * @return {String} replacement string returned by onMissing or undefined
   */
  handleMissing(info) {
    const { onMissing } = this.config
    if (typeof onMissing === 'function') {
      const result = onMissing(info)
      if (typeof result === 'string') {
        return result
      }
    }
  }

  /**
   * Find a language that has desired key
   * @param {String} key value key
   * @return {String} found value or undefined
   */
  getFallbackValue(key) {
    const fallbackLang = Object.values(this.langs).find(lang => lang[key])
    return fallbackLang?.[key]
  }

  /**
   * Escape variable syntax
   * @param  {String} str
   * @return {String}     escaped str
   */
  makeSafe(str) {
    const mapObj = {
      '{': String.raw`\{`,
      '}': String.raw`\}`,
      '|': String.raw`\|`,
    }

    const escapedStr = str.replaceAll(/[{}|]/g, matched => mapObj[matched])

    return new RegExp(escapedStr, 'g')
  }

  /**
   * Temporarily put a string into the currently loaded language, or the given locale
   * @param  {String} key
   * @param  {String} string
   * @param  {String} locale optional locale to write to
   * @return {String} string in current language
   */
  put(key, string, locale) {
    let lang
    if (locale === undefined) {
      lang = this.current || (this.langs[this.locale] ??= {})
    } else {
      lang = this.langs[locale] ??= {}
    }
    lang[key] = string

    return string
  }

  /**
   * Parse arguments for the requested string
   * @param  {String} key  the key we use to lookup our translation
   * @param  {multi}  args  string, number or object containing our arguments
   * @param  {String} locale optional locale, defaults to the current locale
   * @return {String}      updated string translation
   */
  get(key, args, locale = this.locale) {
    const strict = Boolean(this.config.fallbackLocale)
    let value = this.getValue(key, locale)

    if (!isPresent(value, strict)) {
      const count = getCount(args)
      value = count === undefined ? undefined : this.getPluralValue(key, count, locale)
    }

    if (!isPresent(value, strict)) {
      return this.handleMissing({ key, locale, type: 'key' })
    }

    // No replacement needed if no args provided
    if (!args && args !== 0) {
      return value
    }

    const tokens = value.match(/\{[^}]+?\}/g)

    // No tokens to replace
    if (!tokens) {
      return value
    }

    // Object args: replace each token with corresponding key
    if (typeof args === 'object') {
      for (const token of tokens) {
        const tokenKey = token.slice(1, -1)
        let replacement = args[tokenKey]
        if (replacement === undefined || replacement === null) {
          replacement = this.handleMissing({ key, locale, type: 'arg', arg: tokenKey }) ?? ''
        }
        value = value.replace(this.makeSafe(token), replacement)
      }
    } else {
      // Primitive args: replace all tokens with same value
      value = value.replaceAll(/\{[^}]+?\}/g, args)
    }

    return value
  }

  /**
   * Like get() but always returns a string, falling back to the key itself
   * @param  {String} key  the key we use to lookup our translation
   * @param  {multi}  args  string, number or object containing our arguments
   * @param  {String} locale optional locale, defaults to the current locale
   * @return {String} translated string or key
   */
  t(key, args, locale) {
    const value = this.get(key, args, locale)
    return value === undefined ? key : value
  }

  /**
   * Get a translate function bound to a locale
   * @param  {String} locale
   * @return {Function} (key, args) => string
   */
  forLocale(locale) {
    return (key, args) => this.t(key, args, locale)
  }

  /**
   * Static method: Process a language file from raw text
   * @param  {String} response
   * @return {Object} processed language
   */
  static processFile(response) {
    // blank lines are ignored by fromFile
    return I18N.fromFile(response)
  }

  /**
   * Static method: Turn raw text from the language files into fancy JSON
   * Supports `#` and `;` full-line comments and trailing `\` line continuation
   * @param  {String} rawText
   * @return {Object} converted language file
   */
  static fromFile(rawText) {
    const lines = String(rawText).replaceAll('\r\n', '\n').split('\n')
    const lang = {}
    const regex = /^(.+?) *?= *?([^\n]+)/
    const parseLine = line => {
      const matches = regex.exec(line)
      const key = matches?.[1].trim()
      if (key) {
        lang[key] = matches[2].trim()
      }
    }

    let continued = null
    for (const line of lines) {
      let logicalLine = line
      if (continued !== null) {
        logicalLine = continued + line.trimStart()
        continued = null
      } else if (/^\s*[#;]/.test(line)) {
        continue
      }

      // a single trailing backslash joins the next line
      if (/(^|[^\\])\\$/.test(logicalLine)) {
        continued = logicalLine.slice(0, -1)
        continue
      }

      parseLine(logicalLine)
    }

    if (continued !== null) {
      parseLine(continued)
    }

    return lang
  }

  /**
   * Static method: Parse the contents of a `.lang` file, alias of processFile
   * @param  {String} text
   * @return {Object} processed language
   */
  static parse(text) {
    return I18N.processFile(text)
  }

  /**
   * Get the singleton instance
   * @param {Object} options
   * @return {I18NBase} singleton instance
   */
  static getInstance(options) {
    if (!instance) {
      instance = new I18NBase(options)
    }
    return instance
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance() {
    instance = null
  }

  /**
   * Load a remotely stored language file
   * @param  {String} locale
   * @param  {Boolean} useCache
   * @return {Promise}       resolves response
   */
  async loadLang(locale, useCache = true) {
    // Return cached language if already loaded
    if (this.loaded.includes(locale) && useCache) {
      return this.langs[locale]
    }
    // Fetch and process language file
    const langFile = `${this.config.location}${locale}${this.config.extension}`

    try {
      const lang = await fetchData(langFile)
      const processedFile = typeof lang === 'string' ? I18NBase.processFile(lang) : lang
      this.applyLanguage(locale, processedFile)
      return this.langs[locale]
    } catch (err) {
      console.error(err)
      return this.applyLanguage(locale)
    }
  }

  /**
   * applies overrides from config
   * @param {String} locale
   * @param {Object} lang
   * @return {Object} overriden language
   */
  applyLanguage(locale, lang = {}) {
    const override = this.config.override[locale] || {}
    const existingLang = this.langs[locale] || {}
    this.langs[locale] = { ...existingLang, ...lang, ...override }
    // keep the current language reference in sync
    if (this.current && locale === this.locale) {
      this.current = this.langs[locale]
    }
    pushUnique(this.loaded, locale)
    return this.langs[locale]
  }

  /**
   * return currently available languages
   * @return {Object} all configured languages
   */
  get getLangs() {
    return this.config.langs
  }

  /**
   * Attempt to set the current language to the local provided
   * @param {String}   locale
   * @return {Promise} language
   */
  async setCurrent(locale = 'en-US') {
    if (!this.loaded.includes(locale)) {
      await this.loadLang(locale)
    }

    this.locale = locale
    this.current = this.langs[locale]

    return this.current
  }
}

/**
 * Proxy wrapper that enables singleton pattern:
 * - I18N() returns the singleton instance
 * - new I18N() creates a new instance
 */
export const I18N = new Proxy(I18NBase, {
  /**
   * Called when I18N() is invoked as a function (without new)
   * Returns the singleton instance
   */
  apply(target, thisArg, args) {
    return target.getInstance(...args)
  },

  /**
   * Called when new I18N() is invoked
   * Creates a new instance
   */
  construct(target, args) {
    return new target(...args)
  },

  /**
   * Proxy property access to the base class
   */
  get(target, prop) {
    return target[prop]
  },
})

export default I18N.getInstance()
