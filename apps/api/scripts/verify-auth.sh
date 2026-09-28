#!/usr/bin/env bash
#
# Phase 02 acceptance check, against a running API.
#
#   npm run verify:auth -w api                 # http://localhost:3000
#   API=https://api.yourdomain.in apps/api/scripts/verify-auth.sh
#
# Exists because the Phase 02 acceptance criteria are about what the *server*
# refuses, and "I tried it in Postman once" does not survive a redeploy. Run it
# after deploying (Phase 11) and after any change to `lib/auth/`.
#
# It creates one throwaway customer account per run (email
# verify-<timestamp>@example.invalid) and leaves it in the database — harmless,
# `.invalid` is reserved by RFC 2606 and can never receive mail. It never touches
# an existing account, and it never needs admin credentials.
#
# What it cannot check, because both need a real Google account on a real device:
# a successful Google sign-in, and the `User` row it creates. Those stay manual —
# see the README's "Verifying Phase 02".
set -uo pipefail

API="${API:-http://localhost:3000}"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

PASSED=0
FAILED=0

# Prints the HTTP status and leaves the response body in $BODY.
call() { # METHOD PATH [JSON_BODY] [BEARER_TOKEN]
  local method=$1 path=$2 json=${3:-} token=${4:-}
  local args=(-s -o "$BODY" -w '%{http_code}' -X "$method" "$API$path")
  [ -n "$json" ]  && args+=(-H 'Content-Type: application/json' -d "$json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  curl "${args[@]}"
}

expect() { # DESCRIPTION EXPECTED_STATUS ACTUAL_STATUS
  if [ "$2" = "$3" ]; then
    printf '  ok    %-52s HTTP %s\n' "$1" "$3"
    PASSED=$((PASSED + 1))
  else
    printf '  FAIL  %-52s expected HTTP %s, got %s\n' "$1" "$2" "$3"
    printf '        %s\n' "$(cat "$BODY")"
    FAILED=$((FAILED + 1))
  fi
}

assert() { # DESCRIPTION CONDITION_RESULT
  if [ "$2" = "yes" ]; then
    printf '  ok    %s\n' "$1"
    PASSED=$((PASSED + 1))
  else
    printf '  FAIL  %s\n' "$1"
    FAILED=$((FAILED + 1))
  fi
}

# Reads a dotted path out of the JSON in $BODY. `node` is already a dependency of
# everything here, and it beats asking for jq on the VPS.
read_json() { node -e '
  let value = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
  for (const key of process.argv[1].split(".")) value = value?.[key];
  process.stdout.write(value == null ? "" : String(value));
' "$1" "$BODY"; }

EMAIL="verify-$(date +%s)@example.invalid"
PASSWORD="verify-pass-$(date +%s)"

echo
echo "Phase 02 auth verification against $API"
echo

echo "Health"
expect "the API is up and reaching MySQL" 200 "$(call GET /api/health)"

echo
echo "Registration — a new user can register (acceptance criterion 1)"
expect "register $EMAIL" 201 \
  "$(call POST /api/auth/register "{\"name\":\"Verify Script\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
TOKEN="$(read_json data.token)"
assert "a session token was issued" "$([ -n "$TOKEN" ] && echo yes || echo no)"
assert "the new account is a USER, not an ADMIN" \
  "$([ "$(read_json data.user.role)" = USER ] && echo yes || echo no)"

expect "the same email cannot register twice" 409 \
  "$(call POST /api/auth/register "{\"name\":\"Impostor\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"

# context.txt §110-112: a role in the request body must be ignored, not honoured.
expect "a request asking for role=ADMIN still succeeds" 201 \
  "$(call POST /api/auth/register "{\"name\":\"Role Probe\",\"email\":\"role-probe-$EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"ADMIN\"}")"
assert "...but the account it created is a USER (context.txt §110-112)" \
  "$([ "$(read_json data.user.role)" = USER ] && echo yes || echo no)"

echo
echo "Sign-in — and log back in (acceptance criterion 1)"
expect "correct password" 200 \
  "$(call POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
TOKEN="$(read_json data.token)"

expect "wrong password" 401 \
  "$(call POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"definitely-wrong\"}")"
WRONG_PASSWORD_MESSAGE="$(read_json error.message)"

expect "unknown email" 401 \
  "$(call POST /api/auth/login "{\"email\":\"nobody-$EMAIL\",\"password\":\"definitely-wrong\"}")"
assert "both refusals give the same message (no account enumeration)" \
  "$([ "$WRONG_PASSWORD_MESSAGE" = "$(read_json error.message)" ] && echo yes || echo no)"

echo
echo "Bearer tokens"
expect "a valid token identifies its user" 200 "$(call GET /api/auth/me '' "$TOKEN")"
expect "no token" 401 "$(call GET /api/auth/me)"
expect "a token that is not a token" 401 "$(call GET /api/auth/me '' 'not-a-token')"
expect "a tampered token" 401 "$(call GET /api/auth/me '' "${TOKEN}x")"

echo
echo "Role enforcement — a USER cannot reach an admin route (acceptance criterion 3)"
expect "GET /api/admin/users as a USER" 403 "$(call GET /api/admin/users '' "$TOKEN")"
expect "GET /api/admin/users anonymously" 401 "$(call GET /api/admin/users)"

echo
echo "Google sign-in — a forged ID token never mints a session"
STATUS="$(call POST /api/auth/google '{"idToken":"forged.not-a-real.google-token"}')"
# 401 when GOOGLE_* client IDs are set (verification failed); 503 when they are
# not (sign-in is switched off). Anything in the 2xx range would be the bug this
# check exists for.
assert "a forged ID token is refused (HTTP $STATUS)" \
  "$([ "$STATUS" = 401 ] || [ "$STATUS" = 503 ] && echo yes || echo no)"
if [ "$STATUS" = 503 ]; then
  echo "        note: GOOGLE_WEB_CLIENT_ID / GOOGLE_ANDROID_CLIENT_ID are unset,"
  echo "              so Google sign-in is disabled on this server."
fi

expect "an empty ID token is a validation error" 422 "$(call POST /api/auth/google '{"idToken":""}')"

echo
echo "─────────────────────────────────────────────────────────────"
printf '  %s passed, %s failed\n' "$PASSED" "$FAILED"
echo
echo "  Still to check by hand (needs a device and a real Google account):"
echo "    - Google sign-in creates a matching User row in MySQL"
echo "    - flipping that user's role to ADMIN and re-launching the app"
echo "      lands them on the admin stack"
echo

[ "$FAILED" -eq 0 ]
