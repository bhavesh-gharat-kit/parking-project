# public/

Static files Next.js serves straight from the site root.

- `pay-and-park.apk` — the sideloaded Android build `/download-apk` links to.
  Download it from EAS (`eas build:list` → the `preview` profile's artifact
  URL) and drop it here under exactly this name. Not committed to git (see
  `.gitignore`) — a multi-ten-MB binary doesn't belong in version control, and
  it changes every release; copy the new one onto the VPS each time instead
  (`scp` it into this directory, or `wget` the EAS URL directly on the VPS).
- `uploads/` — UTR payment screenshots, written here by
  `lib/upload/localProvider.ts` only when `STORAGE_PROVIDER=local`. Not
  committed (see `.gitignore`) — these are user uploads, not source. On the
  VPS, back this directory up or mount it on persistent storage if you rely
  on `local` rather than `mediahost`: a plain `git pull` / `pm2 reload`
  leaves it alone, but redeploying onto a fresh checkout would not.
