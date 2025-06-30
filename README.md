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
If you've experienced issues with a default mirror, please [open an issue][report-bad-mirror] on the Zig
website repository, which is where the list of mirrors is maintained.

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
[report-bad-mirror]: https://github.com/ziglang/www.ziglang.org/issues/new

## Details

This action attempts to download the requested Zig tarball from a set of mirrors, in a random order. As
a last resort, the official Zig website is used. The tarball's minisign signature is also downloaded and
verified to ensure binaries have not been tampered with. The tarball is cached between runs and workflows.

The global Zig cache directory (`~/.cache/zig` on Linux) is automatically cached between runs, and all
local caches are redirected to the global cache directory to make optimal use of this cross-run caching.

## Adding a mirror

The list of tarball mirrors is not in this repository; rather, the [community mirror list][mirrors] from
ziglang.org is used. If you are interested in hosting a mirror of your own, check out the
[documentation][host-mirror] on the Zig website repository. That way, your mirror can benefit not just
setup-zig, but also any other tooling which wants to fetch Zig!

[mirrors]: https://ziglang.org/download/community-mirrors/
[host-mirror]: https://github.com/ziglang/www.ziglang.org/blob/main/MIRRORS.md
