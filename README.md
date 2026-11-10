# LLM Chat for iPhone

Capacitor wrapper of the existing React interface. The Python server and AI services continue to run on the PC. No accounts, databases, keys or media are included in this repository.

Build: `npm --prefix frontend ci`, `npm --prefix frontend run sync:ios`, then the Build unsigned iOS app workflow. The workflow produces one unsigned IPA without extensions or paid entitlements. Sign it with iloader/SideStore.

Optional GitHub variable `LLM_IOS_SERVER_URL` selects the initial server address. It can also be changed inside the application. The PC server must allow CORS from `capacitor://localhost`. Authentication uses the existing bearer token. Native Preferences restores device settings and drafts before React boots; attachment bytes are saved in the app data directory. Local notifications cannot wake a suspended app to fetch server events.
