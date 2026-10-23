const CATEGORY_ALIASES: Record<string, string> = {
  bone: 'Bone Disorders',
  bonedisease: 'Bone Disorders',
  bonediseases: 'Bone Disorders',
  bonedisorders: 'Bone Disorders',
  bonefracture: 'Bone Disorders',
  bonefractures: 'Bone Disorders',
  bonetumor: 'Bone Disorders',
  bonetumors: 'Bone Disorders',
  bonetumour: 'Bone Disorders',
  bonetumours: 'Bone Disorders',
  footankle: 'Foot / Ankle',
  footandankle: 'Foot / Ankle',
  hand: 'Hand',
  handtrauma: 'Hand',
  handandtrauma: 'Hand',
  sports: 'Sports',
  sportsmedicine: 'Sports',
  pediatrics: 'Pediatrics',
  paediatrics: 'Pediatrics',
  pediatric: 'Pediatrics',
  trauma: 'Trauma',
  spine: 'Spine',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  hip: 'Hip',
  knee: 'Knee',
  msk: 'MSK',
  musculoskeletal: 'MSK',
  surgicalanatomy: 'Surgical Anatomy',
}

export const CASE_CATEGORIES = [...new Set(Object.values(CATEGORY_ALIASES))].sort()

// Only merge known aliases; preserve custom topics rather than guessing their specialty.
export function normalizeCaseCategory(value: string | null | undefined): string {
  const cleaned = (value || '').trim().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ')
  const key = cleaned.toLowerCase().replace(/[^a-z0-9]/g, '')
  return CATEGORY_ALIASES[key] || cleaned
}
