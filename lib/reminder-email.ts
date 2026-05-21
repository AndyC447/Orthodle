export function buildReminderEmail(siteUrl: string, unsubscribeUrl: string) {
  return {
    subject: 'Your Orthodle cases are ready',
    html: `
      <!doctype html>
      <html lang="en">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Your Orthodle cases are ready</title>
        </head>
        <body style="margin:0; padding:0; background-color:#f4f1ea;">
          <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
            Fresh Orthodle cases are live. Jump back in and keep the streak moving.
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
                          <td align="center" style="background-color:#0c4b36; padding:24px 28px 28px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                              <tr>
                                <td align="center" style="padding-bottom:14px;">
                                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                                    <tr>
                                      <td style="height:56px; width:56px; border:2px solid #f0c247; border-radius:999px; text-align:center; vertical-align:middle; font-family:Georgia, 'Times New Roman', serif; font-size:28px; color:#f0c247;">
                                        O
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>

                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#f0c247;">
                              Orthodle Daily
                            </div>
                            <div style="font-family:Georgia, 'Times New Roman', serif; font-size:36px; line-height:1.08; font-weight:700; color:#ffffff; margin-top:16px;">
                              Fresh cases are live
                            </div>
                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.75; color:#deebe5; margin-top:14px; max-width:400px;">
                              New Orthodle cases are ready whenever you are.
                              Jump back in and keep the streak moving.
                            </div>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:28px 28px 32px; background-color:#fffdfa;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e7e1d6; border-radius:18px; background-color:#ffffff;">
                              <tr>
                                <td align="center" style="padding:16px 18px;">
                                  <div style="font-family:Arial, Helvetica, sans-serif; font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#637268;">
                                    Today
                                  </div>
                                  <div style="font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.2; font-weight:700; color:#102018; margin-top:8px;">
                                    Open the new card
                                  </div>
                                </td>
                              </tr>
                            </table>

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
                              <tr>
                                <td align="center">
                                  <a
                                    href="${siteUrl}"
                                    style="display:inline-block; background-color:#1f6448; color:#ffffff; text-decoration:none; padding:13px 24px; border-radius:999px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700;"
                                  >
                                    Play today’s cases
                                  </a>
                                </td>
                              </tr>
                            </table>

                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.7; color:#637268; text-align:center; margin-top:24px;">
                              Don’t want reminders anymore?
                              <a href="${unsubscribeUrl}" style="color:#637268; text-decoration:underline;">
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
