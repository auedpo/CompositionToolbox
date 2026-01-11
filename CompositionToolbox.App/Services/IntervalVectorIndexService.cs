// Purpose: Service orchestrating interval vector index operations for the app.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public enum IvEquivalenceMode
    {
        T,
        TI
    }

    public sealed class IntervalVectorIndex
    {
        public int Modulus { get; init; }
        public int Cardinality { get; init; }
        public IvEquivalenceMode EquivalenceMode { get; init; }
        public IReadOnlyDictionary<string, List<RepresentativeSet>> Buckets { get; init; } =
            new Dictionary<string, List<RepresentativeSet>>();
    }

    public sealed class RepresentativeSet
    {
        public string Key { get; init; } = string.Empty;
        public int[] Pcs { get; init; } = Array.Empty<int>(); // unordered sorted
        public int[] NormalForm { get; init; } = Array.Empty<int>();
        public int[] PrimeForm { get; init; } = Array.Empty<int>();
        public int[] IntervalVector { get; init; } = Array.Empty<int>();
    }

    public sealed class IndexBuildProgress
    {
        public IndexBuildProgress(double percent, int processed, double total)
        {
            Percent = percent;
            Processed = processed;
            Total = total;
        }

        public double Percent { get; }
        public int Processed { get; }
        public double Total { get; }
    }

    public sealed class IntervalVectorIndexService
    {
        private readonly object _lock = new();
        private readonly Dictionary<IndexKey, Task<IntervalVectorIndex>> _indexTasks = new();
        private readonly Dictionary<IndexKey, IntervalVectorIndex> _cache = new();

        public Task<IntervalVectorIndex> EnsureIndexAsync(
            int modulus,
            int cardinality,
            IvEquivalenceMode mode,
            IProgress<IndexBuildProgress>? progress,
            CancellationToken cancellationToken)
        {
            var key = new IndexKey(modulus, cardinality, mode);
            lock (_lock)
            {
                if (_cache.TryGetValue(key, out var cached))
                {
                    return Task.FromResult(cached);
                }
                if (_indexTasks.TryGetValue(key, out var inFlight))
                {
                    return inFlight;
                }

                var task = Task.Run(
                    () => BuildIndex(modulus, cardinality, mode, progress, cancellationToken),
                    cancellationToken);
                _indexTasks[key] = task;
                return task.ContinueWith(t =>
                {
                    lock (_lock)
                    {
                        _indexTasks.Remove(key);
                        if (t.Status == TaskStatus.RanToCompletion)
                        {
                            _cache[key] = t.Result;
                        }
                    }

                    if (t.Status == TaskStatus.RanToCompletion) return t.Result;
                    if (t.IsCanceled) throw new TaskCanceledException(t);
                    throw t.Exception?.GetBaseException() ?? new InvalidOperationException("Index build failed.");
                }, CancellationToken.None, TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
        }

        public static int[] ComputeIntervalVector(int[] pcs, int modulus)
        {
            var set = MusicUtils.NormalizeUnordered(pcs, modulus);
            if (set.Length < 2 || modulus <= 0) return Array.Empty<int>();
            var icCount = modulus / 2;
            var counts = new int[icCount];
            for (int i = 0; i < set.Length; i++)
            {
                for (int j = i + 1; j < set.Length; j++)
                {
                    var d = (set[j] - set[i]) % modulus;
                    if (d <= 0) d += modulus;
                    var ic = Math.Min(d, modulus - d);
                    if (ic <= 0 || ic > icCount) continue;
                    counts[ic - 1]++;
                }
            }
            return counts;
        }

        private static IntervalVectorIndex BuildIndex(
            int modulus,
            int cardinality,
            IvEquivalenceMode mode,
            IProgress<IndexBuildProgress>? progress,
            CancellationToken cancellationToken)
        {
            if (modulus <= 0 || cardinality <= 0 || cardinality > modulus)
            {
                return new IntervalVectorIndex
                {
                    Modulus = modulus,
                    Cardinality = cardinality,
                    EquivalenceMode = mode
                };
            }

            var buckets = new Dictionary<string, Dictionary<string, RepresentativeSet>>();
            var total = EstimateCombinationCount(modulus, cardinality);
            var processed = 0;
            var reportEvery = 2000;

            foreach (var subset in EnumerateSubsets(modulus, cardinality, cancellationToken))
            {
                cancellationToken.ThrowIfCancellationRequested();
                processed++;

                var iv = ComputeIntervalVector(subset, modulus);
                var ivKey = string.Join(",", iv);
                var nf = MusicUtils.ComputeNormalOrder(subset, modulus);
                var pf = mode == IvEquivalenceMode.TI
                    ? MusicUtils.ComputePrimeForm(subset, modulus)
                    : Array.Empty<int>();
                string repKey;
                int[] repPcs;
                int[] repNf;
                int[] repPf;

                if (mode == IvEquivalenceMode.TI)
                {
                    repPf = pf.Length == 0 ? MusicUtils.ComputePrimeForm(subset, modulus) : pf;
                    repKey = string.Join(",", repPf);
                    repPcs = repPf.OrderBy(x => x).ToArray();
                    repNf = MusicUtils.ComputeNormalOrder(repPcs, modulus);
                }
                else
                {
                    var nfZero = TransposeToZero(nf, modulus);
                    repKey = string.Join(",", nfZero);
                    repPcs = nfZero.OrderBy(x => x).ToArray();
                    repNf = nfZero;
                    repPf = Array.Empty<int>();
                }

                if (!buckets.TryGetValue(ivKey, out var repBucket))
                {
                    repBucket = new Dictionary<string, RepresentativeSet>();
                    buckets[ivKey] = repBucket;
                }

                if (!repBucket.ContainsKey(repKey))
                {
                    repBucket[repKey] = new RepresentativeSet
                    {
                        Key = repKey,
                        Pcs = repPcs,
                        NormalForm = repNf,
                        PrimeForm = repPf,
                        IntervalVector = iv
                    };
                }

                if (progress != null && processed % reportEvery == 0)
                {
                    var percent = total <= 0 ? 0 : Math.Min(100.0, processed / total * 100.0);
                    progress.Report(new IndexBuildProgress(percent, processed, total));
                }
            }

            progress?.Report(new IndexBuildProgress(100, processed, total));

            var finalized = buckets.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value.Values.ToList());

            return new IntervalVectorIndex
            {
                Modulus = modulus,
                Cardinality = cardinality,
                EquivalenceMode = mode,
                Buckets = finalized
            };
        }

        private static IEnumerable<int[]> EnumerateSubsets(int modulus, int cardinality, CancellationToken token)
        {
            if (cardinality <= 0 || cardinality > modulus) yield break;
            var comb = new int[cardinality];
            for (int i = 0; i < cardinality; i++) comb[i] = i;

            while (true)
            {
                token.ThrowIfCancellationRequested();
                yield return comb.ToArray();
                int i;
                for (i = cardinality - 1; i >= 0; i--)
                {
                    if (comb[i] < modulus - cardinality + i)
                    {
                        comb[i]++;
                        for (int j = i + 1; j < cardinality; j++)
                        {
                            comb[j] = comb[j - 1] + 1;
                        }
                        break;
                    }
                }
                if (i < 0) break;
            }
        }

        private static int[] TransposeToZero(int[] pcs, int modulus)
        {
            if (pcs.Length == 0) return Array.Empty<int>();
            var t = pcs[0];
            var result = new int[pcs.Length];
            for (int i = 0; i < pcs.Length; i++)
            {
                var v = pcs[i] - t;
                var n = v % modulus;
                result[i] = n < 0 ? n + modulus : n;
            }
            return result;
        }

        private static double EstimateCombinationCount(int n, int k)
        {
            if (k < 0 || n < 0 || k > n) return 0;
            k = Math.Min(k, n - k);
            if (k == 0) return 1;
            double result = 1;
            for (int i = 1; i <= k; i++)
            {
                result *= (n - (k - i));
                result /= i;
            }
            return result;
        }

        private readonly record struct IndexKey(int Modulus, int Cardinality, IvEquivalenceMode Mode);
    }
}
