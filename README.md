# FlowCore

[![tests](https://github.com/averageuserr42/flowcore/actions/workflows/tests.yml/badge.svg)](https://github.com/averageuserr42/flowcore/actions/workflows/tests.yml)

**A focus and recovery diary for the days when an hour of work is not possible.**

**[Open FlowCore in your browser](https://averageuserr42.github.io/flowcore/)** — nothing to install, no account, the diary stays on your device.

*Русская версия: [README.ru.md](README.ru.md).*

Pick one of your areas, say how much energy you have today, and do a single short step. Points collect over the week, a missed day takes nothing away, and an early stop counts as rest, not as failure. The whole app is one 340 KB HTML file: no build, no server, no dependencies.

## What it does

If you are in a hurry:

- Five minutes counts as work, and stopping there is a full result.
- A task remembers where you stopped and offers to start from that exact place.
- A missed day costs nothing: points live on the week, not the day.
- Your diary stays in the browser: no account, no server, works offline.

**Three levels of energy.** Barely any, some, full. The level picks the task and starts the timer at the length that buys its price: 5, 15 and 30 minutes. Every area keeps its own task for each level, so you never invent the wording again.

**Points are the time you confirm, not the mood you picked.** A confirmed stretch gives one point for every ten minutes, rounded: 5–14 minutes give 1, 15–24 give 2, 25 and more give 3, and an hour is still 3. Under five minutes gives nothing, so the five-minute rule keeps its own reward. The button says the amount before you press it: the timer sets the price, not a dropdown. A finished stretch writes itself into the diary when you take another one or reset the timer, so worked minutes are never lost; Done mid-stretch still records what you have at that moment.

**A first step instead of "go work".** Each task comes with three concrete physical actions: open the editor, read the last paragraph, write down one question. Five minutes count as work even if you stop right there.

**A note on the task itself.** The pencil next to the task opens a line right there, with eight emoji that insert into the text. The note lands in the diary under the area's name and gives no points: it is memory, not a finished step. The row of emoji is optional and switches off in System; the quick note in the diary offers the same eight signs.

**A quick note in the diary, and a small mark on every row.** Six chips — a work step, stopped in time, fog or fatigue, tightness in the chest, shallow breathing, good focus — write an entry in one tap with its own type, so the doctor report keeps steps, body signals and early stops apart. Every row also carries a small type mark (a step, a signal, a stop, a note) whenever the entry has no emoji of its own. The separate "In your own words" card is gone: it did the same job as this block but paid differently for the same act, and one place to write is enough. Neither the chips nor the typed note bring points: a feeling is a description, not a reward for describing it. Points come only from confirmed time, otherwise ten seconds of taps would be worth more than half an hour of work.

**On a phone, two summary buttons.** The row of timer lengths and the three first-step chips fold behind a button with the current length and "First step ▾": they open in place, close after a choice, and the summary keeps the current value. Every target grows to 40 px, and the primary action to 44, so nothing has to be aimed at on a bad day. The four sections themselves move into a 54 px bar along the bottom, the current one marked by a line; the header stops sticking and a new section opens from the top. The bar takes its own place in the column instead of floating above the content, so no button is ever half-hidden under it. The diary tab carries a dot, not a number: it appears only when something was written since you last opened the diary, and goes out the moment you do.

**A bridge after stopping.** If you stopped yesterday, a line at the top says where, with one button that starts five minutes from that exact place. Coming back does not require remembering where you were.

**A week, not a day.** Points collect over the week (12 by default, adjustable). A missed day resets nothing, and the week closes into the archive on its own. The panel shows a heat map for the last 12 weeks and a chart of recent weeks.

**A soft cap of 8 points a day.** Past it, notes keep going in and points stop growing, so the length of work stops being the only reward. On a day that is going well the cap can be lifted until midnight with one click on the today line; the next day it is back on its own. An optional strict mode refuses the button until the timer has run five minutes; without it a short note still goes into the diary, it just brings no points.

**A level for all time.** 10 experience points make a level, counted from every point you ever earned, so a new week does not burn it. Levels unlock skins: emerald (1), amber (3), prism (5), cyber (6), aurora (10). Each one changes the whole palette, the background pulse included; prism turns the panel blue-violet and gives each card a thin static line of all four palettes.

**Rest earns points.** A calm yesterday (6 points or fewer) or an early stop charges the rest bonus, up to 3. A charge adds +1 to your next step inside the daily cap, which closes the day sooner instead of pushing you to sit longer.

**A safety reserve of up to 4 points.** A week that closed with an early stop or above its quota moves one point into the reserve. In a hard week you take it back in one click.

**Breathing: two techniques and a background.** "Calm exhale 4/6" runs for a minute. "A five-minute sigh" is two breaths in through the nose and one long breath out through the mouth, which is what takes the edge off acute anxiety when a minute is not enough. Next to it sits a brown noise generator with a volume slider. The noise is computed in the browser, so there are no files and no network. On a phone the sound stops when the screen locks, which makes this a tool for five or ten minutes, not for falling asleep.

**Diary and export.** Notes in one tap with a type mark on every row, grouped by day under "Today", "Yesterday" and every earlier date, with a filter by type (steps, signals, stops, notes) and a list that scrolls with the page instead of living in its own small window. A summary built locally, an AI summary if you add your own Gemini key, the whole diary copied as text, and a week exported as `.md` with YAML front matter that Obsidian reads as is.

**Your own areas and wording.** The first run asks three questions: what is on your mind, how many points a week, what to call the main thing. One button skips all three and leaves two neutral areas, one thing of your own and rest, both in the interface language. Names, tasks and steps are edited in the panel afterwards.

**Four interface languages.** Russian, Ukrainian, English and German. The language comes from the browser on first run and changes in System, including on the password screen before the diary is decrypted. Only the shell is translated: labels, buttons, summaries, export, area templates. What you wrote stays in your words. No language is declared the main one either, because the dictionary is a single table where all four stand side by side.

**Your data stays with you.** Everything lives in the browser's localStorage. The diary lock is a password through PBKDF2 and AES-256-GCM, so the file on disk cannot be read without it. The only outgoing request is the optional Gemini summary with your own key, and the Content Security Policy blocks everything else.

**Installs on a phone and works offline.** There is a manifest, a service worker and icons. Android Chrome offers "Install app", iPhone Safari has "Add to Home Screen".

## Screenshots

| Focus | Diary and weekly review |
| --- | --- |
| ![The focus screen](screenshots/01-focus.png) | ![The diary](screenshots/02-diary.png) |

| Breathing: two techniques and brown noise | System and security |
| --- | --- |
| ![Breathing](screenshots/03-breathe.png) | ![System](screenshots/03-system.png) |

| First run | Phone |
| --- | --- |
| ![First run](screenshots/04-onboarding.png) | ![Phone](screenshots/mobile/01-focus.png) |

| A note on the task | The prism skin (level 5) |
| --- | --- |
| ![Note](screenshots/05-note.png) | ![Prism](screenshots/06-prism.png) |

The interface in the shots is English, which is the default, and the other three switch in System. Every screenshot comes from a demo profile, so none of it is anybody's real diary.

## Quick start

**Online.** https://averageuserr42.github.io/flowcore/ is a permanent address: add it to your home screen once and forget it. Your own copy is described below.

**Locally.** On GitHub take `Code → Download ZIP`, unzip it and open `flowcore.html` with a double click. Everything works without a server except installing it as an app, which needs http(s).

**With a server and an address for your phone.**

```bash
python serve.py            # http://localhost:8088, nothing cached
python serve.py --open     # the same, and it opens the browser
python serve.py --tunnel   # a temporary https address for installing the PWA on a phone
python serve.py --lan      # home network access over http (the PWA will not install)
```

On Windows, `FlowCore.cmd` does the same from a double click.

## Publishing your own copy

1. Fork, or create a repository with these files at the root.
2. Settings → Pages → Source: **Deploy from a branch**, then the branch GitHub created (`main` for new repositories, `master` if you named it that), folder `/ (root)`.
3. A minute later the app lives at `https://USERNAME.github.io/REPO/`.

`index.html` exists so that an address without a file name opens the app: Pages serves a folder, and the app is one `flowcore.html`.

## Layout

| Path | What it is |
| --- | --- |
| `flowcore.html` | the whole app: markup, styles, logic and a font in base64 |
| `index.html` | redirect to `flowcore.html` for GitHub Pages |
| `serve.py` | local server; `--tunnel` brings up a temporary https address for a phone |
| `FlowCore.cmd` | starts the server with a double click on Windows |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | offline shell and phone installation |
| `tests/run.js` | logic checks without a browser |
| `.github/workflows/tests.yml` | runs those checks on every push and pull request |
| `ETHICS.md` | the author's position on what this code is not for |
| `screenshots/` | the images in this README |

## Tests

```bash
node tests/run.js
```

There are **519 checks**: week rollover and the archive, migration of older backups, the lock, points from confirmed time, the daily cap and lifting it for a day, level and skins, the reserve, the rest bonus, the quick chips and their types and that they pay nothing, the type mark in the diary rows, the diary grouped by day and filtered by type, the phone summaries, the bottom bar staying in the column rather than over it, the task note and its emoji set, breathing techniques and their phases, noise under the master sound switch, Markdown export, the area editor, the first-run interview, and the dictionary in four languages (every key from the markup and the code exists, plurals go through `Intl.PluralRules`). The tests cut the script out of the real `flowcore.html`, so they check the file the browser actually opens.

The same checks run on GitHub Actions for every push and pull request, see `.github/workflows/tests.yml`. There is no build, so the job is three steps.

## Limits

- Four interface languages: Russian, Ukrainian, English, German. Another language is one more column in the dictionary, but no other translation exists yet.
- Data lives in one browser. Clearing the profile or the site data removes it, so download a JSON backup every week or so.
- There is no sync between devices, on purpose, so that no server and no account appear.
- Everything is one file. Edits stay convenient, but the file is already large: about 340 KB, roughly 100 KB over the wire with gzip.

## License

MIT: take it, change it, use it, publish it. The only condition is keeping the license text. See [LICENSE](LICENSE).

[ETHICS.md](ETHICS.md) sits next to it as the author's position: this code is not meant for government bodies, armed forces, intelligence services and police, state-owned companies, political organisations, or defence contractors. It is **a statement, not a license condition**: MIT grants permission without restrictions and this file does not narrow it, because a public single-file project cannot check who downloaded it anyway. People are welcome regardless of country and citizenship, since the line is drawn at institutions and not at passports.
