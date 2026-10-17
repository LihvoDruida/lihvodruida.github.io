# Local website fonts

Inter Latin/Cyrillic are the variable WOFF2 fonts used in the supplied PageSpeed
report, now served from this site rather than Google Fonts. Weight axis: 100–900.
The Cyrillic face includes Ukrainian Ґ/ґ, Є/є, І/і and Ї/ї. Both font families are
combined without an intermediate system-font fallback in globals.css.

Sources (Google Fonts Inter v20):
- Cyrillic: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7W0Q5n-wU.woff2
- Latin: https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2
- License: Inter-OFL.txt (The Inter Project Authors).

Cinzel and Spectral SC are WOFF2 derivatives of the original bundled masthead
fonts in ../guild-banner. Their original TTF sources and OFL licenses are kept
there. These subsets retain Latin/Cyrillic characters present in each original,
combining marks and punctuation. Cinzel itself has no Cyrillic; Spectral SC is
retained as the original banner fallback. Next/font handles fingerprinting and
font-display:swap. Spectral is not preloaded, because the current English guild
wordmark uses Cinzel. No build-time font download is required.
