type UnsubscribePageProps = {
  searchParams: Promise<{
    status?: string
  }>
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const params = await searchParams
  const status = params.status || 'success'

  const content =
    status === 'success'
      ? {
          title: 'You’re unsubscribed',
          body: 'You will not receive any more daily Orthodle reminder emails.',
        }
      : status === 'missing'
        ? {
            title: 'Missing unsubscribe link',
            body: 'That reminder link is incomplete. If you still need help, resend the unsubscribe link from your latest email.',
          }
        : {
            title: 'We couldn’t process that request',
            body: 'Please try the unsubscribe link again from your latest reminder email.',
          }

  return (
    <main className="min-h-screen bg-[#fbfaf7] px-6 py-16">
      <div className="mx-auto max-w-lg rounded-3xl border border-[#e7e1d6] bg-white p-6 shadow-[0_10px_24px_rgba(16,32,24,0.04)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#637268]">
          Email reminders
        </div>
        <h1 className="mt-3 font-serif text-[34px] font-bold leading-tight text-[#102018]">
          {content.title}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-[#637268]">{content.body}</p>
      </div>
    </main>
  )
}
