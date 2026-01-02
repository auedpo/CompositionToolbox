using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Tasks;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Services
{
    internal static class PresetItemCache
    {
        private static readonly ConcurrentDictionary<string, PresetItemViewModel> _cache = new(StringComparer.OrdinalIgnoreCase);
        private static bool _initialized;

        public static IReadOnlyCollection<PresetItemViewModel> Values => _cache.Values.ToList();

        public static void PrecreateAll(PresetCatalogService catalog, PresetStateService state)
        {
            if (_initialized) return;
            _initialized = true;
            Task.Run(() =>
            {
                try
                {
                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    foreach (var p in catalog.All)
                    {
                        // create VM off-thread (should be safe as it doesn't touch UI)
                        var vm = new PresetItemViewModel(p, state);
                        _cache[p.Id] = vm;
                    }
                    TimingLogger.Log($"PresetItemCache: precreated {_cache.Count} items in {sw.ElapsedMilliseconds}ms");
                }
                catch (Exception ex)
                {
                    TimingLogger.Log($"PresetItemCache: failed to precreate items: {ex.Message}");
                }
            });
        }

        public static bool TryGet(string id, out PresetItemViewModel vm)
        {
            if (id == null) { vm = null!; return false; }
            return _cache.TryGetValue(id, out vm!);
        }
    }
}
