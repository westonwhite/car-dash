# Turn on Ask Grok Bot

The dashboards already show **Ask Grok Bot** on Weston's Mission Control (`hub.html`, and the Comanche page) and on Anna's page. Until the relay URL is set, Send does not file anything. It stays on the page and offers a prefilled issue link.

No GitHub token is stored in the website or in the Apps Script. Do not paste an email address or a key into any file in this repo.

Anything that becomes a GitHub issue is public. The box says so: "Don't include passwords or account numbers." Full person-to-person memo text stays in the relay and in email. A memo to Anna is only a short preview on the public issue.

## How a request is stored

1. The car browser POSTs the text to a Google Apps Script web app. The body is `text/plain` JSON. It includes who asked, who it's for, the page name, time, and screen size.
2. The script does not call GitHub. It checks the request, emails a person-to-person memo when that is what was asked, stores the full memo for the inbox, and appends the request to a queue in Script Properties. It answers `{ok:true, queued:true, id}`.
3. The car treats that as sent. **Thanks, sent!**, **Memo sent to Weston**, and **Memo sent to Anna** show then. The request list keeps a local **Queued** row until the matching issue appears in `westonwhite/dash-requests`.
4. A computer you control runs `suggest/sync_requests.py` every 2 minutes. It reads the queue with `SYNC_KEY`, creates each issue with `gh`, then acks the queue. The issue body includes `Queue-Id:` so a retry does not file a second copy. The same pass writes a sanitized `channel.json` on this GitHub Pages site when Weston's `for-grokbot` / `weston-request` threads change, so the car does not poll GitHub for the Memos tab. That file omits private data such as account numbers, keys, and VINs.
5. Titles and labels are unchanged: `Anna request:` / `Weston request:`, `for-grokbot` or `for-muse`, `memo` or `suggestion`, plus `nav-request`, `memo-to-weston`, and `memo-to-anna` when those apply.
6. The page reads public issues with no token. While the box is open it refreshes about every 2 minutes. Comment on an issue and close it to answer. A closed issue with a comment is marked Answered. A nav issue that is closed or commented is **Sent to car navigation**.

`gh` on the sync machine uses that machine's existing login for `westonwhite/dash-requests`. The relay never sees a GitHub token.

## 1. Public repo

`westonwhite/dash-requests` is already created and public. Issues land there so the car can read answers with no token.

## 2. Apps Script

1. Open [script.google.com](https://script.google.com), create a project, and replace the default file with `suggest/relay.gs`.
2. Project settings → Script properties. Type the values only here. Do not commit them.
   - `WESTON_EMAIL` = the address that should receive Anna's memos
   - `ANNA_EMAIL` = Anna's email address
   - `MEMO_KEY_WESTON` = a short phrase for Weston's page
   - `MEMO_KEY_ANNA` = a different short phrase for Anna's page
   - `SYNC_KEY` = a third short phrase, used only by the sync machine
3. Deploy → New deployment → Web app. Execute as **Me** (mail is sent from this Google account). Who has access: **Anyone**.
4. Authorize sending email. Copy the URL that ends in `/exec`.

Opening that URL with no query should show `{"ok":true,"ready":true}`.

## 3. Point the dashboards at it

In this repo's `ask-config.js`, set `endpoint` to the `/exec` URL and `memoKey` to the same phrase as `MEMO_KEY_WESTON`. In Anna's `ask-config.js`, set the same `endpoint` and `memoKey` to the same phrase as `MEMO_KEY_ANNA`. Leave both keys empty in git.

Those phrases are not real secrets. Anyone who can view the page source can read that page's inbox. They only stop someone who finds the relay URL without the phrase.

`repo` stays `westonwhite/dash-requests`.

## 4. Sync machine

On a computer where `gh` is logged in and can open issues on `westonwhite/dash-requests`:

```
*/2 * * * * RELAY_URL='https://script.google.com/macros/s/DEPLOYMENT/exec' SYNC_KEY='the-sync-phrase' python3 /path/to/car-dash/suggest/sync_requests.py
```

Replace the URL and the phrase. Do not commit them. The script prints nothing when the queue is empty and `channel.json` is already current. When it files an issue it prints `created <id> -> #<number>`. When it refreshes the Memos tab data it prints `updated channel.json`.

## 5. Check

Send a note from hub.html. The car says **Thanks, sent!** right away and the list shows **Queued**. Within a couple of minutes `dash-requests` has the issue and the Queued row disappears.

On Anna's page, **Send a memo to Weston** emails the full text to `WESTON_EMAIL` with the subject `Memo from Anna (Caroline's whip)`, queues an issue labeled `memo-to-weston` and `anna-request`, and the car says **Memo sent to Weston**.

On hub.html, **Send a memo to Anna** emails the full text to `ANNA_EMAIL` with the subject `Memo from Weston (Mission Control)`. The public issue is titled `Memo to Anna`, labeled `memo-to-anna` and `weston-request`, and the body keeps only the first 80 characters. The car says **Memo sent to Anna**. If either email property is missing, nothing is queued and the page does not claim it was sent.

The **Memos** tab on the hub shows memos from Anna next to Weston's notes to Grok Bot. Notes are labeled **You to Grok Bot**, and issue comments are threaded under them as **Grok Bot reply**. The hub reads `channel.json` on this site for those threads, and still reads `GET {endpoint}?action=memos&for=weston&key=…` for Anna's memos. **Memos from Weston** on Anna's page is unchanged. Until `endpoint` and `memoKey` are set, Anna's memos say **Memos will appear here once setup is done.** Grok Bot threads still load from `channel.json`.

## Navigation

A page in the Tesla browser cannot set the car's navigation. There is no page API for it, and a maps link stays in the browser. Tesla's own command is server-side.

Tapping the other car, or **Send to car navigation** on a Things to do / Ideas place, opens Google Maps and Apple Maps immediately and queues a `nav-request`. The screen says **Sent to car navigation** once that issue is closed or has a comment.

Deliver it with Tessie, then comment or close the issue:

```
POST https://api.tessie.com/{vin}/command/share?value=28.14612,-82.75699&locale=en-US
Authorization: Bearer $TESSIE_TOKEN
```

`value` is `latitude,longitude` when the issue has both, otherwise the address. `{vin}` is the car named in the **Car:** line. Keep the Tessie token in Tessie, not in this repo.

## If it breaks

- The button still offers the public issue link. That is a fallback, not a second copy of a request that already queued.
- A 404 on the issue list means `dash-requests` is missing or private.
- To stop new requests, undeploy the web app and clear `endpoint`.
- To rotate the sync phrase, change `SYNC_KEY` in the script properties and in the cron line. Redeploy only if the script code changed. The `/exec` URL usually stays the same.
