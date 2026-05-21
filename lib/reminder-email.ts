export function buildReminderEmail(siteUrl: string, unsubscribeUrl: string) {
  return {
    subject: 'Your Orthodle cases are ready',
    html: `
      <div style="margin:0; padding:32px 16px; background:#f5f3ed; color:#102018;">
        <div style="max-width:560px; margin:0 auto; font-family:Georgia, 'Times New Roman', serif;">
          <div style="border:1px solid #d9cfbf; border-radius:28px; overflow:hidden; background:#fffdfa; box-shadow:0 18px 40px rgba(16,32,24,0.08);">
            <div style="padding:28px 28px 22px; background:radial-gradient(circle at 50% 20%, rgba(240,194,71,0.18), transparent 26%), linear-gradient(145deg, #0b4d36, #042f22); text-align:center; color:#ffffff;">
              <div style="font-family:Arial, sans-serif; font-size:11px; font-weight:700; letter-spacing:0.28em; text-transform:uppercase; color:#f0c247;">
                Orthodle Daily
              </div>
              <div style="margin-top:14px; font-size:31px; font-weight:700; line-height:1.1;">
                Fresh cases are live
              </div>
              <div style="margin:12px auto 0; max-width:360px; font-family:Arial, sans-serif; font-size:14px; line-height:1.6; color:#deebe5;">
                New Orthodle cases are ready whenever you are. Jump back in and keep the streak moving.
              </div>
            </div>

            <div style="padding:24px 28px 28px; background:#fffdfa;">
              <div style="display:grid; gap:10px; margin-bottom:22px;">
                <div style="border:1px solid #e7e1d6; border-radius:18px; padding:12px 14px; background:#ffffff;">
                  <div style="font-family:Arial, sans-serif; font-size:10px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#637268;">
                    Today
                  </div>
                  <div style="margin-top:6px; font-size:18px; font-weight:700; color:#102018;">
                    Open the new card
                  </div>
                </div>
              </div>

              <div style="text-align:center;">
                <a href="${siteUrl}" style="display:inline-block; background:#1f6448; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:999px; font-family:Arial, sans-serif; font-size:14px; font-weight:700;">
                  Play today’s cases
                </a>
              </div>

              <div style="margin-top:24px; font-family:Arial, sans-serif; font-size:12px; line-height:1.6; color:#637268; text-align:center;">
                Don’t want reminders anymore?
                <a href="${unsubscribeUrl}" style="color:#637268;">Unsubscribe</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
  }
}
