# Turn on Ask Grok Bot

The dashboards already show **Ask Grok Bot** on Weston's Mission Control (`hub.html`, and the Comanche page) and on Anna's page. Until the steps below are done, Send does not file anything. It stays on the page and offers a public GitHub issue link.

No token is stored in the website. Do not paste a GitHub token into `ask-config.js` or any other file that GitHub Pages serves.

Anything filed is public. The box says so: "Don't include passwords or account numbers."

## How a request is stored

1. The car browser POSTs the text to a Google Apps Script web app. The body is `text/plain` JSON. It includes who asked (Anna or Weston), who it's for (Grok Bot or Muse), whether it's a note or a change, plus the page name, time, and screen size.
2. The script holds a fine-grained token in Script properties and creates one issue in the public repo `westonwhite/dash-requests`.
3. The title is `Anna request: …` or `Weston request: …`.
4. The labels are exactly three:
   - `anna-request` or `weston-request`
   - `for-grokbot` or `for-muse`
   - `memo` (Just a note) or `suggestion` (Suggest a change)
5. The page reads that public repo with the unauthenticated GitHub API. No token. While the box is open it refreshes every 2 minutes (slower if GitHub's remaining quota gets low) and shows each request's status plus the latest comment.
6. Answering is not built here. Comment on the issue and close it. The next refresh shows the comment, and a closed issue with a comment is marked Answered.

Reads stay inside the unauthenticated limit of 60 requests an hour: at most two calls per refresh (the issue list, then one page of recent comments), and only while the box is open.

## Why this path

The site is public and static, so the browser cannot hold a credential.

- A token in the page would be world-readable. GitHub secret scanning revokes leaked tokens, and anyone could file issues without using the button.
- `repository_dispatch` needs a token that can write contents or actions, which is wider than filing an issue.
- Formspree's GitHub-issue plugin is on a paid plan.

The relay is free. The token can only create and label issues on `dash-requests`. Someone who can see the script URL can file a request, up to the script's limit (one every 20 seconds, 12 an hour). They cannot read the token or touch any other repo.

The repo has to be **public**. A private repo would hide the answers from the car browser, because the page reads GitHub with no token.

## 1. Public repo

Create an empty **public** repo named `dash-requests` on the `westonwhite` account. Leave it with no code. Issues there are the requests.

## 2. Fine-grained token

GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.

- Resource owner: `westonwhite`
- Repository access: **Only select repositories** → `dash-requests`
- Repository permissions: **Issues → Read and write**
- Leave Contents, Administration, Pull requests, Workflows, and every other permission at **No access**
- Expiration: 1 year (or the longest GitHub allows)

Copy the token once. It goes only in the script property in the next step. When it expires, Send falls back to the public link until you replace the property.

## 3. Apps Script

1. Open [script.google.com](https://script.google.com) and create a project.
2. Replace the default file with the full contents of `suggest/relay.gs`.
3. Project settings → Script properties. Do not put these in the website:
   - `GITHUB_TOKEN` = the token from step 2
   - `GITHUB_REPO` = `westonwhite/dash-requests`
   - `WESTON_EMAIL` = the Gmail address that should receive Anna's memos. Type it only here.
   - `ANNA_EMAIL` = Anna's email address. Type it only here. Do not commit either address.
   - `MEMO_KEY_WESTON` = a short phrase you invent for Weston's page
   - `MEMO_KEY_ANNA` = a different short phrase for Anna's page
4. Deploy → New deployment → type **Web app**.
   - Execute as: **Me** (this is the Google account the mail is sent from)
   - Who has access: **Anyone**
5. Authorize the Google prompt, including permission to send email. Copy the URL that ends in `/exec`.

Opening that URL in a browser should show `{"ok":true,"ready":true}`.

## 4. Point the dashboards at it

In `ask-config.js` on this repo (Weston's pages), set `endpoint` to that `/exec` URL (https only) and set `memoKey` to the same phrase as `MEMO_KEY_WESTON`. In Anna's `ask-config.js`, set the same `endpoint` and set `memoKey` to the same phrase as `MEMO_KEY_ANNA`.

`repo` stays `westonwhite/dash-requests`. That is the public repo the page reads for Ask Grok Bot. Memo text is not stored there.

Optional: set `mail` to an address you actually read. That only adds an Email button to the not-connected fallback.

Commit and push. Wait for GitHub Pages, then hard-refresh the car browser.

## 5. Check

On hub.html, send a note for Grok Bot, then a change for Muse. On Anna's page, send one for Grok Bot. In `dash-requests`:

- titles start with `Weston request:` or `Anna request:`
- Weston issues are labeled `weston-request`; Anna's are `anna-request`
- Grok Bot adds `for-grokbot`; Muse adds `for-muse`
- a note is `memo`; a change is `suggestion`
- the body includes the page name, the time (Eastern plus UTC), and the screen size

On Anna's page, choose **Send a memo to Weston** and send a note. That files an issue labeled `memo-to-weston` and `anna-request`, and emails the full text to `WESTON_EMAIL` with the subject `Memo from Anna (Caroline's whip)`. The car says **Memo sent to Weston**.

On hub.html, choose **Send a memo to Anna**. That emails the full text to `ANNA_EMAIL` with the subject `Memo from Weston (Mission Control)`, and files an issue labeled `memo-to-anna` and `weston-request`. The public issue title is `Memo to Anna` and the body keeps only the first 80 characters. The full text is stored only in the relay. The car says **Memo sent to Anna**. If `ANNA_EMAIL` or `WESTON_EMAIL` is missing, the relay does not file the issue and does not claim it was sent.

Weston's hub shows a **Memos from Anna** card. Anna's page shows **Memos from Weston**. Newest first, with the sender, time, full text, and a New badge. Tapping a memo marks it read. The cards read `GET {endpoint}?action=memos&for=weston|anna&key=…`. Until `endpoint` and `memoKey` are set, the card says **Memos will appear here once setup is done.**

The page key is not a real secret. It is in `ask-config.js`, so anyone who can view the page source can call the relay and read that page's memos. It only stops someone who stumbles on the relay URL without the key. Do not put passwords or account numbers in a memo.

The script creates those labels on the first send. The car shows **Thanks, sent!** for a Grok Bot or Muse request only after GitHub accepts the issue. Open the box again: the request is listed. Comment on it and close it, wait for the refresh, and the comment shows with status Answered.

## Navigation

A page in the Tesla browser cannot set the car's navigation. There is no page API for it, and a maps link stays in the browser (the car does not treat `geo:` or Google Maps links as a nav command). Tesla's own command is server-side (`navigation_gps_request` / share), so this page does not call it.

Tapping the other car, or **Send to car navigation** on a Things to do / Ideas place, does two things:

- Opens Google Maps and Apple Maps immediately, so the route is there if the queue is not connected yet.
- Files an issue when the relay is on. Labels are `nav-request` plus `anna-request` or `weston-request`. The title is `Anna nav: …` or `Weston nav: …`. The body has the car that should drive (Caroline's whip or the miracle whip), the destination name, address, latitude, and longitude.

The screen says **Sent to car navigation** when that issue is closed or has a comment. Until then it says the request is queued.

To deliver it, comment is not enough by itself for the car: send the destination with Tessie, then comment or close the issue so the screen updates.

```
POST https://api.tessie.com/{vin}/command/share?value=28.14612,-82.75699&locale=en-US
Authorization: Bearer $TESSIE_TOKEN
```

`value` is `latitude,longitude` when the issue has both, otherwise the address. `{vin}` is the car named in the **Car:** line (Caroline's whip on Anna's page, the miracle whip on Weston's). Keep the Tessie token in Tessie, not in this repo. `share` is the Tessie command that pushes an address or coordinates into the car's navigation.

## If it breaks

- The button still offers the public issue link and, if set, email. Those are fallbacks, not a second copy of a request that already sent.
- A 404 on the list means `dash-requests` is missing or private.
- To stop new requests, undeploy the web app and clear `endpoint`. The list keeps reading the public issues.
- To rotate the token, replace `GITHUB_TOKEN` and redeploy. The page URL usually stays the same.
