export type PhoneCountry = {
  id: string
  labelRu: string
  labelEn: string
  dial: string
  nationalDigitsExact?: number
  nationalDigitsMax?: number
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { id: 'RU', labelRu: 'Россия', labelEn: 'Russia', dial: '+7', nationalDigitsExact: 10 },
  { id: 'KZ', labelRu: 'Казахстан', labelEn: 'Kazakhstan', dial: '+7', nationalDigitsExact: 10 },
  { id: 'KG', labelRu: 'Кыргызстан', labelEn: 'Kyrgyzstan', dial: '+996', nationalDigitsExact: 9 },
  { id: 'UZ', labelRu: 'Узбекистан', labelEn: 'Uzbekistan', dial: '+998', nationalDigitsExact: 9 },
  { id: 'TJ', labelRu: 'Таджикистан', labelEn: 'Tajikistan', dial: '+992', nationalDigitsExact: 9 },
  { id: 'AM', labelRu: 'Армения', labelEn: 'Armenia', dial: '+374', nationalDigitsExact: 8 },
  { id: 'GE', labelRu: 'Грузия', labelEn: 'Georgia', dial: '+995', nationalDigitsExact: 9 },
  { id: 'AZ', labelRu: 'Азербайджан', labelEn: 'Azerbaijan', dial: '+994', nationalDigitsExact: 9 },
  { id: 'BY', labelRu: 'Беларусь', labelEn: 'Belarus', dial: '+375', nationalDigitsExact: 9 },
  { id: 'MD', labelRu: 'Молдова', labelEn: 'Moldova', dial: '+373', nationalDigitsExact: 8 },
  { id: 'US', labelRu: 'США', labelEn: 'United States', dial: '+1', nationalDigitsExact: 10 },
  { id: 'GB', labelRu: 'Великобритания', labelEn: 'United Kingdom', dial: '+44', nationalDigitsMax: 10 },
  { id: 'DE', labelRu: 'Германия', labelEn: 'Germany', dial: '+49', nationalDigitsMax: 11 },
  { id: 'TR', labelRu: 'Турция', labelEn: 'Turkey', dial: '+90', nationalDigitsExact: 10 },
]

export function findPhoneCountry(id: string | null | undefined): PhoneCountry | null {
  const key = String(id ?? '').trim().toUpperCase()
  if (!key) return null
  return PHONE_COUNTRIES.find((c) => c.id === key) ?? null
}

