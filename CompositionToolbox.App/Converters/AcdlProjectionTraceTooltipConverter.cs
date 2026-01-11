// Purpose: Converter that translates values for the Acdl Projection Trace Tooltip bindings.

using System;
using System.Globalization;
using System.Text;
using System.Windows.Data;
using CompositionToolbox.App.ViewModels;

namespace CompositionToolbox.App.Converters
{
    public sealed class AcdlProjectionTraceTooltipConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object? parameter, CultureInfo culture)
        {
            if (value is not AcdlProjectionTrace trace)
            {
                return string.Empty;
            }

            if (!trace.IsValid)
            {
                return "Invalid projection.";
            }

            var sb = new StringBuilder();
            sb.AppendLine($"Fixed: {trace.FixedGap}");
            sb.AppendLine($"SumV: {trace.ScaledFreeSum}");
            sb.AppendLine($"Target: {trace.TargetFreeSum}");
            sb.Append("Projected CINT: ");
            sb.Append(trace.ProjectedGaps.Length == 0 ? "-" : $"[{string.Join(' ', trace.ProjectedGaps)}]");
            return sb.ToString();
        }

        public object ConvertBack(object value, Type targetType, object? parameter, CultureInfo culture)
        {
            return string.Empty;
        }
    }
}
