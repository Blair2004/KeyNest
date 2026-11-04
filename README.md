# Keynest Authenticator

A dependency-free, browser-local TOTP authenticator with configurable custom fields.

## Windows desktop executable

Run .\build-desktop.ps1 to build a self-contained Windows version. Then launch publish\win-x64\KeynestAuthenticator.exe.

The desktop version does not start or require a web server. It uses the Microsoft Edge WebView2 Runtime included with current Windows 10 and Windows 11 installations. Vault data is kept in Keynest's private WebView2 profile under the current Windows user's local application data.

## Run the browser version locally

From this directory, use any static file server. For example:

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Features

- Standards-compatible 6- and 8-digit TOTP generation
- Custom fields configured once and available on every account
- One-click copying for codes and every populated custom value
- Search, category filters, editing, and deletion
- Persistent to-do/completed status for every account
- Recoverable account archive
- Drag-and-drop manual account ordering
- Top-five search recommendations ranked by successful code copies
- Live code previews and quick-copy actions in search recommendations
- JSON import/export that preserves custom fields
- `otpauth://` text import/export for interoperability
- Google Authenticator `otpauth-migration://` batch imports
- Local QR-code image imports from PNG, JPG, and WebP files
- QR-image pasting from the clipboard with Ctrl+V
- Cameroonian name generator covering all ten regions, with English/Christian, Islamic, and Bantu/local first-name styles, one or two regional family names, separate copy actions, and a full regional shuffle
- Duplicate detection using secret, issuer, and account name
- Safe merge of missing custom values when a duplicate is imported
- Device-local storage with no network requests for vault data

## Security note

This prototype stores vault data in the browser's local storage. JSON and OTP-link exports contain secret keys in plaintext. For production use, add an encrypted vault, a strong unlock flow, CSP headers, dependency auditing, and platform-backed secure key storage.

QR image decoding uses the bundled Apache-2.0-licensed jsQR library. QR images are decoded entirely on-device and are not uploaded.
