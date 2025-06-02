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
      - uses: mlugg/setup-zig@v2
      - run: zig build test
```

This will automatically download Zig and install it to `PATH`.

You can use `version` to set a Zig version to download. This may be a release (`0.13.0`), a specific nightly
build (`0.14.0-dev.2+0884a4341`), the string `master` for the latest nightly build, or the string `latest`
for the latest full release. It can also refer to a [Mach nominated version][mach-nominated], such as
`2024.5.0-mach`. Finally, leaving the value empty (the default) will cause the action to attempt to resolve
the Zig version from the `minimum_zig_version` field in `build.zig.zon`, falling back to `latest` if that
isn't possible.

```yaml
  - uses: mlugg/setup-zig@v2
    with:
      version: 0.13.0
```

> [!WARNING]
> Mirrors, including the official Zig website, may purge old nightly builds at their leisure. This means
> that if you target an out-of-date nightly build, such as a `0.11.0-dev` build, the download may fail.

If you want to use one specific mirror, you can set it using the `mirror` option:

```yaml
  - uses: mlugg/setup-zig@v2
    with:
      mirror: 'https://pkg.machengine.org/zig'
```

Please don't do this unnecessarily; it's not nice to hammer one mirror. This mirror is not permitted to
be https://ziglang.org/download to avoid the official website being hit with large amounts of requests.
If you've experienced issues with a default mirror, please open an issue, and I will communicate with the
mirror's owner or remove it from the list.

If necessary, the caching of the global Zig cache directory can be disabled by setting the option
`use-cache: false`. Don't do this without reason: preserving the Zig cache will typically speed things up
and decrease the load on GitHub's runners.

If you are using a [matrix strategy][matrix] for your workflow, you may need to populate the `cache-key` option
with all of your matrix variables to ensure that every job is correctly cached. Unfortunately, GitHub does not
provide any means for the Action to automatically distinguish jobs in a matrix. However, variables which select
the runner OS can be omitted from the `cache-key`, since the runner OS is included in the cache key by default.

Zig cache directories can get incredibly large over time. By default, this Action will clear the cache directory
once its size exceeds 2 GiB. This threshold can be changed by setting the `cache-size-limit` option to a different
value (in MiB); for instance, `cache-size-limit: 4096` for a 4 GiB limit. The limit can be disabled entirely by
setting `cache-size-limit: 0`.

[mach-nominated]: https://machengine.org/about/nominated-zig/
[matrix]: https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/running-variations-of-jobs-in-a-workflow

## Details

This action attempts to download the requested Zig tarball from a set of mirrors, in a random order. As
a last resort, the official Zig website is used. The tarball's minisign signature is also downloaded and
verified to ensure binaries have not been tampered with. The tarball is cached between runs and workflows.

The global Zig cache directory (`~/.cache/zig` on Linux) is automatically cached between runs using an
intelligent cache key hierarchy that maximizes cache reuse:

1. **Primary cache key**: Includes Zig version, OS, architecture, and any user-provided cache key
2. **Fallback cache keys**: When an exact match isn't found, the action tries:
   - Same Zig version without user cache key
   - Version-agnostic cache for same OS/architecture
   - Any Zig cache for same OS/architecture
   - Broad fallback for any Zig cache

This hierarchical approach ensures optimal cache reuse across different workflow configurations while
maintaining isolation when needed. All local caches are redirected to the global cache directory to
make optimal use of this cross-run caching.

The action provides detailed cache analytics through outputs (`cache-hit`, `cache-key-used`, `zig-version`)
and comprehensive logging of cache operations including timing and size information.

## Adding a mirror

Anyone is welcome to host a Zig download mirror; thanks to the tarball signatures, the mirror provider need
not be trusted. Naturally, if a mirror is found to be a bad actor, it will be removed, and likewise if a
mirror repeatedly encounters reliability problems.

The rules for adding a mirror are listed below. Note that I (@mlugg) reserve the right to, for any or no
reason, exclude mirrors which obey these rules, or include mirrors which violate them.

> [!NOTE]
> While there are a lot of rules listed here, most of them should be obvious. They are stated explicitly here
> to ensure complete clarity on what is expected of a mirror. Please do read these requirements through before
> attempting to add a mirror.

* A mirror provides a single base URL, which we will call `X`.
* `X` **may** include a path component, but is not required to. For instance, `https://foo.bar/zig/` is okay,
  as is `https://zig.baz.qux/`.
* The mirror **must** have working HTTPS support. `X` **must** start with `https://`.
* The mirror **must** cache tarballs locally. For instance, it may not simply forward all requests to another
  mirror.
* The mirror **may** routinely evict its local tarball caches based on any reasonable factor, such as age,
  access frequency, or the existence of newer versions. This does not affect whether the mirror may return 404
  for requests to these files (see below).
* The mirror **must** download its tarballs from either `https://ziglang.org/`, or another mirror which
  follows these rules.
* Tarballs **must** be accessible by sending GET requests for files under `X`, where the filename matches that
  of the files provided by `https://ziglang.org/`, not including the directory part. For instance,
  `X/zig-linux-x86_64-0.13.0.tar.xz` is a valid access, and should return the same file as
  `https://ziglang.org/download/0.13.0/zig-linux-x86_64-0.13.0.tar.xz`.
* Files provided by the mirror **must** be bit-for-bit identical to their `https://ziglang.org/` counterparts.
* If a file is accessed whose Zig version is a master branch build (i.e. a `-dev` version), and the version is
  ordered before the latest major release of Zig, the mirror **may** respond with 404 Not Found, but is not
  required to. For instance, at the time of writing, `0.13.0` is the latest major release of Zig, so a mirror
  may respond with 404 for `0.13.0-dev...` builds, but *not* for `0.14.0-dev...` builds.
* If a file is accessed whose Zig version is `0.5.0` or below, the mirror **may** respond with 404 Not Found,
  but is not required to.
* If a file is acccessed which represents a *source* tarball, such as `X/zig-0.13.0.tar.xz`, the mirror
  **may** respond with 404 Not Found, but is not required to. The same applies to "bootstrap source tarballs",
  such as `X/zig-bootstrap-0.13.0.tar.xz`.
* For all other accesses of valid Zig tarballs, the mirror **must** respond with status code 200 OK and the
  file in question. If the mirror has not yet cached the file locally, it should immediately download it from
  a permitted source (as covered above), and respond with the downloaded file.
* If a tarball `X/foo.ext` is available by the above rules, requesting the minisign signature file
  `X/foo.ext.minisig` **must** also respond with status code 200 OK and the signature file in question, like
  the tarball itself.
* The mirror **may** rate-limit accesses. If an access failed due to rate-limiting, the mirror **should**
  return HTTP status code 429 Too Many Requests.
* The mirror **may** undergo maintenance, upgrades, and other scheduled downtime. If an access fails for this
  reason, where possible, the mirror **should** return HTTP status code 503 Unavailable. The mirror **should**
  try to minimize such downtime.
* The mirror **may** undergo occasional unintended and unscheduled downtime. The mirror **must** go to all
  efforts to minimize such outages, and **must** resolve such outages within a reasonable time upon being
  notified of them.
* The mirror **may** observe the `?source=github-actions` query parameter to track how many requests originate
  from this Action. This Action will provide this query parameter to all mirror requests.

The easiest way to set up a mirror right now is using Mach's [Wrench][wrench]. For instructions, please see
[the relevant section of their README][setup-wrench].

[wrench]: https://github.com/hexops/wrench
[setup-wrench]: https://github.com/hexops/wrench?tab=readme-ov-file#run-your-own-ziglangorgdownload-mirror

After setting up a mirror, you can add it to this GitHub Action by opening a PR which adds it to the list in
[mirrors.json](https://github.com/mlugg/setup-zig/blob/main/mirrors.json).
