window.BOOKING_CONFIG = Object.assign({
  buildHash: '__HASH__',
  bookedEndpoint: '/api/booked',
  bookingEndpoint: '/api/booking',
  turnstileSiteKey: '__TURNSTILE_SITE_KEY__'
}, window.BOOKING_CONFIG || {});
