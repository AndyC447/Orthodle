'use client'

import { Header } from '@/components/Header'

const profileCards = [
  {
    name: 'Your Name Here',
    role: 'Your Role',
    bio: 'Add a short introduction here. You can share your training background, why you built Orthodle, and anything you want visitors to know about you.',
    imageSide: 'left' as const,
  },
  {
    name: 'Second Section Placeholder',
    role: 'Optional Extra Block',
    bio: 'Use this second card for more about your story, the mission behind the project, collaborators, acknowledgments, or anything else you want to highlight.',
    imageSide: 'right' as const,
  },
]

function PhotoPlaceholder() {
  return (
    <div className="flex h-[150px] w-[150px] shrink-0 items-center justify-center rounded-full border-4 border-[#6b4630] bg-[radial-gradient(circle_at_top,#f8efe4,#ead9c6_55%,#dfc2a2)] shadow-sm">
      <div className="flex h-[118px] w-[118px] items-center justify-center rounded-full border border-dashed border-[#8f6b54] bg-white/70 px-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7b6758]">
        Add photo here
      </div>
    </div>
  )
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Header />

      <section className="mx-auto max-w-6xl px-6 pt-8 pb-4 text-center">
        <div className="inline-flex rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#6b4630]">
          About
        </div>
        <h1 className="mt-4 font-serif text-[42px] font-bold leading-[1.05] text-[#6b4630] md:text-[48px]">
          Meet the team behind Orthodle
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-[15px] leading-7 text-[#5d6570]">
          This page is set up with simple placeholders so you can drop in your photo,
          background, and any extra details you want visitors to see.
        </p>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-6 pb-10">
        {profileCards.map(card => {
          const imageFirst = card.imageSide === 'left'

          return (
            <div
              key={card.name}
              className="rounded-[28px] border border-white/70 bg-white px-6 py-6 shadow-[0_18px_40px_rgba(73,91,115,0.12)]"
            >
              <div
                className={`flex flex-col gap-6 md:items-center ${
                  imageFirst ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                <PhotoPlaceholder />

                <div className="flex-1">
                  <div className="font-serif text-[20px] font-bold text-[#6b4630] md:text-[24px]">
                    {card.name}
                  </div>
                  <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.2em] text-[#8a6c58]">
                    {card.role}
                  </div>
                  <p className="mt-4 max-w-3xl text-[15px] leading-8 text-[#3f454d]">
                    {card.bio}
                  </p>

                  <div className="mt-5 rounded-2xl border border-dashed border-[#d9c8b8] bg-[#fcf8f3] px-4 py-3 text-[13px] leading-6 text-[#786557]">
                    Replace this section with your real bio, credentials, fun facts, links, or a short
                    note about why you created Orthodle.
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </section>
    </main>
  )
}
