import Link from 'next/link'

export function PublicFooter() {
  return (
    <footer className="mx-auto mt-3 max-w-4xl border-t border-[#e7e1d6] px-4 py-4 text-center text-[9px] uppercase tracking-[0.24em] text-[#637268] sm:mt-10 sm:px-6 sm:py-5 sm:text-[9.5px] sm:tracking-[0.26em]">
      <div>
        Orthodle — for education &amp; entertainment. Not{' '}
        <Link href="/groups" className="transition hover:text-[#102018]">
          medical
        </Link>{' '}
        <Link href="/admin" className="transition hover:text-[#102018]">
          advice
        </Link>
        .
      </div>
      <div className="mt-1.5 tracking-[0.14em] normal-case sm:mt-2">
        <a href="mailto:contact@orthodle.com" className="transition hover:text-[#102018]">
          contact@orthodle.com
        </a>
      </div>
    </footer>
  )
}
