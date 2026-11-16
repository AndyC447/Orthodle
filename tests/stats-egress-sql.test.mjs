import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Set PGLITE_MODULE to run this against an isolated Postgres runtime, never production.
const databaseModule = process.env.PGLITE_MODULE
const sql = readFileSync(new URL('../supabase-stats-egress.sql', import.meta.url), 'utf8')

function load(file, imports = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('exports', 'require', code)(exports, name => imports[name])
  return exports
}

test('Postgres aggregates match the original counters and streak rules with compact payloads', { skip: !databaseModule }, async () => {
  const { PGlite } = await import(pathToFileURL(databaseModule).href)
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table visits (session_id text, created_at timestamptz, geo_country text, geo_city text);
      create table guesses (session_id text, case_id text, created_at timestamptz, is_correct boolean);
      create table cases (id text, case_date date, level text);
      create table user_accounts (id uuid, username text, display_name text);
      create table group_members (id text, session_id text, display_name text, created_at timestamptz);
      create table play_mode_settings (
        id text, no_resident_mode boolean, no_resident_mode_start_date date,
        no_anatomy_mode boolean, no_anatomy_mode_start_date date
      );
      insert into play_mode_settings values ('default', true, '2026-06-15', true, '2026-06-15');
      insert into user_accounts values ('00000000-0000-0000-0000-000000000001', 'account', 'Account name');
      insert into group_members values ('g1','member','Group name','2026-08-01');
      insert into cases values
        ('old', '2026-06-14', 'attending'),
        ('old-2', '2026-06-15', 'med_student'),
        ('one','2026-10-31','med_student'),
        ('two','2026-11-01','med_student'),
        ('three','2026-11-02','med_student'),
        ('retired','2026-11-02','resident'),
        ('future','2026-11-04','med_student');
      insert into visits select 'visitor-' || n, '2026-11-01T08:20:00Z', ' US ', 'Los+Angeles'
        from generate_series(1,1002) n;
      insert into visits values
        ('member', '2026-11-01T08:30:00Z', 'BR', 'S%C3%A3o%20Paulo'),
        ('member', '2026-11-01T09:30:00Z', 'BR', 'São Paulo'),
        ('another', '2026-11-01T09:30:00Z', 'BR', 'S%C3%A3o+Paulo'),
        ('excluded', '2026-11-01T09:30:00Z', 'NI', 'Excluded city'),
        ('none', null, ' ', 'unknown');
      insert into guesses values
        ('member','one','2026-11-01T06:59:00Z',true),
        ('member','two','2026-11-01T08:30:00Z',true),
        ('member','two','2026-11-01T09:30:00Z',true),
        ('member','three','2026-11-03T07:59:00Z',true),
        ('member','three','2026-11-03T08:00:00Z',true),
        ('member','three','2026-11-04T08:00:00Z',false),
        ('member','future','2026-11-03T08:00:00Z',true),
        ('member','old','2026-06-14T20:00:00Z',true),
        ('member','old-2','2026-06-15T20:00:00Z',true),
        ('retired','retired','2026-11-02T20:00:00Z',true),
        ('excluded','three','2026-11-02T20:00:00Z',true),
        ('00000000-0000-0000-0000-000000000001','three','2026-11-02T20:00:00Z',true),
        ('empty',null,null,false);
      insert into guesses select 'player-' || n, 'three', '2026-11-02T20:00:00Z', true
        from generate_series(1,15) n;
    `)
    await db.exec(sql)
    await db.exec(sql)

    const audience = load('../lib/audience-stats.ts')
    const publication = load('../lib/archive-publication.ts')
    const { buildStreakLeaderboard } = load('../lib/streak-leaderboard.ts', {
      './audience-stats': audience, './archive-publication': publication,
    })
    const excluded = new Set(['excluded'])
    const args = [[...excluded]]
    const { rows: [{ snapshot }] } = await db.query('select public.orthodle_impact_snapshot($1) as snapshot', args)
    const { rows: visits } = await db.query('select session_id, created_at::text from visits where session_id <> $1', [...excluded])
    const { rows: guesses } = await db.query(`
      select g.session_id, g.case_id, g.created_at::text, g.is_correct, jsonb_build_object('case_date', c.case_date) as cases
      from guesses g left join cases c on c.id = g.case_id where g.session_id <> $1
    `, [...excluded])
    const { rows: cases } = await db.query('select id, case_date::text, level from cases')
    const { rows: accounts } = await db.query('select id, username, display_name from user_accounts')
    const { rows: members } = await db.query('select session_id, display_name from group_members')
    const { rows: [settings] } = await db.query('select no_resident_mode, no_resident_mode_start_date::text, no_anatomy_mode, no_anatomy_mode_start_date::text from play_mode_settings')
    const totals = audience.calculateAudienceStats([...visits, ...guesses].filter(row => row.created_at))
    assert.deepEqual(snapshot, {
      ...totals, usersReached: totals.combinedDailyUsers, totalGuesses: guesses.length,
      archiveGuesses: audience.countArchivePlays(guesses), countriesReached: 2,
      topCities: ['Los Angeles', 'São Paulo'], caseCount: cases.length,
    })
    assert.ok(JSON.stringify(snapshot).length < 300)
    assert.ok(JSON.stringify([...visits, ...guesses]).length > 300 * JSON.stringify(snapshot).length)
    const day = '2026-11-03'
    const expected = buildStreakLeaderboard(guesses.filter(row => row.created_at), cases, accounts, members, excluded, settings, day)
    const { rows: [{ leaderboard }] } = await db.query('select public.orthodle_streak_snapshot($1, $2) as leaderboard', [day, ...args])
    assert.deepEqual(leaderboard, expected)
    assert.equal(leaderboard.leaders.length, 10)
    const { rows: personal } = await db.query(
      'select session_id, longest, current_streak from public.orthodle_streak_runs($1,$2,$3)', [day, ...args, 'member']
    )
    assert.deepEqual(personal, [{ session_id: 'member', longest: 3, current_streak: 3 }])
    const { rows: [perms] } = await db.query(`
      select has_function_privilege('anon', 'public.orthodle_impact_snapshot(text[])', 'execute') as anon,
        has_function_privilege('authenticated', 'public.orthodle_streak_snapshot(date,text[])', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.orthodle_streak_runs(date,text[],text)', 'execute') as service
    `)
    assert.deepEqual(perms, { anon: false, authenticated: false, service: true })
    const { rows: [labels] } = await db.query(`
      select public.orthodle_city_label('Bad%ZZ') as malformed,
        public.orthodle_city_label('Bad%00') as null_byte,
        public.orthodle_city_label('  Not%20available ') as placeholder
    `)
    assert.deepEqual(labels, { malformed: 'Bad%ZZ', null_byte: 'Bad%00', placeholder: null })
  } finally { await db.close() }
})
