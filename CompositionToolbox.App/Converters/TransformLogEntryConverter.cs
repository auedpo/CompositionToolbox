// Purpose: Converter that translates values for the Transform Log Entry bindings.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Data;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Stores;
using CompositionToolbox.App.Utilities;

namespace CompositionToolbox.App.Converters
{
    public class TransformLogEntryConverter : IMultiValueConverter
    {
        public object Convert(object[] values, Type targetType, object? parameter, CultureInfo culture)
        {
            if (values.Length == 0) return string.Empty;
            if (values[0] is not CompositeTransformLogEntry entry) return string.Empty;

            var store = values.OfType<CompositeStore>().FirstOrDefault();
            var format = parameter as string ?? "PatchSummary";

            return format switch
            {
                "Badges" => FormatBadges(entry),
                "StepIndex" => FormatStepIndex(entry, store),
                "PitchListValue" => FormatPitchListValue(entry, store),
                "ListTypes" => FormatOpSummary(entry, store),
                "OpLabel" => FormatOpLabel(entry),
                "OpSummary" => FormatOpSummary(entry, store),
                _ => FormatPatchSummary(entry, store)
            };
        }

        public object[] ConvertBack(object value, Type[] targetTypes, object? parameter, CultureInfo culture)
        {
            return Array.Empty<object>();
        }

        private static string FormatPatchSummary(CompositeTransformLogEntry entry, CompositeStore? store)
        {
            if (entry.Patch.Changes.Count == 0) return "-";
            var sb = new StringBuilder();
            foreach (var change in entry.Patch.Changes)
            {
                if (sb.Length > 0) sb.Append("; ");
                var oldRef = FormatRef(change.Slot, change.OldRef, store);
                var newRef = FormatRef(change.Slot, change.NewRef, store);
                sb.Append($"{change.Slot}: {oldRef}->{newRef}");
            }
            return sb.ToString();
        }

        private static string FormatBadges(CompositeTransformLogEntry entry)
        {
            var badges = entry.Patch.Changes
                .Select(change => change.Slot switch
                {
                    "PitchRef" => "P",
                    "RhythmRef" => "R",
                    "VoicingRef" => "V",
                    "EventsRef" => "E",
                    _ => string.Empty
                })
                .Where(badge => !string.IsNullOrWhiteSpace(badge))
                .Distinct()
                .ToArray();

            return badges.Length == 0 ? string.Empty : string.Join(' ', badges);
        }

        private static string FormatStepIndex(CompositeTransformLogEntry entry, CompositeStore? store)
        {
            if (store?.SelectedComposite == null) return string.Empty;
            var compositeId = store.SelectedComposite.CompositeId;
            var index = 0;
            foreach (var logEntry in store.LogEntries)
            {
                if (logEntry.CompositeId != compositeId)
                {
                    continue;
                }
                if (logEntry.EntryId == entry.EntryId)
                {
                    return $"#{index + 1}";
                }
                index++;
            }
            return string.Empty;
        }

        private static string FormatPitchListValue(CompositeTransformLogEntry entry, CompositeStore? store)
        {
            if (store == null) return "-";
            var state = store.States.FirstOrDefault(s => s.StateId == entry.NewStateId);
            if (state?.PitchRef == null) return "-";
            var node = store.Nodes.FirstOrDefault(n => n.NodeId == state.PitchRef.Value);
            if (node == null || node.ValueType != AtomicValueType.PitchList) return "-";
            var pcs = node.Mode == PcMode.Unordered ? node.Unordered : node.Ordered;
            var open = node.Mode == PcMode.Unordered ? "[" : "(";
            var close = node.Mode == PcMode.Unordered ? "]" : ")";
            return $"{open}{string.Join(' ', pcs)}{close}";
        }

        private static string FormatListTypes(CompositeTransformLogEntry entry, CompositeStore? store)
        {
            var slotTypes = entry.Patch.Changes
                .Select(change => change.Slot)
                .Distinct()
                .ToArray();

            if (slotTypes.Length == 0) return string.Empty;

            var parts = slotTypes
                .Select(slot => FormatRefValues(entry, store, slot))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToArray();

            return parts.Length == 0 ? "-" : string.Join(", ", parts);
        }

        private static string FormatRefValues(CompositeTransformLogEntry entry, CompositeStore? store, string slot)
        {
            if (store == null) return string.Empty;
            var state = store.States.FirstOrDefault(s => s.StateId == entry.NewStateId);
            if (state == null) return string.Empty;

            Guid? id = slot switch
            {
                "PitchRef" => state.PitchRef,
                "RhythmRef" => state.RhythmRef,
                "VoicingRef" => state.VoicingRef,
                "EventsRef" => state.EventsRef,
                "RegisterRef" => state.RegisterRef,
                "InstrumentRef" => state.InstrumentRef,
                _ => null
            };

            if (!id.HasValue) return string.Empty;
            var node = store.Nodes.FirstOrDefault(n => n.NodeId == id.Value);
            if (node == null) return string.Empty;

            // Prefer structured representation when available
            switch (node.ValueType)
            {
                case AtomicValueType.PitchList:
                    return FormatPitchListValue(entry, store);
                case AtomicValueType.RhythmPattern:
                case AtomicValueType.VoicingList:
                case AtomicValueType.RegisterPattern:
                    var arr = node.Mode == PcMode.Unordered ? node.Unordered : node.Ordered;
                    return arr.Length == 0 ? string.Empty : (node.Mode == PcMode.Unordered ? $"[{string.Join(' ', arr)}]" : $"({string.Join(' ', arr)})");
                case AtomicValueType.NoteEventSeq:
                    if (!string.IsNullOrWhiteSpace(node.ValueJson))
                    {
                        var json = node.ValueJson!.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
                        return json.Length <= 60 ? json : json[..60] + "...";
                    }
                    // fallback to arrays if present
                    var arr2 = node.Mode == PcMode.Unordered ? node.Unordered : node.Ordered;
                    return arr2.Length == 0 ? string.Empty : $"[{string.Join(' ', arr2)}]";
                default:
                    return string.Empty;
            }
        }

        private static string FormatRef(string slot, Guid? id, CompositeStore? store)
        {
            if (!id.HasValue) return "-";
            var prefix = slot switch
            {
                "PitchRef" => "P",
                "RhythmRef" => "R",
                "RegisterRef" => "G",
                "InstrumentRef" => "I",
                "VoicingRef" => "V",
                "EventsRef" => "E",
                _ => "N"
            };
            var shortId = id.Value.ToString("N")[..6];
            if (store == null) return $"{prefix}{shortId}";
            var node = store.Nodes.FirstOrDefault(n => n.NodeId == id.Value);
            if (node == null) return $"{prefix}{shortId}";
            return $"{prefix}{shortId}";
        }

        private static string FormatOpLabel(CompositeTransformLogEntry entry)
        {
            var descriptor = OpCatalog.Describe(entry);
            var tags = descriptor.Tags?.Length > 0
                ? $"[{string.Join(", ", descriptor.Tags)}] "
                : string.Empty;
            return $"{tags}{descriptor.Title}";
        }

        private static string FormatOpSummary(CompositeTransformLogEntry entry, CompositeStore? store)
        {
            var descriptor = OpCatalog.Describe(entry);
            var summaryParts = new List<string>();
            if (!string.IsNullOrWhiteSpace(descriptor.Summary))
            {
                summaryParts.Add(descriptor.Summary);
            }
            var listTypes = FormatListTypes(entry, store);
            if (!string.IsNullOrWhiteSpace(listTypes))
            {
                summaryParts.Add(listTypes);
            }
            return summaryParts.Count == 0 ? string.Empty : string.Join(" | ", summaryParts);
        }

    }

    public class StepIndexConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object? parameter, CultureInfo culture)
        {
            if (value is int index)
            {
                return $"#{index + 1}";
            }
            return string.Empty;
        }

        public object ConvertBack(object value, Type targetType, object? parameter, CultureInfo culture)
        {
            return 0;
        }
    }
}
