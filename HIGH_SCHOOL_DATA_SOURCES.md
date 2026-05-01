# High School Team & Roster Data Sources (Saved Note)

## Summary
There is no single reliable national free API for U.S. high school teams and rosters.

## Practical Source Options
1. State athletic association websites (official, fragmented by state/format)
2. School/district athletics websites (often provide team rosters)
3. MaxPreps/Hudl-like platforms (broad coverage, but API/legal limits vary)
4. Commercial licensed providers (paid, better consistency)

## Recommended Approach for This Project
- Use a hybrid ingestion model:
  - official state/school sources where available
  - manual CSV upload for gaps/corrections
- Keep coach/admin editable rosters in-app
- Track source + last-verified date per roster record

## Suggested Data Fields
- School name
- Team/sport
- Season/year
- Player full name
- Jersey number
- Grade
- Position
- Source URL
- Last verified timestamp
