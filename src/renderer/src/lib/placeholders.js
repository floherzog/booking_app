import { placeholderName } from '@core/templates'
import { getLanguage } from '../i18n'

// A placeholder as the user should see and type it: {{greeting}} in English,
// {{begrüßung}} in German. Templates accept both (canonicalPlaceholders), so
// this only changes what is shown and inserted.
export const token = key => `{{${placeholderName(key, getLanguage())}}}`
