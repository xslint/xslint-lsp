# Releasing

`xslint-lsp` releases **automatically** whenever `xslint` releases, and can
also be released by hand.

## Automatic (the cascade)

When `xslint` publishes a new version it dispatches `xslint-released` here.
[`.github/workflows/cascade.yml`](.github/workflows/cascade.yml) then bumps
`@maxonfjvipon/xslint` to that version, validates against it (lint, test,
coverage), records the change in `CHANGELOG.md`, and cuts this tool's own next
patch — `npm view xslint-lsp version` + 1, independent of xslint's number —
pushing the tag so `release.yml` publishes to npm. Nothing to do; it happens.

## Manual

First, in `CHANGELOG.md`, rename `## Unreleased` to `## <version> - <date>`.
Then comment on any issue or pull request:

```text
@rultor release, tag=`0.0.3`
```

The backticks around the version are required — without them Rultor reads an
empty tag and refuses the release.

The tag triggers [`release.yml`](.github/workflows/release.yml), which stamps
the version, tests, and publishes `xslint-lsp` to npm over OIDC.

## The VS Code extension

Every release also builds the `client/` extension bundling the just-released
server, attaches the `.vsix` to the GitHub release (so anyone can install it
directly), and — when `OVSX_TOKEN` is set — publishes it to
[Open VSX](https://open-vsx.org), the marketplace Cursor, VSCodium, Gitpod,
and Windsurf install from. The extension version mirrors the server version.

The official VS Code Marketplace is published by hand: publishing there from CI
needs an Azure DevOps token, and creating the organization behind it demands
an Azure subscription. On the first of every month,
[`.github/workflows/marketplace.yml`](.github/workflows/marketplace.yml)
compares the version the Marketplace lists with the latest release and, when
it trails, opens an issue mentioning the maintainer. To answer it, download the
release's `.vsix`, pick *Update* in the extension's menu on the
[manage page](https://marketplace.visualstudio.com/manage/publishers/maxonfjvipon),
upload the file, and close the issue.

## Prerequisites

- `DISPATCH_TOKEN` — an organization secret (PAT, `repo` + `workflow` scope).
- The `master` ruleset grants the organization admin a bypass, so the
  cascade's bump can push to the protected branch.
- `OVSX_TOKEN` — an [Open VSX](https://open-vsx.org) access token, for the
  extension publish. Optional: without it, the `.vsix` is still attached to
  the release.
