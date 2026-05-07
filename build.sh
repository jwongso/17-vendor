#!/bin/sh
HASH=$(echo "$CF_PAGES_COMMIT_SHA" | cut -c1-7)
sed -i "s/__HASH__/$HASH/" index.html
