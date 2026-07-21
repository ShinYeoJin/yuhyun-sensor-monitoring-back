const { evaluate: mathEvaluate } = require('mathjs')

function calculateValue(expression, params) {
  if (!expression || !params) return null
  try {
    const result = mathEvaluate(expression, params)
    if (!isFinite(result) || isNaN(result)) return null
    return parseFloat(result.toFixed(4))
  } catch (err) { return null }
}

function applyFormula(rawValue, initRawValue, formulaExpression, formulaParams, depthKey) {
  if (!formulaExpression || rawValue === null || rawValue === undefined) return null
  let params = formulaParams || {}
  if (depthKey && params[depthKey] && typeof params[depthKey] === 'object') {
    params = params[depthKey]
  }
  return calculateValue(formulaExpression, {
    R: parseFloat(rawValue),
    I: initRawValue !== null && initRawValue !== undefined ? parseFloat(initRawValue) : parseFloat(rawValue),
    ...params
  })
}

module.exports = { calculateValue, applyFormula }
