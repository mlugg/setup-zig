declare class AddonResolveError extends Error {
  readonly code: string

  static INVALID_ADDON_SPECIFIER(msg: string): AddonResolveError
}

export = AddonResolveError
