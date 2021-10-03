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

export function wait(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, ms);
  });
}
