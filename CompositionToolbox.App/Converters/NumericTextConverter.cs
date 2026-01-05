using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace CompositionToolbox.App.Converters
{
    public sealed class NumericTextConverter : IValueConverter
    {
        public object? Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value == null)
            {
                return string.Empty;
            }

            if (value is IFormattable formattable)
            {
                return formattable.ToString(null, culture);
            }

            return value.ToString();
        }

        public object? ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is not string text)
            {
                return System.Windows.Data.Binding.DoNothing;
            }

            if (string.IsNullOrWhiteSpace(text))
            {
                return System.Windows.Data.Binding.DoNothing;
            }

            var isNullable = Nullable.GetUnderlyingType(targetType);
            var effectiveType = isNullable ?? targetType;

            if (effectiveType == typeof(double))
            {
                if (double.TryParse(text, NumberStyles.Float, culture, out var result))
                {
                    return result;
                }
                return System.Windows.Data.Binding.DoNothing;
            }

            if (effectiveType == typeof(int))
            {
                if (int.TryParse(text, NumberStyles.Integer, culture, out var result))
                {
                    return result;
                }
                return System.Windows.Data.Binding.DoNothing;
            }

            return System.Windows.Data.Binding.DoNothing;
        }
    }
}
