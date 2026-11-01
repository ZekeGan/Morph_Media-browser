# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Use GitHub's private reporting instead: open the repository's **Security** tab, choose **Report a vulnerability**, and describe the problem. Only the maintainer can read it, and a fix can be prepared before the details become public.

A useful report says:

- what you did, step by step, and what you expected;
- the version (see `package.json` or the changelog) and your Windows version;
- what an attacker gains (reading or changing files outside a project, running a program, leaking data);
- a small sample folder or file that triggers it, if there is one. Please do not send real personal collections.

This is a one-person project, so replies are best effort: expect an acknowledgement within about a week, and a fix or a clear answer after that. You will be credited in the changelog unless you prefer not to be.

## What is in scope

M:orph runs on your own computer and reads folders you choose, so the most important risks are:

- the interface reading or writing paths it was not given, or running commands (the renderer is sandboxed and must not be able to);
- crafted folder names, record files, archives, subtitles, images or web responses that crash the app, escape a folder, overwrite or delete original files, or run code;
- the launch actions (EXE, shortcut, URL) doing more than the user bound;
- the import from websites sending more data than the page address, or accepting redirects to other hosts.

## What is out of scope

- Attacks that already need full control of your computer or user account.
- Problems in third-party sites or in Electron / Chromium themselves (please report those upstream; tell us if an update is needed).
- Content you chose to open that is unpleasant but harmless to the app.

## Supported versions

Only the latest version receives fixes.
