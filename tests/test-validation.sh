#!/bin/sh
# Comprehensive edge case & validation tests for booking API

URL="https://bookingbooth.pages.dev/api/booking"
PASS=0
FAIL=0

check() {
  LABEL="$1"
  RESPONSE="$2"
  EXPECT="$3"
  if echo "$RESPONSE" | grep -q "$EXPECT"; then
    echo "✅ PASS: $LABEL"
    PASS=$((PASS+1))
  else
    echo "❌ FAIL: $LABEL"
    echo "   Response: $RESPONSE"
    FAIL=$((FAIL+1))
  fi
}

post() {
  curl -s -X POST "$URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "$1"
}

echo "======================================"
echo " Booking API — Edge Case & Validation "
echo "======================================"
echo ""

# ── Empty fields ──────────────────────────────────────────────
echo "--- Empty field tests ---"
check "Missing name" \
  "$(post "name=&email=a%40b.com&phone=123456&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Missing email" \
  "$(post "name=Test&email=&phone=123456&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Missing phone" \
  "$(post "name=Test&email=a%40b.com&phone=&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Missing stallname" \
  "$(post "name=Test&email=a%40b.com&phone=123456&stallname=&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Missing booths" \
  "$(post "name=Test&email=a%40b.com&phone=123456&stallname=Test&booths=&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

echo ""
# ── Invalid email ─────────────────────────────────────────────
echo "--- Email validation tests ---"
check "Email without @" \
  "$(post "name=Test&email=notanemail&phone=123456&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Email with @ only" \
  "$(post "name=Test&email=%40&phone=123456&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Email without domain" \
  "$(post "name=Test&email=test%40&phone=123456&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Valid email passes" \
  "$(post "name=Test&email=valid%40example.com&phone=123456789&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"success"'

echo ""
# ── Invalid phone ─────────────────────────────────────────────
echo "--- Phone validation tests ---"
check "Letters in phone" \
  "$(post "name=Test&email=a%40b.com&phone=abcdef&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Phone too short (4 digits)" \
  "$(post "name=Test&email=a%40b.com&phone=1234&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Phone with + prefix passes" \
  "$(post "name=Test&email=a%40b.com&phone=%2B64212345678&stallname=Test&booths=44&location=Outdoor&total=%24220&agree=true")" \
  '"success"'

echo ""
# ── Invalid booth numbers ─────────────────────────────────────
echo "--- Booth number validation tests ---"
check "Booth 0 (invalid)" \
  "$(post "name=Test&email=a%40b.com&phone=123456&stallname=Test&booths=0&location=Indoor&total=%24200&agree=true")" \
  '"error"'

check "Booth 99 (out of range)" \
  "$(post "name=Test&email=a%40b.com&phone=123456&stallname=Test&booths=99&location=Outdoor&total=%24220&agree=true")" \
  '"error"'

check "Booth -1 (negative)" \
  "$(post "name=Test&email=a%40b.com&phone=123456&stallname=Test&booths=-1&location=Indoor&total=%24200&agree=true")" \
  '"error"'

check "Booth letters (abc)" \
  "$(post "name=Test&email=a%40b.com&phone=123456&stallname=Test&booths=abc&location=Indoor&total=%24200&agree=true")" \
  '"error"'

echo ""
# ── Clean up: cancel test rows written by valid-email/phone tests ──
echo "--- NOTE: Set booth 44 to Cancelled in sheet (used by valid input tests) ---"

echo ""
echo "======================================"
echo " Results: ${PASS} passed, ${FAIL} failed"
echo "======================================"
