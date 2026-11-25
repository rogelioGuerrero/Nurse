# INCIDENTS (append newest first; commit so the cause is readable from git)

Format: `YYYY-MM-DD HH:MM UTC | component | symptom (status code / log line) | cause | fix | commit`

- (none yet) 2026-11-25: all 401s observed in function logs were our own unauthenticated smoke tests.
- 2026-11-25 | patient-token verify | malformed token (non-base64 segment) returns 500 instead of 401 | atob() throws and is caught by the generic handler | cosmetic, rejected anyway; wrap decode in try/catch on next deploy | n/a
