/** Structural JSON validation with explicit boundary policies; never invokes getters. */
export function assertJsonValue(
  value: unknown,
  options: {
    label?: string;
    omitUndefinedProperties?: boolean;
    rejectNegativeZero?: boolean;
    allowBytes?: boolean;
    maxDepth?: number;
    maxNodes?: number;
  } = {},
): void {
  const label = options.label ?? "Value";
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  function fail(reason: string): never {
    throw new TypeError(`${label} ${reason}`);
  }
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > (options.maxNodes ?? Infinity)) {
      fail("exceeds maximum JSON node count.");
    }
    if (depth > (options.maxDepth ?? Infinity)) {
      fail("exceeds maximum JSON depth.");
    }
    if (
      item === null || typeof item === "string" || typeof item === "boolean"
    ) return;
    if (typeof item === "number") {
      if (
        !Number.isFinite(item) ||
        (options.rejectNegativeZero && Object.is(item, -0))
      ) fail("must contain lossless JSON numbers.");
      return;
    }
    if (!item || typeof item !== "object") {
      fail("must contain lossless JSON values.");
    }
    if (options.allowBytes && item instanceof Uint8Array) return;
    if (ancestors.has(item)) fail("cannot be cyclic.");
    const array = Array.isArray(item);
    if (
      !array && Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    ) fail("must contain plain JSON objects.");
    const keys = Reflect.ownKeys(item);
    if (
      array && (keys.length !== item.length + 1 || !keys.includes("length"))
    ) fail("arrays must be dense and contain no extra properties.");
    ancestors.add(item);
    try {
      for (const key of keys) {
        if (array && key === "length") continue;
        if (typeof key !== "string") fail("cannot contain symbol keys.");
        if (
          array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)
        ) fail("arrays must be dense and contain no extra properties.");
        const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
        if (!descriptor.enumerable || !("value" in descriptor)) {
          fail("must contain enumerable data properties only.");
        }
        if (
          !array && descriptor.value === undefined &&
          options.omitUndefinedProperties
        ) continue;
        visit(descriptor.value, depth + 1);
      }
    } finally {
      ancestors.delete(item);
    }
  };
  visit(value, 0);
}
