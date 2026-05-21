type ReminderPreviewCase = {
  label: string
  title: string
}

export function buildReminderEmail(
  siteUrl: string,
  unsubscribeUrl: string,
  previewCases: ReminderPreviewCase[] = []
) {
  const dotRow = `
    <div style="font-family:Arial, Helvetica, sans-serif; font-size:10px; line-height:1; color:#a7802a; letter-spacing:14px; text-align:center; white-space:nowrap;">
      • • • • • • • • • • • • •
    </div>
  `

  const previewMarkup =
    previewCases.length > 0
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;">
          <tr>
            <td align="center" style="font-family:Arial, Helvetica, sans-serif; font-size:10px; font-weight:700; letter-spacing:2.6px; text-transform:uppercase; color:#e4c86f; padding-bottom:12px;">
              Today’s lineup
            </td>
          </tr>
          ${previewCases
            .map(
              item => `
                <tr>
                  <td style="padding:0 0 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #d5b661; border-radius:18px; background-color:#faf5eb;">
                      <tr>
                        <td align="center" style="padding:12px 16px;">
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:10px; font-weight:700; letter-spacing:2.4px; text-transform:uppercase; color:#6b6f65;">
                            ${item.label}
                          </div>
                          <div style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; line-height:1.2; font-weight:700; color:#102018; margin-top:6px;">
                            ${item.title}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              `
            )
            .join('')}
        </table>
      `
      : `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;">
          <tr>
            <td style="border:1px solid #d5b661; border-radius:18px; background-color:#faf5eb; padding:16px 18px;" align="center">
              <div style="font-family:Arial, Helvetica, sans-serif; font-size:10px; font-weight:700; letter-spacing:2.4px; text-transform:uppercase; color:#6b6f65;">
                Today
              </div>
              <div style="font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.2; font-weight:700; color:#102018; margin-top:8px;">
                Open the new card
              </div>
            </td>
          </tr>
        </table>
      `

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
                      style="border:1px solid #0e5a41; border-radius:28px; overflow:hidden; background-color:#0c4b36;"
                    >
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                        <tr>
                          <td align="center" style="background-color:#0c4b36; padding:22px 28px 8px;">
                            ${dotRow}
                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:700; letter-spacing:4px; text-transform:uppercase; color:#f0c247; margin-top:16px;">
                              Orthodle Daily
                            </div>
                            <div style="font-family:Georgia, 'Times New Roman', serif; font-size:38px; line-height:1.08; font-weight:700; color:#ffffff; margin-top:18px;">
                              Fresh cases are live
                            </div>
                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.75; color:#deebe5; margin-top:14px; max-width:400px;">
                              New Orthodle cases are ready whenever you are.
                              Jump back in and keep the streak moving.
                            </div>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding:12px 28px 30px; background-color:#0c4b36;">
                            ${dotRow}

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
                              <tr>
                                <td style="border:1px solid #1f6a51; border-radius:24px; background-color:#12543e; padding:20px 20px 18px;">
                                  ${previewMarkup}
                                </td>
                              </tr>
                            </table>

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
                              <tr>
                                <td align="center">
                                  <a
                                    href="${siteUrl}"
                                    style="display:inline-block; background-color:#f7ead0; color:#0c4b36; text-decoration:none; padding:13px 24px; border-radius:999px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:700;"
                                  >
                                    Play today’s cases
                                  </a>
                                </td>
                              </tr>
                            </table>

                            <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.7; color:#d7e6de; text-align:center; margin-top:24px;">
                              Don’t want reminders anymore?
                              <a href="${unsubscribeUrl}" style="color:#ffffff; text-decoration:underline;">
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
