export type GroupIconOption = {
  value: string
  label: string
  section: 'medical' | 'sports' | 'animals'
}

export const DEFAULT_MEMBER_ICON = '🦴'

export const GROUP_ICONS: GroupIconOption[] = [
  { value: '🦴', label: 'Bone', section: 'medical' },
  { value: '🦿', label: 'Leg', section: 'medical' },
  { value: '🦵', label: 'Knee', section: 'medical' },
  { value: '🦶', label: 'Foot', section: 'medical' },
  { value: '💀', label: 'Skull', section: 'medical' },
  { value: '🖐️', label: 'Hand', section: 'medical' },
  { value: '🤚', label: 'Wrist', section: 'medical' },
  { value: '🩻', label: 'X-ray', section: 'medical' },
  { value: '🥾', label: 'Boot', section: 'medical' },
  { value: '🩹', label: 'Cast', section: 'medical' },
  { value: '🩺', label: 'Doctor', section: 'medical' },
  { value: '🥼', label: 'White coat', section: 'medical' },
  { value: '🏥', label: 'Hospital', section: 'medical' },
  { value: '💊', label: 'Pill', section: 'medical' },
  { value: '💉', label: 'Syringe', section: 'medical' },
  { value: '⚕️', label: 'Medicine', section: 'medical' },
  { value: '🧬', label: 'DNA', section: 'medical' },
  { value: '🧠', label: 'Brain', section: 'medical' },
  { value: '❤️', label: 'Heart', section: 'medical' },
  { value: '🫀', label: 'Anatomy', section: 'medical' },
  { value: '🫁', label: 'Lungs', section: 'medical' },
  { value: '🦷', label: 'Tooth', section: 'medical' },
  { value: '👁️', label: 'Eye', section: 'medical' },
  { value: '🔬', label: 'Lab', section: 'medical' },
  { value: '🧪', label: 'Test tube', section: 'medical' },
  { value: '🧫', label: 'Culture', section: 'medical' },
  { value: '🩼', label: 'Crutches', section: 'medical' },
  { value: '🦽', label: 'Wheelchair', section: 'medical' },
  { value: '🔨', label: 'Hammer', section: 'medical' },
  { value: '🛠️', label: 'Tools', section: 'medical' },
  { value: '🪛', label: 'Drill', section: 'medical' },
  { value: '🔩', label: 'Screw', section: 'medical' },
  { value: '🧑‍⚕️', label: 'Clinician', section: 'medical' },
  { value: '👨‍⚕️', label: 'Surgeon', section: 'medical' },
  { value: '👩‍⚕️', label: 'Team doc', section: 'medical' },
  { value: '🏃', label: 'Runner', section: 'sports' },
  { value: '🏀', label: 'Basketball', section: 'sports' },
  { value: '⛷️', label: 'Ski', section: 'sports' },
  { value: '🚴', label: 'Cycling', section: 'sports' },
  { value: '🏋️', label: 'Lifting', section: 'sports' },
  { value: '🏈', label: 'Football', section: 'sports' },
  { value: '🧗', label: 'Climbing', section: 'sports' },
  { value: '💪', label: 'Strength', section: 'sports' },
  { value: '⚽', label: 'Soccer', section: 'sports' },
  { value: '⚾', label: 'Baseball', section: 'sports' },
  { value: '🎾', label: 'Tennis', section: 'sports' },
  { value: '🏐', label: 'Volleyball', section: 'sports' },
  { value: '🏒', label: 'Hockey', section: 'sports' },
  { value: '🥍', label: 'Lacrosse', section: 'sports' },
  { value: '🤼', label: 'Wrestling', section: 'sports' },
  { value: '🤸', label: 'Gymnastics', section: 'sports' },
  { value: '🏊', label: 'Swimming', section: 'sports' },
  { value: '🏄', label: 'Surfing', section: 'sports' },
  { value: '🚣', label: 'Rowing', section: 'sports' },
  { value: '🥊', label: 'Boxing', section: 'sports' },
  { value: '🥋', label: 'Martial arts', section: 'sports' },
  { value: '🏇', label: 'Equestrian', section: 'sports' },
  { value: '🛹', label: 'Skateboarding', section: 'sports' },
  { value: '🏸', label: 'Badminton', section: 'sports' },
  { value: '🐶', label: 'Dog', section: 'animals' },
  { value: '🐱', label: 'Cat', section: 'animals' },
  { value: '🦁', label: 'Lion', section: 'animals' },
  { value: '🐯', label: 'Tiger', section: 'animals' },
  { value: '🐻', label: 'Bear', section: 'animals' },
  { value: '🐺', label: 'Wolf', section: 'animals' },
  { value: '🦊', label: 'Fox', section: 'animals' },
  { value: '🐵', label: 'Monkey', section: 'animals' },
  { value: '🦍', label: 'Gorilla', section: 'animals' },
  { value: '🦅', label: 'Eagle', section: 'animals' },
  { value: '🦉', label: 'Owl', section: 'animals' },
  { value: '🐢', label: 'Turtle', section: 'animals' },
  { value: '🦈', label: 'Shark', section: 'animals' },
  { value: '🐍', label: 'Snake', section: 'animals' },
  { value: '🐼', label: 'Panda', section: 'animals' },
  { value: '🐨', label: 'Koala', section: 'animals' },
  { value: '🦒', label: 'Giraffe', section: 'animals' },
  { value: '🦓', label: 'Zebra', section: 'animals' },
  { value: '🦌', label: 'Deer', section: 'animals' },
  { value: '🦬', label: 'Bison', section: 'animals' },
  { value: '🦦', label: 'Otter', section: 'animals' },
  { value: '🦥', label: 'Sloth', section: 'animals' },
  { value: '🐸', label: 'Frog', section: 'animals' },
  { value: '🐧', label: 'Penguin', section: 'animals' },
  { value: '🦜', label: 'Parrot', section: 'animals' },
  { value: '🦆', label: 'Duck', section: 'animals' },
]

export const GROUP_ICON_SECTIONS = [
  { id: 'medical', label: 'Medical' },
  { id: 'sports', label: 'Sports' },
  { id: 'animals', label: 'Animals' },
] as const

export function isImageIcon(value: string | null | undefined) {
  if (!value) return false
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:image/')
  )
}

export function getIconsForSection(sectionId: GroupIconOption['section']) {
  return GROUP_ICONS.filter(icon => icon.section === sectionId)
}
