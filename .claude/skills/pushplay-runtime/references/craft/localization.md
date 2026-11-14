# localization in a PushPlay game

The general `localization` skill covers the strings table, the Language setting, longer text, plurals, number formats and fonts. This page gives the PushPlay side. AGENTS.md *Input hints*, *Settings* and *Manifest* are the rules. Never edit the runtime files: the starter's menus, settings and prompts come from them, and you translate only the strings your game passes in.

## Input

- Prompts stay dynamic: button names always come from `input.label()` / `drawPrompts`. A translated line takes the button as a parameter: `t('toStart', { button: input.label('a') })` with the string "{button} para empezar".

## Settings

- Add a `choice` item to the Settings `extra` items: "Language", with English, Español and so on, each named in its own language. `settings.js` saves it.

## Manifest

- Mention the languages in the manifest `description` if it helps.

## Debug hooks and the check

- Play every screen in each language at 1280×800 and at the largest text size. Take screenshots with a repro script (see [debugging.md](../debugging.md)) and read them.
- New languages are a minor `version` bump; add them to DESIGN.md.

## Art and tools

- The bundled art fonts cover Latin text.
