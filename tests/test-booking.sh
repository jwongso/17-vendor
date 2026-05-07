#!/bin/sh
# Test: single booking succeeds, then same booth is blocked on second attempt

URL="https://bookingbooth.pages.dev/api/booking"
BOOTH="45"  # use a booth that's currently free

echo "=== Test 1: First booking should succeed ==="
RESULT=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User\",\"email\":\"test@example.com\",\"phone\":\"123\",\"stallname\":\"Test Stall\",\"booths\":\"$BOOTH\",\"location\":\"Outdoor\",\"total\":\"\$220\",\"agree\":\"true\"}")
echo "Response: $RESULT"
if echo "$RESULT" | grep -q '"success":true'; then
  echo "✅ PASS: First booking succeeded."
else
  echo "❌ FAIL: First booking did not succeed (booth may already be taken — try a different booth)."
  exit 1
fi

echo ""
echo "=== Test 2: Same booth should be blocked ==="
RESULT2=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User 2\",\"email\":\"test2@example.com\",\"phone\":\"456\",\"stallname\":\"Test Stall 2\",\"booths\":\"$BOOTH\",\"location\":\"Outdoor\",\"total\":\"\$220\",\"agree\":\"true\"}")
echo "Response: $RESULT2"
if echo "$RESULT2" | grep -q '"conflict"'; then
  echo "✅ PASS: Duplicate booking was blocked."
else
  echo "❌ FAIL: Duplicate booking was NOT blocked!"
fi

echo ""
echo "NOTE: Set booth $BOOTH to Cancelled in the sheet to clean up."
