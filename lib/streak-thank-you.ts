import 'server-only'
import { createHash } from 'node:crypto'
import type { StreakThankYou } from './streak-rewards'

const campaignId = 'streak-thanks-2026-11-03'

// Fixed top ten, captured November 3, 2026. Never ship recipient identifiers to the browser.
const recipientHashes = new Set([
  '73361be17dbd3c514019214450b0af610d5154dabd2e246c4b62396d7c6b76d7',
  '96f4a7a5bb95ff52b50eef7859b49ebf36232824454bb889b6abb530a7199020',
  '6160ba7e85682ef25a373124c8f0f6a43330c8cab2b013996f20b850878d797b',
  '097a7d676ecf5d597fc528bbbe17cc1f32abad590a53518ad75ba335372dc5a5',
  '4c99b5d25e98f6378dc139527a543f5c467fb81edc1558df19cf6d722296fc84',
  '2114888e617110bfef6a663f63902726161854f594a3780896b48aba3338eb4b',
  '11a0f6b76cbd7b0259bdc663127b0e54c8803f960c9cccf8db6cef07e14c33dd',
  '4bc34b67422cc5cab44897b9072e3f9bbea38f55907c2166ea0ead6f51f4bd2f',
  'bcf7b61722e6368729d4f8a2c402122c089f233b97f2f7638c90710bb447962b',
  'be5311493cd72f8624a924cb99a5de490c6b7eeba90ae7d7c4210856801f6122',
])

export function getStreakThankYou(sessionId: string): StreakThankYou | null {
  const digest = createHash('sha256').update(`${campaignId}:${sessionId}`).digest('hex')
  if (!recipientHashes.has(digest)) return null
  return {
    id: campaignId,
    title: 'A personal thank you',
    body: "Your streak earned you a spot among Orthodle's top 10 all-time daily streak players. Thank you for making this project part of your routine. Knowing you keep coming back means a lot and motivates me to keep sharing new cases.",
    signature: 'Andy, creator of Orthodle',
  }
}
