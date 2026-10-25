# TraceIt: Devpost submission

Everything for the CalHacks 13.0 Devpost form, in the order the form asks for it.

## Project name

TraceIt

## Elevator pitch (max 200 characters)

Your eraser is hiding the good stuff. TraceIt keeps what students erase in lecture, turns it into a study guide, and shows teachers where the class got stuck.

## About the project

```markdown
## Inspiration

Every student has done it: you write something in a lecture, realize it's wrong, and erase it. The page looks clean, but the moment you got confused is gone, and that's exactly what you needed to study. Your teacher never finds out where the class got lost either.

We kept coming back to one idea: the eraser holds the most useful information in the room, and everyone throws it away.

## What it does

TraceIt is a note-taking app that follows a lecture, recorded or live, and keeps what you erase.

- **Write along with the lecture.** Pen and eraser in several sizes. Every stroke is tied to the second of the lecture it was written in, and live lectures get captions.
- **Nothing is lost.** Erased ink stays on the page as faint ghost ink.
- **It spots where you struggled.** Your pauses, slow-downs and rewrites are compared with your own normal pace and marked as **Fixed**, **Still fuzzy** or **Aha moment**.
- **Review in minutes.** Press *Finish & review* and TraceIt opens your most important moment: your first try, your fix, what the professor said right then, and a quick self-test in 10 languages.
- **For teachers.** Create a class, share a join code, and see the minutes where the class got stuck. No names, and no group smaller than three.
- **Take it with you.** Download your notes as a PDF.

## How we built it

TraceIt builds on an earlier single-developer prototype. At CalHacks 13.0 our team of three turned it into a classroom product: accounts, classes with join codes, the teacher view, the step-by-step review, a full redesign and many fixes.

- **App:** Next.js, React, TypeScript and Tailwind CSS. The canvas records each stroke with its lecture time, speed and pressure.
- **Analysis:** plain TypeScript rules. They compare 10-second windows with the student's own pace and pair each erase with the rewrite that followed.
- **Explanations:** Groq writes the explanations and self-tests. Answers are checked on the server, and the app still works without it.
- **Accounts:** email and password, student and teacher roles, and every page limited to the signed-in user.
- **Data and testing:** SQLite or Postgres, over 1,000 automated tests, deployed with Docker.

## Challenges we ran into

- **Mistake or noise?** A crossed-out word, a slip of the pen and a diagram look alike to a computer. We tuned the rules until erases matched real corrections and a drawn axis stopped counting as a strike-through.
- **Privacy for teachers.** Teachers should see where the class struggled, never who. We count only enrolled students and hide any group smaller than three.
- **Live captions.** Silent microphones and stalled speech services failed without telling anyone, so we added clear warnings.

## Accomplishments that we're proud of

- A full loop: a student's erased line becomes a teacher re-teaching the right minute the next day.
- A review that opens straight to what matters.
- Privacy built in from the start.
- Over 1,000 automated tests passing on two databases.

## What we learned

The most useful information in a classroom isn't the final answer, it's the path to it. Small things, like plain words on buttons and opening the most important moment first, helped students more than any big feature.

## What's next for TraceIt

- Letting students share specific fuzzy spots with their teacher.
- Google Classroom and Canvas roster import.
- An iPad app that works offline.
```

## Built with

next.js, react, typescript, node.js, tailwindcss, html5-canvas, web-speech-api, sqlite, postgresql, timescaledb, groq, whisper, elevenlabs, playwright, docker, render

## "Try it out" links

- Live demo: <your Render URL> (click **Try the demo** or **Try the teacher view**)
- Code: https://github.com/Aasrith-Mandava/traceit

## Video demo link

<YouTube link> (upload `E-founder-voiced.mp4` as Unlisted or Public, with `E-founder-voiced.srt` as subtitles)

YouTube title: TraceIt: Your eraser is hiding the good stuff | CalHacks 13.0

YouTube description:

```
Every student erases. But the moment you got confused is exactly what you needed to study, and it's gone.

TraceIt is a note-taking app that keeps what you erase. Every stroke is tied to the second of the lecture it was written in. When the lecture ends, TraceIt takes you back to the spots where you struggled: your first try, your fix, and what the professor said right then. Teachers see the minutes where the whole class got stuck, without any names.

Try it: <your Render URL>
Code: https://github.com/Aasrith-Mandava/traceit

Built at CalHacks 13.0 by Pranav Chowdary, Nagasai Kakani and Aasrith Mandava.
```

## Image gallery (in this order; the first is the thumbnail)

1. `01-landing.jpg`: "Your eraser is hiding the good stuff."
2. `02-sign-in.jpg`: Sign in, or try it as a student or a teacher with no account.
3. `03-my-notes.jpg`: Write along with a recorded lecture or a live one.
4. `04-writing-screen.jpg`: Every stroke is tied to the lecture, and erased ink stays as faint ghost ink.
5. `05-study-mode.jpg`: Finish & review opens your most important moment: first try, fix, and what the lecture said.
6. `06-my-progress.jpg`: Fuzzy spots carry over between sessions until you've got them.
7. `07-class.jpg`: Teachers create a class and share a join code.
8. `08-class-insights.jpg`: Class insights shows the minutes the whole class got stuck, without names.
9. `09-notability-compare.jpg`: Next to a Notability page, TraceIt shows what the final page hides.

## Prize tracks to opt into

- Cal Hacks First, Second and Third Overall
- Cal Hacks Most Creative Hack
- Cal Hacks Most Technically Complex Hack
- Cal Hacks Best People-First Social Impact Hack
- Cal Hacks Hacker's Choice
- [Notability] Best Use of Notability
- [MLH] Best Use of Tiger Data (only if the demo runs on Tiger Data's cloud)
- [MLH] Commit Fellowship Prize Category (also submit their supplemental form)

## Submission questions

**Share feedback about any technology you interacted with at this hackathon.**

```
Groq: Very fast, and because its API works like OpenAI's, one client also covered OpenAI and Gemini. We hit the text-to-speech daily limit mid-hackathon, and that model only worked after we accepted its terms in the console. Clearer error messages would help.

Tiger Data (TimescaleDB): Continuous aggregates made our teacher heatmap a simple query. Our test database (PGlite) can't run TimescaleDB, so we needed a plain-Postgres fallback.

Next.js 16: Renamed middleware (proxy.ts) and async route params caught us out. The docs bundled with the package got us unstuck quickly.

Web Speech API: Easy to start, but a silent microphone fails without any error, so we added our own warning.

Render: Deploying from our Dockerfile took minutes, and every push redeploys.
```

**Which of the following AI tools did you use this weekend?** Claude / Claude Code, Groq, ElevenLabs.

**Did you implement a generative AI model or API in your hack this weekend?** Yes.

**If so, how and why did you use it?**

```
Yes. TraceIt uses the Groq API in three places:

- Explanations and self-tests (gpt-oss-120b): when a student reviews a moment they struggled with, the model explains it in plain words and writes a quick self-test question, in any of 10 languages. Answers are checked on our server, so the correct answer never reaches the browser.
- Reading handwriting changes (a Groq vision model): it compares the student's first try with their rewrite and describes what changed.
- Transcription (Whisper): uploaded lectures without captions are transcribed, so every pen stroke can be linked to what the professor was saying.

We also use ElevenLabs to read explanations aloud.

Why: our own code finds where a student struggled; that part needs no AI. But a student also needs a clear explanation of that exact spot, in their own language, right away. Generative models let us give every student that, without a tutor. The app still works without any keys: it falls back to built-in answers and the browser's own voice.
```

## Team

Pranav Chowdary · Nagasai Kakani · Aasrith Mandava
