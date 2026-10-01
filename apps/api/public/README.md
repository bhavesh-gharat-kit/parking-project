# public/

Static files Next.js serves straight from the site root.

- `pay-and-park.apk` — the sideloaded Android build `/download-apk` links to.
  Download it from EAS (`eas build:list` → the `preview` profile's artifact
  URL) and drop it here under exactly this name. Not committed to git (see
  `.gitignore`) — a multi-ten-MB binary doesn't belong in version control, and
  it changes every release; copy the new one onto the VPS each time instead
  (`scp` it into this directory, or `wget` the EAS URL directly on the VPS).
