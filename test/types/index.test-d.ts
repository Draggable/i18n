// Type tests for src/mi18n.d.ts, checked with `npm run test:types` (tsc --noEmit)
import i18n, {
  I18N,
  type I18NInstance,
  type I18NOptions,
  type LanguageStrings,
  type MissingInfo,
  type TranslateFunction,
} from '../../src/mi18n.js'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expectType = <T extends true>(_value?: T) => {}

const options: I18NOptions = {
  location: 'assets/lang',
  langs: ['en-US', 'pt-BR'],
  locale: 'pt-BR',
  preloaded: { 'en-US': { hello: 'Hello {name}' } },
  override: { 'pt-BR': { hello: 'Olá {name}' } },
  fallbackLocale: ['pt', 'en-US'],
  onMissing: (info: MissingInfo) => {
    expectType<Equal<typeof info.type, 'key' | 'arg'>>()
    return info.type === 'key' ? `[${info.key}]` : undefined
  },
}

// callable proxy returns the singleton, `new` returns an instance
const singleton = I18N(options)
const instance = new I18N({ fallbackLocale: 'en' })
const typed: I18N = instance
expectType<Equal<typeof singleton, I18NInstance>>()
expectType<Equal<typeof instance, I18NInstance>>()
expectType<Equal<typeof i18n, I18NInstance>>()
expectType<Equal<typeof typed, I18NInstance>>()
expectType<Equal<ReturnType<typeof I18N.getInstance>, I18NInstance>>()

// statics
expectType<Equal<ReturnType<typeof I18N.fromFile>, LanguageStrings>>()
expectType<Equal<ReturnType<typeof I18N.processFile>, LanguageStrings>>()
expectType<Equal<ReturnType<typeof I18N.parse>, LanguageStrings>>()
I18N.resetInstance()

// lookups
expectType<Equal<ReturnType<typeof i18n.get>, string | undefined>>()
expectType<Equal<ReturnType<typeof i18n.t>, string>>()
expectType<Equal<ReturnType<typeof i18n.getValue>, string | undefined>>()
const fromGet: string | undefined = i18n.get('hello', { name: 'Ana' }, 'pt-BR')
const fromT: string = i18n.t('items', { count: 2 }, 'pt-BR')
const fromCount: string = i18n.t('items', 2)
const fromPrimitive: string | undefined = i18n.get('hello', 'Ana')
const tPt: TranslateFunction = i18n.forLocale('pt-BR')
const fromBound: string = tPt('hello', { name: 'Ana' })
void [fromGet, fromT, fromCount, fromPrimitive, fromBound]

// mutations and loading
i18n.addLanguage('fr-FR', { hello: 'Bonjour' })
i18n.addLanguage('de-DE', 'hello = Hallo')
const put: string = i18n.put('key', 'value', 'fr-FR')
const langs: string[] = i18n.getLangs
const chain: string[] = i18n.getLocaleChain('pt-BR')
const loaded: Promise<LanguageStrings> = i18n.init({ locale: 'en-US' })
const current: Promise<LanguageStrings> = i18n.setCurrent('fr-FR')
const remote: Promise<LanguageStrings> = i18n.loadLang('de-DE', false)
void [put, langs, chain, loaded, current, remote]

// @ts-expect-error locale must be a string
i18n.t('hello', undefined, 1)
// @ts-expect-error put requires a string value
i18n.put('key')
// @ts-expect-error unknown option
new I18N({ fallback: 'en' })
