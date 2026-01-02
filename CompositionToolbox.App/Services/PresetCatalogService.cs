using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Diagnostics;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public class PresetCatalogService
    {
        private readonly List<PresetPcSet> _all;
        private readonly Dictionary<string, PresetPcSet> _byId;

        public PresetCatalogService()
        {
            _all = LoadCatalog();
            _byId = _all.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase);
        }

        public IReadOnlyList<PresetPcSet> All => _all;

        public PresetPcSet? GetById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            return _byId.TryGetValue(id, out var preset) ? preset : null;
        }

        public IEnumerable<PresetPcSet> Search(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return _all;
            }

            var trimmed = query.Trim();

            if (TryParseCardinality(trimmed, out var card))
            {
                return _all.Where(p => p.Cardinality == card);
            }

            if (LooksLikeIdQuery(trimmed))
            {
                return _all.Where(p => p.Id.Contains(trimmed, StringComparison.OrdinalIgnoreCase));
            }

            if (TryParsePrimeForm(trimmed, out var pcs))
            {
                return _all.Where(p => p.PrimeForm.SequenceEqual(pcs));
            }

            return _all.Where(p =>
                p.Id.Contains(trimmed, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(p.DisplayName) && p.DisplayName.Contains(trimmed, StringComparison.OrdinalIgnoreCase)));
        }

        private static List<PresetPcSet> LoadCatalog()
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var path = Path.Combine(AppContext.BaseDirectory, "Assets", "presets.json");
                if (!File.Exists(path))
                {
                    TimingLogger.Log($"PresetCatalogService.LoadCatalog: presets.json not found (path={path}) - took {sw.ElapsedMilliseconds}ms");
                    return new List<PresetPcSet>();
                }

                var json = File.ReadAllText(path);
                var presets = JsonSerializer.Deserialize<List<PresetPcSet>>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                }) ?? new List<PresetPcSet>();

                foreach (var preset in presets)
                {
                    if (preset.Modulus == 0)
                    {
                        preset.Modulus = 12;
                    }
                    if (preset.Cardinality == 0 && preset.PrimeForm != null)
                    {
                        preset.Cardinality = preset.PrimeForm.Length;
                    }
                }

                var ordered = presets.OrderBy(p => p.Id, StringComparer.OrdinalIgnoreCase).ToList();
                TimingLogger.Log($"PresetCatalogService.LoadCatalog: loaded {ordered.Count} presets in {sw.ElapsedMilliseconds}ms (path={path})");
                return ordered;
            }
            catch (Exception ex)
            {
                TimingLogger.Log($"PresetCatalogService.LoadCatalog: failed ({ex.Message}) after {sw.ElapsedMilliseconds}ms");
                return new List<PresetPcSet>();
            }
        }

        private static bool LooksLikeIdQuery(string query)
        {
            return query.Contains("-", StringComparison.OrdinalIgnoreCase) && !Regex.IsMatch(query, @"^\d+\-$");
        }

        private static bool TryParseCardinality(string query, out int card)
        {
            card = 0;
            var trimmed = query.Trim().ToLowerInvariant();
            if (trimmed.StartsWith("k="))
            {
                return int.TryParse(trimmed.Substring(2).Trim(), out card);
            }
            if (trimmed.StartsWith("card:"))
            {
                return int.TryParse(trimmed.Substring(5).Trim(), out card);
            }
            if (Regex.IsMatch(trimmed, @"^\d+\-$"))
            {
                return int.TryParse(trimmed.TrimEnd('-'), out card);
            }
            if (Regex.IsMatch(trimmed, @"^\d+$") && trimmed.Length <= 2)
            {
                return int.TryParse(trimmed, out card);
            }
            return false;
        }

        private static bool TryParsePrimeForm(string query, out int[] pcs)
        {
            pcs = Array.Empty<int>();
            if (string.IsNullOrWhiteSpace(query)) return false;

            var trimmed = query.Trim();
            if (trimmed.All(char.IsDigit) && trimmed.Length > 1)
            {
                pcs = trimmed.Select(c => c - '0').ToArray();
                return true;
            }

            var matches = Regex.Matches(trimmed, @"\d+");
            if (matches.Count == 0) return false;

            pcs = matches.Select(m => int.Parse(m.Value)).ToArray();
            return pcs.Length > 0;
        }
    }
}
