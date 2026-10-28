import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
function load(path, imports) {
  const exports = {}
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', code)(name => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`)
    return imports[name]
  }, exports)
  return exports
}

test('retired pages redirect bookmarks to the remaining tools', () => {
  for (const [path, target] of [
    ['../app/admin/studio/page.tsx', '/admin'],
    ['../app/admin/gpt-draft/page.tsx', '/admin'],
    ['../app/admin/case-stats/page.tsx', '/admin'],
    ['../app/admin/surveys/page.tsx', '/admin'],
    ['../app/study/page.tsx', '/archive'],
  ]) {
    let destination
    load(path, { 'next/navigation': { redirect: value => { destination = value } } }).default()
    assert.equal(destination, target)
  }
})

test('GPT generation is retired without database or paid model access', async () => {
  const route = load('../app/api/admin/gpt-draft/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
  })
  const result = await route.POST()
  assert.equal(result.status, 410)
  assert.match((await result.json()).error, /retired/i)
})

test('admin keeps the main builder and top scheduling overview, not the retired sections', () => {
  const admin = read('../app/admin/page.tsx')
  for (const label of ['Create / Schedule Case', 'Today overview', 'renderOverviewSection', 'Recent backups']) assert.ok(admin.includes(label), label)
  for (const label of ['Case Studio', 'GPT Draft', 'Cases by Date', 'Home case display', 'Case stats', 'loadCaseCommunityStats']) assert.ok(!admin.includes(label), label)
  assert.doesNotMatch(admin, /href=[^\n]*(?:\/study|\/admin\/(?:studio|gpt-draft|surveys|case-stats))/)
})

test('notification and survey loading no longer runs on public pages', () => {
  const header = read('../components/Header.tsx')
  assert.doesNotMatch(header, /Notifications|\/api\/messages|unreadCount/)
  assert.ok(header.includes('toggleTheme'))
  assert.doesNotMatch(read('../app/groups/page.tsx'), /Notifications|openNotificationsPanel|unreadNotificationCount/)
  for (const path of ['../app/page.tsx', '../app/admin/page.tsx']) {
    assert.doesNotMatch(read(path), /\.from\('(?:site_surveys|homepage_surveys|anatomy_case_surveys|site_survey_responses)'\)/)
  }
  assert.ok(!read('../app/sitemap.ts').includes('/study'))
})
