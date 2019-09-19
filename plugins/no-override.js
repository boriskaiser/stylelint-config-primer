const stylelint = require('stylelint')
const {requirePrimerFile} = require('../src/primer')

const ruleName = 'primer/no-override'
const CLASS_PATTERN = /(\.[-\w]+)/
const CLASS_PATTERN_ALL = new RegExp(CLASS_PATTERN, 'g')
const CLASS_PATTERN_ONLY = /^\.[-\w]+(:{1,2}[-\w]+)?$/

module.exports = stylelint.createPlugin(ruleName, (enabled, options = {}) => {
  if (!enabled) {
    return noop
  }

  const {bundles = ['utilities'], ignoreSelectors = []} = options

  const isSelectorIgnored =
    typeof ignoreSelectors === 'function'
      ? ignoreSelectors
      : selector => {
          return ignoreSelectors.some(pattern => {
            return pattern instanceof RegExp ? pattern.test(selector) : selector.includes(pattern)
          })
        }

  const primerMeta = requirePrimerFile('dist/meta.json')
  const availableBundles = Object.keys(primerMeta.bundles)

  // These map selectors to the bundle in which they're defined.
  // If there's no entry for a given selector, it means that it's not defined
  // in one of the *specified* bundles, since we're iterating over the list of
  // bundle names in the options.
  const immutableSelectors = new Map()
  const immutableClassSelectors = new Map()

  for (const bundle of bundles) {
    if (!availableBundles.includes(bundle)) {
      continue
    }
    const stats = requirePrimerFile(`dist/stats/${bundle}.json`)
    const selectors = stats.selectors.values
    for (const selector of selectors) {
      immutableSelectors.set(selector, bundle)
      for (const classSelector of getClassSelectors(selector)) {
        immutableClassSelectors.set(classSelector, bundle)
      }
    }
  }

  const messages = stylelint.utils.ruleMessages(ruleName, {
    rejected: (rule, {selector, bundle}) => {
      const suffix = bundle ? ` (found in ${bundle})` : ''
      const context = selector === rule.selector ? '' : ` in "${rule.selector}"`
      return selector
        ? `"${selector}" should not be overridden${context}${suffix}.`
        : `"${rule.selector}" should not be overridden${suffix}.`
    }
  })

  return (root, result) => {
    if (!Array.isArray(bundles) || bundles.some(bundle => !availableBundles.includes(bundle))) {
      const invalidBundles = Array.isArray(bundles)
        ? `"${bundles.filter(bundle => !availableBundles.includes(bundle)).join('", "')}"`
        : '(not an array)'
      result.warn(`The "bundles" option must be an array of valid bundles; got: ${invalidBundles}`, {
        stylelintType: 'invalidOption',
        stylelintReference: 'https://github.com/primer/stylelint-config-primer#options'
      })
    }

    if (!enabled) {
      return
    }

    const report = (rule, subject) =>
      stylelint.utils.report({
        message: messages.rejected(rule, subject),
        node: rule,
        result,
        ruleName
      })

    root.walkRules(rule => {
      const subject = {rule}
      if (immutableSelectors.has(rule.selector)) {
        if (isClassSelector(rule.selector)) {
          if (!isSelectorIgnored(rule.selector)) {
            subject.bundle = immutableSelectors.get(rule.selector)
            subject.selector = rule.selector
            return report(rule, subject)
          }
        }
      }
      for (const classSelector of getClassSelectors(rule.selector)) {
        if (immutableClassSelectors.has(classSelector)) {
          if (!isSelectorIgnored(classSelector)) {
            subject.bundle = immutableClassSelectors.get(classSelector)
            subject.selector = classSelector
            return report(rule, subject)
          }
        }
      }
    })
  }
})

function getClassSelectors(selector) {
  const match = selector.match(CLASS_PATTERN_ALL)
  return match ? [...match] : []
}

function isClassSelector(selector) {
  return CLASS_PATTERN_ONLY.test(selector)
}

function noop() {}
