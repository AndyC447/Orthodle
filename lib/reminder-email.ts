function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

export function buildReminderEmail(
  siteUrl: string,
  unsubscribeUrl: string,
  category?: string | null
) {
  const subject = 'Your Orthodle Daily Case is ready'
  const caseCategory = category?.trim()

  return {
    subject,
    html: `
      <!doctype html>
      <html lang="en">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${subject}</title>
        </head>
        <body style="margin:0; padding:0; background-color:#f4f1ea;">
          <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
            A new Orthodle case is ready. Can you make the diagnosis?
          </div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f4f1ea;">
            <tr>
              <td align="center" style="padding:36px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;">
                  <tr>
                    <td
                      style="border:1px solid #d9cfbf; border-radius:28px; overflow:hidden; background-color:#fffdfa;"
                    >
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td align="center" style="background-color:#0c4b36; padding:26px 28px 30px;">
                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#f0c247;">
                              Orthodle Daily
                            </div>
                            <div style="font-family:Georgia, 'Times New Roman', serif; font-size:36px; line-height:1.08; font-weight:700; color:#ffffff; margin-top:16px;">
                              Your Daily Case is ready
                            </div>
                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.75; color:#deebe5; margin-top:14px; max-width:400px;">
                              ${caseCategory ? `Today’s category: ${escapeHtml(caseCategory)}` : 'Open Orthodle to play today’s case.'}
                            </div>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:26px 28px 30px; background-color:#fffdfa;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                              <tr>
                                <td align="center">
                                  <a
                                    href="${escapeHtml(siteUrl)}"
                                    style="display:inline-block; background-color:#1e6a4e; color:#ffffff; text-decoration:none; padding:13px 24px; border-radius:999px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700;"
                                  >
                                    Play today’s case
                                  </a>
                                </td>
                              </tr>
                            </table>

                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.7; color:#6d746b; text-align:center; margin-top:24px;">
                              Don’t want reminders anymore?
                              <a href="${escapeHtml(unsubscribeUrl)}" style="color:#485349; text-decoration:underline;">
                                Unsubscribe
                              </a>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  }
}
