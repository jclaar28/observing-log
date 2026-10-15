# Ideas log

Running list of ideas for the Observing log app. Newest ideas go at the top of "Ideas"; anything parked earlier with a reason is under "Parked".

## Ideas

- **Cloud storage, real app and paid tiers** (2026-10-14). Suggested order: accounts and sync for one user first, then a Play closed test, then paid tiers, then friends.
  - *Backend:* Supabase (sign-in, Postgres, file storage, per-user access rules enforced in the database). Free tier for building, but it pauses after 7 idle days. Pro is $25/mo with 100 GB storage and 250 GB downloads. Cloudflare R2 is an option if photo storage gets large.
  - *Sync:* stays offline-first; the phone saves locally and syncs when connected, last edit wins. Photo upload has a Wi-Fi-only option. An existing log uploads on first sign-in using the backup format.
  - *Android app:* Capacitor wrapper built in Android Studio, which also gives a native photo picker. Play needs a developer account, privacy policy, data safety form, in-app and web account deletion, and a closed test for new personal accounts.
  - *Billing:* Google Play Billing, about 15% total on subscriptions in the US (10% fee + 5% billing fee as of 2026). RevenueCat to manage entitlements.
  - *Paywall split:* Free = logging, current catalogs, planner, full-res photos on the phone, backup export (never lock export). One-time Pro = extra catalogs, advanced stats, multiple filter sets. Subscription = cloud sync and backup, full-res cloud photo storage tiered by GB, friends and sharing. Paying for the server is the story that justifies a subscription.
  - *Rough break-even:* at $2.99/mo you keep about $2.54, so around 10 subscribers cover Supabase Pro.
  - *Open decisions:* Supabase or Firebase; whether iOS matters (needs a Mac and $99/yr); settle the name before the Play listing.
  - *Split of work:* Claude writes the code, schema and access rules; Jarrod creates the accounts and does the signed build so signing keys stay on his machine.
- **After the night** (2026-10-15):
  - *Share card:* turn a photo plus target data into an image like an Instagram info card, for social media or the club newsletter.
  - *Observing-program logs:* export observations in the format the Astronomical League wants for its programs (Messier, Herschel 400) as CSV or printable PDF.
  - *Year in review:* activity calendar of nights out, plus milestones such as first galaxy, Messier complete or 100 hours of integration.
- **Outreach / presentation mode** (2026-10-15): big-text cards for whatever is in the eyepiece at public nights, with one or two facts a visitor can follow, and a visitor count per night.
- **Clear-sky forecast** (2026-10-15): cloud cover, transparency and seeing for saved sites on the planning page, from a free forecast service such as Open-Meteo.
- **Friends and shared catalogs** (2026-10-14): add friends and see their catalog progress and observations. Needs accounts and a server to share data, since the app currently keeps everything on the phone. Open questions: share everything or choose what to share, and whether photos are included.

## Parked

- **Sharpless catalog**: needs a separate list with coordinates. Several popular targets (Barnard's Loop, Medusa, Spaghetti, Tulip) are Sharpless objects and log as custom targets until then.
- **Shared custom lists**: share a list with friends or the club, and follow other people's lists. Needs accounts and the server (see the cloud item).
- **More curated lists**: objects for a given filter or focal length, and club challenge lists (send the club's list to add it).
- **Full plate solving**: identify any photo by uploading it to astrometry.net. Needs a free astrometry.net account and API key, and probably a small server in between, because a web app may not be allowed to call their API directly. FITS files from NINA, ASIAIR and similar already carry solved coordinates, which the app uses to list objects in the field.
- **Horizons per site**: the horizon editor covers the main location; saved sites would need their own coordinates and horizon.
- **Comets and asteroids**: bright comets and asteroids such as Ceres and Vesta need orbital elements that update; could use the Minor Planet Center's data.
- **Multiple filter sets per entry**: for LRGB or narrowband sessions, so one observation can hold several sub sets with their own filter, count and length.
- **Google Photos picker**: pick photos through Google's own picker. Needs a Google Cloud project and sign-in, and photos would still be copied to the phone.
- **Google Play release**: wrap the app with Capacitor and build in Android Studio. Needs a developer account ($25), a closed-testing period and a privacy policy.
- **App name**: AstroFolio is already used by an astrophotography plugin. Shortlist: Culmination, Sky Ledger, Sidereal Log, Faint Fuzzy, Photon Ledger.

## Done

- Plan page (any night, 7-night strip, twilight and Moon times, altitude chart, targets from any list with moon distance), sky view, framing with rig field of view and sky survey image, custom horizon, session mode with quick log, auto-fill from photo EXIF and FITS headers (2026-10-15)
- Solar system catalog (Sun, Moon, planets, Pluto, Galilean moons, Titan) with live positions, magnitudes and phases; Moon catalog of 73 features with a lighting map and best-viewing days; Herschel 400 and Messier marathon lists (2026-10-15)
- Lists menu with Catalogs (Messier, Caldwell, NGC, IC), 10 curated lists and custom lists; add to list from any object page; lists included in backups (2026-10-14)
- Common names: about 270 names (curated plus OpenNGC), alternate names, group names such as Leo Triplet that log several objects (2026-10-14)
- NGC catalog (7,572 objects from OpenNGC) with dot chart, paged grid and cross-matching to Messier and Caldwell (2026-10-14)
- Offline installable app with on-phone storage, backup export and import (2026-10-13)
- Target info pages with descriptions, data table and sky dome (2026-10-13)
