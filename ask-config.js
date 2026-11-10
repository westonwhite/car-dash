/* Ask Grok Bot. One-time setup is in suggest/SETUP.md.
   Leave endpoint empty until the relay exists. Never put a GitHub token here.
   `repo` must be public so the page can read answers with no token. */
window.ASK_CONFIG = {
  endpoint: "",
  repo: "westonwhite/dash-requests",
  /* Optional. Adds an Email button only to the not-connected fallback. */
  mail: "",
  /* Same phrase as MEMO_KEY_WESTON in the relay. Not a real secret.
     Leave empty until setup. Anyone who can view this file can read Weston's inbox. */
  memoKey: ""
};
