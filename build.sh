#!/bin/sh
HASH=$(echo "$CF_PAGES_COMMIT_SHA" | cut -c1-7)
sed -i "s/__HASH__/$HASH/" index.html
sed -i "s/__TURNSTILE_SITE_KEY__/${TURNSTILE_SITE_KEY:-}/" index.html
