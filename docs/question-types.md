# Daily Question Types

In Admin or Case Studio, keep **Publish slot: Daily Case**, choose a date, then
select **Question type: Diagnosis, Anatomy, or Classification**. Types can be
scheduled on any day, including weekends; there is no automatic weekday override.

- Diagnosis retains the existing progressive clues and six guesses.
- Anatomy and Classification use 2-6 answer choices and one submission. Matching
  the answer text to a choice auto-fills its correct letter. Multiple correct
  letters are also supported. Choices must be distinct with no blank gaps.
- Switching types retains text and images so authors can adapt their draft.
  Review the choice/clue wording after switching and use Preview before saving.
- The optional separate anatomy slot remains supported for legacy cases. It is
  not required for anatomy questions in the daily slot, and daily questions are
  not subject to the separate anatomy-tab lock or visibility setting.

No migration is required. The type is stored as private `__question_type__:`
metadata in the existing synonyms array, alongside the existing multi-select
metadata convention. Real aliases are preserved; metadata is excluded from
accepted-answer lists and editor alias fields. Backups retain it automatically.
Older cases without metadata retain their existing behavior.

Preview, grading, reload/resume, completion, and archive navigation share the
same type detector. Quiz answers do not enter the player's diagnosis suggestions.
GPT Draft currently generates diagnosis variations only and excludes quiz sources.
Publishing a new type does not change the daily case identity or group scoring.
