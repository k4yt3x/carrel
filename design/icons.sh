#!/bin/sh
# Renders the icons in public/icons/ from design/icon.webp. Needs ImageMagick 7.
set -eu
cd "$(dirname "$0")/.."

# render SIDE SIZE FILE [BACKGROUND]
# Trims the artwork to its edges, centres it on a square SIDE across (an fx expression of the
# trimmed width w and height h) and scales that to SIZE. The alpha is cleaned first: the
# artwork's solid shapes are 254/255 opaque, and stray pixels of 1/255 lie around them.
# An icon on a background is opaque, so it is stored with a palette of 256 colours, which
# loses nothing that shows and makes the file about a quarter of the size; on a transparent
# icon, the palette leaves jagged edges.
render() {
  if [ -n "${4:-}" ]; then palette='-dither None -colors 256' out="PNG8:public/icons/$3"
  else palette='' out="public/icons/$3"; fi
  # shellcheck disable=SC2086 # $palette is two options or none
  magick design/icon.webp \
    -channel A -level 0.5%,99.6% +channel -background none -alpha background -trim +repage \
    -set option:side "%[fx:ceil($1)]" -gravity center -extent '%[side]x%[side]' \
    -resize "$2x$2" -background "${4:-none}" -flatten $palette -strip -quality 95 "$out"
}

# The favicon fills its square, to read at 16 px; the app's icons keep a margin, like the
# icons around them.
render 'max(w,h)/0.96' 32 icon-32.png
render 'max(w,h)/0.9' 192 icon-192.png
render 'max(w,h)/0.9' 512 icon-512.png

# On the light page colour (neutral.50). Platforms that crop icons to their own shape keep
# only a central circle 80% of the width across, so the artwork's diagonal fits inside it;
# iOS rounds the corners and shows transparency as black.
render 'hypot(w,h)/0.8' 512 maskable-512.png '#f7f9f9'
render 'max(w,h)/0.75' 180 apple-touch-icon.png '#f7f9f9'
