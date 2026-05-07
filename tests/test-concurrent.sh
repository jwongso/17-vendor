#!/bin/sh
# Test: two simultaneous bookings for the same booth — only ONE should succeed

URL="https://bookingbooth.pages.dev/api/booking"
BOOTH="46"  # use a booth that's currently free

echo "Firing two concurrent booking requests for booth $BOOTH..."

curl -s -X POST "$URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=Test+User+A&email=testa%40example.com&phone=12345&stallname=Stall+A&booths=${BOOTH}&location=Outdoor&total=%24220&agree=true" \
  > /tmp/result_a.json &

curl -s -X POST "$URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "name=Test+User+B&email=testb%40example.com&phone=67890&stallname=Stall+B&booths=${BOOTH}&location=Outdoor&total=%24220&agree=true" \
  > /tmp/result_b.json &

wait

echo ""
echo "Result A: $(cat /tmp/result_a.json)"
echo "Result B: $(cat /tmp/result_b.json)"
echo ""

A_SUCCESS=$(grep -c '"success":true' /tmp/result_a.json)
B_SUCCESS=$(grep -c '"success":true' /tmp/result_b.json)
TOTAL=$((A_SUCCESS + B_SUCCESS))

if [ "$TOTAL" -eq 1 ]; then
  echo "✅ PASS: Exactly one booking succeeded, one was blocked."
else
  echo "❌ FAIL: $TOTAL bookings succeeded — duplicate booking not prevented!"
fi

echo ""
echo "NOTE: Set booth $BOOTH to Cancelled in the sheet to clean up."
