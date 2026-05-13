import { NextResponse } from 'next/server'

type Level = 'med_student' | 'resident' | 'attending'

type TemplateCase = {
  level: Level
  answer: string
  category: string
  prompt: string
  clues: string[]
  teachingPoint: string
}

type GenerateRequest = {
  password: string
  shared: {
    caseDate: string
    contributorName: string
    answer: string
    category: string
    caseType: string
    difficultyTone: string
    synonyms: string
    story: string
    clueBank: string
    teachingNotes: string
    orthobulletsUrl: string
    radiopaediaUrl: string
  }
  levels?: Level[]
  templates: TemplateCase[]
  existingDrafts?: Partial<Record<Level, {
    category: string
    answer: string
    synonyms: string
    prompt: string
    clues: string[]
    teachingPoint: string
  }>>
}

function extractTextPayload(responseJson: any): string {
  if (typeof responseJson?.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text.trim()
  }

  const textParts: string[] = []
  const outputItems = Array.isArray(responseJson?.output) ? responseJson.output : []

  for (const outputItem of outputItems) {
    const contentItems = Array.isArray(outputItem?.content) ? outputItem.content : []
    for (const contentItem of contentItems) {
      if (typeof contentItem?.text === 'string' && contentItem.text.trim()) {
        textParts.push(contentItem.text.trim())
      }
    }
  }

  return textParts.join('\n').trim()
}

export async function POST(req: Request) {
  const body = (await req.json()) as GenerateRequest
  const adminPassword = process.env.ADMIN_PASSWORD || 'Pibbles'

  if (body.password !== adminPassword) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const openAiKey = process.env.OPENAI_API_KEY
  if (!openAiKey) {
    return NextResponse.json(
      {
        error:
          'OPENAI_API_KEY is not set yet. Add your OpenAI API key to .env.local before using Case Generator.',
      },
      { status: 400 }
    )
  }

  const model = process.env.OPENAI_CASE_GENERATOR_MODEL || 'gpt-5.5'

  const systemPrompt = [
    'You draft Orthodle cases for orthopaedic education.',
    'Generate related Orthodle case drafts for the requested levels.',
    'Each level should match Orthodle style: concise vignette, progressive clues, and a structured teaching point.',
    'Med student should be the most pattern-recognition friendly.',
    'Resident should add nuance, localization, or workup complexity.',
    'Attending should be the most subtle, consult-level, and high-yield.',
    'Use the provided template cases as style guides for how Orthodle structures prompts, clues, and takeaways.',
    'Do not copy wording from templates. Create a fresh case.',
    'Respect the requested case type and difficulty tone.',
    'If an existing draft is provided for a level, improve or rework it rather than changing the diagnosis.',
    'Do not invent image URLs or image credits.',
    'Do not include contributor name or date in the prose.',
    'Return JSON only.',
    'Teaching point should be formatted as plain text with headings like Clinical Context:, Who:, Pathophys:, Key Clues:, Imaging:, Tx:, Don\'t Miss:, Board Pearl:, DDx: when appropriate.',
    'Clues should be short, high-signal, and ordered from broader to more specific.',
  ].join(' ')

  const userPayload = {
    request: body.shared,
    requested_levels: body.levels && body.levels.length > 0 ? body.levels : ['med_student', 'resident', 'attending'],
    templates: body.templates,
    existing_drafts: body.existingDrafts || {},
    output_requirements: {
      levels: body.levels && body.levels.length > 0 ? body.levels : ['med_student', 'resident', 'attending'],
      fields: [
        'category',
        'answer',
        'synonyms',
        'prompt',
        'clues',
        'teaching_point',
      ],
      clue_count: 6,
      images: 'leave image slots blank; user will add URLs and credits manually',
    },
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      drafts: {
        type: 'object',
        additionalProperties: false,
        properties: {
          med_student: { anyOf: [{ $ref: '#/$defs/caseDraft' }, { type: 'null' }] },
          resident: { anyOf: [{ $ref: '#/$defs/caseDraft' }, { type: 'null' }] },
          attending: { anyOf: [{ $ref: '#/$defs/caseDraft' }, { type: 'null' }] },
        },
        required: ['med_student', 'resident', 'attending'],
      },
    },
    required: ['drafts'],
    $defs: {
      caseDraft: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          answer: { type: 'string' },
          synonyms: {
            type: 'array',
            items: { type: 'string' },
          },
          prompt: { type: 'string' },
          clues: {
            type: 'array',
            items: { type: 'string' },
            minItems: 6,
            maxItems: 6,
          },
          teaching_point: { type: 'string' },
        },
        required: ['category', 'answer', 'synonyms', 'prompt', 'clues', 'teaching_point'],
      },
    },
  }

  const openAiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(userPayload, null, 2) }],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'orthodle_case_generator',
          schema,
          strict: true,
        },
      },
    }),
  })

  const responseJson = await openAiResponse.json().catch(() => null)

  if (!openAiResponse.ok) {
    const errorMessage =
      responseJson?.error?.message || 'OpenAI could not generate the case drafts right now.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }

  const payloadText = extractTextPayload(responseJson)
  if (!payloadText) {
    return NextResponse.json(
      { error: 'The model returned an empty draft payload.' },
      { status: 500 }
    )
  }

  try {
    const parsed = JSON.parse(payloadText)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json(
      {
        error: 'The model returned a draft, but it was not valid JSON.',
        raw: payloadText,
      },
      { status: 500 }
    )
  }
}
