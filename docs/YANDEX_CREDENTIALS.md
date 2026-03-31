# Yandex Credentials Setup

## Purpose

Web Title Pro does not ship with built-in Yandex credentials or tokens.

Each company or user should configure their own:

- `Client ID`
- `Client Secret`

After that, the app receives and stores OAuth tokens locally through `Sign in with Yandex ID`.

## Why this is required

- public GitHub releases must not include real company credentials
- access and refresh tokens must not be committed into the repository
- if one company changes staff or rotates credentials, they can do it independently

## Recommended ownership model

For company usage, create a dedicated Yandex OAuth application owned by the company, not by an individual employee.

That way:

- credentials stay under company control
- `Client Secret` can be rotated if needed
- a developer leaving the company does not block future access

## What users configure in the app

Open:

```text
Settings -> Yandex
```

Fill in:

- `Client ID`
- `Client Secret`
- `Scope`

Recommended scope:

```text
cloud_api:disk.read
```

The desktop app uses this local redirect URI internally:

```text
http://127.0.0.1:43145/yandex/callback
```

The same redirect URI must also be configured in the Yandex OAuth application settings, but it is not meant to be edited in the Web Title Pro UI.

## Authorization flow

1. Save Yandex application settings in the app.
2. Click `Sign in with Yandex ID`.
3. Complete login in the browser.
4. Web Title Pro receives:
   - `access token`
   - `refresh token`
5. Tokens are stored locally on this computer only.

## How tokens are handled

- tokens are not stored in the project file
- tokens are not included in GitHub releases
- tokens are hidden from the UI
- `Client ID` and `Client Secret` are hidden again after saving
- `Client ID` and `Client Secret` cannot be copied back out through the app UI
- sensitive values are stored locally and encrypted through Electron `safeStorage` when OS encryption is available

## Important security note

In a desktop application, tokens can be protected well, but not made absolutely impossible to extract from a machine that is fully controlled by an attacker.

What Web Title Pro does:

- hides tokens from UI
- stores them locally
- avoids shipping them in releases
- uses local OS-backed encryption when available

What this does not guarantee:

- total protection against malware
- total protection against a local administrator
- total protection against memory inspection or reverse engineering

## How to rotate credentials or tokens

### Standard rotation

Inside the app:

1. Click `Sign out`
2. Update `Client ID / Client Secret` if needed
3. Click `Save`
4. Click `Sign in with Yandex ID`

### If only tokens need to be refreshed

Usually it is enough to:

1. Click `Sign out`
2. Click `Sign in with Yandex ID`

## Recommended UI behavior

The intended UI model in Web Title Pro is:

### In `Settings -> Yandex`

- show application settings fields
- show connection status
- show connected account name or login if available
- show `Sign in with Yandex ID`
- show `Sign out`
- do not show raw tokens in visible form
- do not keep `Client ID` and `Client Secret` visible after saving

### In `Data Source -> Yandex Disk`

If the user is not authorized:

- show only Yandex sign-in block
- hide:
  - source name
  - remote URL
  - auto-refresh
  - add button

After authorization:

- reveal the rest of the source form

## For public GitHub releases

Recommended release policy:

- ship the Yandex integration UI
- ship no real credentials
- let each user or company configure their own app credentials locally
