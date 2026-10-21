import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(file, imports = {}, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: id => { if (!(id in imports)) throw new Error(`Unexpected import: ${id}`); return imports[id] }, ...globals })
  return exports
}
const lib = load('../lib/gpt-draft.ts')
const paging = load('../lib/admin-dashboard.ts')
const plain = value => JSON.parse(JSON.stringify(value))
const source = {
  id: '11111111-1111-4111-8111-111111111111', case_date: '2026-01-01', level: 'med_student',
  category: 'Sports', prompt: 'Original clinical presentation.', answer: 'ACL tear',
  synonyms: ['Anterior cruciate ligament tear', 'ACL injury', 'ACL tear, complete'], answer_specificity: 'off',
  image_url: 'https://example.test/knee.jpg', image_credit: 'Source author', image_reveal_clue: 2,
  image_url_2: 'https://example.test/knee2.jpg', image_credit_2: 'Second author', image_reveal_clue_2: 0,
  image_findings: 'Documented source finding.',
  learning_image_url: 'https://example.test/teaching.jpg', learning_image_credit: 'Teaching author', learning_image_caption: '**Original** caption',
  learning_image_url_2: 'https://example.test/teaching2.jpg', learning_image_credit_2: 'Second teacher', learning_image_caption_2: '<u>Second</u> caption',
  clue_1: 'Original symptom.', clue_2: 'MRI demonstrates the documented finding.', clue_3: 'Original exam finding.',
  clue_4: null, clue_5: null, clue_6: null,
  teaching_point: 'Who: Original teaching\n[Reference](https://example.test/source)',
}
const generated = () => ({
  prompt: 'Fresh clinical presentation for review.',
  clues: ['New symptom framing.', 'Untrusted changed imaging text.', 'Fresh exam framing.'],
  teaching: Object.fromEntries(lib.TEACHING_SECTIONS.map(k => [k, `${k} reviewed teaching.`])),
  changes: 'A different activity and presentation.', reviewNotes: 'Verify image compatibility and all clinical details.',
})
const saved = () => ({ id: 'draft-id', source: structuredClone(source), text: generated(), generatedAt: '2026-10-20T12:00:00Z', status: 'draft' })
const guesses = (caseId, n) => Array.from({ length: n }, (_, i) => ({ case_id: caseId, session_id: `player-${i}` }))
const reviews = (caseId, n) => Array.from({ length: n }, (_, i) => ({ id: `review-${i}`, case_id: caseId, session_id: `player-${i}`, feedback_tags: ['Great case'] }))

test('ranking favors proven cases over a single positive review and deduplicates activity', () => {
  const one = { ...source, id: 'one', answer: 'Meniscus injury', synonyms: [] }
  const g = guesses(source.id, 100)
  const f = reviews(source.id, 12)
  const ranked = lib.rankSources([source, one], [...g, ...g, ...guesses('one', 1)], [...f, ...f, ...reviews('one', 1)], '2026-10-20')
  assert.equal(ranked[0].source.id, source.id)
  assert.equal(ranked[0].plays, 100)
  assert.equal(ranked[0].great, 12)
  assert.equal(ranked[0].reviews, 12)
  assert.equal(ranked[0].reviewRate, .12)
  assert.ok(ranked[0].quality < 1)
})

test('ranking excludes non-daily/unpublished cases and penalizes upcoming alias reuse', () => {
  const future = { ...source, id: 'future', case_date: '2026-11-01', answer: 'Anterior cruciate ligament tear', synonyms: [] }
  const original = lib.rankSources([source], guesses(source.id, 50), [], '2026-10-20')[0]
  const ranked = lib.rankSources([source, future, { ...source, id: 'anatomy', level: 'attending' }], guesses(source.id, 50), [], '2026-10-20')
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].score, original.score * .25)
  assert.equal(ranked[0].lastDiagnosisDate, '2026-11-01')
})

test('negative and untagged reviews reduce the smoothed positive rating', () => {
  const good = lib.rankSources([source], guesses(source.id, 50), reviews(source.id, 3), '2026-10-20')[0]
  const mixed = lib.rankSources([source], guesses(source.id, 50), [...reviews(source.id, 3), { id: 'other', case_id: source.id, session_id: 'other', feedback_tags: [] }], '2026-10-20')[0]
  assert.ok(mixed.quality < good.quality)
  assert.equal(mixed.great, 3)
})

test('validation rejects wrong clue counts, missing teaching, duplicate clues, unchanged prompt', () => {
  assert.throws(() => lib.validateGeneratedText({ ...generated(), clues: ['Only one'] }, source), /incomplete/)
  assert.throws(() => lib.validateGeneratedText({ ...generated(), teaching: {} }, source), /incomplete/)
  assert.throws(() => lib.validateGeneratedText({ ...generated(), clues: ['Same', 'Same', 'Third'] }, source), /Duplicate/)
  assert.throws(() => lib.validateGeneratedText({ ...generated(), prompt: source.prompt }, source), /unchanged/)
  const schema = lib.generationSchema(3)
  assert.equal(schema.additionalProperties, false)
  assert.equal(schema.properties.clues.minItems, 3)
  assert.equal(schema.properties.clues.maxItems, 3)
})

test('preview/handoff preserve images, exact aliases, references and seven modern sections without mutating originals', () => {
  const s = saved()
  const original = JSON.stringify(s.source)
  const c = lib.draftCase(s.source, s.text, '2026-11-01')
  for (const key of Object.keys(source).filter(k => k.includes('image') || ['answer', 'synonyms', 'answer_specificity'].includes(k))) assert.deepEqual(plain(c[key]), source[key], key)
  assert.equal(c.clue_2, source.clue_2)
  assert.notEqual(c.clue_1, source.clue_1)
  assert.match(c.teaching_point, /Imaging Findings:\nDocumented source finding/)
  for (const section of lib.TEACHING_SECTIONS) assert.ok(c.teaching_point.includes(`${section}:`))
  assert.ok(c.teaching_point.endsWith('[Reference](https://example.test/source)'))
  assert.equal(JSON.stringify(s.source), original)
  const editor = lib.toEditorDraft(s, '2026-11-01')
  assert.equal(editor.imageRevealClue, '2')
  assert.equal(editor.imageRevealClue2, 'after')
  assert.equal(editor.learningImageCaption, source.learning_image_caption)
  assert.equal(editor.gptDraftProvenance.sourceCaseId, source.id)
  assert.deepEqual(plain(lib.draftSynonyms(editor.gptDraftProvenance, editor.synonyms)), source.synonyms)
  assert.deepEqual(plain(lib.draftSynonyms(editor.gptDraftProvenance, 'Edited alias, Another')), ['Edited alias', 'Another'])
  assert.throws(() => lib.toEditorDraft(s, source.case_date), /new publish date/)
})

test('blank source slots and image-linked clues retain their exact placement', () => {
  const sparse = { ...source, clue_2: null, clue_3: 'As shown above.', clue_4: 'Last clue.', image_reveal_clue: 3 }
  const c = lib.draftCase(sparse, generated(), '2026-11-01')
  assert.equal(c.clue_2, null)
  assert.equal(c.clue_3, sparse.clue_3)
  assert.equal(c.clue_4, generated().clues[2])
  assert.equal(c.image_reveal_clue, 3)
})

function routeHarness({ key = 'test-only-key', responseStatus = 'completed', refusal = false } = {}) {
  const requests = []
  let dbCalls = 0
  let generations = 0
  const db = { from: table => {
    dbCalls++
    const query = {
      select: () => query, eq: () => query, lt: () => query, lte: () => query, order: () => query,
      range: async () => ({ data: table === 'cases' ? [source] : table === 'guesses' ? [...guesses(source.id, 2), { case_id: source.id, session_id: 'admin' }] : [...reviews(source.id, 1), { id: 'admin-review', case_id: source.id, session_id: 'admin', feedback_tags: ['Great case'] }], error: null }),
      single: async () => ({ data: structuredClone(source), error: null }),
      limit: async () => ({ data: [{ teaching_point: 'Clinical Pearls: Current style' }], error: null }),
      insert: () => assert.fail('Generation must not write cases'), upsert: () => assert.fail('Generation must not overwrite cases'),
    }
    return query
  } }
  const route = load('../app/api/admin/gpt-draft/route.ts', {
    'next/server': { NextResponse: { json: (value, init = {}) => new Response(JSON.stringify(value), { ...init, headers: { ...init.headers, 'Content-Type': 'application/json' } }) } },
    '@/lib/admin-auth': { isAdminPassword: password => password === 'test-password' },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => db },
    '@/lib/admin-dashboard': paging,
    '@/lib/stats-exclusions': { getExcludedStatsSessionIds: async () => ['admin'] },
    '@/lib/gpt-draft': lib,
  }, {
    process: { env: { OPENAI_API_KEY: key } }, crypto: webcrypto, AbortSignal,
    fetch: async (_url, init) => {
      generations++
      requests.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ status: responseStatus, output: [{ content: refusal ? [{ type: 'refusal' }] : [{ type: 'output_text', text: JSON.stringify({ ...generated(), prompt: `Fresh presentation variation ${generations}.` }) }] }] }), { status: 200 })
    },
  })
  return { post: body => route.POST(new Request('http://localhost/api/admin/gpt-draft', { method: 'POST', body: JSON.stringify(body) })), requests, dbCalls: () => dbCalls }
}

test('API rejects unauthenticated requests before database or model access', async () => {
  const h = routeHarness()
  const response = await h.post({ action: 'generate', sourceId: source.id, password: 'wrong' })
  assert.equal(response.status, 401)
  assert.equal(h.dbCalls(), 0)
  assert.equal(h.requests.length, 0)
})

test('sources API excludes administrator activity and returns private ranking metrics', async () => {
  const h = routeHarness()
  const response = await h.post({ action: 'sources', password: 'test-password' })
  const body = await response.json()
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(body.sources[0].plays, 2)
  assert.equal(body.sources[0].great, 1)
})

test('full mocked generation flow: ranking -> two variations -> edit -> preview -> editor', async () => {
  const h = routeHarness()
  const ranked = await (await h.post({ action: 'sources', password: 'test-password' })).json()
  const request = { action: 'generate', sourceId: ranked.sources[0].source.id, password: 'test-password' }
  const first = await (await h.post(request)).json()
  const secondResponse = await h.post({ ...request, previousPrompt: first.draft.text.prompt })
  assert.equal(secondResponse.status, 200)
  const second = (await secondResponse.json()).draft
  assert.notEqual(second.id, first.draft.id)
  assert.notEqual(second.text.prompt, first.draft.text.prompt)
  assert.equal(second.text.clues[1], source.clue_2)
  assert.equal(h.requests[0].store, false)
  assert.equal(h.requests[0].text.format.strict, true)
  assert.ok(JSON.parse(h.requests[0].input).recentStyleExamples[0].teaching_point)
  second.text.prompt = 'Andy edited this presentation.'
  const preview = lib.draftCase(second.source, second.text, '2026-11-01')
  const editor = lib.toEditorDraft(second, '2026-11-01')
  assert.equal(editor.prompt, preview.prompt)
  assert.equal(editor.imageUrl, preview.image_url)
  assert.equal(editor.answer, preview.answer)
  assert.equal(lib.gptDraftSaveError(editor.gptDraftProvenance, '2026-11-01', null), '')
  assert.match(lib.gptDraftSaveError(editor.gptDraftProvenance, '2026-11-01', source), /already has/)
})

test('missing key, incomplete output, and refusals never produce a draft', async () => {
  for (const [options, expected] of [[{ key: '' }, 503], [{ responseStatus: 'incomplete' }, 500], [{ refusal: true }, 500]]) {
    const h = routeHarness(options)
    const response = await h.post({ action: 'generate', sourceId: source.id, password: 'test-password' })
    assert.equal(response.status, expected)
    assert.equal((await response.json()).draft, undefined)
  }
})

function adminSaveHarness({ existing = null, provenance = true, conflict = false, captionFallback = false } = {}) {
  const editor = lib.toEditorDraft(saved(), '2026-11-01')
  const writes = []; const messages = []
  const code = readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('admin.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let fn
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'saveCase') fn = node; ts.forEachChild(node, visit) }
  visit(ast)
  assert.ok(fn)
  const compiled = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const write = async (method, payload) => {
    writes.push({ method, payload })
    return { error: conflict ? { message: 'duplicate key' } : captionFallback && writes.length === 1 ? { message: 'missing learning_image_caption column' } : null }
  }
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: existing, error: null }), insert: p => write('insert', p), upsert: p => write('upsert', p) }
  const context = vm.createContext({
    ...editor, answerSpecificity: 'off', gptDraftProvenance: provenance ? editor.gptDraftProvenance : null,
    normalizedAnatomyCorrectChoices: [], anatomyChoiceItemsForComposer: [],
    supabase: { from: () => query }, gptDraftSaveError: lib.gptDraftSaveError, draftSynonyms: lib.draftSynonyms,
    normalizeCreditValue: value => value || null, mergeTeachingPointAndReferences: value => value,
    isMissingTeachingImageCaptionColumnError: message => message.includes('learning_image_caption'),
    shouldCreateCaseBackup: () => false, formatLevel: value => value,
    window: { confirm: () => true, localStorage: { removeItem: () => {} } }, ADMIN_DRAFT_STORAGE_KEY: lib.ADMIN_CASE_DRAFT_KEY,
    setStatus: text => messages.push(text), setDraftStatus: () => {}, refreshSlotBackups: () => {}, clearForm: () => {}, loadCases: async () => {},
  })
  vm.runInContext(compiled, context)
  return { save: () => context.saveCase(), writes, messages, context }
}

test('actual admin save inserts GPT drafts and preserves aliases and images', async () => {
  const h = adminSaveHarness()
  await h.save()
  assert.equal(h.writes[0].method, 'insert')
  assert.deepEqual(plain(h.writes[0].payload.synonyms), source.synonyms)
  assert.equal(h.writes[0].payload.image_url, source.image_url)
  assert.equal(h.writes[0].payload.image_reveal_clue, 2)
  assert.equal(h.writes[0].payload.learning_image_caption, source.learning_image_caption)
  assert.equal(h.writes[0].payload.gptDraftProvenance, undefined)
})

test('actual admin save blocks source/occupied slots and handles a concurrent insert without upserting', async () => {
  const occupied = adminSaveHarness({ existing: source }); await occupied.save(); assert.equal(occupied.writes.length, 0)
  const original = adminSaveHarness(); original.context.caseDate = source.case_date; await original.save(); assert.equal(original.writes.length, 0)
  const race = adminSaveHarness({ conflict: true }); await race.save()
  assert.equal(race.writes.length, 1)
  assert.equal(race.writes[0].method, 'insert')
  assert.match(race.messages.at(-1), /duplicate key/)
})

test('caption compatibility retry remains insert-only and normal manual cases still upsert', async () => {
  const retry = adminSaveHarness({ captionFallback: true }); await retry.save()
  assert.deepEqual(retry.writes.map(w => w.method), ['insert', 'insert'])
  const normal = adminSaveHarness({ provenance: false, existing: source }); await normal.save()
  assert.equal(normal.writes[0].method, 'upsert')
})

test('actual draft-page interactions preserve edits, reject/regenerate, preview, and hand off with backup', async () => {
  const h = routeHarness()
  const states = []
  let cursor = 0; let effect; let ran = false
  const storage = new Map([[lib.ADMIN_CASE_DRAFT_KEY, JSON.stringify({ prompt: 'Existing unsaved work' })]])
  const navigation = []; const previews = []
  const store = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
  const session = { ...store, getItem: k => k === 'orthodle_admin_unlocked' ? 'true' : k === 'orthodle_admin_password' ? 'test-password' : storage.get(k) ?? null }
  const page = load('../app/admin/gpt-draft/page.tsx', {
    react: {
      useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
      useEffect: callback => { if (!ran) effect = callback },
    },
    'react/jsx-runtime': jsxRuntime,
    'next/link': { default: 'a' }, '@/components/Header': { Header: 'header' },
    '@/lib/utils': { todayISO: () => '2026-10-20' }, '@/lib/gpt-draft': lib,
  }, {
    localStorage: store, sessionStorage: session, URLSearchParams,
    window: { location: { search: '?date=2099-11-01', assign: path => navigation.push(path) }, confirm: () => true, open: url => previews.push(url) },
    fetch: (_url, init) => h.post(JSON.parse(init.body)),
  })
  const render = () => { cursor = 0; return page.default() }
  const nodes = tree => {
    if (Array.isArray(tree)) return tree.flatMap(nodes)
    if (!tree || typeof tree !== 'object') return []
    return [tree, ...nodes(tree.props?.children)]
  }
  const find = predicate => { const result = nodes(render()).find(predicate); assert.ok(result, 'Expected control not rendered'); return result }
  const button = label => find(n => n.type === 'button' && n.props.children === label)
  const settle = () => new Promise(resolve => setImmediate(resolve))
  render(); ran = true; effect(); await settle()
  const sourceButton = find(n => n.type === 'button' && nodes(n).some(child => child.type === 'div' && child.props.children === source.answer))
  sourceButton.props.onClick()
  await button('Generate draft').props.onClick()
  assert.equal(JSON.parse(storage.get(lib.GPT_DRAFT_SHELF_KEY)).length, 1)
  button('Reject draft').props.onClick()
  assert.equal(JSON.parse(storage.get(lib.GPT_DRAFT_SHELF_KEY))[0].status, 'rejected')
  await button('Generate draft').props.onClick()
  const presentation = find(n => n.type === 'textarea' && n.props.rows === 4)
  presentation.props.onChange({ target: { value: 'Edited directly in the draft workspace.' } })
  button('Preview full case').props.onClick()
  const preview = JSON.parse(storage.get('orthodle_admin_case_preview_v1'))
  assert.equal(preview.case.prompt, 'Edited directly in the draft workspace.')
  assert.equal(preview.case.image_url, source.image_url)
  assert.match(previews[0], /preview=1/)
  assert.equal(button('Use Draft').props.disabled, true)
  const review = find(n => n.type === 'input' && n.props.type === 'checkbox' && n.props.className === 'mt-1')
  review.props.onChange({ target: { checked: true } })
  assert.equal(button('Use Draft').props.disabled, false)
  button('Use Draft').props.onClick()
  assert.deepEqual(navigation, ['/admin'])
  assert.equal(JSON.parse(storage.get(lib.GPT_DRAFT_PREVIOUS_EDITOR_KEY)).prompt, 'Existing unsaved work')
  const editor = JSON.parse(storage.get(lib.ADMIN_CASE_DRAFT_KEY))
  assert.equal(editor.prompt, preview.case.prompt)
  assert.equal(editor.caseDate, '2099-11-01')
  assert.equal(editor.gptDraftProvenance.sourceCaseId, source.id)
  assert.equal(JSON.parse(storage.get(lib.GPT_DRAFT_SHELF_KEY))[0].status, 'used')
})
