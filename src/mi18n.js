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

/**
 * Main i18n class
 * @class I18N
 * @classdesc methods and data store for i18n
 */
export class I18N {
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
    const parsedLocation = location.replace(/\/?$/, '/')
    this.config = { location: parsedLocation, ...restOptions }
    const { override, preloaded = {} } = this.config
    const allLangs = Object.entries(this.langs).concat(Object.entries(override || preloaded))
    this.langs = allLangs.reduce((acc, [locale, lang]) => {
      acc[locale] = this.applyLanguage(locale, lang)
      return acc
    }, {})
    this.locale = this.config.locale || this.config.langs[0]
  }

  /**
   * Load language and set default
   * @param  {Object} options
   * @return {Promise}        resolves language
   */
  init(options) {
    this.processConfig({ ...this.config, ...options })
    return this.setCurrent(this.locale)
  }

  /**
   * Adds a language to the list of available languages
   * @param {String} locale
   * @param {String|Object} lang
   */
  addLanguage(locale, lang = {}) {
    lang = typeof lang === 'string' ? I18N.processFile(lang) : lang
    this.applyLanguage(locale, lang)
    this.loaded.push(locale)
    this.config.langs.push(locale)
  }

  /**
   * get a string from a loaded language file
   * @param  {String} key  - the key for the string we are trying to retrieve
   * @param  {String} locale - locale to check for value
   * @return {String} language string or undefined
   */
  getValue(key, locale = this.locale) {
    const value = this.langs[locale]?.[key]
    return value || this.getFallbackValue(key)
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
      '{': '\\{',
      '}': '\\}',
      '|': '\\|',
    }

    str = str.replace(/[{}|]/g, matched => mapObj[matched])

    return new RegExp(str, 'g')
  }

  /**
   * Temporarily put a string into the currently loaded language
   * @param  {String} key
   * @param  {String} string
   * @return {String} string in current language
   */
  put(key, string) {
    this.current[key] = string

    return string
  }

  /**
   * Parse arguments for the requested string
   * @param  {String} key  the key we use to lookup our translation
   * @param  {multi}  args  string, number or object containing our arguments
   * @return {String}      updated string translation
   */
  get(key, args) {
    const _this = this
    let value = this.getValue(key)
    if (!value) {
      return
    }

    const tokens = value.match(/\{[^}]+?\}/g)

    if (args && tokens) {
      if ('object' === typeof args) {
        for (const token of tokens) {
          const key = token.substring(1, token.length - 1)
          value = value.replace(_this.makeSafe(token), args[key] || '')
        }
      } else {
        value = value.replace(/\{[^}]+?\}/g, args)
      }
    }

    return value
  }

  /**
   * Static method: Process a language file from raw text
   * @param  {String} response
   * @return {Object} processed language
   */
  static processFile(response) {
    return I18N.fromFile(response.replace(/\n\n/g, '\n'))
  }

  /**
   * Static method: Turn raw text from the language files into fancy JSON
   * @param  {String} rawText
   * @return {Object} converted language file
   */
  static fromFile(rawText) {
    const lines = rawText.split('\n')
    const lang = {}

    for (let matches, i = 0; i < lines.length; i++) {
      const regex = /^(.+?) *?= *?([^\n]+)/
      matches = regex.exec(lines[i])
      if (matches) {
        lang[matches[1]] = matches[2].replace(/(^\s+|\s+$)/g, '')
      }
    }

    return lang
  }

  /**
   * Load a remotely stored language file
   * @param  {String} locale
   * @param  {Boolean} useCache
   * @return {Promise}       resolves response
   */
  loadLang(locale, useCache = true) {
    const _this = this
    return new Promise(function (resolve, reject) {
      if (_this.loaded.indexOf(locale) !== -1 && useCache) {
        _this.applyLanguage(_this.langs[locale])
        return resolve(_this.langs[locale])
      } else {
        const langFile = [_this.config.location, locale, _this.config.extension].join('')
        return fetchData(langFile)
          .then(lang => {
            const processedFile = I18N.processFile(lang)
            _this.applyLanguage(locale, processedFile)
            _this.loaded.push(locale)
            return resolve(_this.langs[locale])
          })
          .catch(err => {
            console.error(err)
            const lang = _this.applyLanguage(locale)
            resolve(lang)
          })
      }
    })
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

export default new I18N()
