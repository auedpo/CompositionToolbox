// Purpose: Converter that translates values for the Nullable Index bindings.

using System;
using System.Globalization;
using System.Windows.Data;

namespace CompositionToolbox.App.Converters
{
    public sealed class NullableIndexConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            return value is int idx ? idx : -1;
        }

        public object? ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is int idx)
            {
                return idx < 0 ? null : idx;
            }

            return null;
        }
    }
}
