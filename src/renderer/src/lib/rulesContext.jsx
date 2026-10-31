import { createContext, useContext } from 'react'
import { DEFAULT_RULES } from '@core/rules'

// The active rules object, provided once in App.jsx. Components read it with
// useRules() instead of having it drilled through TanStack column defs; core
// functions still take it explicitly at every call site.
const RulesContext = createContext(DEFAULT_RULES)

export function RulesProvider({ rules, children }) {
  return <RulesContext.Provider value={rules || DEFAULT_RULES}>{children}</RulesContext.Provider>
}

export function useRules() {
  return useContext(RulesContext)
}

// The classify context (venue-type rules, bands with Dates or templates — see
// classifyContext in core/classify.js), for the components that say why a
// venue is missing info.
const ClassifyContext = createContext({})

export function ClassifyProvider({ value, children }) {
  return <ClassifyContext.Provider value={value || {}}>{children}</ClassifyContext.Provider>
}

export function useClassifyCtx() {
  return useContext(ClassifyContext)
}
