# setup-zig

Install the Zig compiler for use in an Actions workflow, and preserve the Zig cache across workflow runs.

## Usage

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    name: Build and Test
    steps:
      - uses: actions/checkout@v3
      - uses: mlugg/setup-zig@v1
      - run: zig build test
```

This will automatically download Zig and install it to `PATH`.

You can use `version` to set a Zig version to download. This may be a release (`0.13.0`), a specific nightly
build (`0.14.0-dev.2+0884a4341`), the string `master` for the latest nightly build, or the string `latest`
for the latest full release. The default is `latest`.

```yaml
  - uses: mlugg/setup-zig@v1
    with:
      version: 0.13.0
```

> [!WARNING]
> Mirrors, including the official Zig website, may purge old nightly builds at their leisure. This means
> that if you target an out-of-date nightly build, such as a `0.11.0-dev` build, the download may fail.

## Details

This action attempts to download the requested Zig tarball from a set of mirrors, in a random order. As
a last resort, the official Zig website is used. The tarball's minisign signature is also downloaded and
verified to ensure binaries have not been tampered with. The tarball is cached between runs and workflows.

The global Zig cache directory (`~/.cache/zig` on Linux) is automatically cached between runs, and all
local caches are redirected to the global cache directory to make optimal use of this cross-run caching.
