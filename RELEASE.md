# Release Guide

This repo currently uses two release paths:

- `macOS`: manual local release on a maintainer Mac
- `Windows`: automated GitHub Actions release on tag push

The intended end state for a version is one GitHub Release containing:

- Windows installers uploaded by GitHub Actions
- a signed + notarized macOS DMG uploaded manually

## Versioning

Before creating any release, bump the version in:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Use a matching Git tag for the release, for example:

- app version: `0.4.0`
- Git tag: `v0.4.0`

`src-tauri/Cargo.lock` may also change when the release build runs.

## Windows Release

Windows artifacts are built automatically by [release.yml](.github/workflows/release.yml).

How it works:

1. Push a tag matching `v*.*.*`.
2. GitHub Actions runs the `build-windows` job on `windows-latest`.
3. The workflow installs dependencies, builds the Tauri app for `x86_64-pc-windows-msvc`, and publishes the Windows installers to the GitHub Release for that tag.

Important notes:

- The workflow uses `tauri-apps/tauri-action@v0`.
- The release body currently warns that Windows builds are unsigned and may trigger SmartScreen.
- macOS artifacts are not produced by GitHub Actions today.

## macOS Release

macOS releases are created manually on a maintainer Mac.

### Prerequisites

- Xcode Command Line Tools installed
- `pnpm install` already run
- the Developer ID certificate configured in `src-tauri/tauri.conf.json` is installed in Keychain:
  `Developer ID Application: Anthony Neo (D4NKPP62S5)`
- a repo-root `.env` file containing:
  - `APPLE_ID`
  - `APPLE_PASSWORD`
  - `APPLE_TEAM_ID`

The release scripts load `.env` through [scripts/with-env.sh](scripts/with-env.sh).

### Step 1: Build the signed app + DMG

Run:

```bash
pnpm release:macos:dmg
```

This does the following:

- sources `.env`
- runs the frontend production build
- builds the Tauri release app
- signs the macOS app with the configured Developer ID identity
- notarizes the `.app`
- builds the DMG at:

```text
src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
```

### Step 2: Notarize the outer DMG

The `.app` is notarized during the Tauri build, but the outer DMG should also be submitted to Apple Notary before final distribution.

Run:

```bash
./scripts/with-env.sh xcrun notarytool submit \
  src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
```

Wait for status `Accepted`.

### Step 3: Staple the DMG

Run:

```bash
xcrun stapler staple src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
```

Optional direct check:

```bash
xcrun stapler validate src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
```

### Step 4: Validate the release

Run:

```bash
pnpm release:macos:validate
```

Expected success signals:

- the mounted app shows `Authority=Developer ID Application: Anthony Neo (D4NKPP62S5)`
- the mounted app shows `Notarization Ticket=stapled`
- Gatekeeper reports the app as accepted
- the DMG passes stapler validation

If you want a direct DMG-only validation in addition to the helper script:

```bash
xcrun stapler validate src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
spctl -a -vv -t open src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
```

### Step 5: Upload the macOS artifact

After validation succeeds, upload:

```text
src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
```

to the GitHub Release for the matching tag.

## Recommended Release Order

1. Bump the app version in the three version files.
2. Commit the release changes.
3. Create and push the matching tag, for example `v0.4.0`.
4. Wait for the GitHub Actions Windows workflow to publish Windows artifacts.
5. Run the manual macOS DMG flow locally.
6. Upload the validated macOS DMG to the same GitHub Release.

## Troubleshooting

### `no identity found`

The Developer ID certificate is missing from the local keychain or unavailable to `codesign`.

### `Record not found` when stapling the DMG

The DMG itself was not submitted to Apple Notary yet, even if the inner `.app` was already notarized. Submit the DMG with `xcrun notarytool submit ... --wait` first.

### Validation fails on the DMG ticket check

Re-run:

```bash
xcrun stapler validate src-tauri/target/release/bundle/dmg/Blurly_<VERSION>_aarch64.dmg
```

If that still fails, the DMG was not accepted or not stapled successfully.

### SmartScreen warning on Windows

This is expected with the current workflow. The GitHub Actions release text already notes that Windows installers are currently unsigned.
