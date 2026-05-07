# Tests

Integration tests for the booking API. Requires the live site to be deployed.

## Prerequisites
- Cloudflare Pages deployed with latest `functions/api/booking.js`
- Apps Script redeployed with latest `apps-script.js`
- `curl` available

## Tests

### test-booking.sh
Sequential test: first booking succeeds, second booking for same booth is blocked.
```sh
sh tests/test-booking.sh
```

### test-concurrent.sh
Concurrency test: two simultaneous bookings for same booth — only one should succeed.
```sh
sh tests/test-concurrent.sh
```

## Cleanup
After running tests, set the test booth(s) Status to `Cancelled` in the Google Sheet.
