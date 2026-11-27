// Thin-plate spline through landmark pairs: a smooth map from a projection
// plane of the model to a livery sheet, exact at the landmarks, affine with
// three of them, and stretching evenly between them (a two-seat canopy fitted
// on a single-seat sheet, say).

/** @param {Array<[[number, number], [number, number]]>} pairs - [plane point, sheet pixel] */
export function thinPlateSpline(pairs) {
  const n = pairs.length;
  const kernel = (r2) => (r2 > 1e-12 ? r2 * Math.log(r2) * 0.5 : 0);
  const size = n + 3;
  const a = Array.from({ length: size }, () => new Float64Array(size));
  for (let i = 0; i < n; i++) {
    const [xi, yi] = pairs[i][0];
    for (let j = 0; j < n; j++) {
      const [xj, yj] = pairs[j][0];
      a[i][j] = kernel((xi - xj) ** 2 + (yi - yj) ** 2);
    }
    a[i][n] = a[n][i] = 1;
    a[i][n + 1] = a[n + 1][i] = xi;
    a[i][n + 2] = a[n + 2][i] = yi;
  }
  const coeffs = [0, 1].map((c) => {
    const b = new Float64Array(size);
    for (let i = 0; i < n; i++) b[i] = pairs[i][1][c];
    return gauss(
      a.map((row) => Float64Array.from(row)),
      b,
    );
  });
  return (x, y) =>
    coeffs.map((w) => {
      let v = w[n] + w[n + 1] * x + w[n + 2] * y;
      for (let i = 0; i < n; i++) {
        const [xi, yi] = pairs[i][0];
        v += w[i] * kernel((x - xi) ** 2 + (y - yi) ** 2);
      }
      return v;
    });
}

function gauss(a, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}
