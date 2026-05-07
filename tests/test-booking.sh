#!/bin/sh
# Test: single booking succeeds, then same booth is blocked on second attempt

URL="https://bookingbooth.pages.dev/api/booking"
BOOTH="45"  # use a booth that's currently free

echo "=== Test 1: First booking should succeed ==="
RESULT=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=Test+User+A&email=testa%40example.com&phone=111&stallname=Stall+A&booths=${BOOTH}&location=Outdoor&total=%24220&agree=true")
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
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=Test+User+B&email=testb%40example.com&phone=222&stallname=Stall+B&booths=${BOOTH}&location=Outdoor&total=%24220&agree=true")
echo "Response: $RESULT2"
if echo "$RESULT2" | grep -q '"conflict"'; then
  echo "✅ PASS: Duplicate booking was blocked."
else
  echo "❌ FAIL: Duplicate booking was NOT blocked!"
fi

echo ""
echo "NOTE: Set booth $BOOTH to Cancelled in the sheet to clean up."
