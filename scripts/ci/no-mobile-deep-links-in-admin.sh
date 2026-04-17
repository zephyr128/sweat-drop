#!/usr/bin/env bash
# CI guard: the admin panel must never contain sweatdrop:// deep links.
# Admin accounts carry elevated privileges (superadmin / gym_admin / receptionist).
# Routing tokens to the consumer mobile app via a deep link would expose those
# privileges inside the mobile app — a critical privilege-escalation vector.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if rg -n 'sweatdrop://' "$ROOT/apps/admin-panel" 2>/dev/null | grep -q .; then
  echo "❌  ERROR: sweatdrop:// deep link found in apps/admin-panel."
  echo "   Admin panel code must never deep-link into the consumer mobile app."
  rg -n 'sweatdrop://' "$ROOT/apps/admin-panel"
  exit 1
fi

echo "✅  No sweatdrop:// deep links found in apps/admin-panel."
