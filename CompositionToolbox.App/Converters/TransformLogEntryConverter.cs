using System;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Windows.Data;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Stores;

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
            if (store == null) return string.Empty;
            var index = store.CurrentLogEntries.IndexOf(entry);
            if (index < 0) return string.Empty;
            return $"#{index + 1}";
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
