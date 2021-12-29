export function invariant(cond, err = new Error("Assertion Failed!")) {
  if (!cond) throw err;
}

export function isOne(val, set) {
  return set.includes(val);
}

export function copy(val) {
  if (typeof val !== "object" && typeof val !== "function") return val;
  if (typeof val === "function") {
    console.warn("Cannot duplicate functions, returning same function.");
    return val;
  }
  if (!val) return val; // null
  let stringTag = Object.prototype.toString
    .call(val)
    .match(/^\[object (.+)\]$/)[1];
  if (
    /Array$/.test(stringTag) &&
    (Array.isArray(val) || ArrayBuffer.isView(val))
  )
    return val.constructor.from(val);
  if (stringTag === "RegExp") return new RegExp(val.source, val.flags);
  if (/Event$/.test(stringTag)) return new val.constructor(val);
  if (/Map$/.test(stringTag)) return new val.constructor(val);
  if (/Set$/.test(stringTag)) return new val.constructor(val);
  if (/Buffer$/.test(stringTag)) return val.constructor.from(val);
  if (stringTag === "Symbol") return Symbol(val.toSource());
  if (/Error$/.test(stringTag)) return val;
  if (stringTag === "Date") return new Date(val.toString());
  if (stringTag == "Promise") {
    console.warn("Cannot duplicate promises, returning same promise.");
    return val;
  }
  if (stringTag == "WebSocket") {
    console.warn("Cannot duplicate WebSockets, returning same WebSocket.");
    return val;
  }

  if (stringTag === "Object") {
    if ("constructor" in val) {
      let className = val.constructor.name;
      if (className === "Object") return { ...val };
      try {
        console.warn(
          "Unknown value type, attempting to copy with constructor..."
        );
        return new val.constructor(val);
      } catch {
        console.warn("Unable to copy value, returning same instance...");
        return val;
      }
    }
    return Object.assign(Object.create(null), val);
  }

  console.warn("Unknown value type, could not duplicate...");
  return val;
}

export function range(start, end) {
  if (!end) {
    if (start < 0) {
      return [];
    }

    return new Array(start).fill(null).map(function (_, i) {
      return i;
    });
  } else {
    if (end - start < 0) {
      return [];
    }

    return new Array(end - start).fill(null).map(function (_, i) {
      return i + start;
    });
  }
}

export function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, ms);
  });
}
