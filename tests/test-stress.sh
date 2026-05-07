#!/bin/sh
# Stress test: 10 rapid sequential bookings for different booths
# Tests that the system handles load without data corruption

URL="https://bookingbooth.pages.dev/api/booking"
PASS=0
FAIL=0

# Use booths 40-47 for stress test (outdoor, less likely to conflict with real bookings)
BOOTHS="40 41 42 43 44 45 46 47"

echo "======================================"
echo " Booking API — Stress Test            "
echo "======================================"
echo ""
echo "Booking 8 different booths rapidly..."
echo ""

for BOOTH in $BOOTHS; do
  RESULT=$(curl -s -X POST "$URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "name=Stress+Test+$BOOTH&email=stress$BOOTH%40test.com&phone=123456789&stallname=Stress+Stall+$BOOTH&booths=$BOOTH&location=Outdoor&total=%24220&agree=true")

  if echo "$RESULT" | grep -q '"success":true'; then
    echo "✅ Booth $BOOTH booked OK"
    PASS=$((PASS+1))
  elif echo "$RESULT" | grep -q '"conflict"'; then
    echo "⚠️  Booth $BOOTH already taken (conflict)"
    PASS=$((PASS+1))
  else
    echo "❌ Booth $BOOTH FAILED: $RESULT"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "======================================"
echo " Results: ${PASS} passed, ${FAIL} failed"
echo "======================================"
echo ""
echo "NOTE: Set booths 40-47 to Cancelled in the sheet to clean up."
