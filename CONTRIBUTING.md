# Contributing Guide

Thank you for your interest in and support for this project! 🎉

You are welcome to participate in building the project by submitting Issues, Pull Requests, fixing bugs, improving documentation, or proposing new features.

Before you start contributing, please read the notes below so we can collaborate more efficiently.

---

## 1. Ways to Contribute

You can participate in the project in the following ways:

* Submit bug reports
* Propose new features
* Fix existing issues
* Improve code structure or performance
* Improve UI / UX
* Improve project documentation
* Add comments
* Improve compatibility
* Submit new feature implementations

---

## 2. Submitting an Issue

If you find a bug or have a new feature suggestion, please create an Issue first.

When submitting a bug, it is recommended to include as much of the following information as possible:

* Description of the problem
* Version where the problem occurs
* Android / OS version
* Device model
* Steps to reproduce
* Expected behavior
* Actual behavior
* Error logs
* Screenshots or screen recordings (if available)

For example:

```text
Problem:
After entering the game library page, pulling up cannot load the next page.

Steps to reproduce:
1. Open the app
2. Enter the game library
3. Scroll to the bottom
4. Keep pulling up

Expected behavior:
The next page of games is loaded.

Actual behavior:
No loading operation is triggered.

Device:
Android 15
```

For feature suggestions, please describe as clearly as possible:

```text
Feature:
Add a game favorites feature.

Purpose:
Helps users quickly find the games they play often.

Suggested implementation:
Add a favorite button on the game card, and add a "Favorites" category.
```

---

## 3. Fork the Project

First, fork this project to your own GitHub account.

Then clone your repository:

```bash
git clone https://github.com/YOUR_USERNAME/PROJECT_NAME.git
```

Enter the project directory:

```bash
cd PROJECT_NAME
```

Add the original repository as the upstream repository:

```bash
git remote add upstream https://github.com/ORIGINAL_OWNER/PROJECT_NAME.git
```

View the remotes:

```bash
git remote -v
```

---

## 6. Code Standards

When submitting code, please keep it consistent with the project's existing code style.

Basic requirements:
* vibe coding must strictly follow the code standards in `AGENTS.md`.
* Use Kotlin 13.0.0 or later
* Use clear, meaningful variable names
* Avoid meaningless abbreviations
* Avoid duplicate code
* Do not submit obviously unrelated code changes
* Do not reformat the whole project at will
* Remove dead code and debug code
* Do not submit sensitive information
* Add comments appropriately for complex logic

---

## 7. Commit Conventions

It is recommended that each commit completes only one kind of change.

The following format is recommended:

```text
type: short description
```

For example:

```text
feat: add game favorites feature
fix: fix the game library failing to load when pulling up
refactor: refactor the game scanning logic
docs: update README
style: improve the game card layout
perf: improve game list loading performance
chore: update project dependencies
```

---

## 8. Submitting Code

After finishing your changes:

```bash
git add .
```

Commit:

```bash
git commit -m "feat: add game favorites feature"
```

Push to your own repository:

```bash
git push origin feature/game-favorite
```

Then create a Pull Request on GitHub.

---

## 9. Pull Request Conventions

When creating a Pull Request, please provide as clear a description as possible.

Recommended format:

```markdown
## What was changed

Briefly explain what this PR does.

## Why the change is needed

Why this change is necessary.

## Main changes

- Changed xxx
- Added xxx
- Fixed xxx

## Testing

- [x] Local testing completed
- [x] Existing functionality works normally
- [ ] Tested on multiple devices

## Related Issue

Closes #123

## Screenshots

If UI changes are involved, please attach before and after screenshots.
```

A PR that contains a large number of unrelated features and changes at the same time is not accepted; it is hard to review and unclear.
For large changes, it is recommended to create an Issue for discussion first. Be sure to confirm whether the feature fits the project direction.
If the feature fits the project direction, then create the PR.

---

## 10. Feature Changes and Additions

If the Pull Request involves feature changes or additions, it is recommended to provide:

* A before/after comparison report or a detailed description of the new feature
* A detailed explanation of the change approach or a detailed description of the new feature
* How the fixed or added feature applies, and how the problem is solved
* Intuitive on-device test screenshots and comparisons; if images cannot show this accurately or intuitively, attach a video link

Please try to ensure that changes and additions do not break the integrity and accuracy of other features.

---

## 10. UI Changes

If the Pull Request involves UI changes, it is recommended to provide:

* Screenshots before the change
* Screenshots after the change
* Phone UI screenshots
* Tablet UI screenshots (if applicable)
* Landscape screenshots (if applicable)
* Dark mode screenshots (if applicable)

Please try to ensure that the changes do not break layouts at other screen sizes and comply with the UI standards.

---

## 11. Engine and Low-Level Changes

If the Pull Request involves engine changes or low-level changes, it is recommended to provide:

* A detailed report comparing the actual optimization effect against expectations
* A link to an on-device test video or intuitive screenshots
* A detailed explanation of the change approach
* Small-scale real-world usage testing
* For cases that may produce false positives, clearly mark the relevant code sections and explanations


Please be sure to ensure that the changes do not break the normal operation and integrity of the engine and low-level systems.

---

## 11. Bug Fixes

When fixing a bug, please describe as clearly as possible:

```text
Cause of the problem:
xxx

Fix approach:
xxx

Impact scope:
xxx

Test results:
xxx
```

If a corresponding Issue exists, you can write in the Pull Request:

```text
Fixes #123
```

or:

```text
Closes #123
```

After the Pull Request is merged, the corresponding Issue will be closed automatically.

---

## 12. New Features

For larger new features, it is recommended to create an Issue for discussion first.

This allows you to confirm in advance:

* Whether the feature fits the project direction
* Whether someone has already implemented it
* Whether a more suitable implementation approach exists
* Whether the architecture needs to be adjusted
* Whether existing features will be affected

This avoids discovering after a large amount of development work that the feature cannot be merged.

---

## 13. Pull Request Review

After submitting a PR, wait for the bot to make change suggestions and revise accordingly.
If you disagree, reply separately to the specific code false positive reported by the bot.
Do not explain multiple problems in a single note; reply to each problem separately.

For example:

* Change the code structure
* Adjust naming
* Fix compatibility issues
* Add exception handling
* Supplement the documentation
* Fix UI problems

You can continue to push commits to the original branch.

The Pull Request updates automatically; there is no need to create a new PR.

---

## 14. Merge Requirements

Before merging, a Pull Request should preferably satisfy:

* The project compiles normally
* No obvious runtime errors
* No breakage of existing features
* No sensitive information submitted
* No large number of unrelated file changes
* Commit messages are basically clear
* New code matches the overall style of the project
* UI changes have no obvious adaptation problems

Whether to finally merge is decided by the project maintainers according to the actual situation.

---

## 15. Code of Conduct

When participating in project discussions, please stay friendly and respectful.

Please avoid:

* Personal attacks
* Malicious mockery
* Pointless arguments
* Spam
* Posting content unrelated to the project
* Maliciously submitting Issues or Pull Requests

It is normal to have different technical opinions; please keep the discussion focused on the code and the problem itself.

---

## 16. First Time Contributing to Open Source?

If this is your first Pull Request, that is completely fine.

The basic flow is actually quite simple:

```text
Fork the project
   ↓
Clone locally
   ↓
Create a new branch
   ↓
Modify the code
   ↓
Commit
   ↓
Push
   ↓
Create a Pull Request
```

If your implementation still has shortcomings, you can also submit the PR first and then keep improving it based on the review feedback.

---

## Thanks for Contributing ❤️

Thanks to all contributors who participate in the development, testing, feedback, and documentation maintenance of this project.

Every Issue, Pull Request, and suggestion helps the project become better.

Welcome to contribute!