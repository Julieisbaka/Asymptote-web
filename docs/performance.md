# Performance benchmarking

The repository includes a browser benchmark at
[`examples/benchmark.html`](../examples/benchmark.html).

## Running it

Start the Vite development server, then open:

`/examples/benchmark.html`

Click **Run benchmark**. The page performs:

1. One warm-up render, excluded from the measurements.
2. Ten sequential renders of the same fixed Asymptote source.
3. A report containing every sample, average, median, minimum, maximum, and
   total render time.

The results can be exported as `asymptote-benchmark.json` for comparison with
another build.

## What is measured

The timer starts immediately before `engine.render(source)` and stops when the
returned promise resolves. This includes Asymptote execution and SVG
conversion, but excludes displaying the result in the DOM.

The warm-up is excluded because it can include one-time WASM initialization,
module setup, and browser cache effects. Ten measured iterations are used to
make comparisons simple while still allowing the median to reduce the effect
of one unusually slow sample.

The benchmark reports JavaScript heap usage when Chromium exposes the
non-standard `performance.memory.usedJSHeapSize` property. This is JavaScript
heap memory only; it is not a measurement of total WebAssembly memory. Other
browsers report memory as unavailable.

Standard browser APIs do not provide a reliable per-page CPU percentage. The
render duration is therefore the portable CPU-work metric. Compare builds in
the same browser, with the same tab conditions, source, output format, and
WASM assets.

## Comparing changes

For a useful before/after comparison:

- Use the same browser and machine.
- Close unrelated CPU-heavy tabs.
- Make sure both builds use the same Asymptote source.
- Run the benchmark several times and compare medians, not just one average.
- Treat small changes as noise unless they are consistent across runs.
- Keep the warm-up behavior unchanged.

A lower median generally indicates faster rendering. A lower maximum suggests
fewer occasional stalls. Memory deltas are noisy and should be treated as a
signal rather than an exact allocation measurement.
