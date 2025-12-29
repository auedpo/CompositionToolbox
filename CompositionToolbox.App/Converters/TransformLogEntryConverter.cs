using System;
using System.Globalization;
using System.Linq;
using System.Windows.Data;
using CompositionToolbox.App.Models;
using CompositionToolbox.App.Stores;

namespace CompositionToolbox.App.Converters
{
    public class TransformLogEntryConverter : IMultiValueConverter
    {
        public object Convert(object[] values, Type targetType, object? parameter, CultureInfo culture)
        {
            if (values.Length < 2) return string.Empty;
            if (values[0] is not PitchNode node) return string.Empty;
            var store = values.LastOrDefault(v => v is TransformLogStore) as TransformLogStore;
            if (store == null) return string.Empty;

            var op = node.OpFromPrev?.ToDisplayString() ?? "-";
            var sourceId = node.OpFromPrev?.SourceNodeId;
            var sourceNode = sourceId.HasValue
                ? store.Nodes.FirstOrDefault(n => n.Id == sourceId.Value)
                : null;

            var fromPcs = sourceNode != null ? FormatNodePcs(sourceNode) : "-";
            var toPcs = FormatNodePcs(node);
            var toLabel = FormatNodeLabel(node);
            var toLine = string.IsNullOrWhiteSpace(toLabel) ? toPcs : $"{toLabel}: {toPcs}";

            return $"{fromPcs}\n({op})\n{toLine}";
        }

        public object[] ConvertBack(object value, Type[] targetTypes, object? parameter, CultureInfo culture)
        {
            return Array.Empty<object>();
        }

        private static string FormatNodePcs(PitchNode node)
        {
            return node.Mode == PcMode.Unordered
                ? $"[{string.Join(' ', node.Unordered)}]"
                : $"({string.Join(' ', node.Ordered)})";
        }

        private static string FormatNodeLabel(PitchNode node)
        {
            if (string.IsNullOrWhiteSpace(node.Label)) return string.Empty;
            if (string.Equals(node.Label, "Input", StringComparison.OrdinalIgnoreCase)) return string.Empty;
            return node.Label;
        }

    }
}
