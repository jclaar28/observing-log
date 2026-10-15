# Observing log — installable app

This folder is a complete offline web app. Your observations and photos are stored on your phone, not on a server; the host only serves the app's files.

## 1. Put it online (GitHub Pages, free)

1. Sign in at github.com and create a new repository, for example `observing-log`. Public is fine: only the app's code goes there, never your data.
2. Choose **Add file → Upload files** and upload everything in this folder (not the folder itself), so `index.html` sits at the top level.
3. In the repository, open **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, branch **main**, folder **/ (root)**, then Save.
4. After a minute or two the page shows your address, such as `https://<your-username>.github.io/observing-log/`.

Alternative with no account setup: drag this folder onto app.netlify.com/drop.

## 2. Install it on your phone

1. Open that address in **Chrome** on your phone.
2. Tap the ⋮ menu, then **Install app** (on some versions it is **Add to Home screen**, then **Install**).
3. Open it from the new icon. It runs full screen and works offline after the first visit.

## 3. Move your existing log over

1. In the Claude version, open **Settings → Backup → Export backup** and save the .zip file. Exporting from a computer is easier if you have many large photos.
2. Get the .zip onto your phone (Downloads, or Google Drive and download it from there).
3. In the installed app, open **Settings → Backup → Import backup** and choose the file. Entries already in the app are skipped, so importing twice is safe.

## Keeping your data safe

- Everything lives in the app's storage on this phone. Uninstalling the app or clearing Chrome's site data for its address deletes it.
- Use **Export backup** regularly. You can share the file straight to Google Drive from the export prompt.

## Updating the app

Upload the changed files to the repository again. In `sw.js`, change `VERSION` (for example to `observing-log-v2`) so phones pick up the new version; it applies the next time the app is opened while online.

## Catalog data

NGC data in `ngc.js` and part of the name list in `names.js` are derived from [OpenNGC](https://github.com/mattiaverga/OpenNGC) by Mattia Verga and is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Messier and Caldwell descriptions, distances and sizes were written for this app and are approximate.
