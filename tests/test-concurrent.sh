#!/bin/sh
# Test: two simultaneous bookings for the same booth — only ONE should succeed

URL="https://bookingbooth.pages.dev/api/booking"
BOOTH="46"  # use a booth that's currently free

echo "Firing two concurrent booking requests for booth $BOOTH..."

curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User A\",\"email\":\"testa@example.com\",\"phone\":\"111\",\"stallname\":\"Stall A\",\"booths\":\"$BOOTH\",\"location\":\"Outdoor\",\"total\":\"\\$220\",\"agree\":\"true\"}" \
  > /tmp/result_a.json &

curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test User B\",\"email\":\"testb@example.com\",\"phone\":\"222\",\"stallname\":\"Stall B\",\"booths\":\"$BOOTH\",\"location\":\"Outdoor\",\"total\":\"\\$220\",\"agree\":\"true\"}" \
  > /tmp/result_b.json &

wait

echo ""
echo "Result A: $(cat /tmp/result_a.json)"
echo "Result B: $(cat /tmp/result_b.json)"
echo ""

# Check results
A_SUCCESS=$(grep -c '"success":true' /tmp/result_a.json)
B_SUCCESS=$(grep -c '"success":true' /tmp/result_b.json)
TOTAL=$((A_SUCCESS + B_SUCCESS))

if [ "$TOTAL" -eq 1 ]; then
  echo "✅ PASS: Exactly one booking succeeded, one was blocked."
else
  echo "❌ FAIL: $TOTAL bookings succeeded — duplicate booking not prevented!"
fi

echo ""
echo "NOTE: If test passed, set booth $BOOTH status to Cancelled in the sheet to clean up."
