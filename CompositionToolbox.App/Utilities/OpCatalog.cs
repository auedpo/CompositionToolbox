// Purpose: Provides metadata (title, summary, tags) for canonical operations.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.Json;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Utilities
{
    public static class OpCatalog
    {
        private sealed class Entry
        {
            public Entry(string title, Func<IReadOnlyDictionary<string, object>?, string?> summaryFactory, params string[] tags)
            {
                Title = title;
                SummaryFactory = summaryFactory;
                Tags = tags;
            }

            public string Title { get; }
            public Func<IReadOnlyDictionary<string, object>?, string?> SummaryFactory { get; }
            public string[] Tags { get; }
        }

        private static readonly Dictionary<string, Entry> Entries = new(StringComparer.OrdinalIgnoreCase)
        {
            [OpKeys.ProjectInitInput] = new Entry("Input", SummarizeInitialization, "project", "init"),
            [OpKeys.PitchGapToPcApply] = new Entry("Gap → PC", SummarizeGapToPc, "pitch", "gapToPc"),
            [OpKeys.TransformFocusAffineApply] = new Entry("Focus Affine", SummarizeFocusAffine, "transform", "focusAffine"),
            [OpKeys.RhythmInterferenceApply] = new Entry("Interference Rhythm", SummarizeInterferenceRhythm, "rhythm", "interference"),
            [OpKeys.TransformAcdlApply] = new Entry("ACDL", SummarizeAcdl, "transform", "acdl"),
            [OpKeys.PitchPcsetDedupe] = new Entry("Dedupe PCs", SummarizeDedupe, "pitch", "pcset", "dedupe"),
            [OpKeys.PitchPcsetOrder] = new Entry("Order PCs", SummarizeOrdering, "pitch", "pcset", "order"),
            [OpKeys.PitchIvExplorerMove] = new Entry("IV Move", SummarizeIvMove, "pitch", "ivExplorer"),
            [OpKeys.PitchNecklaceEnter] = new Entry("Necklace Entry", SummarizeNecklace, "pitch", "necklace"),
            [OpKeys.UiInspectorForgetOrder] = new Entry("Forget Order", SummarizeInspectorForget, "ui", "inspector"),
            [OpKeys.UiInspectorChooseOrdering] = new Entry("Choose Ordering", SummarizeInspectorChoose, "ui", "inspector")
        };

        public static OpDescriptor Describe(string? opKey, Dictionary<string, object>? opParams)
        {
            var key = string.IsNullOrWhiteSpace(opKey) ? string.Empty : opKey!;
            var args = OperationLog.GetArgs(opParams);
            if (Entries.TryGetValue(key, out var entry))
            {
                return new OpDescriptor
                {
                    OpKey = key,
                    Title = entry.Title,
                    Summary = entry.SummaryFactory(args) ?? string.Empty,
                    Tags = entry.Tags,
                    OperationLabel = entry.Title,
                    OpParams = opParams
                };
            }

            return new OpDescriptor
            {
                OpKey = key,
                Title = string.IsNullOrWhiteSpace(key) ? "Unknown" : key,
                Summary = string.Empty,
                Tags = Array.Empty<string>(),
                OperationLabel = key,
                OpParams = opParams
            };
        }

        public static OpDescriptor Describe(CompositeTransformLogEntry entry)
        {
            var fallbackKey = entry.OpKey
                ?? OpKeyMapper.FromLegacyOpType(entry.OpType)
                ?? OpKeyMapper.FromLegacyOpType(entry.Op)
                ?? entry.Op;
            var descriptor = Describe(fallbackKey, entry.OpParams);
            if (string.IsNullOrWhiteSpace(descriptor.Title) && !string.IsNullOrWhiteSpace(entry.Op))
            {
                descriptor.Title = entry.Op;
                descriptor.OperationLabel = entry.Op;
            }
            if (string.IsNullOrWhiteSpace(descriptor.OpKey) && !string.IsNullOrWhiteSpace(fallbackKey))
            {
                descriptor.OpKey = fallbackKey;
            }
            return descriptor;
        }

        public static Dictionary<string, object> Migrate(string? opKey, Dictionary<string, object>? opParams)
        {
            _ = opKey; // currently unused, paving the way for future migrations.
            return OperationLog.Normalize(opParams);
        }

        public static string? GetGroup(string? opKey)
        {
            if (string.IsNullOrWhiteSpace(opKey)) return null;
            var parts = opKey.Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return null;
            return $"{parts[0]}/{parts[1]}";
        }

        private static string? SummarizeInitialization(IReadOnlyDictionary<string, object>? args)
        {
            var orderedLen = GetLength(args, "ordered");
            var unorderedLen = GetLength(args, "unordered");
            var modulus = ReadInt(args, "modulus");
            var builder = new StringBuilder();
            if (orderedLen >= 0)
            {
                builder.Append($"{orderedLen} ordered pcs");
            }
            if (unorderedLen >= 0 && unorderedLen != orderedLen)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"{unorderedLen} unordered");
            }
            if (modulus.HasValue)
            {
                if (builder.Length > 0)
                {
                    builder.Append(", ");
                }
                builder.Append($"mod {modulus.Value}");
            }
            var input = ReadString(args, "input");
            if (!string.IsNullOrWhiteSpace(input))
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"\"{input}\"");
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeGapToPc(IReadOnlyDictionary<string, object>? args)
        {
            var builder = new StringBuilder();
            if (TryInt(args, "root", out var root))
            {
                builder.Append($"root {root}");
            }
            var gaps = ReadIntArray(args, "gaps");
            if (gaps?.Length > 0)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"{gaps.Length} gap{(gaps.Length == 1 ? string.Empty : "s")}");
            }
            var resultCount = GetLength(args, "pcs");
            if (resultCount >= 0)
            {
                if (builder.Length > 0) builder.Append(" → ");
                builder.Append($"{resultCount} pc{(resultCount == 1 ? string.Empty : "s")}");
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeFocusAffine(IReadOnlyDictionary<string, object>? args)
        {
            var builder = new StringBuilder();
            if (TryInt(args, "focus", out var focus))
            {
                builder.Append($"focus {focus}");
            }
            if (TryInt(args, "a", out var multiplier))
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"a={multiplier}");
            }
            var mode = ReadString(args, "mode");
            if (!string.IsNullOrWhiteSpace(mode))
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append(mode);
            }
            var modulus = ReadInt(args, "modulus");
            if (modulus.HasValue)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"mod {modulus.Value}");
            }
            var resultCount = GetLength(args, "ordered");
            if (resultCount >= 0)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"{resultCount} pcs");
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeInterferenceRhythm(IReadOnlyDictionary<string, object>? args)
        {
            if (args == null) return null;
            var pieces = new List<string>();
            if (TryInt(args, "A", out var a))
            {
                pieces.Add($"A={a}");
            }
            if (TryInt(args, "B", out var b))
            {
                pieces.Add($"B={b}");
            }
            if (TryInt(args, "PitchA", out var pitchA))
            {
                pieces.Add($"PitchA={pitchA}");
            }
            if (TryInt(args, "PitchB", out var pitchB))
            {
                pieces.Add($"PitchB={pitchB}");
            }
            return pieces.Count == 0 ? null : string.Join(", ", pieces);
        }

        private static string? SummarizeAcdl(IReadOnlyDictionary<string, object>? args)
        {
            var builder = new StringBuilder();
            if (TryInt(args, "AnchorGapIndex", out var anchor))
            {
                builder.Append($"anchor {anchor}");
            }
            if (TryInt(args, "P", out var p))
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"P {p}");
            }
            var proj = ReadString(args, "ProjectionMode");
            if (!string.IsNullOrWhiteSpace(proj))
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append(proj);
            }
            var modulus = ReadInt(args, "Modulus");
            if (modulus.HasValue)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"mod {modulus.Value}");
            }
            var resultCount = GetLength(args, "Ordered");
            if (resultCount < 0)
            {
                resultCount = GetLength(args, "resultList");
            }
            if (resultCount >= 0)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"{resultCount} pcs");
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeDedupe(IReadOnlyDictionary<string, object>? args)
        {
            var before = GetLength(args, "Original");
            var after = GetLength(args, "Unique");
            if (before < 0 || after < 0)
            {
                return null;
            }
            return $"removed duplicates {before} → {after}";
        }

        private static string? SummarizeOrdering(IReadOnlyDictionary<string, object>? args)
        {
            var policy = ReadString(args, "policy");
            if (string.IsNullOrWhiteSpace(policy))
            {
                policy = ReadString(args, "policyName");
            }
            var length = GetLength(args, "Ordered");
            var builder = new StringBuilder();
            if (!string.IsNullOrWhiteSpace(policy))
            {
                builder.Append(policy);
            }
            if (length >= 0)
            {
                if (builder.Length > 0)
                {
                    builder.Append(", ");
                }
                builder.Append($"{length} pcs");
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeIvMove(IReadOnlyDictionary<string, object>? args)
        {
            var builder = new StringBuilder();
            if (TryInt(args, "fromIC", out var from))
            {
                builder.Append($"IC{from}");
            }
            if (TryInt(args, "toIC", out var to))
            {
                if (builder.Length > 0) builder.Append(" → ");
                builder.Append($"IC{to}");
            }
            var eq = ReadString(args, "eqMode");
            if (!string.IsNullOrWhiteSpace(eq))
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append(eq);
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeNecklace(IReadOnlyDictionary<string, object>? args)
        {
            var modulus = ReadInt(args, "Modulus");
            var count = GetLength(args, "Order");
            var builder = new StringBuilder();
            if (count >= 0)
            {
                builder.Append($"{count} pcs");
            }
            if (modulus.HasValue)
            {
                if (builder.Length > 0) builder.Append(", ");
                builder.Append($"mod {modulus.Value}");
            }
            return builder.Length == 0 ? null : builder.ToString();
        }

        private static string? SummarizeInspectorForget(IReadOnlyDictionary<string, object>? args)
        {
            var derived = ReadString(args, "derivedFrom");
            return string.IsNullOrWhiteSpace(derived) ? null : $"from {derived}";
        }

        private static string? SummarizeInspectorChoose(IReadOnlyDictionary<string, object>? args)
        {
            var policy = ReadString(args, "policy");
            var derived = ReadString(args, "derivedFrom");
            if (string.IsNullOrWhiteSpace(policy) && string.IsNullOrWhiteSpace(derived))
            {
                return null;
            }
            if (string.IsNullOrWhiteSpace(policy))
            {
                return $"from {derived}";
            }
            if (string.IsNullOrWhiteSpace(derived))
            {
                return policy;
            }
            return $"{policy} ({derived})";
        }

        private static int GetLength(IReadOnlyDictionary<string, object>? args, string key)
        {
            var arr = ReadIntArray(args, key);
            return arr?.Length ?? -1;
        }

        private static int[]? ReadIntArray(IReadOnlyDictionary<string, object>? args, string key)
        {
            if (args == null || !args.TryGetValue(key, out var value) || value == null) return null;
            switch (value)
            {
                case int[] ints:
                    return ints;
                case IEnumerable<int> enumerable:
                    return enumerable.ToArray();
                case JsonElement element when element.ValueKind == JsonValueKind.Array:
                    var list = new List<int>();
                    foreach (var item in element.EnumerateArray())
                    {
                        if (item.TryGetInt32(out var parsed))
                        {
                            list.Add(parsed);
                        }
                    }
                    return list.ToArray();
                case JsonElement element when element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var single):
                    return new[] { single };
            }
            return null;
        }

        private static string? ReadString(IReadOnlyDictionary<string, object>? args, string key)
        {
            if (args == null || !args.TryGetValue(key, out var value) || value == null) return null;
            return value switch
            {
                string s => s,
                JsonElement element when element.ValueKind == JsonValueKind.String => element.GetString(),
                _ => null
            };
        }

        private static bool TryInt(IReadOnlyDictionary<string, object>? args, string key, out int result)
        {
            result = 0;
            if (args == null || !args.TryGetValue(key, out var value) || value == null) return false;
            return TryConvertToInt(value, out result);
        }

        private static int? ReadInt(IReadOnlyDictionary<string, object>? args, string key)
        {
            if (TryInt(args, key, out var value))
            {
                return value;
            }
            return null;
        }

        private static bool TryConvertToInt(object value, out int result)
        {
            switch (value)
            {
                case int i:
                    result = i;
                    return true;
                case long l when l >= int.MinValue && l <= int.MaxValue:
                    result = (int)l;
                    return true;
                case JsonElement element when element.ValueKind == JsonValueKind.Number:
                    return element.TryGetInt32(out result);
                default:
                    result = 0;
                    return false;
            }
        }
    }
}
