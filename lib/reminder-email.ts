export function buildReminderEmail(siteUrl: string, unsubscribeUrl: string) {
  return {
    subject: 'Your Orthodle case is ready',
    html: `
      <div style="font-family: Georgia, serif; color: #102018; line-height: 1.6;">
        <p style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">Orthodle is live for today.</p>
        <p style="font-size: 15px; margin: 0 0 18px;">
          Three new ortho cases are ready whenever you are.
        </p>
        <p style="margin: 0 0 20px;">
          <a href="${siteUrl}" style="display: inline-block; background: #1f6448; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 999px; font-weight: 700;">
            Play today’s card
          </a>
        </p>
        <p style="font-size: 12px; color: #637268; margin-top: 24px;">
          Don’t want reminders anymore?
          <a href="${unsubscribeUrl}" style="color: #637268;">Unsubscribe</a>
        </p>
      </div>
    `,
  }
}
