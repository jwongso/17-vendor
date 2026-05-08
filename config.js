window.BOOKING_CONFIG = Object.assign({
  buildHash: '__HASH__',
  bookedEndpoint: 'https://bookingbooth.pages.dev/api/booked',
  bookingEndpoint: 'https://bookingbooth.pages.dev/api/booking',
  turnstileSiteKey: '__TURNSTILE_SITE_KEY__'
}, window.BOOKING_CONFIG || {});
